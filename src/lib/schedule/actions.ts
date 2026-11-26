"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email/client";
import { buildScheduleReminderEmail } from "@/lib/email/schedule-reminders";

/**
 * Agendamento de publicações em grade semanal (7 dias × horários).
 *
 * Persiste `_schedule` dentro de `campaigns_and_assets.content_payload` (JSONB)
 * sem exigir nova tabela ou migração destrutiva, respeitando 100% a RLS por tenant.
 */

export interface AssetScheduleMeta {
  /** ISO local ou UTC da data/hora agendada (ex.: "2026-11-26T14:00"). */
  scheduledFor: string;
  channel: string;
  reminderEmail?: string | null;
  emailReminderSentAt?: string | null;
  whatsappPhone?: string | null;
  note?: string | null;
}

const scheduleSchema = z.object({
  assetId: z.string().uuid("Salve o conteúdo na biblioteca antes de agendar."),
  threadId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha uma data válida."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Escolha um horário válido."),
  channel: z.string().trim().min(2).max(60).default("Instagram Feed"),
  whatsappPhone: z.string().trim().max(30).optional(),
  note: z.string().trim().max(240).optional(),
});

export interface ScheduleActionState {
  error?: string;
  notice?: string;
}

export async function scheduleAssetAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const session = await requireSessionContext();

  const parsed = scheduleSchema.safeParse({
    assetId: formData.get("assetId"),
    threadId: formData.get("threadId") || undefined,
    date: formData.get("date"),
    time: formData.get("time"),
    channel: formData.get("channel") || "Instagram Feed",
    whatsappPhone: formData.get("whatsappPhone") || undefined,
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados de agendamento inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: asset, error: fetchErr } = await supabase
    .from("campaigns_and_assets")
    .select("id, content_payload")
    .eq("id", parsed.data.assetId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{ id: string; content_payload: Record<string, unknown> }>();

  if (fetchErr || !asset) {
    return { error: "Conteúdo não encontrado nesta conta." };
  }

  const cleanPhone = (parsed.data.whatsappPhone ?? "").replace(/\D/g, "");
  const schedule: AssetScheduleMeta = {
    scheduledFor: `${parsed.data.date}T${parsed.data.time}`,
    channel: parsed.data.channel,
    reminderEmail: session.user.email ?? null,
    emailReminderSentAt: null,
    whatsappPhone: cleanPhone.length >= 10 ? cleanPhone : null,
    note: parsed.data.note || null,
  };

  const nextPayload = {
    ...(asset.content_payload ?? {}),
    _schedule: schedule,
  };

  const { error: updateErr } = await supabase
    .from("campaigns_and_assets")
    .update({ content_payload: nextPayload })
    .eq("id", asset.id)
    .eq("tenant_id", session.tenantId);

  if (updateErr) {
    return { error: `Não foi possível agendar: ${updateErr.message}` };
  }

  revalidatePath("/schedule");
  revalidatePath("/campaigns");
  if (parsed.data.threadId) revalidatePath(`/studio/${parsed.data.threadId}`);

  return {
    notice: `Agendado para ${parsed.data.date.split("-").reverse().join("/")} às ${parsed.data.time} (${parsed.data.channel}).`,
  };
}

export async function unscheduleAssetAction(formData: FormData): Promise<void> {
  const session = await requireSessionContext();
  const assetId = String(formData.get("assetId") ?? "").trim();
  const threadId = String(formData.get("threadId") ?? "").trim();
  if (!assetId) return;

  const supabase = await createSupabaseServerClient();
  const { data: asset } = await supabase
    .from("campaigns_and_assets")
    .select("id, content_payload")
    .eq("id", assetId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{ id: string; content_payload: Record<string, unknown> }>();

  if (!asset?.content_payload) return;
  const nextPayload = { ...asset.content_payload };
  delete nextPayload._schedule;

  await supabase
    .from("campaigns_and_assets")
    .update({ content_payload: nextPayload })
    .eq("id", asset.id)
    .eq("tenant_id", session.tenantId);

  revalidatePath("/schedule");
  revalidatePath("/campaigns");
  if (threadId) revalidatePath(`/studio/${threadId}`);
}

/**
 * Dispara o lembrete por e-mail imediatamente para o e-mail da conta logada
 * e marca `_schedule.emailReminderSentAt` para evitar duplicidade.
 */
export async function sendScheduleReminderNowAction(formData: FormData): Promise<void> {
  const session = await requireSessionContext();
  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!assetId || !session.user.email || !emailConfigured()) return;

  const supabase = await createSupabaseServerClient();
  const { data: asset } = await supabase
    .from("campaigns_and_assets")
    .select("id, brand_id, thread_id, title, content_payload")
    .eq("id", assetId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{
      id: string;
      brand_id: string;
      thread_id: string;
      title: string;
      content_payload: Record<string, unknown> | null;
    }>();

  if (!asset?.content_payload) return;
  const sched = asset.content_payload._schedule as AssetScheduleMeta | undefined;
  if (!sched?.scheduledFor) return;

  const { data: brand } = await supabase
    .from("brand_profiles")
    .select("brand_name")
    .eq("id", asset.brand_id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{ brand_name: string }>();

  const [dateStr = "", timeStr = "09:00"] = sched.scheduledFor.split("T");
  const email = buildScheduleReminderEmail({
    brandName: brand?.brand_name ?? "Sua marca",
    title: asset.title,
    channel: sched.channel || "Instagram Feed",
    dateBr: dateStr.split("-").reverse().join("/"),
    timeStr: timeStr.slice(0, 5),
    threadId: asset.thread_id,
  });

  const targetEmail = sched.reminderEmail?.trim() || session.user.email;
  try {
    await sendEmail({
      to: targetEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    const nextPayload = {
      ...asset.content_payload,
      _schedule: {
        ...sched,
        reminderEmail: targetEmail,
        emailReminderSentAt: new Date().toISOString(),
      },
    };
    await supabase
      .from("campaigns_and_assets")
      .update({ content_payload: nextPayload })
      .eq("id", asset.id)
      .eq("tenant_id", session.tenantId);
  } catch {
    // Falha silenciosa na ação manual; cron tentará novamente na janela de 30 min.
  }

  revalidatePath("/schedule");
}
