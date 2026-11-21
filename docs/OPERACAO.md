# Operação e go-live

Checklist executável, do ambiente local ao primeiro pagamento real.

---

## 1. Variáveis de ambiente

Copie `.env.example` para `.env.local` (nunca commite). Todas são validadas por zod em
`src/lib/env.ts`; o boot loga um resumo sem segredos.

| Variável | Obrigatória | Observação |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | sim | base dos `redirectTo` do Auth e do `backUrl` do MP |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | públicas por desenho (RLS protege) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | **somente servidor**; nunca no bundle |
| `SUPABASE_DB_URL` | recomendada | PostgresSaver, pgmq e transações; sem ela usa `MemorySaver` |
| `SUPABASE_STORAGE_BUCKET` | não | default `brand-assets` |
| `LLM_PROVIDER_MODE` | não | `mock` (default) ou `live` |
| `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | em `live` | modelo por spec `provider:model` |
| `MODEL_ROUTER` / `MODEL_QUALITY` / `MODEL_GUARDRAIL` / `MODEL_EMBEDDING` | não | defaults no `.env.example` |
| `EMBEDDING_DIMENSION` | não | 768 por padrão; mudar exige `ALTER TABLE` + reindex |
| `SERP_PROVIDER` (`serper`/`gemini_grounding`/`mock`), `SERPER_API_KEY` | conforme | mock não bate rede |
| `IMAGE_PROVIDER` (`none`/`google_nano_banana`/`seedream`/`mock`) | não | `none` = só Satori |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | em billing | ausência → rotas de cobrança respondem 503 |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | em cartão | Payment Brick no navegador |
| `MP_PLAN_ESSENTIAL/PRO/AGENCY` | opcional | ids de `preapproval_plan` |
| `GA4_WEBHOOK_SECRET` | opcional | ≥ 16 chars; habilita `/api/webhooks/ga4` |

### Trocar a dimensão do embedding

```sql
alter table public.knowledge_chunks
  alter column embedding type extensions.vector(1024);
drop index if exists public.knowledge_chunks_embedding_hnsw_idx;
create index knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);
```

Depois: `EMBEDDING_DIMENSION=1024`, reindexar todos os chunks (`knowledge_chunks` → recomputar
via script ou reimportar documentos). Nunca deixe o valor do banco diferente do ambiente: a
`assertEmbeddingDimension` falha em vez de gravar vetor inconsistente.

---

## 2. Supabase

### Local (Docker)

```bash
npx supabase start
npx supabase db reset          # aplica as 6 migrations
npm run db:langgraph-setup     # checkpoints do LangGraph
npm run db:seed                # marca demo + conhecimento + telemetria
```

### Projeto remoto

```bash
npx supabase link --project-ref <ref>
npx supabase db push
SUPABASE_DB_URL=postgresql://... npm run db:langgraph-setup
```

Confirme no painel:

1. **Auth → Providers → Google** habilitado (o produto não guarda token social; Google é só
   identidade).
2. **Storage**: bucket `brand-assets` privado (criado pela migration 0005).
3. **Database → Extensions**: `vector` ≥ 0.8, `pgmq`, `pg_trgm`, `pgcrypto`.
4. **Database → Schemas expostos**: apenas `public` e `graphql_public`. `langgraph` **não** pode
   aparecer — se aparecer, remova (os checkpoints ficariam legíveis pela API).

---

## 3. Vercel

1. Importe o repositório; framework detectado: Next.js.
2. Configure as env vars por ambiente (Production/Preview/Development).
3. **Fluid Compute** habilitado (padrão no plano Pro).
4. Rotas que já declaram `maxDuration`:
   - `/api/studio/start` → 300s (geração de artigo GEO)
   - `/(app)/studio/[threadId]` → 300s (leitura de estado + assinatura de URLs)
5. `serverExternalPackages` em `next.config.ts` mantém `@resvg/resvg-js`, `sharp`, `pg` e o
   checkpointer fora do bundle — não remova.
6. `outputFileTracingIncludes` garante as fontes Geist nas rotas de render.

### Deploy de produção

```bash
npm run verify:licenses
npm run lint && npm run typecheck && npm test && npm run build
```

---

## 4. Filas e worker

| Fila | Produtor | Consumidor |
| --- | --- | --- |
| `mp_webhook_events` | `/api/webhooks/mercadopago` | `/api/jobs/mercadopago` |
| `telemetry_distiller` | destilação pós-telemetria | `runTelemetryDistiller` |
| `asset_generation` | gerações longas | (reservado) |

Agende o worker com Cron da Vercel (ex.: `*/2 * * * *`) enviando o header
`x-worker-secret: $MP_WEBHOOK_SECRET`. O worker valida o segredo em tempo constante e responde
503 se o Mercado Pago não estiver configurado.

Fallback: sem `pgmq` (dev/teste), `enqueue_job` grava em `private.job_queue` e o worker lê de lá.

---

## 5. Mercado Pago — validação no Sandbox

1. Crie a aplicação no painel de developers e copie o **Access Token de teste**.
2. Configure o webhook apontando para `https://SEU-DOMINIO/api/webhooks/mercadopago`, eventos
   `payment`, `subscription_preapproval` e `subscription_authorized_payment`.
3. Copie o **secret** do webhook para `MP_WEBHOOK_SECRET`.
4. Roteiro de teste:
   - assinar plano Pro com **Pix Automático** → deve redirecionar ao `init_point`;
   - autorizar no app do banco de teste → `mp_subscriptions` recebe `pending`/`authorized`;
   - simular pagamento aprovado → webhook 200 → worker credita o plano **uma vez** (repita o
     evento: `mp_webhook_events` bloqueia duplicata e o crédito é idempotente por `reference_id`);
   - adulterar `x-signature` → deve responder **401** sem nenhuma escrita;
   - conferir `credit_ledger` com uma linha por cobrança.

Cartão recorrente: só funciona com `NEXT_PUBLIC_MP_PUBLIC_KEY` e o Payment Brick renderizado no
navegador (o token do cartão nasce no cliente).

---

## 6. Limites de gasto (obrigatório antes do go-live)

Configure **spend caps** nos consoles:

| Provedor | Onde |
| --- | --- |
| Anthropic | Console → Limits → monthly spend limit |
| Google AI (Gemini) | Cloud Billing → budget + alertas |
| OpenAI (se usado) | Billing → hard limit |
| Serper | Dashboard → plano/limite de consultas |

Sem esses limites, um bug de loop no grafo vira fatura. O modo `mock` existe justamente para
validar fluxo sem esse risco.

---

## 7. Operação do dia a dia

### Ver telemetria de custo por ativo

Está no JSONB `content_payload._meta` do ativo e no painel “Uso de IA” do estúdio
(`models`, `compliance_reviewer`, `requires_transparency_label`, `bandit_arm`, `credits`).

### Reprocessar um webhook que falhou

```sql
select id, mp_event_id, topic, processed_at from public.mp_webhook_events
 where processed_at is null order by created_at;
```

Reenvie o evento pelo painel do MP ou chame o worker; a idempotência evita crédito duplo.

### Auditoria de isolamento

```bash
npm test -- tests/db/rls-isolation.test.ts
```

15 cenários provam que um tenant não lê, não altera e não apaga dados de outro, incluindo
`INSERT` com `tenant_id` alheio.

### Exclusão LGPD sob demanda

Disponível para o próprio cliente em `/settings/privacy` (exportação + exclusão com confirmação
`EXCLUIR`). Para pedidos por e-mail, execute `eraseTenant`/`eraseBrand` via script interno com
`SUPABASE_SERVICE_ROLE_KEY` — a ordem das etapas está documentada em `docs/ARQUITETURA.md §8`.

---

## 8. Incidentes comuns

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| `permission denied for schema extensions` | grant ausente na migration 0004 | reaplique a migration |
| `insufficient_credits` em ativo novo | saldo do tenant menor que o custo | `/settings/billing` ou `grant` interno |
| `Brand não encontrada` no `/api/studio/start` | RLS bloqueando (marca de outro tenant) | verifique `tenant_members` |
| `SET LOCAL hnsw.iterative_scan` falha | pgvector < 0.8 | upgrade da extensão; o código já tolera a ausência |
| Render sem imagens | bucket/credenciais | cheque `SUPABASE_STORAGE_BUCKET` e a policy de Storage |
| Estado do thread perdido | `SUPABASE_DB_URL` ausente (MemorySaver) | configure a connection string |
| Webhook 401 | `MP_WEBHOOK_SECRET` divergente | recopie o secret do painel |

---

## 9. Escala

- Conexões: `pg.Pool` com `max: 5` (serverless). No Supabase, use o pooler em modo
  transaction para `SUPABASE_DB_URL`.
- `pgmq` absorve picos de webhook; o ACK é imediato e o processamento é assíncrono.
- Render é CPU-bound: uma geração de 8 slides custa ~1–3s; `geo_article` é dominado pelo LLM.
- Créditos são serializados por linha do tenant (`FOR UPDATE`) — sem lost update sob concorrência.
