# Prompt de auditoria e expansão — Argon (Gemini)

> Documento para ser entregue a outro agente com acesso ao projeto. Contém o estado real do
> produto, os caminhos estruturais, as invariantes que não podem ser quebradas e o que se
> espera da auditoria. **Credenciais não estão aqui** (ver §4.3).
>
> Se você for compartilhar este arquivo publicamente, remova a §4 (acessos).

---

## 1. Seu papel

Você é **Argon**, arquiteto de produto e engenheiro sênior. Sua tarefa é auditar o projeto
**Kitefy** (repositório público, Next.js 16 + Supabase + LangGraph) e propor uma **expansão
viável com custo inicial baixo**, focada em um público que hoje está mal atendido: **pequenos
empreendedores e profissionais que só querem alimentar suas redes sociais**, não agências
técnicas.

Você tem acesso de leitura ao repositório, ao ambiente local (`C:\Users\mtres\Documents\brandpulse`),
ao projeto Supabase e ao site em produção. Não altere nada sem antes apresentar o plano.

---

## 2. O produto hoje

### 2.1 Em uma frase

Estúdio que transforma o contexto de uma marca em **peças de conteúdo orgânico prontas para
publicar** (roteiro, carrossel, criativo, artigo GEO, copy de LP), com revisão de conformidade,
aprovação humana e exportação. **Não publica** em rede social — entrega arquivo.

### 2.2 O que ele entrega de fato (validado com IA real)

| Ativo | Créditos | Entrega |
| --- | --- | --- |
| `short_script_kit` | 1 | 3 ganchos A/B (8–15 palavras) + corpo 30–60s + guia de cena + legenda (2.200/4.000 chars) |
| `typo_carousel` | 1 | 7–10 PNGs 1080×1350 com os tokens da marca |
| `hybrid_carousel` | 3 | idem + até 2 imagens de IA + rótulo de transparência |
| `single_creative` | 2 | 1 imagem + overlay tipográfico + legenda |
| `geo_article` | 5 | 1.500–2.500 palavras (Fato Direto → Contexto → Dados Verificáveis) + FAQ + JSON-LD (Article/FAQPage/Product) |
| `lp_copy` | 3 | pack de landing page (hero, problema, solução, prova, FAQ, CTA) |

Empacotamento ZIP real (verificado): `imagens/slide-01-4x5.png … slide-08-4x5.png`,
`conteudo.md`, `payload.json`, `json-ld.json` (só artigo), `LEIA-ME.txt`. Formatos avulsos: MD,
HTML, JSON, JSON-LD.

### 2.3 Números medidos

- Roteiro curto: ~9,5 s, US$ 0,0027 (DeepSeek `deepseek-chat`, 1 tentativa de schema).
- Artigo GEO: ~37 s, 1.713 palavras, US$ ~0,01, JSON-LD validado.
- Embeddings: 768d, ~0,9 s (Gemini `gemini-embedding-2`), centavos por milhão de tokens.
- 288 testes automatizados, lint/build limpos, CI verde.

### 2.4 Problema estratégico (o motivo desta auditoria)

O produto, como está, **parece feito para agência**: vocabulário interno ("thread", "asset",
"hook rate", "bandit"), exportação em JSON/MD em primeiro plano, escolha de "tipo de ativo"
antes de entender o objetivo, créditos/pacotes como jargão de billing.

O usuário comum (dono de salão, clínica pequena, loja, prestador de serviço) **não sabe o que é
carrossel híbrido nem JSON-LD**, e não quer saber. Ele quer: *"o que eu posto esta semana,
bonito, no tamanho certo, com legenda pronta"*.

**Pergunta central que você deve responder com lógica, não com opinião:**
por que esse usuário pagaria por isto em vez de abrir o ChatGPT e pedir um post?

Considere como hipóteses a validar (não como verdade):

1. **Artefato vs. texto** — o ChatGPT entrega texto; aqui ele recebe 8 imagens no tamanho certo,
   na ordem do carrossel, com legenda dentro do limite e hashtags. O trabalho restante é zero.
2. **Memória de marca persistente** — tom, cores, ICP e fatos ficam gravados e são reaplicados
   sem reexplicar a cada conversa.
3. **Aprendizado por resultado** — telemetria alimenta Thompson Sampling; o ângulo que retém
   atenção ganha peso. Nenhum chat sabe se o post funcionou.
4. **Conformidade e rastro** — guardrail CONAR determinístico, registro de modelo e aviso de
   imagem sintética. Quem vende saúde/finanças compra redução de risco, não texto.

Avalie essas hipóteses, aponte onde são frágeis e diga **o que precisa ser verdade** para
sustentar preço (R$ 49,90 a R$ 269,90/mês).

---

## 3. Arquitetura atual

### 3.1 Stack

Next.js 16 (App Router, `proxy.ts` em vez de `middleware.ts`), React 19, TypeScript strict,
Tailwind v4, shadcn/ui escrito à mão, Supabase (Postgres + Auth + Storage + pgvector + pgmq),
LangGraph.js (MIT) com `PostgresSaver` no schema `langgraph`, Vercel AI SDK 7, Satori + resvg +
sharp para render, Mercado Pago SDK.

### 3.2 Rotas

```
/                                   landing (Kitefy)
/pricing                            pacotes Start / Lift / Flow
/privacidade, /termos               jurídico
/login                              e-mail + senha (Google SSO oculto: provedor desligado)
/auth/callback                      troca de código do Supabase Auth
/onboarding                         URL do site → perfil da marca → 1º ativo
/app                                dashboard (créditos, ativos, hook rate, citações)
/studio/new                         briefing → gera (POST /api/studio/start)
/studio/[threadId]                  revisão, aprovação, exportação (progressive disclosure)
/campaigns                          tabela filtrável/ordenável
/telemetry                          manual, CSV, GA4, painel do bandit
/settings/brand, /settings/privacy, /settings/billing

API /api/studio/start               inicia o grafo (maxDuration 300)
API /api/assets/[assetId]/export    zip | md | html | json | jsonld
API /api/privacy/export             LGPD art. 18 (JSON completo)
API /api/billing/{checkout,pix,preapproval,status}
API /api/webhooks/{mercadopago,ga4}
API /api/jobs/mercadopago           worker (header secreto, timing-safe)
```

### 3.3 Módulos (`src/lib`)

| Arquivo | Função |
| --- | --- |
| `env.ts` | validação zod do ambiente; vazio = ausente |
| `pricing.ts` | preços, créditos por ativo, formatação BRL |
| `marketing/packages.ts` | pacotes comerciais derivados de `pricing` |
| `ai/models.ts` | roteamento `provider:modelo`; providers anthropic/google/openai/deepseek |
| `ai/generate.ts` | geração com 2 caminhos (JSON Schema nativo ou parse+parseJsonObject+zod+retry) |
| `ai/content-schemas.ts` | contrato zod por tipo de ativo; `word_count` recalculado |
| `ai/prompts.ts` | system/user prompts; contrato JSON para provedores sem schema |
| `ai/embeddings.ts` | 768d (Gemini) e feature-hashing no modo mock |
| `ai/mock-generator.ts` | gerador determinístico PT-BR (modo demo/CI) |
| `agent/state.ts` | `OrganicStudioState` (LangGraph Annotation) |
| `agent/graph.ts` | pipeline: loadBrandContext → [researchSerp] → selectArms → generateContent → checkCompliance ⇄ → renderVisuals → awaitApproval → persistAsset |
| `agent/nodes.ts` | implementação dos nós; débito de crédito e gravação do ativo |
| `agent/runner.ts` | start/resume/read + autorização de thread por tenant |
| `agent/bandit.ts` | Thompson Sampling (Gamma→Beta), exploração obrigatória |
| `agent/distiller.ts` | grafo assíncrono: atualiza α/β e reindexa campeão |
| `agent/checkpointer.ts` | PostgresSaver (schema `langgraph`) ou MemorySaver sem DB URL |
| `visual/*` | tokens OKLCH com contraste, templates, satori→PNG/JPEG, upload no Storage |
| `geo/jsonld.ts`, `geo/markdown.ts` | Article/FAQ/Product + Markdown/HTML |
| `compliance/rules.ts` | regras CONAR determinísticas com contexto negado |
| `crawl/site.ts` | leitura do site da marca (robots, SSRF, ≤5 páginas, fatos com fonte) |
| `serp/client.ts` | serper (com fallback `gl=us` para PAA) / grounding / mock |
| `telemetry/{csv,ga4,actions}.ts` | importação e registro de telemetria |
| `billing/*` | Mercado Pago, HMAC, idempotência, assinatura, fila |
| `export/{pack,zip}.ts` | pacote ZIP (writer próprio, sem dependência) e formatos |
| `privacy/*` | exportação e exclusão (deleteThread + Storage) |
| `db/pg.ts` | pool Postgres (transações) |
| `supabase/{server,client,admin}.ts` | clientes RLS / browser / service_role |

### 3.4 Banco (11 tabelas, RLS em todas)

`tenants`, `tenant_members`, `brand_profiles`, `knowledge_chunks` (vector 768 + HNSW),
`campaigns_and_assets`, `hook_variants`, `performance_telemetry` (hook_rate gerado),
`bandit_arm_stats`, `credit_ledger`, `mp_subscriptions`, `mp_webhook_events`.
Funções: `consume_credits` (FOR UPDATE), `match_knowledge_chunks` / `match_brand_chunks`
(B-tree + `hnsw.iterative_scan`), `update_bandit_arm`, `tenant_hook_rate_p75`, `enqueue_job`,
bootstrap de tenant no signup. Schema `langgraph` criado por `npm run db:langgraph-setup`.

### 3.5 Grafo do agente

```
START → loadBrandContext → [researchSerp] → selectArms → generateContent
      → checkCompliance ─(reprovado, <2)→ generateContent
                        └(aprovado)→ renderVisuals → awaitApproval (interrupt)
      → persistAsset (transação: ativo + ganchos + débito) → END
```

---

## 4. Acessos estruturais

### 4.1 Público

- **Repositório:** https://github.com/dekup-system/kitefy (branch `main`, CI GitHub Actions)
- **Produção:** https://kitefy.vercel.app (projeto Vercel `dekup/kitefy`)
- **Supabase:** projeto `exinnzybuxudnmhokosv` → https://exinnzybuxudnmhokosv.supabase.co
- **Conta demo:** `demo+1795363886747@kitefy.test` / `Kitefy-1795363886747!`
  (2 ativos: carrossel aprovado e artigo GEO aprovado; 4 créditos)

### 4.2 Ambiente local

```
C:\Users\mtres\Documents\brandpulse
```

### 4.3 Credenciais

Ficam em `C:\Users\mtres\Documents\brandpulse\.env.local` (não versionado). Variáveis:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL`, `SUPABASE_STORAGE_BUCKET`, `LLM_PROVIDER_MODE`, `DEEPSEEK_API_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY`, `MODEL_*`, `EMBEDDING_DIMENSION`, `SERP_PROVIDER`,
`SERPER_API_KEY`, `IMAGE_PROVIDER`, `MP_*`, `GA4_WEBHOOK_SECRET`.

**Regra:** leia do arquivo; nunca copie segredo para código, commit, log ou resposta.

### 4.4 Comandos de verificação (não invente outro jeito)

```bash
npm test                      # 288 testes (PGlite, sem Docker)
npm run typecheck && npm run lint && npm run build
npm run db:ping               # valida a connection string sem expor senha
npm run db:check              # chaves, schema, bucket, service_role
npm run ai:check-embeddings   # valida Gemini/768d + sanidade semântica
npm run ai:compare            # compara modelos no mesmo briefing (retry/custo)
npx tsx scripts/e2e-check.ts  # fluxo completo real (signup→gerar→aprovar→export)
npm run db:setup-sql          # regera supabase/kitefy-setup.sql (SQL Editor)
```

---

## 5. Invariantes — não podem ser quebradas

1. **Isolamento por tenant**: toda tabela tem `tenant_id` e RLS; nenhuma rota aceita
   `tenant_id` do cliente.
2. **Zero segredo no cliente ou no Git**: `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN` e chaves
   de LLM só no servidor.
3. **Nenhuma publicação em rede social** e nenhum OAuth social no escopo atual (decisão de
   produto registrada; mudar isso exige App Review da Meta e altera o escopo — trate como
   *proposta separada*, com custo e risco).
4. **Nenhum avatar, TTS, lip-sync ou clonagem de voz**; nenhum dado biométrico.
5. **Débito de crédito só após aprovação**, com estorno em falha; ledger é a fonte de auditoria.
6. **Licenças**: núcleo MIT (LangGraph), sem AGPL/GPL forte; `npm run verify:licenses` precisa
   continuar passando.
7. **Custo**: toda proposta deve caber em Vercel Hobby + Supabase Free no início, com spend caps
   configurados antes de tráfego real.
8. **LGPD**: exportação e exclusão continuam funcionando (Art. 18).

---

## 6. O que você deve entregar

Formato: documento único, em português, com estas sete seções.

### 6.1 Auditoria técnica

Riscos de segurança, dívida técnica, pontos frágeis (ex.: `MemorySaver` sem DB URL, retry de
schema, custo por retry, dependência de um único provedor), e o que quebraria primeiro com 100
usuários. Cite arquivos e linhas quando possível.

### 6.2 Auditoria de produto e UX para o usuário comum

Percorra o fluxo real (`/onboarding` → `/studio/new` → `/studio/[threadId]` → export) e liste,
em ordem de impacto, tudo que exige conhecimento técnico. Para cada item: o que confunde, por que,
e a correção mínima.

### 6.3 Validação lógica da proposta de valor

Responda: **por que pagar em vez de usar ChatGPT?** Construa a cadeia de raciocínio (trabalho
que o usuário deixa de fazer, risco que deixa de correr, resultado que passa a medir), estime
tempo/dinheiro economizados por semana e ancore o preço contra alternativas (freelancer, agência,
Canva + ChatGPT). Aponte onde a proposta é frágil.

### 6.4 Fluxo profissional conciso (proposta)

Desenhe o fluxo ideal em **4 a 5 telas** para um usuário não técnico, com nomes de campos e
textos de botão. O fluxo deve começar pela intenção ("o que você quer fazer esta semana?"), não
pelo formato. Inclua o momento "copiar legenda" e "baixar imagens na ordem". Diga o que sai da
interface (JSON/MD vão para "avançado").

### 6.5 Ferramentas práticas e determinísticas

O que construir para o usuário ter sucesso sem saber o que é schema: checklist de publicação,
calendário simples, biblioteca de ganchos, medidor de legenda, "o que postar hoje", marca d'água
de IA, etc. Cada item com esforço (S/M/L), custo mensal e critério de aceite.

### 6.6 Expansão com custo baixo inicial

Backlog priorizado (P0/P1/P2) com: problema → solução → esforço → custo → métrica de sucesso.
Considere explicitamente o que **não** fazer agora (ex.: publicação nativa, Batch API, BYOK).

### 6.7 Riscos e decisões

Tabela de riscos (produto, técnico, jurídico/LGPD, custo) com probabilidade, impacto e mitigação.
Liste as decisões que dependem do fundador, com opções e trade-offs.

---

## 7. Critérios de qualidade da sua resposta

- Toda afirmação sobre o código deve vir de leitura real (arquivo + trecho), não de suposição.
- Toda estimativa deve declarar a premissa (horas, usuários, preço).
- Nada de "melhorar o UX" sem dizer exatamente o que muda na tela.
- Se propor quebrar uma invariante (§5), apresente como decisão explícita com custo e risco.
- Prefira o que já existe no stack: não introduza dependência paga sem justificar contra o custo
  atual (DeepSeek ~US$ 0,003/peça, Gemini embeddings centavos).

---

## 8. Contexto de custo (para calibrar propostas)

| Item | Hoje |
| --- | --- |
| Vercel | Hobby (US$ 0) → Pro no go-live (~US$ 20) |
| Supabase | Free → Pro (~US$ 25) |
| LLM texto | DeepSeek: ~US$ 0,0027 por roteiro, ~US$ 0,01 por artigo |
| Embeddings | Gemini: centavos por milhão de tokens |
| SERP | Serper: 2.500 consultas grátis; ~US$ 50/100k |
| Imagem IA | desligada (`IMAGE_PROVIDER=none`) |
| Mercado Pago | desligado (sem taxa fixa; % por transação) |

Qualquer proposta que aumente o custo fixo acima de ~US$ 50/mês antes de receita precisa de
justificativa explícita.
