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
| `SUPABASE_SERVICE_ROLE_KEY` | sim (rotas de servidor) | sem ela: estúdio, billing, Storage e LGPD não operam |
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

### Projeto remoto (Kitefy)

Projeto atual: `exinnzybuxudnmhokosv` — <https://exinnzybuxudnmhokosv.supabase.co>

**Caminho sem Docker e sem senha do banco (recomendado):**

1. Dashboard → **SQL Editor** → New query
2. Cole todo o conteúdo de **`supabase/kitefy-setup.sql`** (gerado por `npm run db:setup-sql`)
3. Run → confirme 11 tabelas em `public`, todas com `rowsecurity = true`

**Caminho por CLI (requer a senha do banco):**

```bash
npx supabase link --project-ref exinnzybuxudnmhokosv
npx supabase db push
SUPABASE_DB_URL=postgresql://... npm run db:langgraph-setup
```

> A chave publicável (`sb_publishable_...`) cobre auth, onboarding e leituras protegidas por RLS.
> As rotas de servidor — estúdio, billing, Storage e LGPD — exigem a **secret key** em
> `SUPABASE_SERVICE_ROLE_KEY`. Sem ela, a geração falha com erro explicativo, nunca em silêncio.

Confirme no painel:

1. **Auth → Providers → Google** habilitado (o produto não guarda token social; Google é só
   identidade).
2. **Storage**: bucket `brand-assets` privado (criado pela migration 0005).
3. **Database → Extensions**: `vector` ≥ 0.8, `pgmq`, `pg_trgm`, `pgcrypto`.
4. **Database → Schemas expostos**: apenas `public` e `graphql_public`. `langgraph` **não** pode
   aparecer — se aparecer, remova (os checkpoints ficariam legíveis pela API).

---

## 2b. Provedores de LLM (configuração atual: DeepSeek + Gemini)

| Papel | Variável | Valor |
| --- | --- | --- |
| Roteamento, kits, guardrail | `MODEL_ROUTER` / `MODEL_GUARDRAIL` | `deepseek:deepseek-chat` |
| Artigos GEO e landing pages | `MODEL_QUALITY` | `deepseek:deepseek-chat` (ou `deepseek:deepseek-reasoner`) |
| Embeddings (busca vetorial) | `MODEL_EMBEDDING` | `google:gemini-embedding-2` (768d) |

Chaves necessárias em `live`: **`DEEPSEEK_API_KEY`** (texto) e
**`GOOGLE_GENERATIVE_AI_API_KEY`** (embeddings). A DeepSeek **não oferece** API de
embeddings, por isso o Google permanece nesta função.

### Saída estruturada: por que two paths

- Anthropic/Google/OpenAI: `generateObject` com JSON Schema — o provedor é obrigado a
  respeitar o contrato.
- DeepSeek: o modo JSON garante apenas "é JSON". O código então **extrai o objeto**
  (`parseJsonObject`), **valida com zod** (`content-schemas.ts`) e **retenta** até 3 vezes
  passando os erros de validação no prompt.
- Custo do retry: só acontece quando o modelo desvia do formato (minoria dos casos) e a
  chamada é na DeepSeek, cujo token é uma fração do preço de Sonnet.

Para voltar a Anthropic/Google, basta trocar as três variáveis `MODEL_*` — nenhum código muda.

## 2c. SERP real e leitura do site

### Ligar o SERP real (Serper)

1. Crie a conta em **https://serper.dev** (2.500 consultas grátis; depois ~US$ 50/100k).
2. Dashboard → **API Key** → copie.
3. `.env.local` e Vercel:
   ```
   SERP_PROVIDER=serper
   SERPER_API_KEY=...
   ```
Sem a chave, `SERP_PROVIDER=mock` devolve perguntas e lacunas **sintéticas** (determinísticas, para demo/teste).

### Contagem de palavras do artigo GEO

O modelo **não sabe contar palavras** (declarou 1.520 para um texto de 1.241). Por isso o campo
`word_count` da resposta é descartado: o pipeline recalcula o total e valida a faixa
1.450–2.550. Se estiver fora, a mensagem de erro diz quantas faltam ("faltam 191 palavras"),
o que alimenta a retentativa. Blocos do artigo exigem mínimo de **100 palavras** — sem isso o
modelo entregava três parágrafos curtos e o texto nunca chegava ao tamanho contratado.

### Leitura do site no onboarding

Quando o usuário informa uma URL, o onboarding lê até 5 páginas (home + institucionais) e extrai:
título, descrição, headings (tópicos), tipos de JSON-LD e **candidatos a fato verificável** com a URL de origem.

Limites e salvaguardas:

| Item | Valor |
| --- | --- |
| Páginas por marca | 5 |
| Tempo total | 12s no onboarding (20s no crawler) |
| Bytes por página | 1,5 MB |
| Execução de JS | nenhuma (HTML estático) |
| `robots.txt` | respeitado; bloqueio é registrado em `needs_review` |
| Destinos | só http(s), porta 80/443, host público (bloqueia localhost, IPs privados e metadados de nuvem) |

Os fatos extraídos entram como **não verificados** e a UI pede confirmação — o sistema nunca inventa número:
sem evidência concreta (ano, moeda, %, milhar, escala) e sem verbo de afirmação, a frase é descartada.

## 3. Vercel

1. Importe o repositório; framework detectado: Next.js. **Não** é preciso build command customizado.
2. Configure as env vars por ambiente (Production/Preview/Development):

| Variável | Production | Preview | Observação |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | URL final | URL do preview | base dos `redirectTo` do Auth |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | chave publicável (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | **secret key** (`sb_secret_…`) — marque como Sensitive |
| `SUPABASE_STORAGE_BUCKET` | `brand-assets` | idem | |
| `LLM_PROVIDER_MODE` | `mock` ou `live` | `mock` | mock não gasta crédito de LLM |
| `SERP_PROVIDER` | `mock`/`serper` | `mock` | |
| `IMAGE_PROVIDER` | `none` | `none` | |
| `EMBEDDING_DIMENSION` | `768` | `768` | igual ao `vector(768)` do banco |
| `SUPABASE_DB_URL` | recomendado | opcional | sem ela o checkpointer usa `MemorySaver` |
| `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET` | quando ativar cobrança | — | ausentes → rotas de billing respondem 503 |
| `GA4_WEBHOOK_SECRET` | opcional | — | ≥ 16 caracteres |

3. **Supabase → Authentication → URL Configuration**: adicione `https://SEU-DOMINIO/auth/callback`
   em *Redirect URLs* e defina a *Site URL* com o domínio de produção. Sem isso o link de
   confirmação de e-mail cai em `localhost`.
4. **Confirmação de e-mail**: o projeto está com `mailer_autoconfirm = false`. Para testar o
   login imediatamente após o deploy, desative “Confirm email” em
   *Authentication → Providers → Email* (ou confirme pelo link recebido).
5. **Fluid Compute** habilitado (padrão no Pro).
6. Rotas que já declaram `maxDuration`:
   - `/api/studio/start` → 300s (geração de artigo GEO)
   - `/(app)/studio/[threadId]` → 300s (leitura de estado + assinatura de URLs)

### Depois do primeiro deploy

```bash
# valida chaves, schema, bucket e service_role contra o projeto real
npx tsx scripts/check-supabase.ts

# fluxo completo (signup → grafo → render → Storage → aprovação → débito → ZIP)
npx tsx scripts/e2e-check.ts
```
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

## 5. Mercado Pago — cobrança, renovação e go-live

### 5.1 O que está implementado

| Fluxo | Evento | Resultado |
| --- | --- | --- |
| Assinatura autorizada | `subscription_preapproval` | grava `mp_subscriptions`, atualiza `plan_tier` e credita o **mês corrente** (`subscription_credit`) |
| Renovação mensal | `subscription_authorized_payment` | confirma a cobrança na API e credita o mês (`subscription_renewal`) |
| Pagamento avulso | `payment` | creditado quando o `external_reference` traz o tenant |
| Outros | `merchant_order`, chargebacks | arquivados (`topic_not_handled`) |

Idempotência em três camadas: `mp_webhook_events.mp_event_id` (evento), `processed_at` (worker) e
`credit_ledger.reference_id` (`subscription:<preapproval>:AAAA-MM` e
`subscription_payment:<chargeId>`). Reentrega do MP não duplica crédito.

O worker roda **logo após o webhook** (hook `after()` do Next) e o cron diário é a rede de
segurança para falhas.

### 5.2 Variáveis

```
MP_ACCESS_TOKEN=...                 # TEST- para sandbox, APP_USR- para produção
NEXT_PUBLIC_MP_PUBLIC_KEY=...       # tokenização do cartão no navegador
MP_WEBHOOK_SECRET=...               # assinatura secreta do webhook (uma por modo)
MP_ENVIRONMENT=sandbox|production   # rótulo: o prefixo do token é que manda
CRON_SECRET=...                     # Bearer do cron da Vercel
```

O segredo de produção pode ficar em `MP_WEBHOOK_SECRET_PRODUCTION` até a virada.

### 5.3 Configuração no painel (developers → aplicação)

1. **Webhooks** → modo que vai usar → URL `https://kitefy.vercel.app/api/webhooks/mercadopago`
2. Eventos: **Planos e assinaturas** e **Pagamentos (legacy)**. Nada além disso.
3. Salvar e copiar a **assinatura secreta**.
4. **Contas de teste** → criar dois usuários: **recebedor** (dono do token) e **comprador**.
   O Mercado Pago recusa `payer_email` igual ao recebedor (`Payer and collector cannot be the same user`).
5. O e-mail do comprador de teste segue `test_user_<id>@testuser.com`.

### 5.4 Roteiro de validação (sem cobrança real)

```bash
npm run mp:check                                        # valida token e mostra a conta
npm run mp:check -- --create --cancel --payer=<email>   # assinatura pendente + link, cancelada depois
```

Fluxo manual do crédito:

1. criar assinatura pendente com `external_reference` = UUID do tenant;
2. abrir o `init_point` como comprador e pagar com cartão de teste
   (`5031 4332 1540 6351`, nome `APRO`, validade futura, CVV `123`);
3. o webhook chega → worker roda sozinho → `mp_subscriptions.status = active` e **+120 créditos**;
4. repetir o evento: `already_processed` e **nenhum** crédito novo;
5. conferir `credit_ledger` com uma linha por cobrança.

Testar o HMAC diretamente (sem pagar):

```ts
// assina id:<data.id>;request-id:<uuid>;ts:<epoch>; com MP_WEBHOOK_SECRET
POST https://kitefy.vercel.app/api/webhooks/mercadopago?data.id=<id>&type=payment
headers: x-signature: ts=<epoch>,v1=<hmac>   x-request-id: <uuid>
```

Respostas esperadas: **200** aceito · **401** assinatura inválida (o corpo traz `reason`:
`missing_header`, `invalid_header`, `expired`, `mismatch`) · **503** banco indisponível.

### 5.5 Go-live

1. Conta **DEKUP** → “Credenciais de produção” (setor, site, consentimento, captcha).
2. Copiar Access Token/Public Key `APP_USR-…` → Vercel (Production + Preview).
3. Trocar `MP_WEBHOOK_SECRET` pelo segredo do modo produção → **Redeploy**.
4. Repetir o roteiro 5.4 com um cartão real de valor baixo e **estornar** em seguida.
5. Criar o cron do worker (diário no Hobby) e conferir `CRON_SECRET`.
6. Monitorar `mp_webhook_events` com `processed_at is null` por mais de 10 min → alerta.

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
