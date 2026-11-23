# spec.md — Especificação Técnica e Funcional (MVP)
 
## 1. Objetivo
Entregar um afinador de violão preciso, responsivo e sem distrações, instalável na tela inicial do smartphone como PWA e funcional offline.
 
## 2. Escopo
**Dentro do MVP:** afinação padrão (A4 = 440 Hz), 6 cordas, modo Automático e Manual, tom de referência, wake lock, PWA offline, tema escuro.
 
**Fora do MVP (backlog):** afinações alternativas (Drop D, DADGAD…), calibração de A4, outros instrumentos, histórico, ajustes persistidos além do último modo usado, i18n.
 
## 3. Requisitos Funcionais
- **RF01 — Ativação de Áudio:** botão claro para ligar/pausar o microfone. `AudioContext` é criado/retomado dentro do handler do clique (política de gesto do usuário).
- **RF02 — Modo Automático:** cromático. Detecta a fundamental, identifica a nota mais próxima (nome + oitava) e o desvio em *cents* em relação a ela. Destaca no seletor a corda padrão mais próxima, somente se estiver a até `STRING_HIGHLIGHT_MAX_CENTS` dela; caso contrário, nenhuma corda é destacada.
- **RF03 — Modo Manual (trava de corda):** o usuário seleciona uma das 6 cordas (E2, A2, D3, G3, B3, E4). O alvo é **a frequência dessa corda**, não a nota mais próxima: `cents = 1200 * log2(freq / freqAlvoDaCorda)`. Leituras a mais de `MANUAL_LOCK_WINDOW_CENTS` do alvo são ignoradas (outra corda, harmônico ou ruído). Isso impede o falso "Afinado" em uma nota errada quando a corda está muito fora do tom.
- **RF04 — Indicador Visual:** nota detectada, frequência em Hz, desvio em cents, direção e estado.
  - Convenção de sinal: `cents < 0` = grave (abaixo do alvo) → "Apertar"; `cents > 0` = agudo → "Afrouxar".
  - Estados: **Afinado** (`|cents| <= 4`), **Quase** (`4 < |cents| <= 15`), **Desafinado** (`> 15`), **Sem sinal**.
  - A escala visual vai de −50 a +50; fora dela o ponteiro encosta na extremidade e a seta de direção continua indicando o sentido.
  - Histerese no estado Afinado (ver 5.4) para evitar piscar na borda.
- **RF05 — Tom de Referência:** botão que toca a corda selecionada (no modo Automático, a corda destacada; se nenhuma, o botão fica desabilitado). Detalhes na seção 7.
- **RF06 — Manter Tela Ativa:** Screen Wake Lock enquanto o microfone estiver ativo; reobter ao voltar para a aba; falha silenciosa se não houver suporte.
- **RF07 — Uso Offline (PWA):** funcionar sem conexão após o primeiro carregamento, incluindo o worklet.
- **RF08 — Estados e Erros:** a UI cobre `idle`, `requesting`, `listening`, `paused`, `error` (`permission-denied`, `no-device`, `unsupported`, `insecure-context`) com mensagem clara e ação sugerida (ver `ds.md`).
## 4. Máquina de Estados do Tuner
```ts
type TunerStatus =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'listening' }
  | { kind: 'paused' }
  | { kind: 'error'; reason: 'permission-denied' | 'no-device' | 'unsupported' | 'insecure-context' };
 
type TunerMode = { kind: 'auto' } | { kind: 'manual'; stringIndex: number };
```
- Página oculta (`visibilitychange`) → pausa o microfone e libera recursos. Ao voltar, o usuário toca em Ligar.
- `AudioContext.state === 'interrupted'` (iOS: ligação, Siri) → status `paused`.
- Tom de referência tocando → detecção suspensa (ver seção 7).
## 5. Especificação Matemática e DSP
 
### 5.1 Afinação Padrão (A4 = 440 Hz)
| Corda | Nota | Hz |
|---|---|---|
| 6ª | E2 | 82.41 |
| 5ª | A2 | 110.00 |
| 4ª | D3 | 146.83 |
| 3ª | G3 | 196.00 |
| 2ª | B3 | 246.94 |
| 1ª | E4 | 329.63 |
 
No código, as frequências são **calculadas** a partir de MIDI (40, 45, 50, 55, 59, 64) e `A4_HZ`, não digitadas à mão, para não acumular erro de arredondamento.
 
### 5.2 Conversões (`pitch.ts`)
```
midiFloat = 69 + 12 * log2(freq / A4_HZ)
midi      = round(midiFloat)
freqAlvo  = A4_HZ * 2^((midi - 69) / 12)
cents     = 1200 * log2(freq / freqAlvo)      // = 100 * (midiFloat - midi)
```
Todo processamento intermediário (mediana, EMA) é feito em **`midiFloat`** (log-frequência), nunca em Hz: assim 1 cent vale o mesmo em graves e agudos, e a média entre leituras não distorce.
 
### 5.3 YIN (`yin.ts`)
Entrada: `Float32Array` com `N = 4096` amostras e `sampleRate`.
```
tauMin = floor(sampleRate / MAX_FREQ_HZ)     // 1000 Hz
tauMax = ceil (sampleRate / MIN_FREQ_HZ)     //   65 Hz
W      = YIN_WINDOW (2048)                   // requisito: N >= W + tauMax
```
1. **Diferença:** `d(τ) = Σ_{j=0}^{W-1} (x[j] − x[j+τ])²`, calculada para `τ = 1..tauMax`. A etapa 2 precisa da soma acumulada desde τ = 1, mesmo que a busca comece em `tauMin`.
2. **CMNDF:** `d'(0) = 1`; `d'(τ) = d(τ) · τ / Σ_{j=1}^{τ} d(j)`.
3. **Limiar absoluto:** o primeiro `τ >= tauMin` com `d'(τ) < YIN_THRESHOLD`; avançar enquanto `d'(τ+1) < d'(τ)` (mínimo local). **Se nenhum τ atingir o limiar, retornar `null`** (sem sinal periódico). Não usar o mínimo global como fallback: em ruído ele gera leituras falsas.
4. **Interpolação parabólica** em `τ−1, τ, τ+1` (tratar bordas) para obter `τ` fracionário. `freq = sampleRate / τ`.
5. Descartar se `freq` fora de `[MIN_FREQ_HZ, MAX_FREQ_HZ]`.
6. Saída: `{ freq: number; confidence: number } | null`, com `confidence = 1 − d'(τ)`.
`rms(buffer)` é calculado sobre a janela inteira. O gate de RMS é aplicado **antes** do YIN para economizar CPU.
 
### 5.4 Estabilização (`smoother.ts` + `tuning-state.ts`)
Pipeline por frame:
1. **Gate de amplitude com histerese:** liga acima de `RMS_GATE_ON`, desliga abaixo de `RMS_GATE_OFF`. Sem `autoGainControl`, o nível de celulares é baixo; valores devem ser calibrados em T17.
2. **YIN** (somente se o gate estiver aberto). `null` = frame inválido.
3. **Janela de manutenção (hold):** em frames inválidos, mantém a última leitura por `SIGNAL_HOLD_MS` (a corda decai e o YIN falha antes de ela silenciar); depois, volta para "Sem sinal" e **zera** o smoother.
4. **Filtro de mediana** das últimas `MEDIAN_SIZE` leituras válidas (em `midiFloat`) para eliminar outliers de oitava.
5. **Reset por salto confirmado:** se a nova leitura difere da mediana atual em mais de `JUMP_RESET_CENTS`, ela fica como candidata e não altera a saída. Se a próxima leitura válida também estiver além desse limite e a até `JUMP_RESET_CENTS` da candidata, o buffer é descartado (usuário trocou de corda). Um salto isolado não desloca a saída; a confirmação adiciona no máximo um frame de latência.
6. **EMA** no ponteiro visual: `y = y + EMA_ALPHA · (x − y)`.
7. **Modo Manual:** descartar leituras fora de `MANUAL_LOCK_WINDOW_CENTS` antes da mediana.
8. **Estado "Afinado" com histerese:** entra quando `|cents| <= IN_TUNE_ENTER_CENTS` por `IN_TUNE_MIN_FRAMES` frames consecutivos; sai quando `|cents| > IN_TUNE_EXIT_CENTS`.
### 5.5 Constantes (`constants.ts`, valores iniciais a calibrar)
| Constante | Valor | Papel |
|---|---|---|
| `A4_HZ` | 440 | Referência de afinação |
| `MIN_FREQ_HZ` / `MAX_FREQ_HZ` | 65 / 1000 | Abaixo do E2 com folga; acima do E4 + harmônicos úteis. Define `tauMax`/`tauMin` |
| `YIN_WINDOW` | 2048 | Janela de integração (≈ 3,5 períodos de E2 a 48 kHz; custo ≈ 1,5 M operações/frame) |
| `YIN_THRESHOLD` | 0.15 | Aperiodicidade máxima aceita. Mais baixo = mais rigoroso |
| `HOP_SAMPLES` | 2048 | Passo entre análises (≈ 23 frames/s a 48 kHz) |
| `RMS_GATE_ON` / `RMS_GATE_OFF` | 0.010 / 0.006 | ≈ −40 dBFS / −44 dBFS; histerese do gate |
| `SIGNAL_HOLD_MS` | 400 | Mantém leitura durante o decaimento da corda |
| `MEDIAN_SIZE` | 5 | Janela da mediana (≈ 220 ms) |
| `EMA_ALPHA` | 0.25 | Suavização do ponteiro |
| `JUMP_RESET_CENTS` | 80 | Salto que indica nova nota |
| `IN_TUNE_ENTER_CENTS` / `IN_TUNE_EXIT_CENTS` | 4 / 6 | Histerese do "Afinado" |
| `IN_TUNE_MIN_FRAMES` | 3 | Estabilidade mínima antes de acender o verde |
| `NEAR_TUNE_CENTS` | 15 | Limite amarelo/vermelho |
| `STRING_HIGHLIGHT_MAX_CENTS` | 100 | Distância máxima para destacar corda no modo Auto |
| `MANUAL_LOCK_WINDOW_CENTS` | 300 | Janela aceita no modo Manual |
 
## 6. Captura de Áudio
Grafo: `MediaStreamAudioSourceNode → AudioWorkletNode → GainNode(0) → destination`.
 
Contrato worklet → main (`messages.ts`):
```ts
type WorkletFrame = {
  type: 'frame';
  samples: Float32Array;   // 4096 amostras lineares (mais antiga → mais recente), transferida
  sampleRate: number;      // `sampleRate` global do worklet
};
```
O worklet acumula blocos de 128 amostras no ring buffer e posta um `WorkletFrame` a cada `HOP_SAMPLES` amostras, somente depois do buffer estar cheio pela primeira vez. A main thread valida a mensagem com type guard.
 
## 7. Tom de Referência
- `OscillatorNode` com `PeriodicWave`. Alto-falantes de celular reproduzem mal abaixo de ~150 Hz, então para E2, A2 e D3 a onda **deve** incluir harmônicos (ex.: amplitudes relativas 1, 0.6, 0.35, 0.2 nos 4 primeiros) — o ouvido reconstrói a altura da fundamental. Para G3, B3 e E4, pode ser mais pura.
- Envelope no `GainNode`: ataque de ~20 ms, release de ~80 ms (`linearRampToValueAtTime`/`setTargetAtTime`); nunca `start/stop` abrupto com ganho cheio (clique).
- Ganho máximo conservador (≈ 0.3). Para automaticamente após ~4 s ou ao tocar de novo.
- **Detecção suspensa** enquanto o tom toca e por ~300 ms depois, para o microfone não captar o próprio tom. A UI mostra "Tocando referência".
- Funciona com o microfone desligado (usa o mesmo `AudioContext`, criado no gesto).
## 8. PWA
- Manifest em `app/manifest.ts`: `name`, `short_name`, `start_url: '/'`, `display: 'standalone'`, `orientation: 'portrait'`, `theme_color` e `background_color` = `#09090B`, ícones 192/512 e `maskable` 512.
- Service Worker (Serwist, `app/sw.ts`) com precache de **todos** os assets de build e da rota `/`, e também de `/worklets/pitch-processor.js` e dos ícones de `public/` (confirmar que entram no precache; usar `additionalPrecacheEntries` se necessário). Esquecer o worklet quebra o app offline. Fallback de navegação para `/`.
- Atualização: `skipWaiting` + `clientsClaim`, com o SW novo assumindo na próxima abertura.
- O SW fica desativado em desenvolvimento; PWA e offline são validados somente em build de produção.
- HTTPS obrigatório em produção (`getUserMedia` só funciona em contexto seguro; `localhost` é exceção).
- Preferência de deploy: `output: 'export'` (estático) em host com HTTPS; Vercel também serve.
- iOS: `appleWebApp` na `metadata` do Next, `apple-touch-icon`. Validar em dispositivo real (comportamento de permissão de microfone no modo standalone).
## 9. Critérios de Aceite
Automatizados (Vitest, sinais sintéticos, PRNG com seed):
- **A1 — Precisão:** para cada corda × desvios {−40, −15, −5, 0, +5, +15, +40 cents} × sample rates {44100, 48000} × perfis de harmônicos {fundamental dominante; 2º harmônico dominante, fundamental −6 dB; com 3º harmônico}: erro `|cents| <= 1.5` com SNR 30 dB. Meta com SNR 20 dB: `<= 3 cents` (se não atingir, documentar o resultado e ajustar).
- **A2 — Silêncio e ruído:** 1000 frames de zeros, de ruído abaixo do gate e de ruído branco alto (RMS 0.05) retornam `null` / "Sem sinal" em 100% dos casos.
- **A3 — Sem erro de oitava** em toda a matriz de A1.
- **A4 — Smoother:** um outlier de oitava entre 5 leituras não altera a saída; troca de corda (salto > `JUMP_RESET_CENTS`) converge sem arrasto; "Afinado" não pisca com leitura oscilando entre 3 e 5 cents.
- **A5 — Modo Manual:** com E2 travada, uma leitura de A2 é ignorada e uma de E2 −80 cents mostra −80 (nunca "Afinado" em D#2).
Manuais (dispositivo real):
- **A6:** em silêncio ambiente por 60 s, o ponteiro não se move e nenhuma nota é exibida.
- **A7:** instalado e aberto em modo avião, o app carrega e afina.
- **A8:** violão real em ambiente silencioso, comparado com um tom de referência conhecido ou outro afinador confiável: diferença `<= 3 cents`.
- **A9:** latência da palhetada até a primeira leitura `<= 300 ms`; análise por frame `< 5 ms` na main thread.
## 10. Decisões
- Next.js (App Router) já adotado no projeto: usado como shell client-side; sem API/Server Actions; SSR limitado a `layout`/`page` finos; PWA via Serwist.
- Médias e medianas em log-frequência (`midiFloat`).
- Sem fallback de mínimo global no YIN: prefere "sem sinal" a leitura incorreta.
- Setup T01: manter a estrutura existente na raiz (`app/`, `lib/`, `hooks/`, `components/`); usar `@tailwindcss/postcss` para integrar Tailwind v4; usar Vitest 3.2.4 por compatibilidade com `@types/node` 20 do projeto.
- T05: confirmar um salto maior que `JUMP_RESET_CENTS` com uma segunda leitura próxima antes de resetar o smoother; isso preserva a saída diante de um outlier isolado e acrescenta no máximo um frame de latência na troca de nota.
- T07: a matriz A1 ficou abaixo de 1.5 cents em todos os casos a 30 dB (máximo 0.742). A 20 dB, a meta de 3 cents não foi atingida: erro máximo de 5.428 cents em E2 −40 cents, perfil fundamental dominante, 48 kHz; a suíte usa 5.5 cents como limite observado até otimização posterior. Reduzir `YIN_THRESHOLD` para 0.10 não alterou esse resultado; refinamento parabólico com janela estendida piorou a precisão e foi revertido, portanto `YIN_THRESHOLD` permanece em 0.15.
- (Registrar novas decisões aqui.)
 