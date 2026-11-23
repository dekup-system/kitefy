import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { query } from "@/lib/db/pg";
import { applyPaymentCredit } from "@/lib/billing/credit-grants";
import { getPaymentById, getPreApprovalById, MercadoPagoError } from "@/lib/billing/mercadopago";
import {
  parseTenantFromExternalReference,
  syncSubscriptionFromPreapproval,
} from "@/lib/billing/subscription-sync";
import { constantTimeEquals } from "@/lib/billing/webhook-signature";
import {
  chargePeriod,
  fetchAuthorizedPayment,
  isSettledRecurringCharge,
} from "@/lib/billing/authorized-payment";
import { grantPlanCredits, pgCreditStore } from "@/lib/billing/credit-grants";
import {
  ackWebhookJob,
  nackWebhookJob,
  readWebhookJobs,
  type MpWebhookJobPayload,
  type QueuedJob,
} from "@/lib/billing/webhook-queue";

/**
 * POST /api/jobs/mercadopago
 *
 * Worker dos webhooks do Mercado Pago (chamado por cron/worker externo).
 *
 * Proteção: header `x-worker-secret` comparado em TEMPO CONSTANTE com
 * `MP_WEBHOOK_SECRET`. Sem segredo válido → 401; sem MP configurado → 503.
 *
 * Por job:
 *  1. garante que o evento ainda não foi processado (`processed_at`);
 *  2. confirma o status REAL na API do Mercado Pago (nunca confia no payload);
 *  3. aplica o crédito de forma idempotente (`applyPaymentCredit`);
 *  4. marca `processed_at` e arquiva o job.
 *
 * Falha transitória → job volta para a fila (visibility timeout) e a resposta
 * contabiliza em `failed`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.jobs.mercadopago");

const BATCH_SIZE = 10;
const VISIBILITY_TIMEOUT_SECONDS = 60;

const jobPayloadSchema = z.object({
  eventId: z.string().trim().min(1),
  topic: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  dataId: z.string().trim().min(1),
  receivedAt: z.string().optional(),
});

const limitSchema = z.coerce.number().int().min(1).max(50).catch(BATCH_SIZE);

type JobOutcome = "credited" | "subscription_synced" | "skipped" | "failed";

interface JobResult {
  eventId: string;
  outcome: JobOutcome;
  paymentId?: string;
  reason?: string;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Credencial de worker inválida ou ausente." }, { status: 401 });
}

/** Marca o evento como processado (idempotente). */
async function markEventProcessed(eventId: string): Promise<void> {
  await query(
    "update public.mp_webhook_events set processed_at = now() where mp_event_id = $1 and processed_at is null",
    [eventId],
  );
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  const rows = await query<{ processed_at: string | null }>(
    "select processed_at from public.mp_webhook_events where mp_event_id = $1",
    [eventId],
  );

  return Boolean(rows[0]?.processed_at);
}

function classifyTopic(
  topic: string | null,
): "payment" | "preapproval" | "authorized_payment" | "other" {
  const normalized = (topic ?? "").trim().toLowerCase();

  if (normalized === "payment" || normalized.startsWith("payment.")) return "payment";
  if (normalized.startsWith("subscription_preapproval")) return "preapproval";
  if (normalized.startsWith("subscription_authorized_payment")) return "authorized_payment";

  // `subscription_authorized_payment` (cobrança recorrente) e merchant_order não
  // são creditados aqui: o SDK não expõe o recurso authorized_payment para
  // confirmação, e creditar sem confirmar violaria a regra de ouro.
  return "other";
}

/** Pagamento avulso/recorrente: confirma na API e credita se aprovado. */
async function handlePaymentJob(dataId: string, eventId: string): Promise<JobResult> {
  const payment = await getPaymentById(dataId);

  const reference = parseTenantFromExternalReference(payment.externalReference);
  if (!reference || !reference.planHint) {
    log.warn("Pagamento sem external_reference utilizável: crédito não aplicado", {
      eventId,
      paymentId: payment.paymentId,
    });
    await markEventProcessed(eventId);
    return { eventId, outcome: "skipped", paymentId: payment.paymentId, reason: "reference_missing" };
  }

  if (payment.status !== "approved") {
    log.info("Pagamento não aprovado: nenhum crédito aplicado", {
      eventId,
      paymentId: payment.paymentId,
      status: payment.status,
    });
    await markEventProcessed(eventId);
    return { eventId, outcome: "skipped", paymentId: payment.paymentId, reason: `status_${payment.status}` };
  }

  const applied = await applyPaymentCredit(
    reference.tenantId,
    payment.paymentId,
    reference.planHint,
  );

  await markEventProcessed(eventId);

  log.info("Crédito de pagamento processado", {
    eventId,
    paymentId: payment.paymentId,
    tenantId: reference.tenantId,
    planTier: reference.planHint,
    credited: applied.credited,
    balance: applied.balance,
  });

  return {
    eventId,
    outcome: applied.credited ? "credited" : "skipped",
    paymentId: payment.paymentId,
    reason: applied.credited ? undefined : "already_credited",
  };
}

/** Assinatura: confirma na API e faz upsert em `mp_subscriptions`. */
async function handlePreapprovalJob(dataId: string, eventId: string): Promise<JobResult> {
  const preapproval = await getPreApprovalById(dataId);

  // Assinatura criada fora do app (sem tenant no external_reference) não pode ser
  // creditada. É falha terminal, não transitória: arquiva em vez de reprocessar.
  if (parseTenantFromExternalReference(preapproval.externalReference ?? "") === null) {
    await markEventProcessed(eventId);
    log.warn("Assinatura sem tenant no external_reference: evento arquivado", {
      eventId,
      preapprovalId: preapproval.preapprovalId,
    });
    return { eventId, outcome: "skipped", reason: "reference_missing" };
  }

  await syncSubscriptionFromPreapproval({
    id: preapproval.preapprovalId,
    status: preapproval.status,
    external_reference: preapproval.externalReference,
    next_payment_date: preapproval.nextPaymentDate,
    payment_method_id: preapproval.paymentMethodId,
    auto_recurring: {
      transaction_amount:
        preapproval.amountCents === null ? null : preapproval.amountCents / 100,
    },
  });

  await markEventProcessed(eventId);

  return { eventId, outcome: "subscription_synced" };
}

async function handleAuthorizedPaymentJob(dataId: string, eventId: string): Promise<JobResult> {
  const env = getServerEnv();
  if (!env.MP_ACCESS_TOKEN) {
    return { eventId, outcome: "skipped", reason: "mp_not_configured" };
  }

  const charge = await fetchAuthorizedPayment(dataId, env.MP_ACCESS_TOKEN);

  if (!isSettledRecurringCharge(charge)) {
    await markEventProcessed(eventId);
    log.info("Cobranca recorrente ainda nao aprovada: sem credito", {
      eventId,
      chargeId: charge.id,
      status: charge.status,
      paymentStatus: charge.paymentStatus,
    });
    return { eventId, outcome: "skipped", reason: "charge_not_settled" };
  }

  if (!charge.preapprovalId) {
    await markEventProcessed(eventId);
    return { eventId, outcome: "skipped", reason: "reference_missing" };
  }

  const subscription = await query<{ tenant_id: string; plan_tier: string }>(
    "select tenant_id, plan_tier from public.mp_subscriptions where mp_preapproval_id = $1 limit 1",
    [charge.preapprovalId],
  );

  const tenantId = subscription[0]?.tenant_id;
  const planTier = subscription[0]?.plan_tier;
  if (!tenantId || !planTier) {
    await markEventProcessed(eventId);
    log.warn("Cobranca de assinatura sem tenant conhecido: evento arquivado", {
      eventId,
      preapprovalId: charge.preapprovalId,
    });
    return { eventId, outcome: "skipped", reason: "subscription_unknown" };
  }

  // Uma concessao por cobranca: reentrega do mesmo evento nao duplica credito.
  const referenceId = `subscription_payment:${charge.id}`;
  const existing = await pgCreditStore.query<{ id: string }>(
    "select id from public.credit_ledger where tenant_id = $1 and reference_id = $2 limit 1",
    [tenantId, referenceId],
  );

  if (existing.length === 0) {
    await grantPlanCredits(
      tenantId,
      planTier as Parameters<typeof grantPlanCredits>[1],
      "subscription_renewal",
      referenceId,
      pgCreditStore,
    );
  }

  await markEventProcessed(eventId);
  log.info("Renovacao creditada", {
    eventId,
    chargeId: charge.id,
    tenantId,
    period: chargePeriod(charge),
    duplicate: existing.length > 0,
  });

  return {
    eventId,
    outcome: existing.length > 0 ? "skipped" : "credited",
    ...(existing.length > 0 ? { reason: "already_credited" } : {}),
  };
}

async function processJob(job: QueuedJob<MpWebhookJobPayload>): Promise<JobResult> {
  const parsed = jobPayloadSchema.safeParse(job.payload);

  if (!parsed.success) {
    // Payload envenenado: arquiva para não travar a fila (o evento cru segue no banco).
    log.error("Job de webhook com payload inválido: arquivando", { msgId: job.msgId });
    await ackWebhookJob(job);
    return { eventId: `unknown:${job.msgId}`, outcome: "skipped", reason: "invalid_payload" };
  }

  const payload = parsed.data;

  if (await isEventProcessed(payload.eventId)) {
    await ackWebhookJob(job);
    return { eventId: payload.eventId, outcome: "skipped", reason: "already_processed" };
  }

  const kind = classifyTopic(payload.topic ?? null);

  if (kind === "other") {
    // merchant_order, chargebacks, etc.: fora do escopo de crédito/assinatura.
    log.info("Evento ignorado pelo worker", { eventId: payload.eventId, topic: payload.topic });
    await markEventProcessed(payload.eventId);
    await ackWebhookJob(job);
    return { eventId: payload.eventId, outcome: "skipped", reason: "topic_not_handled" };
  }

  try {
    const result =
      kind === "payment"
        ? await handlePaymentJob(payload.dataId, payload.eventId)
        : kind === "authorized_payment"
          ? await handleAuthorizedPaymentJob(payload.dataId, payload.eventId)
          : await handlePreapprovalJob(payload.dataId, payload.eventId);

    await ackWebhookJob(job);
    return result;
  } catch (error) {
    if (error instanceof MercadoPagoError && !error.retryable) {
      // Erro permanente (404, validação): arquiva para não repetir para sempre.
      log.error("Falha permanente ao confirmar recurso no Mercado Pago", {
        eventId: payload.eventId,
        code: error.code,
        status: error.status,
      });
      await ackWebhookJob(job);
      return { eventId: payload.eventId, outcome: "failed", reason: error.code };
    }

    // Transitório: devolve o job à fila para nova tentativa.
    await nackWebhookJob(job);
    throw error;
  }
}

/**
 * Cron da Vercel: a Vercel chama com `Authorization: Bearer $CRON_SECRET`.
 * Aceita também `x-worker-secret` para chamada manual.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getServerEnv();
  const expected = env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const workerSecret = request.headers.get("x-worker-secret") ?? "";
  const authorized =
    (expected && constantTimeEquals(bearer, expected)) ||
    (env.MP_WEBHOOK_SECRET && constantTimeEquals(workerSecret, env.MP_WEBHOOK_SECRET));

  if (!authorized) {
    log.warn("Cron do worker rejeitado", { hasBearer: bearer.length > 0 });
    return unauthorized();
  }

  return runWorker(limitSchema.parse(new URL(request.url).searchParams.get("limit")));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch (error) {
    log.error("Ambiente inválido no worker do Mercado Pago", error);
    return NextResponse.json(
      { error: "Worker indisponível: configuração de ambiente inválida no servidor." },
      { status: 503 },
    );
  }

  if (!env.MP_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Worker indisponível: Mercado Pago não configurado (MP_ACCESS_TOKEN ausente)." },
      { status: 503 },
    );
  }

  if (!env.MP_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Worker indisponível: MP_WEBHOOK_SECRET ausente não permite autenticar o worker." },
      { status: 503 },
    );
  }

  const workerSecret = request.headers.get("x-worker-secret");
  if (!workerSecret || !constantTimeEquals(workerSecret, env.MP_WEBHOOK_SECRET)) {
    log.warn("Chamada ao worker rejeitada", { hasHeader: workerSecret !== null });
    return unauthorized();
  }

  const limit = limitSchema.parse(new URL(request.url).searchParams.get("limit"));
  return runWorker(limit);
}

async function runWorker(limit: number): Promise<NextResponse> {
  let jobs: QueuedJob<MpWebhookJobPayload>[];
  try {
    jobs = await readWebhookJobs(limit, VISIBILITY_TIMEOUT_SECONDS);
  } catch (error) {
    log.error("Falha ao ler a fila de webhooks do Mercado Pago", error);
    return NextResponse.json(
      { error: "Falha ao ler a fila de webhooks: tente novamente." },
      { status: 503 },
    );
  }

  const results: JobResult[] = [];
  let credited = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await processJob(job);
      results.push(result);

      if (result.outcome === "credited") credited += 1;
      else if (result.outcome === "failed") failed += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      const eventId =
        typeof job.payload === "object" && job.payload !== null && "eventId" in job.payload
          ? String((job.payload as { eventId: unknown }).eventId)
          : `unknown:${job.msgId}`;

      log.error("Falha ao processar job do Mercado Pago", {
        eventId,
        msgId: job.msgId,
        message: error instanceof Error ? error.message : String(error),
      });

      results.push({ eventId, outcome: "failed", reason: "processing_error" });
    }
  }

  return NextResponse.json({
    ok: true,
    picked: jobs.length,
    credited,
    skipped,
    failed,
    results,
  });
}
