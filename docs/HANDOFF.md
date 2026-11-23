# Handoff — Kitefy (continuação)

Projeto: `C:\Users\mtres\Documents\brandpulse` · repo `github.com/dekup-system/kitefy` · branch `main`
Produção: `https://www.kitefy.com.br`

Commits desta sessão: `bf512a2` (painel do usuário), `fb019f1` (perfis de marca) e o commit
do Pacote Google no topo do histórico (`git log -1`). Base anterior: `b645ce1`.

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

## Aplicar em produção

A migration `0007` já está incluída no script único. Rode:

```bash
npm run db:setup-sql        # regenera supabase/kitefy-setup.sql (7 migrations)
```

e cole o arquivo no **SQL Editor** do Supabase (`exinnzybuxudnmhokosv`), ou use `npx supabase db push`.
Confirme que `brand_profiles.google_verification_token` existe e que o bucket privado continua
configurado. Nenhuma variável de ambiente nova é necessária.

## Verificação rápida

```bash
npm run typecheck && npm run lint && npm test   # 367 testes
npm run build
npm run db:ping
```

## Próximos passos (opcionais)

- Smoke manual em produção: upload de logo (bucket privado) e download do Pacote Google com token
  real do Search Console.
- Nenhum bloco da lista original ficou pendente.

## Credenciais

Tudo em `.env.local` (não versionado): Supabase (URL, anon, service_role, DB URL, access token),
DeepSeek, Gemini, Serper, Mercado Pago (produção), Resend, CRON_SECRET.

Conta de produção Supabase: `exinnzybuxudnmhokosv` · MP: DEKUP_EDITOR (id 1403168693).

## Regras que não podem ser quebradas

- RLS em todas as tabelas; `tenant_id` nunca vem do cliente.
- Segredos só no servidor; nada no Git.
- Sem OAuth social, sem avatar/TTS, sem clonagem de voz.
- Débito de crédito só após aprovação humana; estorno em falha.
- Produto só para o Brasil (locale pt-BR fixo).
