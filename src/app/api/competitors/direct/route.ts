import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CREDIT_COSTS } from "@/lib/pricing";
import { VALID_REGION_IDS } from "@/lib/brand/regions";
import {
  analyzeCompetitorWithAi,
  discoverDirectCompetitors,
} from "@/lib/competitors/ai-correlator";
import { createLogger } from "@/lib/logger";
import type { EntityFact, ToneOfVoice } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = createLogger("api.competitors.direct");

const discoverSchema = z.object({
  action: z.literal("discover"),
  brandId: z.string().uuid(),
  targetRegions: z.array(z.string().trim().min(2).max(40)).optional(),
});

const analyzeSchema = z.object({
  action: z.literal("analyze"),
  brandId: z.string().uuid(),
  competitorName: z.string().trim().min(2).max(120),
  competitorUrl: z.string().trim().url().max(500),
});

const bodySchema = z.discriminatedUnion("action", [discoverSchema, analyzeSchema]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
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
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: brand, error: brandErr } = await supabase
    .from("brand_profiles")
    .select("id, brand_name, website_url, icp_description, tone_of_voice, entity_facts")
    .eq("id", parsed.data.brandId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{
      id: string;
      brand_name: string;
      website_url: string | null;
      icp_description: string | null;
      tone_of_voice: ToneOfVoice | null;
      entity_facts: EntityFact[] | null;
    }>();

  if (brandErr || !brand) {
    return NextResponse.json({ error: "Marca não encontrada nesta conta." }, { status: 404 });
  }

  if (parsed.data.action === "discover") {
    try {
      // Se o usuário selecionou regiões na página Radar de Concorrentes, persiste na marca antes de buscar.
      let effectiveRegions = brand.tone_of_voice?.target_regions;
      if (parsed.data.targetRegions && parsed.data.targetRegions.length > 0) {
        const cleanRegions = parsed.data.targetRegions.filter((r) => VALID_REGION_IDS.has(r));
        if (cleanRegions.length > 0) {
          effectiveRegions = cleanRegions.includes("Todo o Brasil")
            ? ["Todo o Brasil"]
            : [...new Set(cleanRegions)];
          await supabase
            .from("brand_profiles")
            .update({
              tone_of_voice: {
                ...(brand.tone_of_voice ?? {}),
                target_regions: effectiveRegions,
              },
            })
            .eq("id", brand.id)
            .eq("tenant_id", session.tenantId);
        }
      }

      const candidates = await discoverDirectCompetitors({
        brandName: brand.brand_name,
        websiteUrl: brand.website_url,
        icpDescription: brand.icp_description,
        uvp: brand.tone_of_voice?.uvp,
        entityFacts: brand.entity_facts ?? [],
        targetRegions: effectiveRegions,
      });
      return NextResponse.json({ candidates, targetRegions: effectiveRegions ?? ["Todo o Brasil"] });
    } catch (err) {
      log.warn("Falha ao buscar concorrentes diretos", {
        message: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Não foi possível pesquisar concorrentes diretos agora. Tente novamente." },
        { status: 500 },
      );
    }
  }

  // action === "analyze" -> cobra 2 créditos (isento para admin, estorno automático em erro técnico)
  const cost = session.isPlatformAdmin ? 0 : CREDIT_COSTS.competitor_analysis;
  const chargeRef = `competitor_analysis:${randomUUID()}`;
  const admin = createSupabaseAdminClient();

  if (cost > 0) {
    const { error: debitErr } = await admin.rpc("consume_credits", {
      p_tenant_id: session.tenantId,
      p_delta: -cost,
      p_reason: "competitor_analysis",
      p_reference_id: chargeRef,
    });
    if (debitErr) {
      return NextResponse.json(
        {
          error: `Saldo insuficiente: a análise comparativa com IA custa ${cost} créditos. Recarregue em Plano e créditos.`,
          code: "insufficient_credits",
        },
        { status: 402 },
      );
    }
  }

  try {
    const report = await analyzeCompetitorWithAi({
      brandName: brand.brand_name,
      icpDescription: brand.icp_description,
      toneOfVoice: brand.tone_of_voice,
      entityFacts: brand.entity_facts ?? [],
      competitorName: parsed.data.competitorName,
      competitorUrl: parsed.data.competitorUrl,
    });

    return NextResponse.json({ report, creditsCharged: cost });
  } catch (err) {
    if (cost > 0) {
      await admin.rpc("consume_credits", {
        p_tenant_id: session.tenantId,
        p_delta: cost,
        p_reason: "refund_technical_error:competitor_analysis_failed",
        p_reference_id: chargeRef,
      });
    }
    log.error("Falha na análise comparativa de concorrente (créditos estornados)", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Erro técnico na análise do concorrente. Seus 2 créditos foram estornados automaticamente." },
      { status: 500 },
    );
  }
}
