/**
 * Envio de e-mail transacional via Resend.
 *
 * Sem SDK: uma chamada HTTP. O remetente precisa ser do domínio verificado
 * (kitefy.com.br), senão o provedor recusa com 403.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  id: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("E-mail não configurado: defina RESEND_API_KEY e EMAIL_FROM.");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;

  if (!response.ok || !body?.id) {
    throw new Error(
      `Resend respondeu HTTP ${response.status}${body?.message ? `: ${body.message}` : ""}.`,
    );
  }

  return { id: body.id };
}
