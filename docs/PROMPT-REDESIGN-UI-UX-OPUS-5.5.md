# Briefing — Redesign de produto, UX, recursos e copy da Kitefy

**Para:** Claude Opus 5.5 (agente com acesso ao repositório e terminal)
**Projeto:** `C:\Users\mtres\Documents\brandpulse` · repo `github.com/dekup-system/kitefy` · branch `main`
**Commit de referência:** `cad451d` (SEO) — confira `git log -1` antes de começar
**Idioma do produto e das entregas:** português do Brasil (pt-BR)

---

## 0. Papel e missão

Você é **lead de produto + design de interface + UX writer + estrategista de produto**, com mão na massa em front-end. Sua missão não é “deixar bonito”: é **elevar a percepção de valor da Kitefy**, reduzindo atrito, dando clareza de proposta e fazendo o produto parecer (e ser) mais completo do que parece hoje.

O dono do produto reportou, com razão:

- o front-end autenticado parece **muito branco, genérico e pobre**;
- os **recursos entregues parecem simples demais** para o preço;
- os **textos são longos**, repetitivos e pouco orientados a resultado.

Seu trabalho tem quatro frentes, nesta ordem de prioridade:

1. **Auditar** o produto inteiro (UI, UX, estados, copy, proposta de valor, dados disponíveis).
2. **Redesenhar** o sistema visual e as telas de maior impacto, preservando a identidade da marca.
3. **Propor e implementar quick wins de recursos** que aumentem valor percebido usando os dados que já existem; o resto vira roadmap explícito.
4. **Enxugar e reescrever** todo o texto de produto, marketing e microcopy, com um glossário único.

Você tem autonomia para decidir dentro das regras abaixo. Não peça aprovação tela a tela. Pare apenas nos casos listados na seção 12.

---

## 1. Contexto real do produto

A Kitefy é um SaaS B2B brasileiro de **conteúdo orgânico + GEO (Generative Engine Optimization)** para pequenas e médias empresas e agências. O produto:

- cria **6 formatos** de conteúdo com IA multiagente: roteiro curto, carrossel tipográfico, carrossel híbrido, criativo único, artigo GEO e pack de landing page;
- mantém **perfis de marca** (tom de voz, cores, logo privado, fatos verificáveis);
- analisa **concorrentes** (SERP pt-BR + crawl);
- organiza **biblioteca de conteúdos**, aprovação humana e exportação (PNG, Markdown, HTML, JSON-LD, ZIP);
- mede **telemetria** (impressões, retenção, citações em IA) e usa Thompson Sampling para aprender ganchos;
- gera **Pacote Google** (sitemap, robots liberando crawlers de IA, index com canonical/OG/JSON-LD e token do Search Console);
- cobra assinatura recorrente via **Mercado Pago Checkout Pro**;
- tem **painel administrativo** (contas, planos, cupons, receita e custo de API).

**Stack:** Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript estrito, Tailwind CSS v4, componentes próprios no estilo shadcn/ui, Supabase (Auth/Postgres/Storage), `sharp`/Satori para imagens, Mercado Pago. Testes com Vitest + PGlite.

**Rotas principais:**

- públicas: `/`, `/pricing`, `/login`, `/reset`, `/privacidade`, `/termos`, `/auth/callback`
- app: `/app` (dashboard), `/campaigns`, `/competitors`, `/telemetry`, `/studio/new`, `/studio/[threadId]`, `/settings/account`, `/settings/billing`, `/settings/brand`, `/settings/privacy`, `/google`
- admin: `/admin`, `/admin/contas`, `/admin/contas/[tenantId]`, `/admin/cupons`, `/admin/receita`
- APIs: billing, exportação de ativos, Pacote Google, studio, webhooks, jobs.

**Estado atual:** funcional e com testes passando (última medição: 398 testes, 37 arquivos; typecheck, lint e build limpos). O problema é de **produto/design/percepção**, não de falta de motor.

---

## 2. Leitura obrigatória antes de opinar

Leia, nesta ordem:

1. `docs/HANDOFF.md` — estado real, regras e o que não pode quebrar.
2. `docs/KITEFY-BRAND.md` — manual cromático aplicado, contrastes, proporção 60/30/10, regras de logo.
3. `docs/ARQUITETURA.md` e `docs/OPERACAO.md` — modelo de dados, billing, operação.
4. `src/app/globals.css` — tokens atuais (não invente uma marca nova).
5. `src/app/page.tsx`, `src/app/pricing/page.tsx` — marketing e preços.
6. `src/app/(app)/layout.tsx`, `src/components/app/*` — shell autenticado.
7. Todas as páginas em `src/app/(app)/**` e `src/app/(app)/admin/**`.
8. `src/components/ui/*` — primitivas existentes (botão, card, field, table, dialog, tabs, badge, stat-card, empty-state, skeleton…).
9. `src/lib/pricing.ts`, `src/lib/marketing/packages.ts`, `src/lib/onboarding/extract.ts`, `src/lib/ai/*`, `src/lib/geo/*`.
10. `package.json`, `eslint.config.mjs`, `vitest.config.ts`, `next.config.ts`, `tsconfig.json`.

**Antes de alterar qualquer coisa**, rode o baseline:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Registre o resultado. Se algo já falhar, não conserte “de passagem”: documente e siga.

Também capture o estado atual (desktop 1440, mobile 390/430, tema claro/escuro) de pelo menos: landing, pricing, login, dashboard, campaigns, studio/new, studio/[threadId], competitors, telemetry, settings/brand, settings/account, settings/billing, google e admin. Já existem capturas antigas em `artifacts/shots/` (`landing-full.png`, `pricing.png`, `cdp-mobile.png`, `dark2-top.png`); use como baseline e **recapture o app autenticado**. Use o servidor de dev gerenciado e as ferramentas de screenshot existentes (`scripts/cdp-shot.mts`, `npm run qa:shot`) ou Playwright/Chrome DevTools. Salve em `artifacts/shots/antes-*`. **Não** suba um segundo servidor de produção sem necessidade.

---

## 3. Regras que não podem ser quebradas

- **Marca:** preserve a identidade. Navy `#181331`, laranja sinal `#FD3E01`, canvas `#F8F8FA`, superfície branca, proporção 60/30/10. O laranja é sinal de ação, não cor de parágrafo ou fundo de seção longa. Não troque a paleta, não “modernize” o logo, não invente outra marca.
- **“Muito branco” não significa “virar dark mode”.** O problema é falta de ritmo, hierarquia, profundidade, textura, imagens, dados e contraste entre superfícies. Resolva com composição e sistema, mantendo a identidade clara.
- **Acessibilidade:** WCAG 2.2 AA no mínimo. Texto normal ≥ 4,5:1; texto grande pode usar o laranja conforme o manual. Foco visível, labels associados, alvos de toque ≥ 44px no mobile, `prefers-reduced-motion`, navegação por teclado.
- **Produto só para o Brasil**, pt-BR fixo. Não introduza inglês na interface.
- **Sem OAuth social, sem publicação em redes, sem avatar digital, sem TTS, sem clonagem de voz.** Não proponha nada que viole isso.
- **Créditos:** débito só depois de aprovação humana; estorno em falha. Não altere essa semântica.
- **RLS e multi-tenant:** `tenant_id` nunca vem do cliente; não enfraqueça policies, testes de isolamento ou o papel do admin (`app_metadata.is_admin`).
- **Billing:** não altere valores, planos, cupons, checkout ou semântica de assinatura para “melhorar a UI”. Ajustes de billing exigem plano separado.
- **SEO recém-entregue:** preserve `src/app/sitemap.ts`, `src/app/robots.ts`, JSON-LD, canonical/OG e as rotas públicas liberadas em `src/proxy.ts`.
- **Segredos:** nunca leia, imprima, copie ou commite `.env.local`; nunca faça deploy/push em produção sem autorização explícita. Use preview/local.
- **Dependências:** evite novas libs pesadas. Se precisar de gráficos/animação, justifique bundle, licença e alternativa com SVG/CSS. Prefira o que já existe.
- **Sem dados falsos:** não invente métricas, depoimentos, logos de clientes, números de mercado ou citações. Se um recurso depende de dados que não existem, marque como roadmap e diga qual dado é necessário.

### Anti-padrões visuais (proibidos)

- Template genérico de SaaS: gradiente roxo/azul, glassmorphism em tudo, blobs, emojis como ícones, cards idênticos empilhados.
- Hero gigante que esconde o produto; screenshot falso de dashboard; mockup de celular sem relação com o conteúdo.
- “Modernizar” trocando a marca por cinza/preto genérico ou por dark mode sem pedido.
- Excesso de animação, parallax, texto que aparece no scroll sem necessidade.
- Ícones de bibliotecas diferentes misturados; sombras, raios e espaçamentos sem sistema.
- Texto cinza claro em fundo branco; placeholder como label; erro só por cor.
- Tabela como único padrão de listagem; quatro StatCards como única narrativa de dashboard.

---

## 4. Fase 1 — Diagnóstico (entregável obrigatório antes do código)

Produza um documento curto e direto (`docs/REDESIGN-AUDIT.md`) com:

### 4.1 Auditoria de UI/UX

Avalie cada tela contra heurísticas (NN/g), Baymard, WCAG e princípios de dashboards modernos:

- hierarquia visual, densidade, uso de espaço, contraste entre canvas/card/seções;
- clareza do próximo passo, affordances, feedback, estados de loading/empty/error/success;
- navegação, agrupamento, breadcrumbs, busca global, mobile, dark mode;
- consistência de componentes, espaçamento, tipografia, ícones, tabelas;
- acessibilidade e performance percebida.

Entregue uma tabela com **os 10 problemas de maior impacto**, cada um com: evidência (arquivo/rota/screenshot), impacto no usuário, esforço e correção proposta. Ordene por impacto × esforço. Inclua o que está bom (não destrua o que funciona).

### 4.2 Auditoria de proposta de valor

Mapeie cada recurso para o “trabalho” que ele resolve (jobs-to-be-done), o resultado que promete e o quanto isso aparece na interface. Identifique:

- recursos subvalorizados (existem, mas não são percebidos);
- recursos que prometem mais do que entregam;
- lacunas que o cliente sente antes de pagar;
- onde o produto pode aumentar receita (upgrade, retenção, indicação) sem virar “feature creep”.

### 4.3 Auditoria de copy

Liste textos longos, redundantes, genéricos ou contraditórios. Verifique especialmente:

- inconsistência de nomes dos planos: o marketing usa **Kitefy Start / Lift / Flow**, mas o app/billing usa **Essencial / Crescimento Pro / Agência Escala**. Escolha **um** sistema canônico e mapeie os outros.
- a página `/pricing` ainda recomenda **Pix Automático**, que foi removido do produto. Confirme e corrija.
- promessas de “IA”, “GEO”, “multiagente”, “prova em dado”: onde são jargão e onde são resultado.
- textos de formulários, vazios, erros, tooltips, modais e e-mails.

Entregue antes/depois de pelo menos 12 trechos.

### 4.4 Diagnóstico técnico de UI

- componentes duplicados ou inconsistentes;
- páginas que repetem o mesmo padrão de “4 cards + tabela”;
- tabelas sem hierarquia, sem thumbnail, sem ações claras;
- formulários longos, validações pobres, estados ausentes;
- oportunidades de Server Components, streaming, skeleton, cache;
- oportunidades de reduzir JS no cliente.

### 4.5 Perguntas de negócio (máximo 3)

Só pergunte o que realmente bloqueia: por exemplo, canonização dos nomes dos planos, apetite para novos recursos com backend, ou permissão de deploy. Se não houver bloqueio, decida e registre a decisão.

---

## 5. Fase 2 — Direção visual e sistema

Antes de codar, defina uma direção em `docs/REDESIGN-DIRECTION.md`. Não entregue “três opções” sem escolher: escolha uma e defenda.

### 5.1 Territórios

Explore **3 territórios visuais** coerentes com a marca, por exemplo:

1. **Editorial premium:** tipografia forte, muito respiro, imagens editoriais, navy como âncora, laranja cirúrgico.
2. **Produto de dados:** densidade controlada, gráficos, chips, tabelas elegantes, aparência de “ferramenta séria”.
3. **Estúdio criativo:** textura, prévias de conteúdo, cards com personalidade, foco em criação.

Escolha o que melhor equilibra **percepção de valor, clareza e escalabilidade** para um SaaS B2B brasileiro. Justifique com referências (não copie layouts).

### 5.2 Tokens e componentes

Defina e implemente:

- **Cor:** papéis semânticos (canvas, surface, elevated, sunken, border, muted, brand, signal, success, warning, danger, info). Preserve a proporção 60/30/10.
- **Tipografia:** escala, pesos, tracking, medida de linha; hierarquia para dashboard, marketing e dados. Use a fonte existente salvo justificativa.
- **Espaçamento e grid:** escala consistente, containers, gutters, densidade de tabela.
- **Superfícies:** 3–4 níveis (canvas, card, inset, elevated) com sombras/bordas sutis; nada de “tudo branco no mesmo plano”.
- **Raios, sombras, ícones:** um sistema, não mistura.
- **Movimento:** transições curtas, propósito, respeito a reduced motion.
- **Imagens/ilustração:** como representar conteúdo, carrosséis e dados sem estoque genérico; prefira previews reais, composições tipográficas e texturas da marca.
- **Data viz:** estilo de gráficos, cores, legendas, estados vazios.
- **Componentes:** Button, IconButton, Card (variantes), Stat/Metric, Badge, Table/DataTable, Tabs, Dialog, Sheet, Form/Field, Select, EmptyState, Skeleton, Toast, Tooltip, Progress, Stepper, Command palette, Content card, Asset preview, Chart, Insight card, Upgrade card.

Documente estados de cada componente (default/hover/focus/active/disabled/loading/error). Nada de componente “só no caminho feliz”.

### 5.3 Shell e arquitetura de informação

Redesenhe o shell autenticado:

- sidebar agrupada por intenção (Criar, Biblioteca, Inteligência, Marca, Conta), não uma lista plana;
- topbar com breadcrumb/título, busca global, notificações, ajuda, seletor de marca e menu de conta;
- mobile: navegação inferior ou sheet, sem 7 itens espremidos;
- página padrão com header, ações primárias, contexto e conteúdo;
- estados de crédito/plano sempre visíveis, mas sem poluir;
- admin separado e discreto (não competir com o produto).

Entregue um mapa antes/depois da navegação e justifique cada mudança.

---

## 6. Fase 3 — Redesign das telas (prioridade)

Priorize o **app autenticado**; o marketing já está acima da média. Ordem sugerida:

### P0 — impacto imediato

1. **Dashboard `/app`**
   - hoje: 4 StatCards + tabela + cards genéricos.
   - objetivo: uma central de trabalho com “o que fazer agora”.
   - inclua: próxima melhor ação, pipeline de conteúdos, últimos ativos com preview, saúde de créditos/plano, ideias da semana, evolução de resultado, checklist de onboarding.
   - remova redundância e métricas sem ação.

2. **Estúdio `/studio/new` e `/studio/[threadId]`**
   - criação guiada em etapas, cards de formato com exemplo e custo estimado;
   - clareza de tempo/créditos antes de gerar;
   - progresso visível, estados parciais, erros acionáveis;
   - tela de aprovação com preview real (carrossel/roteiro/artigo), comparação de ganchos, score de marca/GEO e botão de aprovar com confiança;
   - exportação com checklist e prévia do que vai no ZIP.

3. **Biblioteca `/campaigns`**
   - trocar tabela por cards com thumbnail/tipo/status/marca;
   - filtros por status, tipo, marca e período; busca; visão em lista/grade/calendário;
   - ações em lote; estados vazios que ensinam.

4. **Conta/billing `/settings/account`, `/settings/billing`**
   - plano atual legível, uso de créditos, renovação, upgrade; cupom sem ambiguidade;
   - comparativo de planos enxuto; uma única nomenclatura;
   - faturas/recibos e transparência de cobrança.

5. **Marketing `/` e `/pricing`**
   - consistência com o app; hero mais específico e curto; prova visual do produto;
   - planos com nomes canônicos e comparação escaneável;
   - remover Pix Automático da recomendação;
   - CTA e narrativa orientados a “primeiro ativo em minutos”, não a “plataforma completa”.

### P1 — consolidação

6. **Concorrentes `/competitors`**: transformar tabela em leitura de gaps e ângulos, com evidência e ação (“criar conteúdo sobre X”).
7. **Telemetria `/telemetry`**: gráficos, funil, insights em linguagem de negócio, não só números.
8. **Marca `/settings/brand`**: completude do perfil, preview ao vivo, logo, voz, fatos com fonte, “o que falta para o conteúdo ficar melhor”.
9. **Pacote Google `/google`**: vender o resultado (aparecer em buscas e respostas de IA), passos claros, preview do que será baixado, estado de verificação.
10. **Privacidade**: simplificar sem perder seriedade.

### P2 — admin

11. **Admin**: densidade, filtros, busca, saúde do sistema, ações com confirmação e auditoria. Não é a prioridade estética, mas precisa parecer confiável.

Para cada tela, entregue antes/depois e os estados (vazio, carregando, erro, sucesso, permissão negada).

---

## 7. Fase 4 — Recursos: como propor e o que priorizar

O dono sente que “entrega pouco”. Não resolva isso com mais telas; resolva com **resultado percebido**. Para cada ideia, use a tabela:

| Recurso | Dor do usuário | Experiência proposta | Dados já existentes? | Esforço (P/M/G) | Impacto | Risco | MVP? |
|---|---|---|---|---|---|---|---|

Regras:

- Priorize o que usa dados que já existem (ativos, telemetria, marca, SERP, créditos, billing).
- Se exigir backend novo, marque como roadmap e descreva a migration/rota necessária; não simule.
- Máximo de **3 a 5 recursos implementados nesta rodada**, escolhidos por impacto × esforço.
- Nada de “ChatGPT dentro do produto” genérico; o diferencial é marca + método + dado + aprovação humana.

### Menu de ideias para avaliar (não implemente tudo)

1. **Próxima melhor ação** no dashboard (S; usa ativos/telemetria/créditos).
2. **Content Score** por ativo: gancho, voz da marca, estrutura GEO, compliance, clareza; com correções acionáveis (M; determinístico, sem novo backend).
3. **Calendário editorial** semanal/mensal com slots e sugestões (M; pode começar só com dados existentes).
4. **Templates por objetivo/nicho** no estúdio (S/M; catálogo estático).
5. **Biblioteca visual** com thumbnails reais e preview (M; usa `visual_urls`/signed URLs).
6. **Medidor de créditos e previsão** de consumo + gatilho de upgrade (S).
7. **Checklist de exportação/publicação** por formato (S).
8. **Completude da marca** e recomendações para melhorar o resultado (S).
9. **Resumo semanal no app/e-mail** com próxima ação, não só métricas (S; já existe lembrete semanal).
10. **Cards de ângulo de concorrente** com “criar conteúdo sobre isto” (M; usa SERP/crawl).
11. **Monitor de visibilidade em IA/GEO** (citações, prompts, share of voice) — G; precisa de fonte de dados e desenho de coleta.
12. **Portal de aprovação do cliente / white-label para agência** — G; backend e permissões.
13. **Exportação para CMS** (WordPress/Webflow) — M/G; integração, sem OAuth social.
14. **Testes A/B de gancho** com leitura de aprendizado (M; usa telemetria/bandit).
15. **Biblioteca de prompts/templates** internos (S).
16. **Relatório de auditoria do site** no onboarding como entregável (S/M; usa crawl existente).
17. **Equipe e permissões** (owner/editor/viewer já existem; expor melhor) — M.
18. **Metas e acompanhamento** (ex.: 8 conteúdos/mês, citações) — M.

Entregue `docs/FEATURES-ROADMAP.md` com a tabela, os 3–5 escolhidos e o que ficou de fora com justificativa.

---

## 8. Fase 5 — Copy: princípios e reescrita

### 8.1 Princípios

- **Uma ideia por frase.** Verbos concretos. Sem “potencialize”, “solução 360°”, “revolucionário”, “plataforma completa”.
- **Resultado antes de mecanismo.** O usuário quer “post pronto para publicar”, não “grafo multiagente”.
- **Números só se forem verdadeiros** e verificáveis.
- **Explique jargão uma vez.** GEO, ativo, crédito, aprovação, tenant (nunca “tenant” na UI; use “conta”).
- **Consistência de vocabulário.** Escolha e registre no glossário.
- **Microcopy de sistema:** erro sem culpa, com próximo passo; loading com contexto; vazio com ação.
- **Marketing:** prova, especificidade e ritmo; menos adjetivos, mais cenas de uso.

### 8.2 Decisões obrigatórias

- Canonizar nomes dos planos: **um** conjunto. Se manter Start/Lift/Flow no marketing, o app/billing/admin e o `reason` do Mercado Pago devem usar os mesmos nomes (ou um mapeamento explícito e consistente).
- Remover promessa de **Pix Automático** onde ele não existe mais.
- Glossário canônico em `docs/COPY-GUIDE.md`: marca, conta, conteúdo/ativo, pacote/plano, créditos, aprovação, exportação, publicação, GEO.
- Antes/depois de pelo menos 20 textos, com contagem de palavras e justificativa.

### 8.3 Meta

Reduzir **25–35%** das palavras nas telas-chave sem perder informação crítica. O texto deve caber no mobile sem virar parede.

---

## 9. Fase 6 — Implementação e qualidade

- Trabalhe em commits pequenos e temáticos (`feat(ui)`, `refactor(ui)`, `docs`, `fix(copy)`).
- Rode após cada bloco: `npm run typecheck && npm run lint && npm test && npm run build`.
- Não weaken testes, não remova cobertura, não ignore erros de acessibilidade.
- Preserve Server Components; só use client onde houver interação.
- Otimize imagens, evite CLS, controle bundle; se adicionar lib, justifique e meça.
- Teste 390px, 768px, 1280px, 1440px; claro/escuro; teclado; leitor de tela básico; zoom 200%.
- Faça QA visual antes/depois em `artifacts/shots/depois-*`.
- Rode Lighthouse (ou equivalente) nas telas principais e registre performance/acessibilidade.
- Não faça deploy de produção nem push sem autorização explícita; use preview.

### Critérios de aceite

- Em **5 segundos**, uma pessoa entende o que a Kitefy faz e qual é o próximo passo.
- Nenhuma tela parece “quatro cards brancos e uma tabela”: há hierarquia, contexto, dado e ação.
- Todos os fluxos têm loading, vazio, erro, sucesso e permissão negada quando aplicável.
- Mobile 390px sem overflow horizontal; alvos de toque confortáveis.
- Contraste AA, foco visível, labels, ARIA correta, reduced motion.
- Copy 25–35% menor nas telas-chave; nomes de plano e produto 100% consistentes.
- `typecheck`, `lint`, `test`, `build` verdes; nenhuma regressão em billing, admin, RLS, SEO/JSON-LD ou Pacote Google.
- Antes/depois documentados; decisões e trade-offs registrados.

---

## 10. Referências para pesquisar (extraia princípios; não copie)

**UI/UX e design system**

- Nielsen Norman Group — 10 heurísticas e pesquisas de dashboard: https://www.nngroup.com/articles/ten-usability-heuristics/
- Baymard Institute — checkout, formulários, confiança: https://baymard.com/
- Refactoring UI — hierarquia, espaçamento, cor, profundidade: https://www.refactoringui.com/
- Material Design 3 — tokens, estados, movimento: https://m3.material.io/
- Apple Human Interface Guidelines — clareza, feedback, navegação: https://developer.apple.com/design/human-interface-guidelines/
- WCAG 2.2 Quick Reference: https://www.w3.org/WAI/WCAG22/quickref/
- web.dev — Core Web Vitals: https://web.dev/vitals/
- Padrões de produto (referência, não cópia): Linear, Stripe Dashboard, Vercel, Notion, Figma, Height.

**Marketing digital, GEO e crescimento**

- Google Search Central — conteúdo útil, E-E-A-T, dados estruturados: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google Search Central — structured data: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Ahrefs Blog: https://ahrefs.com/blog/
- Semrush Blog: https://www.semrush.com/blog/
- Search Engine Land: https://searchengineland.com/
- Search Engine Journal: https://www.searchenginejournal.com/
- SparkToro — audiência e comportamento: https://sparktoro.com/
- Profound / Otterly — visibilidade em buscas com IA: https://www.profound.com/ · https://otterly.ai/
- Reforge — produto e crescimento: https://www.reforge.com/
- ProductLed — onboarding e ativação: https://productled.com/
- OpenView Partners — benchmarks SaaS: https://openviewpartners.com/
- CXL / GoodUI — CRO e experimentos: https://cxl.com/ · https://goodui.org/

Entregue `docs/PESQUISA-REFERENCIAS.md` com 8–12 fontes, o princípio extraído e como ele foi aplicado (ou descartado) na Kitefy.

---

## 11. Entregáveis

1. `docs/REDESIGN-AUDIT.md` — diagnóstico, top 10, evidências, screenshots.
2. `docs/REDESIGN-DIRECTION.md` — direção escolhida, tokens, componentes, IA/navegação.
3. `docs/FEATURES-ROADMAP.md` — 12+ ideias, 3–5 escolhidas, esforço/impacto/risco/dados.
4. `docs/COPY-GUIDE.md` — glossário, regras, antes/depois, decisão de nomes.
5. `docs/PESQUISA-REFERENCIAS.md` — fontes e princípios.
6. Código implementado (design system + shell + P0; P1 se couber).
7. `docs/REDESIGN-RESULT.md` — antes/depois, métricas, checks, bundle, riscos e próximos passos.
8. Screenshots antes/depois em `artifacts/shots/`.

---

## 12. Autonomia, pausas e escopo

- **Não peça aprovação para cada tela.** Decida, implemente, documente.
- **Pare e pergunte** apenas se: (a) for necessário escolher o nome comercial canônico dos planos e isso mudar contrato/preço; (b) a mudança exigir deploy de produção; (c) for remover uma feature; (d) exigir integração paga/nova; (e) houver conflito com uma regra da seção 3.
- Se o escopo não couber na sessão, entregue **P0 completo e polido** (shell + dashboard + estúdio + biblioteca + billing/pricing + copy), e um roadmap claro para P1/P2. Não deixe metade de uma tela.
- Se encontrar um bug de produto no caminho (ex.: texto de Pix removido, plano inconsistente), corrija se for barato e documente; se for estrutural, registre no roadmap.
- Não reescreva backend por estética. O foco é elevar a experiência com o que existe.

## 13. Primeira resposta esperada

Comece com:

1. confirmação do que leu e baseline (comandos + resultados);
2. auditoria em 10 pontos (problema → evidência → impacto → correção);
3. direção visual escolhida (com 2 alternativas descartadas e por quê);
4. mapa de navegação antes/depois;
5. shortlist de 3–5 recursos com impacto/esforço/dados;
6. decisão de nomenclatura e plano de copy;
7. plano de commits/etapas.

Depois disso, **siga implementando** o P0, a menos que uma das perguntas da seção 12 esteja bloqueando. Entregue progresso verificável, não um manifesto.

---

**Lema:** menos telas genéricas, mais produto com ponto de vista. A Kitefy não precisa parecer maior; precisa parecer **mais útil, mais confiável e mais fácil de começar**.
