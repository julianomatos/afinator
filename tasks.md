# tasks.md — Plano de Execução Incremental
 
Regra: uma tarefa por vez, na ordem. Cada tarefa só termina com `npm run typecheck && npm run test` verdes e o critério "Pronto quando" atendido. Detalhes de comportamento estão em `spec.md`; de interface, em `ds.md`.
 
## Fase 1: Setup e Motor Matemático (DSP Puro)
- [x] **T01 — Ajustar o projeto Next.js existente.** Conferir/ativar `strict` e `noUncheckedIndexedAccess` no `tsconfig.json`; garantir Tailwind CSS; instalar Vitest (`environment: 'node'`, alias de paths igual ao do `tsconfig`); regra de lint contra `any` (`@typescript-eslint/no-explicit-any`); criar a estrutura de pastas do AGENTS.md; remover do template o que não for usado (API routes, páginas de exemplo). Scripts: `dev`, `build`, `start`, `test`, `typecheck`, `lint`. Serwist só é instalado e configurado na T15.
  *Pronto quando:* `npm run dev` abre uma página vazia; um teste dummy passa; `typecheck` e `lint` verdes; `any` é barrado pelo lint.
- [x] **T02 — `constants.ts` e `pitch.ts`.** Constantes da tabela 5.5 do `spec.md`, cada uma documentada. Funções puras: `freqToMidiFloat`, `midiToFreq`, `noteFromFreq` (nome, oitava, `midi`, `cents`), `centsBetween(freq, target)`, `STRINGS` (calculadas a partir de MIDI 40, 45, 50, 55, 59, 64), `nearestString(freq, maxCents)`.
  *Pronto quando:* testes confirmam as 6 frequências da tabela 5.1 (±0.01 Hz), `cents` de ±50 nas bordas de semitom e `nearestString` retornando `null` além do limite.
- [x] **T03 — `test-utils/signals.ts`.** Geradores determinísticos: senoide, soma de harmônicos com amplitudes configuráveis (inclui perfil "fundamental fraca"), ruído branco com PRNG seedado (ex.: mulberry32), mistura por SNR. Sem `Math.random()`.
  *Pronto quando:* o mesmo seed produz sinais idênticos entre execuções.
- [x] **T04 — `yin.ts`.** YIN conforme `spec.md` 5.3 (diferença desde τ=1, CMNDF, limiar absoluto sem fallback global, interpolação parabólica, faixa 65–1000 Hz derivada do `sampleRate`) e `rms()`.
  *Pronto quando:* senoides das 6 cordas em 44100/48000 Hz passam com `|erro| <= 1.5 cents` e silêncio/ruído branco retornam `null`.
- [x] **T05 — `smoother.ts`.** Mediana (`MEDIAN_SIZE`) e EMA em `midiFloat`, reset por salto (`JUMP_RESET_CENTS`), `reset()` explícito.
  *Pronto quando:* critério A4 do `spec.md` passa (outlier de oitava, troca de corda).
- [x] **T06 — `tuning-state.ts`.** Função/classe pura que recebe `{ detection, rms, nowMs, mode }` e devolve o estado de UI: gate com histerese, hold de `SIGNAL_HOLD_MS`, filtro de janela no modo Manual, cents relativos ao alvo (Manual) ou à nota mais próxima (Auto), destaque de corda, estado Afinado com histerese e `IN_TUNE_MIN_FRAMES`.
  *Pronto quando:* critério A5 passa e "Afinado" não pisca com leitura oscilando entre 3 e 5 cents.
- [x] **T07 — Suíte de aceitação DSP.** Matriz do critério A1–A3: cordas × desvios × sample rates × perfis de harmônicos × SNR.
  *Pronto quando:* tudo verde; se a meta de 20 dB de SNR não for atingida, o resultado e o ajuste ficam registrados em "Decisões" no `spec.md`.
## Fase 2: Captura de Áudio e AudioWorklet
- [x] **T08 — Worklet e contrato de mensagens.** `public/worklets/pitch-processor.js` (JS + `// @ts-check` + JSDoc): ring buffer de 4096 amostras, posta `WorkletFrame` (buffer transferível) a cada `HOP_SAMPLES`, só após encher. `src/lib/audio/messages.ts` com tipos e type guard.
  *Pronto quando:* teste unitário do type guard (aceita frame válido, rejeita o resto) e janela linearizada na ordem correta (mais antiga → mais recente).
- [ ] **T09 — `useTuner.ts`.** Gerencia `AudioContext` (criado/retomado no clique), `getUserMedia` com `echoCancellation/noiseSuppression/autoGainControl: false` e `channelCount: 1`, grafo `source → worklet → GainNode(0) → destination`, `TunerStatus` (spec seção 4), pausa em `visibilitychange`, tratamento de `interrupted`, limpeza completa de recursos, e integração com `tuning-state`. Erros mapeados: permissão negada, sem dispositivo, não suportado, contexto inseguro. Arquivo com `"use client"`; nenhuma API do navegador fora de `useEffect`/handlers; worklet carregado de `/worklets/pitch-processor.js`.
  *Pronto quando:* no navegador real, ligar/pausar 10 vezes não vaza tracks nem nós, **inclusive em dev com React Strict Mode** (sem dois `AudioContext` abertos); `track.getSettings()` confirma os flags desligados (ou loga aviso em dev); testado em celular via HTTPS (`--experimental-https`, túnel ou preview).
- [ ] **T10 — `useReferenceTone.ts`.** `OscillatorNode` com `PeriodicWave` (harmônicos para E2/A2/D3), envelope de ataque/release, parada automática ~4 s, suspensão da detecção durante o tom e ~300 ms depois, funciona com microfone desligado.
  *Pronto quando:* sem cliques audíveis no início/fim e nenhuma leitura espúria ao tocar o tom com o microfone ligado.
- [ ] **T11 — `useWakeLock.ts`.** Request ao ligar, release ao pausar, reobter em `visibilitychange` visível, tratamento do evento `release`, feature detection com falha silenciosa.
  *Pronto quando:* a tela não apaga durante 2+ minutos de uso e volta a apagar normalmente após pausar.
## Fase 3: Interface e Experiência de Uso
- [x] **T12 — `TunerMeter.tsx`.** Conforme `ds.md` 4.1: barra −50…+50, nota + oitava, Hz, cents, cor + texto + ícone por estado, `prefers-reduced-motion`.
  *Pronto quando:* storybook-less: página de demonstração com estados simulados (sem sinal, desafinado, quase, afinado) renderiza corretamente em 360 px de largura.
- [x] **T13 — `StringSelector.tsx` e `ActionBar.tsx`.** Seletor de 6 cordas (Auto: destaque; Manual: trava), toggle Auto/Manual, `Ouvir Nota`, botão Ligar/Pausar, alvos de toque ≥ 48 px, `safe-area-inset-bottom`.
  *Pronto quando:* usável com uma mão (polegar) em celular de 6", sem rolagem.
- [ ] **T14 — Integração em `Tuner` + `app/page.tsx`.** Criar o Client Component `Tuner` compondo hooks + componentes; `page.tsx` apenas o renderiza. Configurar `layout.tsx` (`metadata`, `viewport` com `themeColor` e `viewportFit: 'cover'`, `lang="pt-BR"`). Mensagens de estado e erro (`ds.md` seção 5); persistir apenas o último modo (`localStorage`, lido em `useEffect`, com try/catch), sem erro de hidratação.
  *Pronto quando:* fluxo completo funciona em Chrome Android e Safari iOS (idle → permissão → ouvindo → pausar → erro de permissão negada).
## Fase 4: PWA Offline, Deploy e Calibração Real
- [x] **T15 — PWA com Serwist.** Instalar o pacote do Serwist compatível com a versão do Next (ver AGENTS.md, seção 2; se for `@serwist/next`, usar `next build --webpack`). `app/manifest.ts` (nome, `display: standalone`, `orientation: portrait`, cores `#09090B`, ícones 192/512/maskable), `app/sw.ts` com precache dos assets de build e da rota `/`, mais `additionalPrecacheEntries` para **`/worklets/pitch-processor.js`** e ícones, fallback para `/`, `skipWaiting` + `clientsClaim`, registro do SW, `appleWebApp` na `metadata`, `apple-touch-icon`. SW desativado em dev.
  *Pronto quando:* em `next build` + `next start`, DevTools → Application mostra manifest válido, SW ativo e o worklet no cache; recarregar com a rede desligada funciona.
- [ ] **T16 — Deploy HTTPS e teste de instalação.** Avaliar `output: 'export'` e publicar em host com HTTPS (Cloudflare Pages, Netlify, GitHub Pages ou Vercel). Instalar na tela inicial em Android e iOS e abrir em **modo avião**.
  *Pronto quando:* critério A7 do `spec.md` passa nos dois sistemas (anotar qualquer diferença de comportamento de permissão no iOS standalone).
- [ ] **T17 — Calibração com violão real.** Checklist:
  1. Silêncio ambiente por 60 s: sem leitura espúria (A6). Se houver, subir `RMS_GATE_ON/OFF`.
  2. Cada corda solta, ataque forte e fraco, deixando decair: sem salto de oitava, sem perder o sinal cedo demais. Ajustar `YIN_THRESHOLD` (0.15 → 0.20 se E2/A2 falharem) e `SIGNAL_HOLD_MS`.
  3. Ruído leve (TV baixa, conversa): sem troca de nota no modo Manual.
  4. Comparar com um tom de referência conhecido ou outro afinador confiável: `<= 3 cents` (A8).
  5. Medir latência e tempo de análise por frame (A9). Se `> 5 ms`, mover YIN para Web Worker.
  6. Registrar valores finais das constantes e o dispositivo usado em "Decisões" no `spec.md`.
  *Pronto quando:* A6, A8 e A9 atendidos.
## Backlog (fora do MVP)
Afinações alternativas, calibração de A4, outros instrumentos, vibração háptica ao afinar, modo claro.
 