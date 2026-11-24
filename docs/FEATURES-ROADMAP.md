# Roadmap de Recursos e Quick Wins de Valor Percebido — Kitefy

**Data:** 24/11/2026

## 1. Matriz de avaliação (14 recursos)

| # | Recurso | Dor do usuário | Experiência proposta | Dados já existentes? | Esforço | Impacto | Risco | MVP nesta rodada? |
|---|---|---|---|---|---|---|---|---|
| 1 | **Próxima Melhor Ação no Dashboard** | Entrar no app e não saber o que fazer agora | Faixa de ação inteligente no topo do `/app` baseada em estado real (marca, rascunhos pendentes, créditos, telemetria, GSC) | Sim (`tenants`, `brand_profiles`, `campaigns_and_assets`, `performance_telemetry`) | P | Alto | Baixo | **Sim (MVP #1)** |
| 2 | **Completude da Marca (0–100%)** | Não saber por que o conteúdo pode melhorar | Medidor determinístico com checklist acionável (logo, site, público, tom de voz, fatos com fonte, token Google) no `/app` e `/settings/brand` | Sim (`brand_profiles`) | P | Alto | Baixo | **Sim (MVP #2)** |
| 3 | **Biblioteca Visual com Thumbnails Reais** | Lista de conteúdos parecer planilha genérica | Alternância Grade/Lista em `/campaigns` exibindo thumbnails assinadas reais (`visual_urls`) + filtros por formato, status e marca | Sim (`campaigns_and_assets.visual_urls` + `signVisualPaths`) | M | Muito Alto | Baixo | **Sim (MVP #3)** |
| 4 | **Content Score (0–100) + Checklist de Publicação no Estúdio** | Insegurança na hora de aprovar e debitar créditos | Nota determinística por critério (ganchos A/B, compliance, estrutura GEO/JSON-LD, legenda, visuais) + checklist prático de exportação/publicação em `/studio/[threadId]` | Sim (`content_payload`, `hook_variants`, `compliance_report`, `visual_urls`) | M | Muito Alto | Baixo | **Sim (MVP #4)** |
| 5 | **Medidor de Créditos + Capacidade Restante** | Não entender quantos conteúdos ainda cabem no saldo | Barra visual na sidebar e em `/settings/billing` traduzindo saldo em "até X roteiros/carrosséis ou Y artigos GEO" | Sim (`tenants.credit_balance`, `PLANS`, `CREDIT_COSTS`) | P | Alto | Baixo | **Sim (MVP #5)** |
| 6 | **Calendário Editorial semanal/mensal** | Falta de visão temporal das entregas | Grade mensal posicionando ativos por `created_at`/agendamento sugerido | Parcial (não há coluna `scheduled_for`) | M | Médio-Alto | Baixo | Roadmap P1 |
| 7 | **Cards de Ângulo de Concorrente com 1 clique** | Tabela de concorrentes não vira ação | Cards de gap de SERP com botão "Criar conteúdo sobre este tema" apontando para `/studio/new` | Sim (`competitors`) | M | Alto | Baixo | Roadmap P1 |
| 8 | **Gráficos nativos SVG na Telemetria** | Números em tabela sem tendência visual | Barras de retenção 3s, taxa de sucesso dos ângulos em linguagem de negócio | Sim (`performance_telemetry`, `bandit_arm_stats`) | M | Alto | Baixo | Roadmap P1 |
| 9 | **Relatório de Auditoria do Site no Onboarding** | Valor demora até o primeiro post | Entregável imediato após crawl da URL mostrando pontos fortes e lacunas de SEO/GEO | Sim (`extract.ts` crawl) | M | Alto | Baixo | Roadmap P1 |
| 10 | **Templates por objetivo/nicho no Estúdio** | Bloqueio criativo ao preencher briefing | Biblioteca curada de briefings por segmento (clínicas, SaaS, serviços, e-commerce) | Estático | P | Médio | Baixo | Roadmap P1 |
| 11 | **Metas mensais de produção** | Sem ritmo de constância | Meta configurável (ex.: 12 conteúdos/mês) com progresso no dashboard | Requer nova coluna em `tenants` | M | Médio | Baixo | Roadmap P2 |
| 12 | **Portal de aprovação externo para clientes (Agência)** | Agência precisa aprovar com cliente final | Link público com senha/expiração (`approvalLinks` já previsto no plano Flow) | Requer nova tabela + rota pública | G | Muito Alto (Flow) | Médio | Roadmap P2 |
| 13 | **Exportação para CMS (WordPress / Webflow)** | Colar HTML + JSON-LD manualmente dá trabalho | Envio de artigo GEO como rascunho via Application Password / webhook | Requer nova rota + credencial cifrada | M/G | Alto | Médio | Roadmap P2 (proposta em Audit) |
| 14 | **Monitor contínuo de visibilidade em IA (GEO)** | Medir citações no ChatGPT/Perplexity automaticamente | Coleta agendada de prompts de marca + share of voice | Requer nova fonte de dados e custo de API | G | Muito Alto | Alto | Roadmap P3 |

---

## 2. Os 5 Quick Wins escolhidos para implementação imediata (P0)

Todos usam **100% dados já existentes**, zero novas migrations, zero novas dependências pesadas e têm lógica pura testável em `src/lib/ui/workspace-insights.ts`:

1. **Próxima Melhor Ação** (Dashboard `/app`)
2. **Score de Completude da Marca (0–100%)** (Dashboard `/app` e `/settings/brand`)
3. **Biblioteca Visual com Thumbnails Reais + Grade/Lista + Filtros** (`/campaigns`)
4. **Content Score Determinístico (0–100) + Checklist de Exportação/Publicação** (`/studio/[threadId]`)
5. **Medidor Visual de Créditos e Capacidade** (Sidebar + `/settings/billing` + `/studio/new`)
