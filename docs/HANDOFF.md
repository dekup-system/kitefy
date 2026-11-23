# Handoff — Kitefy (continuação)

Projeto: `C:\Users\mtres\Documents\brandpulse` · repo `github.com/dekup-system/kitefy` · branch `main`
Último commit desta sessão: `f3947db` · produção: `https://www.kitefy.com.br`

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
| **Perfis de marca (criar/editar/upload de logo)** | ⏳ pendente |
| **Pacote Google** (sitemap.xml, robots.txt, verificação GSC) | ⏳ pendente |

## Credenciais

Tudo em `.env.local` (não versionado): Supabase (URL, anon, service_role, DB URL, access token),
DeepSeek, Gemini, Serper, Mercado Pago (produção), Resend, CRON_SECRET.

Conta de produção Supabase: `exinnzybuxudnmhokosv` · MP: DEKUP_EDITOR (id 1403168693).

## Verificação rápida

```bash
npm run typecheck && npm run lint && npm test   # 314 testes
npm run build
npm run db:ping
```

## Próximos blocos

1. **Perfis de marca** — múltiplas marcas por conta, edição e upload de logomarca (Storage privado).
2. **Pacote Google** — ZIP com `sitemap.xml`, `robots.txt` liberando GPTBot/Perplexity,
   `index.html` com canonical/OG/JSON-LD e campo para o token de verificação do Search Console.

## Regras que não podem ser quebradas

- RLS em todas as tabelas; `tenant_id` nunca vem do cliente.
- Segredos só no servidor; nada no Git.
- Sem OAuth social, sem avatar/TTS, sem clonagem de voz.
- Débito de crédito só após aprovação humana; estorno em falha.
- Produto só para o Brasil (locale pt-BR fixo).
