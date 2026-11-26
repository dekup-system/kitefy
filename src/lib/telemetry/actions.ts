"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";
import { runTelemetryDistiller } from "@/lib/agent/distiller";
import { parseTelemetryCsv } from "@/lib/telemetry/csv";
import { createLogger } from "@/lib/logger";

/**
 * Telemetria: entrada manual, importação CSV e (via rota) webhook GA4.
 * Após cada linha registrada, o destilador assíncrono atualiza o bandit e
 * reindexa campeões como conhecimento da marca.
 */

const log = createLogger("telemetry.actions");

export interface TelemetryActionState {
  error?: string;
  notice?: string;
  details?: string[];
}

const manualSchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid().optional().or(z.literal("")),
  channelLabel: z.string().trim().max(80).optional(),
  impressions: z.coerce.number().int().min(0).max(50_000_000),
  views3s: z.coerce.number().int().min(0).max(50_000_000),
  retention50: z.coerce.number().min(0).max(1).optional(),
  savesOrClicks: z.coerce.number().int().min(0).max(50_000_000).optional(),
  aiCitations: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

async function distillFor(assetId: string | undefined, tenantId: string, brandId: string, hookRate: number) {
  if (!assetId) return null;
  try {
    return await runTelemetryDistiller({ tenantId, brandId, assetId, hookRate });
  } catch (error) {
    log.warn("Destilação falhou", { assetId, message: error instanceof Error ? error.message : "erro" });
    return null;
  }
}

export async function addTelemetryAction(
  _prev: TelemetryActionState,
  formData: FormData,
): Promise<TelemetryActionState> {
  const session = await requireSessionContext();
  const supabase = await createSupabaseServerClient();

  const parsed = manualSchema.safeParse({
    brandId: formData.get("brandId"),
    assetId: formData.get("assetId") || "",
    channelLabel: formData.get("channelLabel") || "organic",
    impressions: formData.get("impressions"),
    views3s: formData.get("views3s"),
    retention50: formData.get("retention50") || undefined,
    savesOrClicks: formData.get("savesOrClicks") || undefined,
    aiCitations: formData.get("aiCitations") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (parsed.data.views3s > parsed.data.impressions) {
    return { error: "Views em 3s não pode ser maior que impressões." };
  }

  const insert = await supabase.from("performance_telemetry").insert({
    tenant_id: session.tenantId,
    brand_id: parsed.data.brandId,
    asset_id: parsed.data.assetId || null,
    channel_label: parsed.data.channelLabel ?? "organic",
    impressions: parsed.data.impressions,
    views_3s: parsed.data.views3s,
    retention_50_pct: parsed.data.retention50 ?? null,
    saves_or_clicks: parsed.data.savesOrClicks ?? 0,
    ai_citations_count: parsed.data.aiCitations ?? 0,
    source_mode: "manual",
  });

  if (insert.error) {
    return { error: `Falha ao registrar: ${insert.error.message}` };
  }

  const hookRate = parsed.data.impressions > 0 ? parsed.data.views3s / parsed.data.impressions : 0;
  const distilled = await distillFor(parsed.data.assetId || undefined, session.tenantId, parsed.data.brandId, hookRate);

  revalidatePath("/telemetry");
  revalidatePath("/app");

  return {
    notice: distilled
      ? `Resultado registrado! O estúdio atualizou o estilo da sua marca (${distilled.success ? "padrão campeão salvo" : "ajuste aplicado"}).`
      : "Resultado registrado.",
  };
}

const quickFeedbackSchema = z.object({
  assetId: z.string().uuid(),
  brandId: z.string().uuid(),
  rating: z.enum(["great", "average", "weak"]),
  threadId: z.string().optional(),
});

export type QuickFeedbackRating = "great" | "average" | "weak";

export interface QuickFeedbackState {
  error?: string;
  notice?: string;
  rating?: QuickFeedbackRating;
}

/**
 * Feedback de resultado em 1 clique para pequenos empreendedores:
 * - "great" (🔥 Bombou) -> hook_rate 0.48 (sucesso no bandit + reindexa como winning_post + memória positiva)
 * - "average" (👍 Foi bem) -> hook_rate 0.32 (registra desempenho regular sem inflar campeões)
 * - "weak" (👎 Fraco) -> hook_rate 0.15 (incrementa beta no bandit + entra na memória negativa do agente)
 */
export async function recordQuickFeedbackAction(
  _prev: QuickFeedbackState,
  formData: FormData,
): Promise<QuickFeedbackState> {
  const session = await requireSessionContext();
  const supabase = await createSupabaseServerClient();

  const parsed = quickFeedbackSchema.safeParse({
    assetId: formData.get("assetId"),
    brandId: formData.get("brandId"),
    rating: formData.get("rating"),
    threadId: formData.get("threadId") || undefined,
  });

  if (!parsed.success) {
    return { error: "Não foi possível identificar o anúncio para salvar o feedback." };
  }

  const metricsByRating = {
    great: {
      impressions: 1000,
      views3s: 480,
      saves: 42,
      hookRate: 0.48,
      notice:
        "Feedback 'Bombou' salvo! Este gancho e ângulo foram promovidos na memória do agente para guiar os próximos anúncios.",
    },
    average: {
      impressions: 1000,
      views3s: 320,
      saves: 14,
      hookRate: 0.32,
      notice:
        "Feedback 'Foi bem' salvo! O agente registrou o resultado e continuará testando variações ainda mais fortes.",
    },
    weak: {
      impressions: 1000,
      views3s: 150,
      saves: 2,
      hookRate: 0.15,
      notice:
        "Feedback 'Fraco' salvo! O agente reduziu a prioridade deste ângulo e evitará repetir esse padrão nas próximas criações.",
    },
  } as const;

  const metrics = metricsByRating[parsed.data.rating];

  const { error: insertErr } = await supabase.from("performance_telemetry").insert({
    tenant_id: session.tenantId,
    brand_id: parsed.data.brandId,
    asset_id: parsed.data.assetId,
    channel_label: `feedback_${parsed.data.rating}`,
    impressions: metrics.impressions,
    views_3s: metrics.views3s,
    saves_or_clicks: metrics.saves,
    ai_citations_count: 0,
    source_mode: "manual",
  });

  if (insertErr) {
    return { error: `Não foi possível salvar o feedback agora: ${insertErr.message}` };
  }

  await distillFor(parsed.data.assetId, session.tenantId, parsed.data.brandId, metrics.hookRate);

  if (parsed.data.threadId) {
    revalidatePath(`/studio/${parsed.data.threadId}`);
  }
  revalidatePath("/campaigns");
  revalidatePath("/telemetry");
  revalidatePath("/app");

  return {
    rating: parsed.data.rating,
    notice: metrics.notice,
  };
}

export async function importTelemetryCsvAction(
  _prev: TelemetryActionState,
  formData: FormData,
): Promise<TelemetryActionState> {
  const session = await requireSessionContext();
  const supabase = await createSupabaseServerClient();

  const brandId = String(formData.get("brandId") ?? "");
  const file = formData.get("file");

  if (!brandId) return { error: "Escolha a marca." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo CSV." };
  }
  if (file.size > 4 * 1024 * 1024) {
    return { error: "Arquivo acima de 4 MB. Divida o CSV em partes." };
  }

  const text = await file.text();
  const parsed = parseTelemetryCsv(text);

  if (parsed.rows.length === 0) {
    return {
      error: "Nenhuma linha válida encontrada no CSV.",
      details: parsed.errors.slice(0, 5).map((item) => `linha ${item.line}: ${item.message}`),
    };
  }

  const rows = parsed.rows.map((row) => ({
    tenant_id: session.tenantId,
    brand_id: brandId,
    asset_id: row.asset_id ?? null,
    channel_label: row.channel_label ?? "organic",
    impressions: row.impressions,
    views_3s: row.views_3s,
    retention_50_pct: row.retention_50_pct ?? null,
    saves_or_clicks: row.saves_or_clicks ?? 0,
    ai_citations_count: row.ai_citations_count ?? 0,
    source_mode: "csv" as const,
    recorded_at: row.recorded_at ?? new Date().toISOString(),
  }));

  const insert = await supabase.from("performance_telemetry").insert(rows);
  if (insert.error) {
    return { error: `Falha ao importar: ${insert.error.message}` };
  }

  // Destila até 20 linhas com ativo vinculado para não estourar tempo da action.
  const withAsset = rows.filter((row) => row.asset_id).slice(0, 20);
  for (const row of withAsset) {
    const hookRate = row.impressions > 0 ? row.views_3s / row.impressions : 0;
    await distillFor(row.asset_id ?? undefined, session.tenantId, row.brand_id, hookRate);
  }

  revalidatePath("/telemetry");
  revalidatePath("/app");

  return {
    notice: `${rows.length} linha(s) importada(s)${parsed.errors.length > 0 ? `, ${parsed.errors.length} ignorada(s)` : ""}.`,
    details: parsed.errors.slice(0, 5).map((item) => `linha ${item.line}: ${item.message}`),
  };
}
