# Roadmap e critérios de aceite por fase

Cada fase lista o que foi entregue, **onde** e **como foi verificado**. Nenhuma fase avança com
critério em aberto.

---

## Fase 1 — Fundação, schema e segurança

### Entregue
- Next.js 16 + TypeScript strict (`noUncheckedIndexedAccess`) + Tailwind v4 (tokens OKLCH) +
  shadcn/ui (26 primitivas) + Supabase SSR (`@supabase/ssr`, `proxy.ts` no lugar de
  `middleware.ts`).
- 6 migrations idempotentes em `supabase/migrations/`:
  `0001` extensões e schemas · `0002` 11 tabelas e índices · `0003` funções transacionais e RPC ·
  `0004` RLS e grants · `0005` storage/langgraph/pgmq · `0006` busca vetorial do agente.
- `match_knowledge_chunks` com B-tree `(tenant_id, brand_id)` + HNSW cosseno +
  `SET LOCAL hnsw.iterative_scan = relaxed_order`.
- `consume_credits` com `SELECT ... FOR UPDATE`, bloqueio de saldo negativo e ledger auditável.
- Harness de banco sem Docker: PGlite + pgvector 0.8.7 aplicando **as migrations reais**.

### Verificação
```
tests/db/schema.test.ts          9 ✓  RLS nas 11 tabelas, policies, vector(768), B-tree+HNSW,
                                      hook_rate gerado, trigger de signup
tests/db/rls-isolation.test.ts  15 ✓  SELECT/UPDATE/DELETE/INSERT cross-tenant bloqueados,
                                      ledger/mp/bandit somente leitura, viewer restrito, anon negado
tests/db/credits.test.ts         9 ✓  débito, estorno, recusa de saldo negativo, P75, bandit
tests/db/vector-search.test.ts   6 ✓  isolamento por marca, ordenação, threshold, forbidden, source
```

---

## Fase 2 — Núcleo do agente MIT + estúdio visual + onboarding

### Entregue
- `StateGraph` tipado (`src/lib/agent/state.ts`) com 8 nós e roteamento condicional
  (`src/lib/agent/graph.ts`).
- `interrupt()` nativo para aprovação humana + `Command({ resume })` (`runner.ts`, `actions.ts`).
- `PostgresSaver` no schema `langgraph`, `setup()` apenas em script (`scripts/langgraph-setup.ts`),
  `LANGGRAPH_STRICT_MSGPACK=true` em `instrumentation.ts`.
- Thompson Sampling com amostragem Gamma → Beta, exploração obrigatória de braço inédito.
- Gerador mock determinístico em PT-BR com bancos de frase (paridade de schema com o LLM).
- Motor visual: tokens OKLCH/hex, `ensureContrast`, 5 layouts de slide, PNG 4:5 e 9:16, JPEG
  opcional, upload em Storage privado, composição de imagem IA sem perder o enquadramento.
- Onboarding: campo único (URL ou descrição) + 3 templates de nicho, extração de marca e
  sugestão de primeiro ativo.

### Verificação
```
tests/agent/bandit.test.ts            8 ✓  16 braços, Beta no intervalo, exploração, regra 0.35/P75
tests/agent/graph-interrupt.test.ts   2 ✓  pausa no nó, payload exposto, retomada aprova/rejeita
tests/ai/mock-generator.test.ts      13 ✓  payload válido nos 6 tipos, determinismo, 8–15 palavras
tests/visual/render.test.ts          17 ✓  IHDR 1080x1350/1920, magic bytes, JPEG, contraste, híbrido
tests/export/*.test.ts               16 ✓  ZIP (estrutura + CRC32), MD/HTML/JSON por tipo de ativo
```

---

## Fase 3 — Motor GEO, SERP e aprendizado contínuo

### Entregue
- SERP com três provedores (`serper`, `gemini_grounding`, `mock`) e cache de 15 min.
- Artigo GEO 1.500–2.500 palavras em blocos **Fato Direto → Contexto → Dados Verificáveis**.
- JSON-LD `Article + FAQPage + Product` com validação e escape de `</script>`, U+2028/2029.
- Exportação Markdown/HTML sem dependência (HTML escapado).
- Telemetria: entrada manual, CSV (PT/EN, vírgula decimal, percentual) e webhook GA4 com segredo
  em tempo constante.
- Grafo assíncrono `telemetryDistiller`: atualiza α/β e reindexa o ativo campeão como
  `winning_post` em `knowledge_chunks` (idempotente por `asset_id`).

### Verificação
```
tests/serp/client.test.ts        9 ✓  mock determinístico, cache, serper sem chave falha explícito
tests/geo/jsonld.test.ts         9 ✓  Article/FAQ/Product, escape de script, validação de headline
tests/geo/markdown.test.ts       8 ✓  estrutura GEO, HTML escapado, assertGeoStructure
tests/compliance/rules.test.ts  23 ✓  10 bloqueadores + avisos, texto limpo passa
tests/telemetry/csv.test.ts     10 ✓  PT/EN, vírgula decimal, percentual, erro por linha
tests/telemetry/ga4.test.ts      5 ✓  agregação e descarte
tests/agent/jsonld-builder.test.ts 3 ✓ bundle gerado só para geo_article, validado
```

---

## Fase 4 — Mercado Pago e LGPD

### Entregue
- `Payment` (cartão) e Pix avulso, `PreApproval` de cartão e mandato de **Pix Automático**.
- `X-Idempotency-Key` (UUID v4) em toda criação + memoização de 10 min.
- Webhook: HMAC-SHA256 de `dataId:requestId:ts`, `timingSafeEqual`, janela de 300s, 401 sem
  escrita, 200 imediato após persistir em `mp_webhook_events` e enfileirar.
- Worker: confirma status na API do MP antes de creditar; crédito idempotente por `reference_id`.
- `nextDaytimeBillingWindow` (08h–18h BRT) para evitar bloqueio noturno.
- LGPD: exportação JSON completa, exclusão de marca e de conta com `deleteThread` + purga de
  Storage + anonimização de ledger.

### Verificação
```
tests/billing/webhook-signature.test.ts 26 ✓  válida, inválida, malformada, expirada, ausente,
                                               tamanho diferente não lança, ordem invertida
tests/billing/idempotency.test.ts       12 ✓  crédito único por pagamento, saldo e ledger, retry
tests/billing/subscription-sync.test.ts 25 ✓  mapeamento de status, janela 22h→08h, virada de mês
tests/billing/webhook-route.test.ts      7 ✓  401 sem escrita, 503 sem configuração, worker
```

---

## Fase 5 — Polimento, acessibilidade e go-live

### Entregue
- Tokens com contraste medido: texto 19.5:1 (claro) / 18.1:1 (escuro); `--input` ajustado para
  3.06:1 / 3.09:1 (WCAG 1.4.11). Nenhuma informação transmitida só por cor.
- Foco visível global, alvos ≥ 32px, `aria-label` em todo botão de ícone, `role="status"` no
  spinner, `aria-live` no copiar, `prefers-reduced-motion` respeitado.
- Busca global Cmd/Ctrl+K, tabelas filtráveis, skeleton e estados vazios acionáveis.
- CI GitHub Actions: licenças → lint → typecheck → testes → build + job de varredura de segredos.
- Documentação de operação com spend caps, checklist de sandbox do Mercado Pago e incidentes.

### Verificação
```
npm run lint ............ 0 erros, 0 avisos
npm run typecheck ....... 0 erros
npm test ................ 232 testes / 21 arquivos
npm run build ........... 26 rotas compiladas
npm run verify:licenses .. APROVADO
```

---

## Fase 0 (pré-lançamento comercial) — caminho de exposição mínima

Não é dívida técnica, é estratégia de validação:

1. Vercel Hobby + Supabase Free + GitHub Free + 2.500 consultas gratuitas do Serper.
2. 5 a 10 usuários-piloto com `LLM_PROVIDER_MODE` real, mas sem checkout de produção.
3. Upgrade para Vercel Pro + Supabase Pro (≈ US$ 50/mês) **no dia** da ativação do checkout real.
4. Spend caps configurados **antes** de virar a chave do billing.

---

## Pendências conscientes (não bloqueiam a entrega)

| Item | Motivo | Dono |
| --- | --- | --- |
| Licença do SDK `mercadopago` | campo `license` ausente no pacote | jurídico antes do go-live |
| Payment Brick do cartão | exige `NEXT_PUBLIC_MP_PUBLIC_KEY` e tokenização no navegador | próxima iteração |
| Links externos de aprovação (plano Agência) | a coluna de plano e o gate de recurso existem; a página pública com senha/expiração não foi construída | próxima iteração |
| Batch API (lotes assíncronos de artigo GEO) | hoje o `maxDuration` de 300s cobre a geração síncrona; a fila `asset_generation` está criada e reservada | quando houver volume |
| Supabase Vault / chaves BYOK | o spec trata como "eventual"; hoje as chaves vivem em env do servidor | quando houver cliente exigindo |
| Grounding do Gemini como provedor SERP | hoje falha com mensagem explícita | quando houver chave/quota |
| `logo_path` no render | exigiria fetch por slide | quando houver demanda |
| Docker local | requer WSL2/admin na máquina de desenvolvimento | ambiente do dev |
