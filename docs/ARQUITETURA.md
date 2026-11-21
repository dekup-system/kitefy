# Arquitetura — BrandPulse Organic & GEO Studio

Este documento registra **decisões**, não tutoriais. Onde houver trade-off, ele está explícito.

---

## 1. Princípios que governaram o desenho

1. **O banco é a fronteira de segurança.** Toda tabela de negócio tem `tenant_id` e RLS
   habilitada. Nenhuma rota confia em `tenant_id` vindo do cliente — membership é sempre
   revalidada no servidor e no banco.
2. **Entrega, não publicação.** O produto nunca fala com API de rede social. A saída é arquivo
   (ZIP/PNG/JPEG/MD/HTML/JSON-LD) ou webhook do CMS do cliente.
3. **Núcleo MIT.** O orquestrador é `@langchain/langgraph` (MIT). Nada de Postiz/AGPL ou
   módulos `ee/` proprietários no caminho crítico.
4. **Custo previsível.** Renderização programática (Satori/resvg) em vez de geração de imagem
   por padrão; modelo econômico para kits, modelo de qualidade só onde há retorno (GEO/LP).
5. **Tudo é testável offline.** Mock determinístico + PGlite permitem rodar 232 testes sem
   Docker, sem chave e sem rede.

---

## 2. Modelo de dados (11 tabelas)

```
tenants ──┬── tenant_members ── auth.users
          ├── brand_profiles ──┬── knowledge_chunks (vector 768 + HNSW)
          │                    ├── campaigns_and_assets ──┬── hook_variants
          │                    │                          └── performance_telemetry
          │                    └── bandit_arm_stats
          ├── credit_ledger
          └── mp_subscriptions / mp_webhook_events
```

Decisões relevantes:

| Decisão | Motivo |
| --- | --- |
| `text + CHECK` em vez de `enum` | evoluir domínio sem `ALTER TYPE` bloqueante |
| `credit_balance` materializado + `credit_ledger` | leitura O(1) na UI, auditoria completa no extrato |
| `hook_rate` como coluna **gerada** (`views_3s/impressions`) | impossível divergir do dado bruto |
| `bandit_arm_stats` com `unique (tenant, brand, arm_key)` | upsert atômico do Thompson Sampling |
| `knowledge_chunks.embedding vector(768)` | 768 cabe em HNSW com folga (limite 2000) |
| índice **B-tree** `(tenant_id, brand_id)` + **HNSW** cosseno | filtro seletivo antes da busca vetorial |
| `thread_id` em `campaigns_and_assets` | permite `deleteThread()` na exclusão LGPD |
| schema `langgraph` separado | checkpoints nunca expostos pelo PostgREST |

### Busca vetorial e `iterative_scan`

`match_knowledge_chunks` (usuário) e `match_brand_chunks` (agente/service_role) executam
`SET LOCAL hnsw.iterative_scan = relaxed_order` antes do `ORDER BY embedding <=> query`:

- HNSW com filtro pode devolver menos que `k` candidatos; `relaxed_order` continua varrendo até
  preencher o `k`, preservando recall quando `tenant_id + brand_id` descartam a maioria dos nós.
- O `SET LOCAL` roda em bloco com `EXCEPTION` para tolerar pgvector < 0.8 (ambiente antigo).
- Funções usam `set search_path = ''` e, por isso, o operador é qualificado:
  `OPERATOR(extensions.<=>)`. Sem isso o operador não resolve com `search_path` vazio — foi um
  bug real encontrado pelo teste de integração.

### RLS

- `public.is_tenant_member(uuid)` é `SECURITY DEFINER` justamente para a política de
  `tenant_members` não recursar em si mesma.
- `credit_ledger`, `mp_subscriptions` e `bandit_arm_stats` são **somente leitura** para
  `authenticated`; escrita só por `service_role` (funções e webhooks).
- `mp_webhook_events` não tem `tenant_id` (payload de terceiros) → **nenhuma política** para
  `authenticated`, apenas `service_role`.
- Testes em `tests/db/rls-isolation.test.ts` provam 15 cenários de cross-tenant, incluindo
  `INSERT` com `tenant_id` alheio e `UPDATE`/`DELETE` cruzados.

---

## 3. Grafo do agente

`StateGraph` tipado por `Annotation.Root` (`src/lib/agent/state.ts`):

```
brandContext ──► [researchSeoGeo] ──► banditSelector ──► contentGenerator ──► complianceGuardrail
                                                                  ▲                    │
                                                                  └── repr <2 ─────────┤
                                                                                       ▼
                                        finalizeAsset ◄── humanApproval ◄── visualRender
```

| Nó | Responsabilidade | Detalhe |
| --- | --- | --- |
| `brandContext` | perfil + Top-8 chunks | chama `match_brand_chunks` via pool `pg` |
| `researchSeoGeo` | PAA, gaps, fatos | obrigatório em `geo_article`; opcional nos outros |
| `banditSelector` | 1 braço + 2 explorações | Beta(α,β) por amostragem Gamma (Marsaglia-Tsang) |
| `contentGenerator` | JSON validado | retenta até 3× com os erros de schema no prompt |
| `complianceGuardrail` | CONAR determinístico + LLM leve | bloqueador volta para o gerador (máx. 2) |
| `visualRender` | PNG no Storage privado | falha de render não invalida o texto |
| `humanApproval` | `interrupt()` nativo | pausa o thread; `Command({resume})` continua |
| `finalizeAsset` | ativo + ganchos + débito | transação única com `consume_credits` |
| `telemetryDistiller` | grafo assíncrono | atualiza α/β e reindexa campeões |

### Por que `interrupt()` e não `interruptBefore`

`interruptBefore` pausa **antes** do nó, o que exige outro round-trip para montar o payload de
revisão. Com `interrupt()` o payload (título, ganchos, custo, aviso de transparência) sai junto
com o estado persistido, e a retomada usa `Command({ resume: decision })`. A semântica está
coberta por `tests/agent/graph-interrupt.test.ts`.

### Persistência do estado

- `LANGGRAPH_STRICT_MSGPACK=true` definido em `src/instrumentation.ts` **antes** de qualquer
  import do LangGraph — evita corrupção silenciosa de checkpoint.
- `PostgresSaver.fromConnString(..., { schema: "langgraph" })`; `setup()` roda **somente** em
  `npm run db:langgraph-setup`, nunca no boot (cria/migra tabelas).
- Sem `SUPABASE_DB_URL` o runner usa `MemorySaver`: útil para demo/dev, com limitação declarada
  (estado não sobrevive a restart de processo).

---

## 4. Thompson Sampling

```
alpha += 1  se hook_rate >= 0.35 ou >= P75 do tenant
beta  += 1  caso contrário
```

- Prior Beta(1,1): sem histórico, todos os braços são equiprováveis.
- Seleção: maior θ amostrado entre braços já testados; **um braço nunca testado entra
  obrigatoriamente** na exploração (descobrir ângulo novo não é opcional).
- 2 variantes de exploração: segundo melhor θ + um braço inédito.
- `isSuccessPull` isola a regra e é testado com bordas (0.35 exato, P75, NaN).

---

## 5. Conteúdo e conformidade

- **Schemas zod** (`src/lib/ai/content-schemas.ts`) são o contrato: 3 ganchos de 8–15 palavras,
  corpo de 30–60s, slides 7–10 com título ≤ 8 e corpo ≤ 35 palavras, artigo com 1.450–2.550
  palavras e `word_count` coerente com o texto real (validado por `superRefine`).
- **Mock e LLM usam o mesmo schema** → paridade de contrato entre dev e produção.
- **Guardrail determinístico** (`src/lib/compliance/rules.ts`) roda antes do LLM leve: promessas
  absolutas de saúde/finanças, superlativo sem prova, urgência fabricada, menção a avatar/TTS.
  Só bloqueadores impedem a entrega; avisos são exibidos.
- **Transparência**: `requiresTransparencyLabel` marca ativos com imagem sintética; o aviso
  aparece na UI, no Markdown exportado e no `LEIA-ME.txt` do ZIP.

### GEO/JSON-LD

- Estrutura de seção fixa: **Fato Direto → Contexto → Dados Verificáveis**; `assertGeoStructure`
  reprova artigo sem bloco verificável.
- Bundle `Article + FAQPage + Product` com `validateJsonLdBundle`; se a validação falhar, o ativo
  é salvo **sem** JSON-LD e o problema é logado (nunca publicamos schema inválido).
- `serializeJsonLd` escapa `<`, `>`, `&`, U+2028/2029 — impede `</script>` injection.

---

## 6. Renderização visual

- Satori → SVG → `@resvg/resvg-js` → PNG 1080×1350 (4:5) e 1080×1920 (9:16); JPEG opcional via
  `sharp` (`quality 92`, sRGB, mozjpeg).
- Tokens da marca (`visual_tokens`) aceitam hex **e** OKLCH; `ensureContrast` corrige
  luminosidade até ≥ 4.5:1 para texto.
- Fontes Geist embutidas em `src/assets/fonts` (SIL OFL, licença copiada junto) e incluídas no
  trace da função por `outputFileTracingIncludes`.
- Ilustração IA é opcional (`hybrid_carousel`/`single_creative`); a imagem é composta como faixa
  com painel sólido de texto. Falha de download degrada para slide tipográfico com `warnings`.
- `RenderResult` é um array híbrido: continua `RenderedAsset[]` e expõe `.warnings`/`.assets`.

---

## 7. Mercado Pago

| Requisito | Implementação |
| --- | --- |
| Checkout transparente | Payment/Pix via SDK oficial em `/api/billing/{checkout,pix}` |
| Assinatura de cartão | `PreApproval` com `auto_recurring` mensal |
| Pix Automático | `PreApproval` com `payment_method_id: 'pix'`, `init_point` para autorizar no banco |
| Idempotência | `X-Idempotency-Key` (UUID v4) + memoização de 10 min por chave |
| Webhook | HMAC-SHA256 de `dataId:requestId:ts` com `timingSafeEqual`, janela de 300s, 401 sem tocar no banco |
| ACK rápido | insere em `mp_webhook_events` (unique), enfileira em pgmq, responde 200 |
| Worker | confirma status na API do MP **antes** de creditar; crédito idempotente por `reference_id` |
| Janela diurna | `nextDaytimeBillingWindow` (08h–18h BRT) evita bloqueio noturno de PF |

`mp_webhook_events` sem política RLS para `authenticated` é intencional: o payload contém dados
de terceiros e não pertence a um tenant.

---

## 8. LGPD

- **Exportação** (`/api/privacy/export`): JSON com marca, conhecimento (sem vetores), ativos,
  telemetria, extrato e assinatura. Sem payload de webhook.
- **Exclusão** (`eraseBrand` / `eraseTenant`): ordem obrigatória —
  `deleteThread()` → purga do Storage (prefixo do tenant) → conhecimento/telemetria/ganchos/ativos
  → ledger movido para tenant técnico `anonimo-fiscal` (mantém soma fiscal, remove vínculo) →
  tenant (cascade) → usuário do Auth.
- Nenhuma coleta biométrica; nenhum token social; nenhum treinamento com dados de cliente.

---

## 9. Observabilidade e custo

- Logger JSON com redação de chaves sensíveis (`src/lib/logger.ts`).
- `tokenUsageLog` no estado do grafo → custo estimado por ativo (`src/lib/ai/usage.ts`) e exibido
  em “Uso de IA” no estúdio.
- Prompt Caching (Anthropic) aplicado ao bloco de contexto de marca, que é estável por marca.

---

## 10. Limitações conhecidas

1. **`MemorySaver` sem `SUPABASE_DB_URL`**: estado do thread não sobrevive a restart.
2. **`gemini_grounding`**: adaptador existe, mas o grounding efetivo pertence à camada de LLM;
   com `SERP_PROVIDER=gemini_grounding` o provedor falha com mensagem explícita em vez de fingir.
3. **Cartão recorrente** exige o Payment Brick no navegador e `NEXT_PUBLIC_MP_PUBLIC_KEY`;
   sem a chave, a UI oferece Pix Automático (não simulamos cobrança).
4. **`logo_path`** não é composto no render (exigiria fetch do Storage por slide).
5. **Docker local**: `supabase start` requer Docker Desktop + WSL2; o CI e os testes de banco
   usam PGlite e não dependem disso.
