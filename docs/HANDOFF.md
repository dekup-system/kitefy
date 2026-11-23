# Handoff — Kitefy (continuação)

Projeto: `C:\Users\mtres\Documents\brandpulse` · repo `github.com/dekup-system/kitefy` · branch `main`
Produção: `https://www.kitefy.com.br`

Commits desta sessão: `bf512a2` (painel do usuário), `fb019f1` (perfis de marca), o commit do
Pacote Google e o do console administrativo no topo do histórico (`git log -1`).
Base anterior: `b645ce1`.

## Estado atual (tudo verificado)

| Frente | Estado |
| --- | --- |
| Geração (6 formatos, IA real DeepSeek + embeddings Gemini) | ✅ |
| Artigo GEO com JSON-LD validado | ✅ |
| Billing MP: autorização + renovação idempotentes, worker automático + cron | ✅ |
| Assinatura via Checkout Pro (plano por tenant, sem amarrar e-mail do pagador) | ✅ |
| Pix Automático | removido (não liberado na conta) |
| Onboarding com leitura real do site (robots, SSRF) | ✅ |
| Análise de concorrentes (SERP pt-BR + crawl) | ✅ |
| Auth: confirmar senha, link mágico, esqueci a senha (/reset) | ✅ |
| SMTP Resend + e-mails com logo | ✅ (templates em `docs/EMAILS-TEMPLATES.md`) |
| Lembrete semanal por e-mail | ✅ |
| Domínio `kitefy.com.br` com SSL, Supabase Auth apontado | ✅ |
| **Painel do usuário** | ✅ `/settings/account` |
| **Perfis de marca (múltiplas, edição, logo privado)** | ✅ `/settings/brand` |
| **Pacote Google (sitemap, robots de IA, index, GSC)** | ✅ `/google` |
| **Console administrativo (contas, planos, cupons, receita, custos)** | ✅ `/admin` |

## O que foi entregue nesta sessão

### 1. Painel do usuário — `/settings/account`

- Pacote atual, créditos, status da assinatura e próxima cobrança.
- Renovar/assinar o mesmo plano quando não há assinatura ativa; upgrade/downgrade quando há.
  A decisão é a função pura `src/lib/billing/plan-change.ts`; a server action
  (`src/lib/account/actions.ts`) cria o checkout novo **e cancela** a assinatura antiga antes de
  redirecionar — nunca cobra duas vezes. Só `owner` troca plano.
- Dados cadastrais: nome da conta (owner), troca de e-mail com confirmação do Supabase Auth e
  envio de link para definir senha nova.
- Reaproveita `createPlanCheckout`/`cancelPreApproval` e grava o cancelamento local como
  `cancelled`; o webhook confirma depois.

### 2. Perfis de marca — `/settings/brand`

- Criar marcas adicionais direto no painel (limite `PLANS[tier].maxBrands` conferido no servidor).
- Logomarca no bucket **privado** `SUPABASE_STORAGE_BUCKET` (default `brand-assets`):
  caminho `<tenantId>/<brandId>/brand/logo-<timestamp>.png`.
  - aceita PNG/JPEG/WebP por magic bytes, até 2 MB;
  - `sharp` re-encoda para PNG com no máximo 1024px (remove EXIF e limita bomba de pixels);
  - o path vai para `brand_profiles.visual_tokens.logo_path`; a UI recebe apenas URL assinada;
  - a policy de Storage já valida a primeira pasta pelo `tenant_id`.
- Upload/remoção em `src/lib/brand/actions.ts`; validação pura em `src/lib/brand/logo.ts`.

### 3. Pacote Google — `/google`

- ZIP gerado por `GET /api/brands/[brandId]/google-pack` (RLS pela sessão; `404` para marca de
  outro tenant). Conteúdo:
  - `sitemap.xml` — homepage + artigos `geo_article` com status `approved`/`exported`;
  - `robots.txt` — libera GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User,
    Google-Extended, ClaudeBot e CCBot, com `Sitemap:` absoluto;
  - `index.html` — canonical, Open Graph, Twitter Card, JSON-LD (Organization/WebSite/ItemList)
    e `<meta name="google-site-verification">` quando há token;
  - `LEIA-ME.txt` — instalação, aviso do `/logo.png` público e verificação no GSC.
- Token do Search Console por marca em `brand_profiles.google_verification_token`
  (migration `20260101000007_brand_google_setup.sql`). Aceita token puro, prefixo
  `google-site-verification=` ou a meta tag inteira; validado antes de salvar.
- Builder puro em `src/lib/export/google-pack.ts` (sem rede), com escaping de XML/HTML/JSON-LD.

### 4. Console administrativo — `/admin`

- Acesso por flag `auth.users.app_metadata.is_admin` (só gravável com service_role/Admin API).
  `getSessionContext().isPlatformAdmin` libera o link na sidebar/menu e o layout `/admin` responde
  `404` para quem não é admin. Toda action revalida a flag no servidor.
- **Visão geral**: MRR (valor real das assinaturas), receita confirmada em 30 dias, custo estimado de
  API, margem, contas, marcas, conteúdos, cupons, custo por modelo e últimos usos.
- **Contas e planos** (`/admin/contas`): busca por nome/slug/e-mail, plano, assinatura, créditos,
  receita e custo por conta. No detalhe: alterar plano (sem tocar na cobrança do MP) e ajustar
  créditos via `consume_credits` (extrato + auditoria).
- **Cupons** (`/admin/cupons`): gerador `KITE-XXXXXX` (ou código custom), desconto de 1–90%,
  limite de usos, validade, ativação/desativação, resgates e receita gerada. O cupom é validado no
  servidor e embutido no `external_reference` (`tenantId:plano:CUPOM`); o resgate só é confirmado
  quando a assinatura fica ativa (RPC `confirm_coupon_redemption`, idempotente).
- **Receita e custos** (`/admin/receita`): MRR/ARPU, receita 30d e histórica, série mensal, receita
  por plano, extrato de cobranças e custo por provider/modelo.
- Dados novos (migration `20260101000008_admin_console.sql`):
  `discount_coupons`, `coupon_redemptions`, `billing_revenue_events`, `api_usage_events`,
  `admin_audit_log` e `mp_subscriptions.amount_cents`.
- Custo de IA: o runner grava `api_usage_events` após cada invoke/retomada, com sequência
  determinística (`thread_id + sequence`) para não duplicar. Estimativa por tokens de LLM;
  embeddings/SERP/imagens não entram nessa conta.

## Aplicar em produção

As migrations `0007` e `0008` **já foram aplicadas** no projeto `exinnzybuxudnmhokosv` (verificado:
5 tabelas novas com RLS e `mp_subscriptions.amount_cents` presente). Para regenerar o script único:

```bash
npm run db:setup-sql        # regenera supabase/kitefy-setup.sql (8 migrations)
```

Aplicação idempotente por CLI (usa `SUPABASE_DB_URL`):

```bash
npm run db:apply-setup -- supabase/migrations/20260101000008_admin_console.sql --apply
```

Confirme que `brand_profiles.google_verification_token` existe, que o bucket privado continua
configurado e que as 5 tabelas internas têm RLS. Nenhuma variável de ambiente nova é obrigatória;
`ADMIN_USD_BRL_RATE` (default 5,4) só ajusta a margem estimada.

## Verificação rápida

```bash
npm run typecheck && npm run lint && npm test   # 398 testes
npm run build
npm run db:ping
```

## Próximos passos

- **Deploy**: o console `/admin` só fica disponível após publicar este commit (Vercel). As migrations
  já estão aplicadas, então não há passo de banco no deploy.
- A conta `kitefy.flow@gmail.com` foi criada com e-mail confirmado e `is_admin=true`; a senha
  temporária foi entregue fora do Git e deve ser trocada no primeiro login (Minha conta).
- Smoke manual: abrir `/admin`, conferir MRR/custos, gerar um cupom e testar um checkout com cupom.

## Credenciais

Tudo em `.env.local` (não versionado): Supabase (URL, anon, service_role, DB URL, access token),
DeepSeek, Gemini, Serper, Mercado Pago (produção), Resend, CRON_SECRET.

Conta de produção Supabase: `exinnzybuxudnmhokosv` · MP: DEKUP_EDITOR (id 1403168693).

Admin da plataforma: `kitefy.flow@gmail.com` (user id `60052eb0-3afc-4a59-8f33-d28f683aeaf8`,
tenant `884f54e2-f64e-4b93-8719-3e954d1e3c93`). A promoção é feita por
`npm run admin:create -- email` e grava `app_metadata.is_admin=true`; nenhuma senha fica no repo.

## Regras que não podem ser quebradas

- RLS em todas as tabelas; `tenant_id` nunca vem do cliente.
- Segredos só no servidor; nada no Git.
- Sem OAuth social, sem avatar/TTS, sem clonagem de voz.
- Débito de crédito só após aprovação humana; estorno em falha.
- Produto só para o Brasil (locale pt-BR fixo).
- Admin só com `app_metadata.is_admin=true`; ações administrativas usam service_role no servidor e
  gravam em `admin_audit_log`.
