import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { startStudioRun } from "@/lib/agent/runner";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { totalRunCreditCost } from "@/lib/pricing";
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
  visualFormat: z.enum(["4:5", "9:16"]).default("4:5"),
});

const activeRunsByTenant = new Map<string, number>();
const MAX_CONCURRENT_RUNS_PER_TENANT = 3;

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

  const isAdmin = session.isPlatformAdmin;
  const researchEnabled = parsed.data.researchEnabled || parsed.data.assetType === "geo_article";
  const cost = isAdmin ? 0 : totalRunCreditCost(parsed.data.assetType, researchEnabled);
  if (!isAdmin && (!tenant.data || tenant.data.credit_balance < cost)) {
    return NextResponse.json(
      {
        error: `Créditos insuficientes: este conteúdo custa ${cost} e você tem ${tenant.data?.credit_balance ?? 0}.`,
        code: "insufficient_credits",
      },
      { status: 402 },
    );
  }

  const currentActive = activeRunsByTenant.get(session.tenantId) ?? 0;
  if (currentActive >= MAX_CONCURRENT_RUNS_PER_TENANT) {
    return NextResponse.json(
      {
        error: "Você já tem 3 conteúdos sendo gerados ao mesmo tempo. Aguarde alguns segundos e tente novamente.",
        code: "too_many_concurrent_runs",
      },
      { status: 429 },
    );
  }

  activeRunsByTenant.set(session.tenantId, currentActive + 1);
  const threadId = randomUUID();
  const admin = createSupabaseAdminClient();

  // Débito atômico ANTES de acionar as APIs pagas de IA ("gerou, cobrou").
  // Contas admin da plataforma possuem créditos ilimitados (cost = 0).
  if (cost > 0) {
    const { error: debitError } = await admin.rpc("consume_credits", {
      p_tenant_id: session.tenantId,
      p_delta: -cost,
      p_reason: parsed.data.assetType,
      p_reference_id: threadId,
    });

    if (debitError) {
      const remaining = (activeRunsByTenant.get(session.tenantId) ?? 1) - 1;
      if (remaining <= 0) activeRunsByTenant.delete(session.tenantId);
      else activeRunsByTenant.set(session.tenantId, remaining);

      return NextResponse.json(
        {
          error: `Créditos insuficientes para iniciar a geração (${cost} crédito${cost > 1 ? "s" : ""}).`,
          code: "insufficient_credits",
        },
        { status: 402 },
      );
    }
  }

  const autoRefundOnTechnicalFailure = async (reason: string): Promise<void> => {
    if (cost <= 0) return;
    const { error: refundError } = await admin.rpc("consume_credits", {
      p_tenant_id: session.tenantId,
      p_delta: cost,
      p_reason: `refund_technical_error:${reason.slice(0, 60)}`,
      p_reference_id: threadId,
    });
    if (refundError) {
      log.error("Falha ao estornar créditos após erro técnico", {
        tenantId: session.tenantId,
        threadId,
        cost,
        message: refundError.message,
      });
    } else {
      log.info("Estorno automático de créditos executado após erro técnico", {
        tenantId: session.tenantId,
        threadId,
        cost,
      });
    }
  };

  try {
    const run = await startStudioRun({
      tenantId: session.tenantId,
      brandId: brand.data.id,
      threadId,
      objective: parsed.data.objective,
      assetType: parsed.data.assetType,
      productInput: parsed.data.productInput,
      researchEnabled,
      visualFormat: parsed.data.visualFormat,
      requestedBy: session.user.id,
    });

    // Erro técnico do pipeline (ex.: falha de API ou guardrail sem entrega): estorno 100% automático.
    if (run.status === "failed" || !run.view.draft) {
      await autoRefundOnTechnicalFailure(run.view.error ?? "pipeline_failed");
      return NextResponse.json(
        {
          error:
            run.view.error ??
            "Ocorreu um erro técnico ao gerar o conteúdo. Seus créditos foram estornados automaticamente.",
          threadId,
          refunded: true,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      threadId,
      status: run.status,
      view: run.view,
      interrupt: run.interrupt,
      creditsCharged: cost,
      mockMode: getServerEnv().LLM_PROVIDER_MODE === "mock",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await autoRefundOnTechnicalFailure(message);
    log.error("Falha ao iniciar run (créditos estornados automaticamente)", {
      tenantId: session.tenantId,
      threadId,
      message,
    });
    return NextResponse.json(
      {
        error: `Não foi possível gerar o ativo por erro técnico (${message}). Seus créditos foram estornados automaticamente.`,
        threadId,
        refunded: true,
      },
      { status: 500 },
    );
  } finally {
    const remaining = (activeRunsByTenant.get(session.tenantId) ?? 1) - 1;
    if (remaining <= 0) activeRunsByTenant.delete(session.tenantId);
    else activeRunsByTenant.set(session.tenantId, remaining);
  }
}
