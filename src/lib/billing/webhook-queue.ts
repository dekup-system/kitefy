import { query } from "@/lib/db/pg";
import { createLogger } from "@/lib/logger";

/**
 * Fila interna dos webhooks do Mercado Pago.
 *
 * Estratégia dual (a migration 0005 já prepara as duas):
 *  - `pgmq` presente (Supabase produção): `pgmq.send` / `pgmq.read` / `pgmq.archive`;
 *  - `pgmq` ausente (ambientes locais de teste): cai para `public.enqueue_job`
 *    (que por sua vez grava em `private.job_queue`) e para claim com
 *    `FOR UPDATE SKIP LOCKED`.
 *
 * A fila NUNCA carrega o corpo bruto assinado: o payload bruto fica em
 * `mp_webhook_events.payload`; aqui vai só o envelope necessário ao worker
 * (eventId, tópico, action e dataId).
 */

const log = createLogger("billing.webhook-queue");

export const MP_WEBHOOK_QUEUE = "mp_webhook_events";

let pgmqAvailable: boolean | null = null;

/** Detecta (e memoiza) a presença da extensão pgmq. */
export async function hasPgmq(): Promise<boolean> {
  if (pgmqAvailable !== null) return pgmqAvailable;

  const rows = await query<{ present: boolean }>(
    "select exists (select 1 from pg_extension where extname = 'pgmq') as present",
  );

  pgmqAvailable = rows[0]?.present === true;
  return pgmqAvailable;
}

/** Somente para testes: força nova detecção na próxima chamada. */
export function resetPgmqDetection(): void {
  pgmqAvailable = null;
}

export interface MpWebhookJobPayload {
  eventId: string;
  topic: string | null;
  action: string | null;
  dataId: string;
  receivedAt: string;
}

export interface QueuedJob<TPayload> {
  msgId: string;
  payload: TPayload;
  via: "pgmq" | "job_queue";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Enfileira o envelope do webhook. Devolve `false` (sem lançar) quando nem pgmq
 * nem a fila de fallback aceitaram o job — o chamador decide o status HTTP.
 */
export async function enqueueWebhookJob(payload: MpWebhookJobPayload): Promise<boolean> {
  const body = JSON.stringify(payload);

  if (await hasPgmq()) {
    try {
      await query("select pgmq.send($1, $2::jsonb)", [MP_WEBHOOK_QUEUE, body]);
      return true;
    } catch (error) {
      log.warn("pgmq.send falhou; tentando enqueue_job", { message: errorMessage(error) });
    }
  }

  try {
    // enqueue_job valida o nome da fila e grava em private.job_queue sem pgmq.
    await query("select public.enqueue_job($1, $2::jsonb)", [MP_WEBHOOK_QUEUE, body]);
    return true;
  } catch (error) {
    log.error("Não foi possível enfileirar o webhook do Mercado Pago", {
      message: errorMessage(error),
    });
    return false;
  }
}

interface PgmqRow {
  msg_id: string | number | bigint;
  message: MpWebhookJobPayload;
}

interface JobQueueRow {
  id: string | number | bigint;
  payload: MpWebhookJobPayload;
}

/**
 * Reserva até `quantity` jobs com visibility timeout.
 * Mensagens reservadas e não confirmadas voltam para a fila depois do timeout.
 */
export async function readWebhookJobs(
  quantity = 10,
  visibilityTimeoutSeconds = 60,
): Promise<QueuedJob<MpWebhookJobPayload>[]> {
  if (await hasPgmq()) {
    try {
      const rows = await query<PgmqRow>("select msg_id, message from pgmq.read($1, $2, $3)", [
        MP_WEBHOOK_QUEUE,
        visibilityTimeoutSeconds,
        quantity,
      ]);

      return rows.map((row) => ({
        msgId: String(row.msg_id),
        payload: row.message,
        via: "pgmq" as const,
      }));
    } catch (error) {
      log.warn("pgmq.read falhou; usando private.job_queue", { message: errorMessage(error) });
    }
  }

  const rows = await query<JobQueueRow>(
    `with claimed as (
       select id
         from private.job_queue
        where queue_name = $1
          and processed_at is null
        order by created_at
        limit $2
        for update skip locked
     )
     update private.job_queue as j
        set attempts = j.attempts + 1
       from claimed
      where j.id = claimed.id
      returning j.id, j.payload`,
    [MP_WEBHOOK_QUEUE, quantity],
  );

  return rows.map((row) => ({
    msgId: String(row.id),
    payload: row.payload,
    via: "job_queue" as const,
  }));
}

/** Confirma o job (arquiva no pgmq ou marca `processed_at` no fallback). */
export async function ackWebhookJob(job: QueuedJob<MpWebhookJobPayload>): Promise<void> {
  if (job.via === "pgmq") {
    await query("select pgmq.archive($1, $2::bigint)", [MP_WEBHOOK_QUEUE, job.msgId]);
    return;
  }

  await query("update private.job_queue set processed_at = now() where id = $1::bigint", [
    job.msgId,
  ]);
}

/** Move o job de volta para a fila (reprocessamento após falha transitória). */
export async function nackWebhookJob(job: QueuedJob<MpWebhookJobPayload>): Promise<void> {
  if (job.via === "pgmq") {
    await query("select pgmq.set_vt($1, $2::bigint, $3)", [MP_WEBHOOK_QUEUE, job.msgId, 30]);
    return;
  }

  // No fallback, não confirmar já devolve o job na próxima leitura.
  log.debug("Job mantido pendente para nova tentativa", { msgId: job.msgId });
}
