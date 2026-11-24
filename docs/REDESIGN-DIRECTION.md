# Direção Visual, Sistema de Design e Arquitetura de Informação — Kitefy

**Data:** 24/11/2026 · **Manual base:** `docs/KITEFY-BRAND.md`

---

## 1. Territórios visuais avaliados

1. **Editorial Premium (puro)** — Muito espaço em branco, tipografia display grande, pouca densidade. *Descartado como escolha isolada:* funciona bem em landing pages, mas no app autenticado agrava a sensação de "vazio / muito branco" relatada pelo dono.
2. **Estúdio Criativo (exuberante)** — Fundos coloridos, texturas pesadas, cards decorativos. *Descartado:* compete visualmente com os previews dos próprios conteúdos do cliente (que já carregam as cores da marca dele) e envelhece mal em telas de billing/admin.
3. **Editorial de Dados (ESCOLHIDO — equilíbrio entre Stripe Dashboard, Linear e estúdio editorial)** — Preserva o DNA claro e limpo da marca Kitefy (`60%` superfícies claras estratificadas), recupera a âncora **Navy `#181331`** (`30%`) na sidebar e em blocos de foco estratégicos, usa o **Laranja Sinal `#FD3E01`** (`10%`) com precisão cirúrgica em CTAs, indicadores ativos e badges de prioridade, e traz **previews reais + medidores visuais + densidade confortável**.

### Por que "Editorial de Dados" resolve a queixa do dono
- Acaba com o efeito "tudo branco no mesmo plano" sem transformar o produto em dark mode.
- Dá peso de ferramenta profissional ("parece valer o preço") com hierarquia de superfícies, dados acionáveis e pré-visualizações reais.
- Escala perfeitamente do Dashboard ao Estúdio, Biblioteca, Billing e Admin.

---

## 2. Sistema de superfícies e tokens (`src/app/globals.css`)

| Papel | Modo Claro | Modo Escuro | Uso |
|---|---|---|---|
| **Canvas (`--background`)** | `#F2F2F7` | `#0F0B22` | Fundo geral do workspace (contraste real com cards brancos) |
| **Surface (`--card`)** | `#FFFFFF` | `#171230` | Cards principais com borda `#DDDCE8` e sombra suave em 2 camadas |
| **Sunken / Inset (`--surface-inset`)** | `#EAEAF2` | `#1E183A` | Áreas internas, barras de filtro, previews, barras de progresso |
| **Elevated (`--surface-elevated`)** | `#FFFFFF` + `--shadow-elevated` | `#201A3E` | Popovers, modais, barra fixa de ação |
| **Âncora da Marca (`--sidebar`)** | `#181331` (Navy) | `#120D28` | Sidebar autenticada no desktop — traz os **30% Navy** do manual para dentro do app! |
| **Sinal (`--brand-signal`)** | `#FD3E01` | `#FD3E01` | Indicador ativo na sidebar, barra de progresso crítica, CTA principal de destaque (texto grande ou ícone/filete respeitando WCAG AA) |

### Estados obrigatórios de componentes
Todos os componentes interativos (`Button`, `Card` interativo, `Input`, `Select`, `Tabs`, `NavLink`) mantêm:
- `default` · `hover` (transição 150ms) · `focus-visible` (`outline: 2px solid var(--ring); outline-offset: 2px`) · `active` · `disabled` (`opacity-50 pointer-events-none`) · `loading` (`Loader2` + `aria-busy`) · `error` (ícone + borda `destructive` + texto explicativo, nunca só cor).
- `prefers-reduced-motion: reduce` já preservado globalmente em `globals.css`.

---

## 3. Arquitetura de Informação — Mapa Antes vs. Depois

### Antes
- **Sidebar plana (6 itens sem agrupamento):**
  `Início`, `(Administração misturado no topo)`, `Meus conteúdos`, `Concorrentes` (ícone `BarChart3`), `Resultados` (mesmo ícone `BarChart3`), `Pacote Google`, `Configurações` (levava só para `/settings/brand`, escondendo `/settings/account`, `/settings/billing` e `/settings/privacy`).
- **Topbar:** quase vazia (créditos em texto simples + `Buscar` + menu mobile).
- **Mobile:** renderizava a `<AppSidebar />` vertical dentro de uma barra inferior horizontal.

### Depois
- **Sidebar Navy `#181331` agrupada por intenção:**
  - **CTA de topo:** `Criar conteúdo` (`/studio/new`, botão de alto destaque)
  - **PRODUÇÃO**
    - `Início` (`/app`) — Central de trabalho
    - `Biblioteca` (`/campaigns`) — Grade visual + lista de conteúdos
  - **INTELIGÊNCIA**
    - `Concorrentes` (`/competitors` — ícone `Radar`)
    - `Resultados` (`/telemetry` — ícone `TrendingUp`)
    - `Pacote Google` (`/google` — ícone `Globe`)
  - **MARCA & CONTA**
    - `Marca e voz` (`/settings/brand` — ícone `Palette`)
    - `Plano e créditos` (`/settings/billing` — ícone `CreditCard`)
    - `Minha conta` (`/settings/account` — ícone `UserRound`)
  - **Rodapé da Sidebar:**
    - Card **Saúde de Créditos** com barra visual proporcional (`saldo / cota mensal`) + link rápido `Gerenciar plano`
    - Link discreto **Administração** (`/admin`, visível apenas para `isPlatformAdmin`, separado do fluxo de produto)
    - `UserMenu` com avatar de iniciais da conta
- **Topbar contextual:**
  - Breadcrumb / título dinâmico da seção atual (`AppTopbarContext`)
  - Chip de marca ativa (quando há marca cadastrada) com atalho para `/settings/brand`
  - Pílula de créditos + Busca global (`Ctrl K`, vocabulário sincronizado) + Tema + Menu da conta
- **Mobile (`< lg`):**
  - Barra inferior dedicada (`MobileBottomNav`) com **4 ações ergonômicas (≥ 44px)**: `Início`, `Criar`, `Biblioteca`, `Conta` (mais acesso completo via `CommandMenu` / menu da conta), zero overflow em 390px.
