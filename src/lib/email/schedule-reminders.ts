/**
 * Disparo automático de lembretes por e-mail 30 minutos antes dos agendamentos
 * na grade semanal (`content_payload._schedule`).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail } from "@/lib/email/client";
import { createLogger } from "@/lib/logger";
import type { AssetScheduleMeta } from "@/lib/schedule/actions";

const log = createLogger("email.schedule-reminders");
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.kitefy.com.br";
const LOGO_URL = `${SITE_URL}/brand/kitefy-logo.png`;

export interface ScheduleReminderBatchResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

export function buildScheduleReminderEmail(input: {
  brandName: string;
  title: string;
  channel: string;
  dateBr: string;
  timeStr: string;
  threadId: string;
}): { subject: string; html: string; text: string } {
  const studioUrl = `${SITE_URL}/studio/${input.threadId}`;
  const subject = `⏰ Faltam 30 min para publicar: ${input.title}`;
  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#F8F8FA;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#181331;line-height:1.6">
  <div style="max-width:540px;margin:0 auto;padding:32px 24px;background:#FFFFFF;border-radius:12px">
    <img src="${LOGO_URL}" alt="Kitefy" width="150" style="display:block;margin-bottom:24px" />
    <p style="margin:0 0 12px;font-size:15px">Olá,</p>
    <p style="margin:0 0 16px;font-size:15px">Faltam <strong>30 minutos</strong> para a publicação agendada da marca <strong>${input.brandName}</strong>:</p>
    <div style="background:#FFF5F0;border:1px solid #FED7AA;border-radius:10px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 6px;font-size:14px"><strong>Conteúdo:</strong> ${input.title}</p>
      <p style="margin:0 0 6px;font-size:14px"><strong>Canal:</strong> ${input.channel}</p>
      <p style="margin:0;font-size:14px"><strong>Horário:</strong> ${input.dateBr} às ${input.timeStr}</p>
    </div>
    <p style="margin:0 0 24px">
      <a href="${studioUrl}" style="display:inline-block;background:#FD3E01;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Abrir conteúdo para baixar e postar</a>
    </p>
    <p style="color:#54506A;font-size:12px;margin:0">Lembrete automático de agendamentos da Kitefy.</p>
  </div>
</body></html>`;

  const text = [
    `Lembrete Kitefy — faltam 30 minutos para publicar!`,
    `Marca: ${input.brandName}`,
    `Conteúdo: ${input.title}`,
    `Canal: ${input.channel}`,
    `Horário: ${input.dateBr} às ${input.timeStr}`,
    `Abrir conteúdo: ${studioUrl}`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Envia lembretes por e-mail para agendamentos que acontecem nos próximos 35 minutos
 * (janela segura para cron a cada 10–15 min) e ainda não foram notificados.
 */
export async function sendDueScheduleEmailReminders(
  options: { dryRun?: boolean } = {},
): Promise<ScheduleReminderBatchResult> {
  const result: ScheduleReminderBatchResult = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  const admin = createSupabaseAdminClient();

  const { data: rows, error } = await admin
    .from("campaigns_and_assets")
    .select("id, tenant_id, brand_id, thread_id, title, content_payload")
    .not("content_payload->_schedule", "is", null)
    .limit(200);

  if (error || !rows) {
    log.warn("Falha ao consultar agendamentos para envio de e-mail", { message: error?.message });
    return result;
  }

  // Referência em America/Sao_Paulo (UTC-3)
  const nowUtc = Date.now();
  const nowBrtMs = nowUtc - 3 * 60 * 60 * 1000;

  for (const row of rows as {
    id: string;
    tenant_id: string;
    brand_id: string;
    thread_id: string;
    title: string;
    content_payload: Record<string, unknown> | null;
  }[]) {
    const sched = row.content_payload?._schedule as AssetScheduleMeta | undefined;
    if (!sched?.scheduledFor || sched.emailReminderSentAt) continue;

    // Interpreta scheduledFor ("YYYY-MM-DDTHH:mm") como horário de Brasília (BRT)
    const scheduledMs = Date.parse(`${sched.scheduledFor}:00Z`);
    if (Number.isNaN(scheduledMs)) continue;

    const diffMinutes = (scheduledMs - nowBrtMs) / 60_000;
    // Janela de disparo: entre 0 e 35 minutos antes do horário agendado
    if (diffMinutes < -5 || diffMinutes > 35) continue;

    result.checked += 1;
    if (!emailConfigured() || options.dryRun) {
      result.skipped += 1;
      continue;
    }

    try {
      let targetEmail = sched.reminderEmail?.trim() || "";
      if (!targetEmail) {
        const { data: member } = await admin
          .from("tenant_members")
          .select("user_id")
          .eq("tenant_id", row.tenant_id)
          .limit(1)
          .maybeSingle<{ user_id: string }>();
        if (member?.user_id) {
          const user = await admin.auth.admin.getUserById(member.user_id);
          targetEmail = user.data.user?.email ?? "";
        }
      }

      if (!targetEmail) {
        result.skipped += 1;
        continue;
      }

      const { data: brand } = await admin
        .from("brand_profiles")
        .select("brand_name")
        .eq("id", row.brand_id)
        .maybeSingle<{ brand_name: string }>();

      const [dateStr = "", timeStr = "09:00"] = sched.scheduledFor.split("T");
      const dateBr = dateStr.split("-").reverse().join("/");

      const mail = buildScheduleReminderEmail({
        brandName: brand?.brand_name ?? "Sua marca",
        title: row.title,
        channel: sched.channel,
        dateBr,
        timeStr: timeStr.slice(0, 5),
        threadId: row.thread_id,
      });

      await sendEmail({
        to: targetEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });

      const nextPayload = {
        ...(row.content_payload ?? {}),
        _schedule: {
          ...sched,
          emailReminderSentAt: new Date().toISOString(),
        },
      };

      await admin
        .from("campaigns_and_assets")
        .update({ content_payload: nextPayload })
        .eq("id", row.id);

      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      log.warn("Falha ao enviar lembrete de agendamento por e-mail", {
        assetId: row.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
