# Kitefy — pacotes ágeis de marketing orgânico

SaaS B2B de conteúdo orgânico em pacotes (Start / Lift / Flow) com orquestração multi-agente
(LangGraph.js, MIT), PostgreSQL/Supabase, renderização programática de imagens (Satori + resvg) e
cobrança no Brasil via Mercado Pago.

- **Repositório:** <https://github.com/dekup-system/kitefy>
- **Supabase:** projeto `exinnzybuxudnmhokosv`
- **Identidade visual:** [`docs/KITEFY-BRAND.md`](docs/KITEFY-BRAND.md) — paleta, proporção
  60/30/10, contraste medido e desvios justificados

> **Entrega sem atrito, sem rede social.** Nada de OAuth de Meta/Instagram/TikTok/LinkedIn/X/YouTube,
> nada de avatar digital, lip-sync, TTS ou clonagem de voz. O conteúdo sai para cópia em 1 clique,
> download ZIP (PNG/JPEG), Markdown, HTML e JSON-LD, ou webhook para o CMS do cliente.

---

## 1. Estado da entrega

| Fase | Escopo | Situação |
| --- | --- | --- |
| 1 | Fundação, schema, RLS, RPC vetorial, isolamento entre tenants | ✅ |
| 2 | Núcleo do agente MIT, estúdio visual, onboarding < 90s | ✅ |
| 3 | Motor GEO/SERP, JSON-LD, telemetria + Thompson Sampling | ✅ |
| 4 | Mercado Pago (Checkout/Pix/preapproval), webhook HMAC, LGPD | ✅ |
| 5 | Polimento UX, acessibilidade, CI, documentação de go-live | ✅ |

Verificação automatizada atual:

```
23 arquivos de teste · 237 testes passando
tsc --noEmit .............. 0 erros
eslint . .................. 0 erros, 0 avisos
next build ................ 26 rotas compiladas
npm run verify:licenses ... APROVADO
```

---

## 2. Stack (e por quê)

| Camada | Escolha | Licença |
| --- | --- | --- |
| Front/back | Next.js 16 (App Router) + React 19.3 + TypeScript strict | MIT / Apache-2.0 |
| Estilo | Tailwind CSS v4 (tokens OKLCH, `@theme inline`, `@custom-variant dark`) | MIT |
| UI | shadcn/ui escrito à mão (Radix + cva + `data-slot`), Geist Sans/Mono | MIT / ISC / SIL OFL |
| Dados/Auth/Storage | Supabase (Postgres, Auth Google+e-mail, Storage privado, pgvector, pgmq, Vault) | MIT/Postgres |
| Orquestração | `@langchain/langgraph` + `langgraph-checkpoint-postgres` | **MIT** |
| Streaming/LLM | Vercel AI SDK (`ai`, `@ai-sdk/*`) | Apache-2.0 |
| Render | `satori` + `@resvg/resvg-js` + `sharp` | MPL-2.0 / Apache-2.0 |
| Pagamentos | `mercadopago` SDK oficial | ver `docs/DEPENDENCIAS-LICENCAS.md` |

Detalhamento completo e auditoria: [`docs/DEPENDENCIAS-LICENCAS.md`](docs/DEPENDENCIAS-LICENCAS.md).

---

## 3. Rodar localmente

```bash
# 1. dependências (Node >= 22)
npm install
npm install-scripts approve esbuild   # postinstall do esbuild (vitest/tsx)

# 2. ambiente
cp .env.example .env.local            # preencha o que for usar

# 3. desenvolvimento (modo mock: sem nenhuma chave externa)
npm run dev
```

Com `LLM_PROVIDER_MODE=mock` (padrão) o produto funciona ponta a ponta — onboarding, geração,
aprovação, render, exportação, telemetria e aprendizado — sem chamar nenhum provedor.
O conteúdo é gerado por um motor determinístico com bancos de frases em PT-BR.

### Banco no projeto real (sem Docker)

Cole **`supabase/kitefy-setup.sql`** no SQL Editor do Supabase e clique em Run. O arquivo é
idempotente: cria as 11 tabelas com RLS, as funções transacionais, o bucket privado e as filas.
Depois:

```bash
SUPABASE_DB_URL=postgresql://... npm run db:langgraph-setup   # checkpoints do LangGraph
```

Rotas de servidor (estúdio, billing, Storage, LGPD) exigem `SUPABASE_SERVICE_ROLE_KEY`
(Supabase → Project Settings → API Keys → Secret keys). A chave publicável
(`sb_publishable_...`) cobre auth, onboarding e leituras protegidas por RLS.

### Supabase local (opcional, requer Docker)

```bash
npx supabase start          # sobe Postgres + Auth + Storage + Studio
npx supabase db reset       # aplica supabase/migrations/*.sql
npm run db:langgraph-setup  # cria as tabelas do PostgresSaver no schema langgraph
```

> O schema/RLS também é validado **sem Docker** pelo harness PGlite em `tests/db/harness.ts`,
> que aplica exatamente os mesmos arquivos de migration.

---

## 4. Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | Next em modo desenvolvimento |
| `npm run build` / `start` | Build e execução de produção |
| `npm run lint` | ESLint 9 (flat config, Next 16) |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm test` | 232 testes: RLS, créditos, pgvector, agente, visual, billing, GEO, export |
| `npm run test:coverage` | Mesmos testes com cobertura |
| `npm run verify:licenses` | Auditoria de licenças (reprova AGPL/GPL forte) |
| `npm run db:langgraph-setup` | `checkpointer.setup()` no schema `langgraph` (nunca no boot) |
| `npm run db:seed` | Popula uma marca demo + conhecimento + telemetria |

---

## 5. Arquitetura em uma tela

```
┌──────────────────────────── Next.js 16 (App Router, Fluid Compute) ────────────────────────────┐
│  Rotas de UI              Server Actions                 Route Handlers                          │
│  /onboarding              approve/reject ativo           /api/studio/start   (maxDuration 300)  │
│  /studio/[threadId]       salvar marca                   /api/assets/[id]/export (zip|md|html)  │
│  /campaigns /telemetry    importar CSV                   /api/billing/*  /api/webhooks/*        │
└───────────────┬───────────────────────────┬──────────────────────────┬──────────────────────────┘
                │                           │                          │
        ┌───────▼────────┐        ┌─────────▼─────────┐      ┌─────────▼──────────┐
        │ LangGraph.js   │        │ Satori + resvg    │      │ Mercado Pago SDK   │
        │ (MIT)          │        │ PNG 4:5 / 9:16    │      │ Checkout/Pix/      │
        │ StateGraph +   │        │ tokens da marca   │      │ preapproval        │
        │ interrupt()    │        └─────────┬─────────┘      └─────────┬──────────┘
        └───────┬────────┘                  │                          │
                │                           │                          │
        ┌───────▼───────────────────────────▼──────────────────────────▼──────────┐
        │ Supabase: Postgres 17 · RLS em 11 tabelas · pgvector(HNSW) · pgmq       │
        │ schema langgraph isolado (service_role) · Storage privado · Auth        │
        └─────────────────────────────────────────────────────────────────────────┘
```

Pipeline do agente (detalhes em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)):

```
START → brandContext → [researchSeoGeo] → banditSelector → contentGenerator
      → complianceGuardrail ⇄ contentGenerator (máx. 2 retentativas)
      → visualRender → humanApproval (interrupt) → finalizeAsset → END
```

---

## 6. Créditos e planos

| Ativo | Créditos |
| --- | --- |
| `short_script_kit`, `typo_carousel`, análise SERP | 1 |
| `single_creative` | 2 |
| `hybrid_carousel`, `lp_copy` | 3 |
| `geo_article` | 5 |

| Plano | Preço | Créditos/mês | Marcas |
| --- | --- | --- | --- |
| Essencial | R$ 49,90 | 120 | 1 |
| Crescimento Pro | R$ 119,90 | 360 | 3 |
| Agência Escala | R$ 269,90 | 1.000 | 10 |

O débito acontece **apenas após a aprovação humana**, em transação com `FOR UPDATE`
(`consume_credits`). Falha técnica gera estorno.

---

## 7. Estrutura

```
src/
  app/                rotas de UI e Route Handlers
  components/ui/      26 primitivas shadcn (data-slot, cva, a11y AA)
  components/app/     shell autenticado, busca Cmd+K, menu
  lib/
    agent/            grafo LangGraph, nós, bandit, checkpointer, distiller
    ai/               roteamento de modelos, schemas zod, prompts, mock determinístico
    visual/           tokens OKLCH, templates, render satori/resvg, storage
    geo/              JSON-LD (Article/FAQ/Product) e Markdown/HTML
    serp/             Serper, Gemini Grounding e mock
    compliance/       regras CONAR determinísticas
    telemetry/        CSV, GA4, server actions
    billing/          Mercado Pago, HMAC, idempotência, assinaturas
    privacy/          exportação e exclusão (LGPD)
    export/           pacote ZIP/MD/HTML/JSON sem dependência
supabase/migrations/  6 migrations idempotentes (schema, RLS, funções, storage, filas)
tests/                harness PGlite + 232 testes
docs/                 arquitetura, operação, licenças, fases
```

---

## 8. Privacidade por desenho

- Zero biometria: nenhum dado facial ou de voz é coletado, armazenado ou processado.
- Zero treinamento com dados de clientes: provedores são usados apenas para gerar o ativo.
- Chaves somente no servidor (`SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN` nunca no bundle).
- LGPD Art. 18: exportação completa em JSON e exclusão definitiva (marca ou conta) com
  `checkpointer.deleteThread()`, purga do Storage e anonimização de registros fiscais.

---

## 9. Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — decisões, schema, RLS, grafo, bandit, JSON-LD
- [`docs/OPERACAO.md`](docs/OPERACAO.md) — env, deploy Vercel/Supabase, workers, spend caps, checklist MP
- [`docs/KITEFY-BRAND.md`](docs/KITEFY-BRAND.md) — identidade cromática aplicada e contraste medido
- [`docs/DEPENDENCIAS-LICENCAS.md`](docs/DEPENDENCIAS-LICENCAS.md) — auditoria e justificativas
- [`docs/FASES.md`](docs/FASES.md) — critérios de aceite por fase e evidências
