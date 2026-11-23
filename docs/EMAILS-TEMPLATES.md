# Templates de e-mail — Kitefy

A Management API do Supabase expõe apenas os avisos (senha alterada, e-mail alterado).
Os templates de **confirmação**, **recuperação** e **link mágico** precisam ser colados no
painel: **Authentication → Emails**.

Regras usadas (valem para os três): logo no topo, texto curto, um único botão, tom de conversa,
sem promessa e sem linguagem técnica.

Logo: `https://www.kitefy.com.br/brand/kitefy-logo.png`

---

## 1. Confirmação de cadastro

**Assunto:** `Só falta confirmar seu e-mail para começar`

```html
<div style="max-width:520px;margin:0 auto;padding:32px 24px;background:#FFFFFF;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#181331;line-height:1.6">
  <img src="https://www.kitefy.com.br/brand/kitefy-logo.png" alt="Kitefy" width="160" style="display:block;margin-bottom:28px" />
  <p>Boas-vindas!</p>
  <p>Sua conta na Kitefy foi criada. Falta um passo de nada: confirmar que este e-mail é seu.</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#FD3E01;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:8px">Confirmar e entrar</a>
  </p>
  <p style="font-size:13px;color:#54506A">O link vale por 24 horas. Se ele expirar, é só pedir outro na tela de entrada.</p>
  <p style="font-size:13px;color:#54506A">Não foi você? Pode ignorar este e-mail — nada acontece sem a confirmação.</p>
  <p style="margin-top:28px;font-size:12px;color:#6E6A85">Kitefy · conteúdo orgânico com padrão de marca</p>
</div>
```

---

## 2. Redefinição de senha

**Assunto:** `Vamos criar uma senha nova?`

```html
<div style="max-width:520px;margin:0 auto;padding:32px 24px;background:#FFFFFF;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#181331;line-height:1.6">
  <img src="https://www.kitefy.com.br/brand/kitefy-logo.png" alt="Kitefy" width="160" style="display:block;margin-bottom:28px" />
  <p>Olá,</p>
  <p>Recebemos um pedido para redefinir a senha da sua conta. Se foi você, é só clicar:</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#FD3E01;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:8px">Criar senha nova</a>
  </p>
  <p style="font-size:13px;color:#54506A">O link vale por 1 hora e só pode ser usado uma vez.</p>
  <p style="font-size:13px;color:#54506A">Se você não pediu, ignore este e-mail: sua senha atual continua valendo.</p>
  <p style="margin-top:28px;font-size:12px;color:#6E6A85">Kitefy · conteúdo orgânico com padrão de marca</p>
</div>
```

---

## 3. Link mágico (entrar sem senha)

**Assunto:** `Seu link de acesso está pronto`

```html
<div style="max-width:520px;margin:0 auto;padding:32px 24px;background:#FFFFFF;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#181331;line-height:1.6">
  <img src="https://www.kitefy.com.br/brand/kitefy-logo.png" alt="Kitefy" width="160" style="display:block;margin-bottom:28px" />
  <p>Olá,</p>
  <p>Você pediu para entrar sem senha. Clique no botão e você já cai no seu painel:</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#FD3E01;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:8px">Entrar no Kitefy</a>
  </p>
  <p style="font-size:13px;color:#54506A">O link vale por 1 hora e funciona uma vez só.</p>
  <p style="font-size:13px;color:#54506A">Se não foi você, ignore esta mensagem.</p>
  <p style="margin-top:28px;font-size:12px;color:#6E6A85">Kitefy · conteúdo orgânico com padrão de marca</p>
</div>
```

---

## Onde colar

1. **Supabase → Authentication → Emails**
2. Escolha o template (Confirm signup / Reset password / Magic link)
3. Cole o HTML no campo de mensagem e o assunto no campo de assunto
4. **Save**

Depois teste: criar conta com um e-mail real, pedir redefinição e pedir link mágico.

## Lembrete semanal

Esse já é enviado pelo código (`src/lib/email/weekly-reminder.ts`), com a mesma logo e o
mesmo tom — não precisa colar nada.
