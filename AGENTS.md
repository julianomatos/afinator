# AGENTS.md — Diretrizes de Desenvolvimento (Afinador de Violão PWA)
 
## 1. Visão Geral
Aplicação web progressiva (PWA) 100% client-side e offline-first para afinação de violão em tempo real, usando Web Audio API e detecção de pitch via algoritmo YIN implementado do zero. Sem backend, sem anúncios, sem analytics e sem dependências de DSP/pitch de terceiros.
 
Documentos de referência (fonte da verdade, nesta ordem em caso de conflito): `spec.md` (comportamento e matemática) > `ds.md` (interface) > `tasks.md` (ordem de execução) > este arquivo (como escrever o código).
 
## 2. Stack Tecnológica (decisão fechada)
- **Framework:** Next.js (App Router) com React. O projeto já existe; manter a versão instalada. Uso **somente client-side**: sem API Routes, Server Actions, banco ou qualquer dependência de servidor. Preferir `output: 'export'` (build estático) em `next.config.ts`, para hospedar em qualquer host estático.
- **Linguagem:** TypeScript com `strict: true` (e `noUncheckedIndexedAccess: true`).
- **Estilização:** Tailwind CSS.
- **Áudio:** Web Audio API (`AudioContext`, `MediaStreamAudioSourceNode`, `AudioWorkletNode`, `OscillatorNode`/`PeriodicWave`, `GainNode`).
- **Testes:** Vitest (validação matemática do motor DSP e da máquina de estados). O DSP é testado em ambiente `node`, sem depender do Next.
- **PWA:** `app/manifest.ts` + Service Worker via Serwist (precache de todos os assets, incluindo o worklet). O suporte do Serwist a Webpack/Turbopack depende da versão do Next instalada; seguir a documentação do pacote correspondente (`@serwist/next` ou `@serwist/turbopack`) e, se for o caso, usar `next build --webpack`.
- **Offline real:** proibido CDN, Google Fonts via `<link>` ou qualquer recurso externo. Usar fonte do sistema (`system-ui`) ou `next/font` (que hospeda a fonte no próprio build).
## 3. Estrutura de Pastas
```
public/
  worklets/pitch-processor.js      # AudioWorklet (JS puro + // @ts-check + JSDoc)
  icons/                           # 192, 512, maskable-512, apple-touch-icon
src/                               # (ou raiz, conforme o projeto existente)
  app/
    layout.tsx                     # metadata + viewport (themeColor, viewportFit)
    manifest.ts                    # Web App Manifest
    page.tsx                       # Server Component fino: renderiza <Tuner />
    sw.ts                          # Service Worker (Serwist)
  lib/audio/                       # DSP puro: SEM React, SEM DOM, SEM Web Audio
    constants.ts                   # todas as constantes documentadas
    pitch.ts                       # freq <-> MIDI/cents, cordas
    yin.ts                         # YIN + RMS
    smoother.ts                    # mediana + EMA
    tuning-state.ts                # detecção -> estado de UI (modos, histerese, hold)
    messages.ts                    # tipos das mensagens worklet <-> main
    test-utils/signals.ts          # geradores sintéticos (senoide, harmônicos, ruído com seed)
    *.test.ts
  hooks/                           # useTuner, useReferenceTone, useWakeLock ("use client")
  components/                      # Tuner, TunerMeter, StringSelector, ActionBar ("use client")
```
 
## 4. Regras de Arquitetura e Código
- **Proibido `any`** (e proibido `as` para contornar o compilador). Buffers são `Float32Array`; mensagens do worklet chegam como `unknown` e passam por type guard em `messages.ts`; estados de afinação são tipos/uniões explícitos.
- **Separação estrita DSP vs. UI:**
  - `yin.ts`, `pitch.ts`, `smoother.ts` e `tuning-state.ts` são funções/classes puras, sem importar React, DOM ou Web Audio. Recebem `sampleRate` como argumento (nunca assumir 44100 ou 48000).
  - Componentes apenas consomem o estado já processado e suavizado.
  - Determinismo: nenhum `Math.random()` ou `Date.now()` dentro de `lib/audio`. Tempo entra como parâmetro (`nowMs`); testes usam PRNG com seed.
- **Captura fora da main thread:**
  - Proibido `ScriptProcessorNode` (depreciado).
  - O `AudioWorkletNode` mantém um ring buffer de **4096** amostras e posta janelas lineares (transferíveis) para a main thread a cada hop (ver `spec.md`). 2048 não comporta a janela do YIN para 65 Hz com precisão.
  - O YIN roda na main thread, limitado pelo hop. Se a medição (`performance.now()`) passar de 5 ms por frame em celular intermediário, mover a análise para um Web Worker (as funções puras permitem isso sem reescrita).
  - Ligar o worklet a um `GainNode` com `gain = 0` conectado ao `destination`, para garantir que o grafo seja processado sem causar retorno de áudio.
- **Microfone:** `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } })`. Conferir com `track.getSettings()` e registrar no console (dev) se o navegador ignorou algum flag.
- **AudioContext:** criar/`resume()` somente dentro de um handler de gesto do usuário. Usar um único `AudioContext` para microfone e tom de referência.
- **Ciclo de vida:** liberar tracks, desconectar nós, fechar wake lock e `AudioContext` ao pausar, desmontar ou quando a página ficar oculta.
- **Regras específicas do Next.js (App Router):**
  - Tudo que usa Web Audio, `navigator`, `window`, `localStorage` ou hooks é Client Component (`"use client"`). `page.tsx` e `layout.tsx` permanecem Server Components finos; nenhum acesso a APIs do navegador durante a renderização (evita erro de SSR e de hidratação). Ler `localStorage` e checar suporte (`navigator.wakeLock`, `AudioWorklet`) apenas dentro de `useEffect` ou handlers.
  - **React Strict Mode** (dev) monta/desmonta efeitos duas vezes: todo cleanup (tracks, nós, `AudioContext.close()`, wake lock, listeners) deve ser idempotente, sem criar dois contextos de áudio.
  - Carregar o worklet com URL absoluta a partir de `public/`: `audioContext.audioWorklet.addModule('/worklets/pitch-processor.js')` (respeitar `basePath` se houver).
  - Metadados PWA via API do Next: `metadata` (`applicationName`, `appleWebApp`, ícones) e `export const viewport` (`themeColor: '#09090B'`, `viewportFit: 'cover'`).
  - O Service Worker fica desativado em `next dev`; testar PWA/offline sempre com build de produção (`next build` + `next start`, ou servindo a pasta `out/`).
  - `getUserMedia` exige contexto seguro: para testar no celular durante o desenvolvimento, usar `next dev --experimental-https`, um túnel HTTPS (ex.: Cloudflare Tunnel) ou um preview deploy. Acesso por `http://IP-da-rede:3000` retorna `insecure-context`.
## 5. Convenções de Qualidade
- Toda constante de DSP (limiar YIN, gate RMS, janela de mediana, alfa do EMA, histerese etc.) vive em `constants.ts` com comentário explicando seu papel físico/acústico e a unidade.
- Qualquer alteração em `yin.ts`, `pitch.ts`, `smoother.ts` ou `tuning-state.ts` deve passar pela suíte de aceitação com sinais sintéticos (harmônicos, ruído, vários sample rates) antes de ser considerada concluída.
- Componentes pequenos, legíveis, sem over-engineering. Sem bibliotecas de estado global; `useState`/`useReducer` bastam.
## 6. Fluxo de Trabalho do Agente
1. Executar **uma tarefa por vez** de `tasks.md`, na ordem. Não antecipar tarefas futuras.
2. Ao terminar: `npm run typecheck && npm run test` verdes, marcar o checkbox e listar arquivos criados/alterados.
3. Ambiguidade ou conflito entre documentos: parar e perguntar. Decisões tomadas são registradas na seção "Decisões" do `spec.md`.
4. Não adicionar funcionalidades fora do escopo do MVP (ver `spec.md`, seção 2).
## 7. Scripts esperados
`dev`, `build`, `start`, `test`, `typecheck` (`tsc --noEmit`), `lint`.
 
