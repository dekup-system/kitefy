import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { startStudioRun } from "@/lib/agent/runner";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { CREDIT_COSTS } from "@/lib/pricing";
import { createLogger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";

/**
 * Inicia um run do estúdio.
 *
 * Rota (e não Server Action) porque a geração de artigo GEO pode levar mais de
 * um minuto: precisamos de `maxDuration` alto no Fluid Compute.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = createLogger("api.studio.start");

const bodySchema = z.object({
  brandId: z.string().uuid(),
  assetType: z.enum([
    "short_script_kit",
    "typo_carousel",
    "hybrid_carousel",
    "single_creative",
    "geo_article",
    "lp_copy",
  ]),
  objective: z.string().trim().min(8, "Descreva o objetivo com pelo menos 8 caracteres.").max(280),
  productInput: z.string().trim().min(3, "Informe o produto ou oferta.").max(280),
  researchEnabled: z.boolean().default(false),
});

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

  // RLS garante que a marca é do tenant da sessão.
  const brand = await supabase
    .from("brand_profiles")
    .select("id, brand_name")
    .eq("id", parsed.data.brandId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{ id: string; brand_name: string }>();

  if (brand.error) {
    return NextResponse.json({ error: `Falha ao validar a marca: ${brand.error.message}` }, { status: 500 });
  }
  if (!brand.data) {
    return NextResponse.json({ error: "Marca não encontrada para esta conta." }, { status: 404 });
  }

  const tenant = await supabase
    .from("tenants")
    .select("credit_balance, plan_tier")
    .eq("id", session.tenantId)
    .single<{ credit_balance: number; plan_tier: string }>();

  const cost = CREDIT_COSTS[parsed.data.assetType];
  if (!tenant.data || tenant.data.credit_balance < cost) {
    return NextResponse.json(
      {
        error: `Créditos insuficientes: este ativo custa ${cost} e você tem ${tenant.data?.credit_balance ?? 0}.`,
        code: "insufficient_credits",
      },
      { status: 402 },
    );
  }

  const threadId = randomUUID();

  try {
    const run = await startStudioRun({
      tenantId: session.tenantId,
      brandId: brand.data.id,
      threadId,
      objective: parsed.data.objective,
      assetType: parsed.data.assetType,
      productInput: parsed.data.productInput,
      researchEnabled: parsed.data.researchEnabled || parsed.data.assetType === "geo_article",
      requestedBy: session.user.id,
    });

    return NextResponse.json({
      threadId,
      status: run.status,
      view: run.view,
      interrupt: run.interrupt,
      mockMode: getServerEnv().LLM_PROVIDER_MODE === "mock",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Falha ao iniciar run", { tenantId: session.tenantId, message });
    return NextResponse.json(
      { error: `Não foi possível gerar o ativo: ${message}`, threadId },
      { status: 500 },
    );
  }
}
