# Guia de Copy e Glossário Canônico — Kitefy

**Data:** 24/11/2026

## 1. Glossário canônico (obrigatório em toda a UI)

| Conceito | Termo oficial na UI | Evitar / Proibido na UI |
|---|---|---|
| Organização do cliente | **Conta** | `tenant`, `workspace`, `org` |
| Perfil editorial | **Marca** | `brand_profile`, `perfil de entidade` |
| Peça gerada | **Conteúdo** (ou nome do formato: Carrossel, Roteiro, Artigo GEO) | misturar `ativo`, `campanha` e `post` na mesma tela |
| Lista de peças | **Biblioteca** | `Campanhas` (na busca), `Meus conteúdos` (em um lugar e `Ativos` noutro) |
| Planos (transição segura) | **Kitefy Start** · **Kitefy Lift** · **Kitefy Flow** *(com referência ao tier quando aplicável)* | Misturar Start/Lift/Flow na LP e só Essencial/Pro/Agência no app |
| Moeda interna | **Créditos** (débito só após aprovação) | `tokens`, `pontos` |
| Aprendizado | **Aprendizado de ganchos** / **Estilos vencedores** | `Braços do bandit`, `alpha`, `beta`, `pulls`, `Thompson Sampling` (sem explicação simples) |
| SEO para IAs | **Artigo GEO (Google e IAs)** | `GEO` solto sem contexto na primeira menção |
| Checkout | **Mercado Pago (assinatura mensal em BRL)** | `Pix Automático`, `Payment Brick`, `X-Idempotency-Key`, `HMAC-SHA256` |

---

## 2. Regras de escrita

1. **Uma ideia por frase.** Máximo 18–22 palavras em subtítulos e descrições de card.
2. **Resultado antes do mecanismo.** Escreva *"O estúdio repete as aberturas que mais retêm seu público"* em vez de *"alpha e beta são os parâmetros Beta da amostragem"*.
3. **Sem jargão de infraestrutura para o usuário final.** Segurança de pagamento é *"Pagamento protegido pelo Mercado Pago, sem cobrança duplicada"*, nunca *"X-Idempotency-Key UUID v4 e HMAC-SHA256 em tempo constante"*.
4. **Estados vazios sempre ensinam e oferecem 1 ação direta.**
5. **Meta de enxugamento:** 25–35% menos palavras nas telas P0, sem perder informação crítica.

---

## 3. Tabela Antes / Depois (20 trechos reais)

| # | Tela | Antes (palavras) | Depois (palavras) | Redução |
|---|---|---|---|---|
| 1 | `/app` header | "Seus conteúdos prontos para publicar, ideias da semana e créditos disponíveis." (11) | "Seu painel de produção, prioridades da semana e saldo de créditos." (10) | -9% |
| 2 | `/app` ideias | "Escolha uma sugestão abaixo para criar o conteúdo completo com imagens e legenda em menos de 1 minuto." (18) | "Clique em uma ideia para gerar imagens e legenda em menos de 1 minuto." (14) | -22% |
| 3 | `/app` aprendizado | "Quando você marca um post como 'Bombou', o estúdio guarda o estilo de abertura para repetir o que dá resultado no seu público." (23) | "Marque os posts que performaram bem para o estúdio repetir suas melhores aberturas." (13) | -43% |
| 4 | `/campaigns` header | "Todos os seus carrosséis, roteiros e artigos salvos, prontos para copiar a legenda e baixar as imagens." (17) | "Seus carrosséis, roteiros e artigos prontos para revisar, copiar e exportar." (11) | -35% |
| 5 | `/campaigns` vazio | "Gere o primeiro ativo: um roteiro curto custa 1 crédito e sai em menos de um minuto." (17) | "Crie seu primeiro conteúdo: roteiro ou carrossel custa 1 crédito." (10) | -41% |
| 6 | `/campaigns` busca | "Buscar campanhas por título" (4) | "Buscar na biblioteca…" (3) | -25% |
| 7 | `CommandMenu` | "Ir para, criar ativo, buscar campanha…" (6) | "Ir para tela, criar conteúdo ou buscar…" (7) | Consistência |
| 8 | `CommandMenu` vazio | "Nada encontrado. Tente 'campanhas' ou 'telemetria'." (7) | "Nada encontrado. Tente 'biblioteca', 'marca' ou 'resultados'." (8) | Consistência |
| 9 | `/studio/new` research | "Busca as perguntas mais feitas pelas pessoas no Google para enriquecer o post (+1 crédito; já incluso no Artigo para Blog)." (21) | "Inclui dúvidas reais do Google no conteúdo (+1 crédito; incluso no Artigo GEO)." (13) | -38% |
| 10 | `/studio/new` footer | "Você só usa X créditos se aprovar o resultado · seu saldo: Y" (12) | "Débito de X cr só após aprovação · Saldo: Y cr" (10) | -17% |
| 11 | `/pricing` pagamento título | "Pix Automático é a forma recomendada" (6) | "Assinatura mensal simples em reais pelo Mercado Pago" (8) | Corrige bug |
| 12 | `/pricing` pagamento corpo | "Menor taxa, renovação sem atrito e nenhuma cobrança na janela noturna (20h–06h), que costuma ser bloqueada em contas pessoa física. Você autoriza o mandato uma única vez no app do banco; as renovações seguintes acontecem entre 08h e 18h (BRT)." (40) | "Você escolhe o pacote, autoriza pelo Mercado Pago e recebe os créditos na aprovação. Sem taxa de setup, sem fidelidade e com renovação automática em horário comercial (08h–18h BRT)." (29) | -28% + corrige fato |
| 13 | `/pricing` bullet 1 | "Cartão recorrente também disponível, com tokenização no navegador (Payment Brick)." (10) | "Checkout oficial do Mercado Pago: seus dados de pagamento nunca passam pela Kitefy." (13) | Corrige fato |
| 14 | `/pricing` bullet 2 | "Idempotência em toda criação de cobrança: nenhuma duplicidade em retentativa." (10) | "Proteção automática contra cobrança duplicada." (5) | -50% |
| 15 | `/pricing` bullet 3 | "Webhook validado por assinatura HMAC antes de creditar qualquer valor." (10) | "Créditos liberados assim que o pagamento é confirmado." (8) | -20% |
| 16 | `/settings/billing` rodapé | "Cada criação de pagamento usa X-Idempotency-Key (UUID v4) para impedir cobrança duplicada em retentativa. O webhook valida x-signature com HMAC-SHA256 em tempo constante, responde 200 imediatamente e processa em fila..." (32+) | "Pagamentos processados pelo Mercado Pago com proteção contra duplicidade e renovação em horário comercial (08h–18h BRT). Créditos entram automaticamente após a confirmação." (22) | -55% |
| 17 | `/settings/billing` header | "Assinatura mensal em BRL pelo Mercado Pago. Você escolhe a conta no checkout e os créditos entram na aprovação." (19) | "Acompanhe seu saldo, compare pacotes e gerencie sua assinatura mensal em reais." (12) | -37% |
| 18 | `/settings/account` header | "Pacote atual, renovação e upgrade, além dos dados cadastrais e do acesso." (12) | "Seu pacote, créditos, renovação e dados de acesso." (8) | -33% |
| 19 | `/telemetry` aprendizado | "Braços do bandit — alpha e beta são os parâmetros Beta da amostragem. pulls é quantas vezes o braço foi usado em produção." (23) | "Estilos de abertura — o estúdio mede quais abordagens geram mais retenção e prioriza as vencedoras." (16) | -30% |
| 20 | `/telemetry` webhook | "Webhook GA4 disponível para o plano Pro e Agência: envie eventos para /api/webhooks/ga4 com o header de segredo do seu tenant." (21) | "Integração GA4 disponível nos pacotes Lift e Flow via /api/webhooks/ga4 usando a chave da sua conta." (16) | -24% |
