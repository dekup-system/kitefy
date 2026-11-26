import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { constantTimeEquals } from "@/lib/billing/webhook-signature";
import { sendWeeklyReminders } from "@/lib/email/weekly-reminder";
import { sendDueScheduleEmailReminders } from "@/lib/email/schedule-reminders";
import { createLogger } from "@/lib/logger";

const log = createLogger("api.jobs.reminders");

/**
 * Cron de lembretes por e-mail:
 * 1) Lembretes de agendamentos (30 min antes) — executa sempre que chamado.
 * 2) Lembrete semanal de inatividade — executa às segundas (ou com `?force=1`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getServerEnv();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const dryRun = url.searchParams.get("dry") === "1";

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const workerSecret = request.headers.get("x-worker-secret") ?? "";
  const authorized =
    (env.CRON_SECRET && constantTimeEquals(bearer, env.CRON_SECRET)) ||
    (env.MP_WEBHOOK_SECRET && constantTimeEquals(workerSecret, env.MP_WEBHOOK_SECRET));

  if (!authorized) {
    log.warn("Cron de lembretes rejeitado", { hasBearer: bearer.length > 0 });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const scheduledReminders = await sendDueScheduleEmailReminders({ dryRun });

  // 1 = segunda-feira
  const weekly =
    force || new Date().getUTCDay() === 1
      ? await sendWeeklyReminders({ dryRun })
      : { skipped: "not_monday" };

  return NextResponse.json({ ok: true, scheduledReminders, weekly });
}
