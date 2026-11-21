import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { parseGa4Webhook } from "@/lib/telemetry/ga4";
import { runTelemetryDistiller } from "@/lib/agent/distiller";
import { createLogger } from "@/lib/logger";

/**
 * Webhook de telemetria GA4 (planos Pro e Agência).
 *
 * Segurança: segredo compartilhado por header, comparado em tempo constante.
 * O payload nunca é logado; apenas contagens.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.webhooks.ga4");

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  brandId: z.string().uuid(),
  events: z.array(z.unknown()).min(1).max(500),
});

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = getServerEnv();
  if (!env.GA4_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook GA4 não configurado." }, { status: 503 });
  }

  if (!secretMatches(request.headers.get("x-ga4-secret"), env.GA4_WEBHOOK_SECRET)) {
    log.warn("Assinatura GA4 inválida", { reason: "mismatch" });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido." },
      { status: 422 },
    );
  }

  const { rows, skipped } = parseGa4Webhook({ events: parsed.data.events });
  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped });
  }

  const supabase = createSupabaseAdminClient();

  // Confirma que a marca pertence ao tenant (defesa contra spoof de tenantId).
  const brand = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("id", parsed.data.brandId)
    .eq("tenant_id", parsed.data.tenantId)
    .maybeSingle<{ id: string }>();

  if (!brand.data) {
    return NextResponse.json({ error: "Marca não encontrada para o tenant." }, { status: 404 });
  }

  const insertRows = rows.map((row) => ({
    tenant_id: parsed.data.tenantId,
    brand_id: parsed.data.brandId,
    asset_id: row.asset_id,
    channel_label: row.channel_label,
    impressions: row.impressions,
    views_3s: row.views_3s,
    retention_50_pct: row.retention_50_pct,
    saves_or_clicks: row.saves_or_clicks,
    ai_citations_count: row.ai_citations_count,
    source_mode: "ga4_webhook" as const,
    recorded_at: row.recorded_at,
  }));

  const insert = await supabase.from("performance_telemetry").insert(insertRows);
  if (insert.error) {
    log.error("Falha ao inserir telemetria GA4", { message: insert.error.message });
    return NextResponse.json({ error: "Falha ao registrar telemetria." }, { status: 500 });
  }

  for (const row of insertRows.slice(0, 20)) {
    if (!row.asset_id) continue;
    const hookRate = row.impressions > 0 ? row.views_3s / row.impressions : 0;
    await runTelemetryDistiller({
      tenantId: row.tenant_id,
      brandId: row.brand_id,
      assetId: row.asset_id,
      hookRate,
    }).catch(() => undefined);
  }

  log.info("Telemetria GA4 recebida", { inserted: insertRows.length, skipped });

  return NextResponse.json({ inserted: insertRows.length, skipped });
}
