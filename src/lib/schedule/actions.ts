"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";

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
