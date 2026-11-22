import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { query } from "@/lib/db/pg";
import { verifyMpSignature } from "@/lib/billing/webhook-signature";
import { enqueueWebhookJob } from "@/lib/billing/webhook-queue";

/**
 * POST /api/webhooks/mercadopago
 *
 * Recebe notificações do Mercado Pago. Fluxo deliberadamente curto:
 *   1. valida HMAC (`x-signature` + `x-request-id` + `data.id`);
 *   2. se inválido → 401 SEM tocar no banco (nem log de payload);
 *   3. grava o evento de forma idempotente (`mp_event_id` UNIQUE);
 *   4. enfileira o envelope em pgmq (fallback `enqueue_job`);
 *   5. responde 200 imediatamente.
 *
 * O pagamento NÃO é processado neste request: quem confirma o status real na API
 * do Mercado Pago e credita é o worker (`POST /api/jobs/mercadopago`).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.webhooks.mercadopago");

/**
 * O corpo é validado apenas como objeto JSON: o conteúdo de negócio é sempre
 * reconfirmado na API do Mercado Pago pelo worker, nunca confiado daqui.
 */
const notificationSchema = z.record(z.string(), z.unknown());

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Assinatura do webhook inválida." }, { status: 401 });
}

function readStringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let secret: string;
  try {
    const env = getServerEnv();
    if (!env.MP_WEBHOOK_SECRET) {
      log.error("MP_WEBHOOK_SECRET ausente: webhook do Mercado Pago não pode ser validado");
      return NextResponse.json(
        { error: "Webhook indisponível: segredo de assinatura não configurado no servidor." },
        { status: 503 },
      );
    }
    secret = env.MP_WEBHOOK_SECRET;
  } catch (error) {
    log.error("Ambiente inválido ao validar webhook do Mercado Pago", error);
    return NextResponse.json(
      { error: "Webhook indisponível: configuração de ambiente inválida no servidor." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  // Mercado Pago envia `?data.id=...`; `data_id` é aceito por compatibilidade.
  const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("data_id");
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");

  // O corpo é lido antes da verificação apenas para descobrir `data.id` quando
  // ele não vem na query string (o simulador do painel e alguns eventos mandam
  // só no corpo). Nenhuma ação de negócio acontece antes do HMAC validar.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    log.warn("Corpo do webhook inválido", { requestId });
    return NextResponse.json({ error: "Corpo do webhook inválido: JSON esperado." }, { status: 400 });
  }

  const parsed = notificationSchema.safeParse(rawBody);
  if (!parsed.success) {
    log.warn("Payload do webhook não é um objeto JSON", { requestId });
    return NextResponse.json({ error: "Corpo do webhook inválido: objeto JSON esperado." }, { status: 400 });
  }

  const notification = parsed.data;
  const bodyData = notification.data;
  const dataId =
    queryDataId ??
    (bodyData && typeof bodyData === "object"
      ? readStringField(bodyData as Record<string, unknown>, "id")
      : null) ??
    readStringField(notification, "id");

  const verification = verifyMpSignature({
    signatureHeader,
    requestId,
    dataId,
    secret,
  });

  if (!verification.valid) {
    // Loga só o motivo e IDs de correlação — nunca o header nem o hash recebido.
    log.warn("Webhook do Mercado Pago rejeitado", {
      reason: verification.reason,
      requestId: requestId ?? null,
      hasDataId: dataId !== null,
      hasSignatureHeader: signatureHeader !== null,
    });
    return NextResponse.json(
      { error: "Assinatura do webhook inválida.", reason: verification.reason ?? "unknown" },
      { status: 401 },
    );
  }

  // Após `valid`, `verifyMpSignature` já garantiu ambos; a checagem estreita tipos.
  if (dataId === null || requestId === null) return unauthorized();

  const topic = readStringField(notification, "type") ?? readStringField(notification, "topic");
  const action = readStringField(notification, "action");

  // `id` da notificação é o identificador idempotente do Mercado Pago.
  // Fallback determinístico (nunca aleatório) para não perder a idempotência.
  const eventId =
    readStringField(notification, "id") ?? `${topic ?? "mp"}:${dataId}:${requestId}`;

  let inserted = false;

  try {
    const insertedRows = await query<{ id: string }>(
      `insert into public.mp_webhook_events (mp_event_id, topic, payload)
       values ($1, $2, $3::jsonb)
       on conflict (mp_event_id) do nothing
       returning id`,
      [eventId, topic, JSON.stringify(notification)],
    );
    inserted = insertedRows.length > 0;
  } catch (error) {
    log.error("Falha ao persistir evento do Mercado Pago", {
      eventId,
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Falha temporária ao registrar o evento: reenvie a notificação." },
      { status: 503 },
    );
  }

  // Enfileira inclusive em reentrega: se o enfileiramento anterior falhou, esta é
  // a chance de recuperar. O worker é idempotente (processed_at + ledger).
  const queued = await enqueueWebhookJob({
    eventId,
    topic,
    action,
    dataId,
    receivedAt: new Date().toISOString(),
  });

  if (!queued) {
    log.error("Evento registrado, mas não enfileirado", { eventId, requestId });
    return NextResponse.json(
      { error: "Evento registrado, mas a fila interna falhou: reenvie a notificação." },
      { status: 503 },
    );
  }

  log.info("Webhook do Mercado Pago aceito", { eventId, topic, duplicate: !inserted });

  return NextResponse.json({ received: true, eventId, duplicate: !inserted });
}
