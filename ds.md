# ds.md — Design System e Diretrizes de Interface
 
## 1. Princípios de UX
- **Legibilidade à distância:** o celular fica apoiado na perna, estante ou mesa enquanto as duas mãos estão no violão. Tipografia grande e alto contraste são obrigatórios.
- **Uso com uma mão:** controles principais (Ligar/Pausar, Auto/Manual, seleção das 6 cordas, Ouvir Nota) na metade inferior da tela, dentro da zona do polegar.
- **Zero poluição visual:** sem banners, popups ou menus aninhados na tela principal. Uma única tela.
- **Cor nunca é o único sinal:** todo estado tem também texto e/ou ícone (acessibilidade e luz ambiente ruim).
## 2. Tema e Paleta (Dark Mode Nativo)
| Token | Hex | Uso |
|---|---|---|
| `bg` | `#09090B` (Zinc 950) | Fundo; reduz brilho e economiza bateria OLED |
| `surface` | `#18181B` (Zinc 900) | Cards/superfícies |
| `border` | `#27272A` (Zinc 800) | Bordas sutis |
| `text` | `#FAFAFA` (Zinc 50) | Texto principal |
| `text-muted` | `#A1A1AA` (Zinc 400) | Texto secundário |
| `tuned` | `#10B981` (Emerald 500) | Afinado, com brilho sutil (`box-shadow`/`drop-shadow` suave) |
| `near` | `#F59E0B` (Amber 500) | Quase afinado |
| `off` | `#EF4444` (Red 500) | Desafinado |
| `idle` | `#52525B` (Zinc 600) | Inativo / sem sinal |
 
Regras de contraste:
- `idle` (≈ 2,6:1 sobre `bg`) serve só para elementos decorativos/inativos (traços da escala, ponteiro apagado). **Texto** em estado inativo usa `text-muted`.
- Os demais tokens passam de 4,5:1 sobre `bg`.
Estados de afinação (limiares e histerese definidos em `spec.md`, seções 3 e 5.4):
| Estado | Cor | Texto | Ícone |
|---|---|---|---|
| Afinado | `tuned` | "Afinado" | ✓ |
| Quase | `near` | "Grave · Apertar" / "Agudo · Afrouxar" | ▲ / ▼ |
| Desafinado | `off` | "Muito grave · Apertar" / "Muito agudo · Afrouxar" | ▲▲ / ▼▼ |
| Sem sinal | `idle` | "Toque uma corda" | — |
 
Convenção: nota grave (`cents < 0`) → apertar a tarraxa (sobe a altura); nota aguda → afrouxar.
 
## 3. Tipografia e Layout
- Fonte: `system-ui` (sem fontes externas, por causa do offline); se usar fonte customizada, somente via `next/font` (self-hosted no build). Valores numéricos com `font-variant-numeric: tabular-nums` para não tremerem.
- Nota: `clamp(6rem, 28vw, 11rem)`, peso 700. Oitava em subscrito ao lado, ~35% do tamanho.
- Hz e cents: 1rem–1.25rem, `text-muted`.
- Mobile-first, portrait. Tela cheia: `min-height: 100dvh`. Respeitar `env(safe-area-inset-*)` (notch e barra de gestos) no padding inferior. `viewport-fit=cover` e `themeColor: '#09090B'` via `export const viewport` em `layout.tsx`.
- Alvos de toque ≥ 48×48 px, espaçamento ≥ 8 px. `touch-action: manipulation`; `user-select: none` nos controles.
Wireframe (portrait):
```
┌──────────────────────────┐
│  status (ex.: "Ouvindo") │  topo: apenas informação
│                          │
│          E 2             │  nota gigante + oitava
│       82.4 Hz · −2 ¢     │
│                          │
│  ├──┼──┼──┼──┼──┼──┼──┤  │  barra de cents −50 … 0 … +50
│            ▲             │
│     ✓ Afinado            │  texto + ícone do estado
│                          │
│ (E2)(A2)(D3)(G3)(B3)(E4) │  ↓ metade inferior
│ [ Auto | Manual ] [Ouvir]│
│ [   Ligar microfone    ] │
└──────────────────────────┘
```
 
## 4. Componentes
### 4.1 Mostrador Central (`TunerMeter`)
- **Barra horizontal** (decisão do MVP; mais simples e legível que arco).
- Escala −50 a +50 cents; marcas a cada 10, marca central em 0 maior e destacada. Fora da escala, o ponteiro encosta na extremidade e a seta de direção continua visível.
- Ponteiro com transição CSS curta (~100 ms). Com `prefers-reduced-motion`, sem transição (posição direta).
- Nota gigante + oitava; subtexto com Hz (1 casa decimal) e desvio em cents (inteiro, com sinal). A cor do estado se aplica à nota, ao ponteiro e ao texto de estado.
- Sem sinal: tudo em `idle`/`text-muted`, ponteiro centralizado e apagado, mensagem "Toque uma corda".
- `aria-live="polite"` somente no texto de estado (não em Hz/cents, que mudam o tempo todo).
### 4.2 Seletor das 6 Cordas (`StringSelector`)
- 6 botões circulares, da esquerda para a direita: `E2, A2, D3, G3, B3, E4`, com o número da corda em tamanho pequeno ("6" … "1").
- **Modo Auto:** o botão da corda detectada (se houver) recebe anel na cor do estado; toque nos botões troca para Manual com aquela corda.
- **Modo Manual:** corda travada com preenchimento sólido + ícone de cadeado pequeno; toque em outra corda troca a trava; toque na mesma volta ao Auto.
- Mesmos botões acionam o contexto do tom de referência.
### 4.3 Barra Inferior de Ações (`ActionBar`)
- Toggle segmentado `Automático / Manual`.
- Botão `Ouvir Nota` (desabilitado sem corda alvo; mostra "Tocando…" com ícone animado enquanto toca; toque novamente para parar).
- Botão primário full-width `Ligar microfone` / `Pausar` (cor de destaque; estado ativo claramente distinto).
## 5. Estados e Mensagens
| Situação | Mensagem | Ação |
|---|---|---|
| `idle` | "Toque em Ligar e dedilhe uma corda" | Botão Ligar |
| `requesting` | "Aguardando permissão do microfone…" | — |
| `error: permission-denied` | "Sem acesso ao microfone. Libere nas configurações do navegador e tente de novo." | Botão "Tentar novamente" |
| `error: no-device` | "Nenhum microfone encontrado." | Tentar novamente |
| `error: unsupported` | "Este navegador não suporta o afinador. Use Chrome, Safari ou Edge atualizados." | — |
| `error: insecure-context` | "O afinador precisa de conexão segura (HTTPS)." | — |
| `paused` | "Pausado" | Botão Ligar |
| Tom tocando | "Tocando referência" (detecção suspensa) | Parar |
 
## 6. Acessibilidade
- Botões com `aria-label` descritivo ("Corda 6, Mi grave, E2") e `aria-pressed` nos toggles/seletores.
- Foco visível (`outline`) em navegação por teclado.
- Não depender de cor, vibração ou som para comunicar o estado.
 