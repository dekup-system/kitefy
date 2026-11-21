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
      ? `Telemetria registrada. Bandit atualizado (${distilled.success ? "sucesso" : "falha"}${distilled.reindexed ? ", ativo reindexado" : ""}).`
      : "Telemetria registrada.",
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
