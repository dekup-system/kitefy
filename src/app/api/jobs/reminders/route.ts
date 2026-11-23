import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { constantTimeEquals } from "@/lib/billing/webhook-signature";
import { sendWeeklyReminders } from "@/lib/email/weekly-reminder";
import { createLogger } from "@/lib/logger";

const log = createLogger("api.jobs.reminders");

/**
 * Cron diário do lembrete semanal.
 *
 * A Vercel chama com `Authorization: Bearer $CRON_SECRET`. Só envia na segunda
 * (`?force=1` ignora a checagem, útil para teste manual).
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

  // 1 = segunda-feira
  if (!force && new Date().getUTCDay() !== 1) {
    return NextResponse.json({ ok: true, skipped: "not_monday" });
  }

  const result = await sendWeeklyReminders({ dryRun });
  return NextResponse.json({ ok: true, ...result });
}
