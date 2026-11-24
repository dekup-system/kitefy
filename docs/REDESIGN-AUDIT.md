# Auditoria de Produto, UI/UX, Valor e Copy — Kitefy

**Data:** 24/11/2026 · **Base:** `7f3a6d0` (`main`)
**Baseline técnico verificado antes de qualquer edição:**
- `npm run typecheck` → OK (exit 0)
- `npm run lint` → OK (exit 0)
- `npm test` → OK — 37 arquivos, **398 testes aprovados** (exit 0)
- `npm run build` → OK — compilado em 5,2s (exit 0)

---

## 1. O que está bom (preservar)

1. **Identidade cromática e acessibilidade documentadas (`docs/KITEFY-BRAND.md`, `globals.css`)**: a landing page (`/`) já respeita 60/30/10 com navy `#181331`, canvas `#F8F8FA`, sinal `#FD3E01` e contraste AA/AAA medido.
2. **Motor real de produto**: 6 formatos de conteúdo, extração de marca via URL, renderização visual `sharp`/Satori, Thompson Sampling, Pacote Google (ZIP) e console `/admin` com RLS e 398 testes.
3. **Semântica de confiança**: débito de crédito apenas após aprovação humana e estorno automático em falha técnica — diferencial forte que hoje fica escondido em rodapé de formulário.
4. **SEO técnico recém-entregue (`cad451d`)**: `sitemap.ts`, `robots.ts`, JSON-LD e `proxy.ts` liberando crawlers.

---

## 2. Top 10 problemas de maior impacto (Impacto × Esforço)

| # | Problema | Evidência (arquivo / rota) | Impacto no usuário | Esforço | Correção proposta |
|---|---|---|---|---|---|
| 1 | **App autenticado "todo branco" e sem âncora de marca (60/30/10 quebrado)** | `src/app/(app)/layout.tsx`, `src/app/globals.css` (`--sidebar: #fff`, `--card: #fff`, `--background: #f8f8fa`, contraste 1,06:1) | Percepção imediata de "template genérico e barato" logo após o login; zero continuidade com a LP | P | Aplicar sidebar Navy `#181331` (30% escuro da marca), canvas `#F3F3F7` + cards `#FFFFFF` com borda nítida `#DDDCE8` e CTA primário com sinal de marca |
| 2 | **Navegação mobile quebrada na barra inferior** | `src/app/(app)/layout.tsx#L95-L100` renderiza `<AppSidebar />` (`flex-col`) dentro de barra horizontal inferior com 6–7 itens | Barra inferior espremida/empilhada em 390px, alvos de toque comprometidos | P | Criar componente dedicado `MobileBottomNav` com 4 destinos principais (`Início`, `Criar`, `Biblioteca`, `Mais`) e alvos ≥ 44px |
| 3 | **Dashboard é "4 StatCards + tabela" sem ação principal** | `src/app/(app)/app/page.tsx` | Usuário entra e não sabe qual é o próximo passo de maior impacto; métricas ficam em `0` ou `—` sem ensinar o que fazer | M | Central de trabalho com **Próxima Melhor Ação**, **Pipeline de Conteúdos**, cards de conteúdos recentes, **Saúde da Marca (0–100%)** e medidor visual de créditos |
| 4 | **Biblioteca `/campaigns` é tabela crua sem thumbnails nem filtros de tipo/marca** | `src/app/(app)/campaigns/page.tsx` (ignora `visual_urls` já salvos no banco) | Conteúdos visuais (carrosséis, criativos) parecem linhas de planilha; baixo valor percebido | M | Visão em **Grade visual (thumbnails assinadas reais) + Lista**, filtros por formato, status, marca e busca |
| 5 | **Promessa contraditória de Pix Automático removido** | `src/app/pricing/page.tsx#L110-L142` ("Pix Automático é a forma recomendada"), `src/app/termos/page.tsx#L24` | Quebra de confiança no checkout: cliente clica esperando Pix Automático e encontra Mercado Pago Checkout Pro | P | Remover todas as promessas de Pix Automático/Payment Brick e explicar claramente o checkout mensal em BRL via Mercado Pago |
| 6 | **Nomes de planos e preços inconsistentes entre marketing, app e JSON-LD** | `src/lib/marketing/packages.ts` (`Start/Lift/Flow`) vs `src/lib/pricing.ts` (`Essencial/Crescimento Pro/Agência Escala`) vs `src/app/layout.tsx` (`lowPrice: 197.00` quando real é `49.90`) | Confusão comercial após cadastro e dados estruturados incorretos no Google | P | Corrigir JSON-LD (`49.90`–`269.90`), alinhar rótulos comerciais `Kitefy Start / Lift / Flow` na UI e propor canonização completa ao dono |
| 7 | **Jargão interno de engenharia exposto na interface** | `settings/billing/page.tsx` (`X-Idempotency-Key`, `HMAC-SHA256`), `telemetry/page.tsx` (`Braços do bandit`, `alpha`, `beta`, `pulls`, `tenant`), `command-menu.tsx` (`Campanhas` vs `Meus conteúdos`) | Afasta PMEs/gestores e passa impressão de ferramenta inacabada/técnica demais | P | Reescrever em linguagem de resultado de negócio e aplicar glossário único |
| 8 | **Sidebar plana com ícones duplicados e sem contexto de marca** | `src/components/app/app-sidebar.tsx` (`Concorrentes` e `Resultados` usam o mesmo `BarChart3`; `Administração` misturado no meio dos itens) | Falta hierarquia mental; usuário com 3+ marcas não vê em qual marca está operando | P | Agrupar sidebar por intenção (**Criar**, **Produção**, **Inteligência**, **Marca & Google**, **Conta**), ícones distintos, admin isolado no rodapé e indicador de marca na topbar |
| 9 | **Tela de aprovação `/studio/[threadId]` sem leitura rápida de qualidade nem checklist de publicação** | `src/app/(app)/studio/[threadId]/page.tsx` | Usuário precisa ler blocos longos para decidir se aprova e debita crédito | M | Adicionar **Content Score determinístico (0–100)** com critérios visíveis e **Checklist de Exportação/Publicação** por formato |
| 10 | **Estúdio `/studio/new` parece formulário longo sem resumo fixo de custo/tempo** | `src/app/(app)/studio/new/new-run-form.tsx` | Custo em créditos e saldo só aparecem no final do scroll; formatos competem visualmente | P | Cards de formato mais escaneáveis com estimativa de tempo, entregáveis claros e barra de resumo de créditos visível |

---

## 3. Auditoria de proposta de valor (Jobs-to-be-Done)

| Recurso | Trabalho que resolve (JTBD) | O que existe no motor | Percepção atual na UI | Diagnóstico |
|---|---|---|---|---|
| Extração de marca + perfil | Não começar do zero com prompts genéricos | Crawler com extração de ICP, voz, cores, fatos verificáveis e logo privado | Formulário escondido em `/settings/brand` sem medidor de completude | **Subvalorizado** — criar score de completude e recomendações acionáveis |
| Estúdio 6 formatos | Produzir semana inteira de conteúdo no padrão da marca | LangGraph + render Satori/`sharp` + 3 ganchos A/B + JSON-LD | Formulário plano e tabela de texto | **Subvalorizado** — mostrar previews reais, Content Score e checklist |
| Biblioteca & Exportação | Organizar e levar pronto para publicar | ZIP, PNG, Markdown, HTML, JSON-LD, `visual_urls` | Tabela sem miniaturas | **Subvalorizado** — galeria visual com thumbnails reais |
| Telemetria & Thompson Sampling | Repetir o que traz resultado e cortar o que não funciona | Bandit Beta (`alpha/beta/pulls`) + feedback rápido ("Bombou") | Tabela estatística crua (`alpha`, `beta`, `pulls`) | **Mal traduzido** — traduzir para "Taxa de sucesso", "Ganchos vencedores" e recomendações |
| Pacote Google | Aparecer no Google e ser citado por ChatGPT/Perplexity | ZIP com `sitemap.xml`, `robots.txt` para IAs, `index.html` e GSC | Card técnico com lista de arquivos | **Bom motor, copy técnica** — destacar resultado de visibilidade |

---

## 4. Auditoria de copy (resumo — lista completa com 20+ trechos em `docs/COPY-GUIDE.md`)

Principais desvios detectados:
- **Contradição factual**: `/pricing` recomenda Pix Automático e cita Payment Brick, ambos removidos.
- **Vazamento de jargão**: `"tenant"`, `"Braços do bandit"`, `"alpha e beta são os parâmetros Beta da amostragem"`, `"X-Idempotency-Key (UUID v4)"`, `"HMAC-SHA256 em tempo constante"`.
- **Inconsistência de vocabulário**: sidebar diz `Meus conteúdos`, busca global diz `Campanhas` e `Criar novo ativo`, dashboard diz `Conteúdos recentes`, vazio diz `Nenhum ativo encontrado`.

---

## 5. Revisão das restrições da Seção 3 (Propostas fundamentadas)

Abaixo estão **4 propostas** ordenadas por impacto × evidência × reversibilidade. **Nenhuma foi implementada sem aprovação** — todo o P0 desta rodada opera 100% dentro das regras atuais.

### Proposta 1 — Canonizar o nome comercial dos planos para `Kitefy Start / Lift / Flow` em todo o sistema
- **Categoria:** Comercial
- **Regra atual:** Não alterar nomes/contratos de billing (`Essencial / Crescimento Pro / Agência Escala`) sem aprovação.
- **Por que existe:** Evitar divergência entre checkout do Mercado Pago (`reason`), faturas antigas e UI.
- **Evidência:** A landing (`/`) e `/pricing` vendem **Start / Lift / Flow**, mas ao logar o usuário encontra **Essencial / Crescimento Pro / Agência Escala** (`src/lib/pricing.ts`), gerando quebra de reconhecimento no momento da compra.
- **Proposta:** Adotar **Kitefy Start**, **Kitefy Lift** e **Kitefy Flow** como únicos nomes visíveis em `PLANS`, `/settings/account`, `/settings/billing`, `/admin` e `reason` do Mercado Pago, mantendo `essential | pro | agency` apenas como enum interno do banco.
- **Alternativa dentro da regra atual:** Exibir o nome comercial junto ao plano interno (`Kitefy Start · Essencial`) na UI sem alterar `PLANS` nem `reason` do Mercado Pago. *(Aplicada nesta rodada.)*
- **Impacto:** Alto em conversão e clareza; zero impacto em banco/RLS; baixo esforço de engenharia.
- **Risco e reversibilidade:** Baixíssimo; 100% reversível em 1 arquivo (`src/lib/pricing.ts`).
- **Recomendação:** **Fazer agora** (após OK do dono).
- **Decisão necessária:** Aprovação do dono para atualizar `PLANS[tier].name` e `reason` do MP.

### Proposta 2 — Piloto de exportação direta para CMS (WordPress / Webflow / Webhook estruturado) sem OAuth social
- **Categoria:** Produto/estratégia
- **Regra atual:** Fluxo termina em download/cópia local; sem integrações de publicação automática.
- **Por que existe:** Reduzir escopo, manutenção de OAuth e risco de bloqueio em redes sociais.
- **Evidência:** O artigo GEO (5 créditos, maior ticket de consumo) gera Markdown + HTML + JSON-LD; colar manualmente HTML + `<script type="application/ld+json">` em blogs é o maior atrito para PMEs.
- **Proposta:** Piloto opcional de publicação em rascunho no WordPress (via Application Password, sem OAuth social) ou webhook padronizado de publicação para CMS.
- **Alternativa dentro da regra atual:** Checklist guiado de publicação por plataforma + cópia em 1 clique do bloco completo HTML + JSON-LD + Pacote Google em ZIP. *(Aplicada nesta rodada.)*
- **Impacto:** Alto em retenção de planos Lift/Flow; esforço médio de backend; sem risco de APIs sociais.
- **Risco e reversibilidade:** Baixo; feature opcional atrás de configuração por marca.
- **Recomendação:** **Testar em piloto** na próxima fase (P2/Roadmap).
- **Decisão necessária:** Aprovação do dono para priorizar conector WordPress/Webhook no roadmap.

### Proposta 3 — Adicionar biblioteca leve de gráficos (`recharts` ou `visx` / SVG nativo) para Telemetria e Admin
- **Categoria:** Técnica
- **Regra atual:** Evitar novas libs pesadas; preferir SVG/CSS.
- **Por que existe:** Controlar bundle e licenças (`docs/DEPENDENCIAS-LICENCAS.md`).
- **Evidência:** `/telemetry` e `/admin/receita` hoje exibem apenas tabelas numéricas; gráficos de evolução (retenção 3s, citações IA, MRR mensal) aumentam fortemente a percepção de valor.
- **Proposta:** Manter **SVG nativo sem dependências** no P0/P1 (zero KB de bundle extra, 100% SSR e acessível), e só avaliar biblioteca dedicada se entrarem gráficos interativos multi-eixo complexos.
- **Alternativa dentro da regra atual:** Componentes leves de barra de progresso, sparkline e barras horizontais em SVG/CSS puro. *(Aplicada nesta rodada.)*
- **Impacto:** Zero aumento de bundle, máxima performance Core Web Vitals.
- **Risco e reversibilidade:** Nenhum.
- **Recomendação:** **Não adicionar lib agora** — manter SVG/CSS nativo.
- **Decisão necessária:** Nenhuma (mantém regra atual).

### Proposta 4 — Manter "Sem OAuth social e sem avatar/TTS" como posicionamento de marca (não mudar)
- **Categoria:** Produto/estratégia
- **Regra atual:** Sem OAuth social, sem publicação em redes, sem avatar digital, sem TTS/clonagem de voz.
- **Por que existe:** Diferenciação de privacidade (LGPD, zero dados biométricos, zero tokens de redes), menor superfície legal e foco em autenticidade humana.
- **Evidência:** Na LP e na Política de Privacidade, "zero OAuth social e zero avatar sintético" é argumento explícito de segurança para PMEs e agências.
- **Proposta:** **Manter a restrição integralmente** e transformá-la em argumento visual de confiança no estúdio e na biblioteca ("Seus dados e contas sociais ficam só com você").
- **Alternativa dentro da regra atual:** N/A (regra mantida).
- **Recomendação:** **Não fazer** — manter a restrição atual.
- **Decisão necessária:** Nenhuma.
