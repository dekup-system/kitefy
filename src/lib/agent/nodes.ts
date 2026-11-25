import { END, interrupt } from "@langchain/langgraph";
import { z } from "zod";
import type {
  AngleType,
  BrandContext,
  ContentPayload,
  Framework,
  SourceType,
} from "@/types/domain";
import type { OrganicStudioStateType, OrganicStudioUpdate } from "@/lib/agent/state";
import { armKey, selectArms } from "@/lib/agent/bandit";
import { generateAssetContent } from "@/lib/ai/generate";
import { crossReferenceAdvertisingContext } from "@/lib/ai/marketing-knowledge";
import { embedOne, toPgVector } from "@/lib/ai/embeddings";
import { buildRetryFeedback, evaluateCompliance } from "@/lib/agent/compliance-adapter";
import { renderAndUploadVisuals } from "@/lib/agent/visual-adapter";
import { buildJsonLdForAsset } from "@/lib/agent/jsonld-builder";
import { searchWithCache } from "@/lib/serp/client";
import { withTransaction } from "@/lib/db/pg";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { totalRunCreditCost } from "@/lib/pricing";
import { createLogger } from "@/lib/logger";
import type { CarouselOutput, GeoArticleOutput, ShortScriptKitOutput } from "@/lib/ai/content-schemas";

/**
 * Nós do grafo OrganicStudio.
 *
 * Contrato de cada nó: recebe OrganicStudioStateType, devolve um update parcial.
 * Nós nunca chamam outro nó — o fluxo é declarado em graph.ts (edges condicionais).
 */

const log = createLogger("agent.nodes");

// ---------------------------------------------------------------------------
// 1. brandContextNode — perfil da marca + Top-K chunks vencedores
// ---------------------------------------------------------------------------

interface BrandRow {
  id: string;
  brand_name: string;
  website_url: string | null;
  icp_description: string | null;
  tone_of_voice: BrandContext["tone_of_voice"];
  visual_tokens: BrandContext["visual_tokens"];
  entity_facts: BrandContext["entity_facts"];
}

interface ChunkRow {
  content: string;
  source_type: SourceType;
  similarity: number;
}

export async function brandContextNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("brand_profiles")
    .select("id, brand_name, website_url, icp_description, tone_of_voice, visual_tokens, entity_facts")
    .eq("id", state.brandId)
    .eq("tenant_id", state.tenantId)
    .maybeSingle<BrandRow>();

  if (error) throw new Error(`Falha ao carregar a marca: ${error.message}`);
  if (!data) throw new Error("Marca não encontrada para o tenant informado.");

  const embedding = await embedOne(`${state.objective} ${state.productInput}`);

  // RPC via PostgREST: não exige conexão direta ao Postgres (SUPABASE_DB_URL).
  // O vector vai como literal '[..]' e o Postgres faz o cast para extensions.vector.
  const { data: matches, error: matchError } = await supabase.rpc("match_brand_chunks", {
    p_tenant_id: state.tenantId,
    p_brand_id: state.brandId,
    query_embedding: toPgVector(embedding),
    match_count: 8,
    match_threshold: 0,
  });

  if (matchError) {
    throw new Error(`Falha na busca vetorial da marca: ${matchError.message}`);
  }

  const rows = (matches ?? []) as ChunkRow[];

  const brandContext: BrandContext = {
    brand_id: data.id,
    brand_name: data.brand_name,
    website_url: data.website_url,
    icp_description: data.icp_description,
    tone_of_voice: data.tone_of_voice ?? {},
    visual_tokens: data.visual_tokens ?? {},
    entity_facts: Array.isArray(data.entity_facts) ? data.entity_facts : [],
    top_chunks: rows.map((row) => ({
      content: row.content,
      source_type: row.source_type,
      similarity: Number(row.similarity),
    })),
  };

  log.info("Contexto de marca carregado", {
    threadId: state.threadId,
    chunks: brandContext.top_chunks.length,
    // Nunca logamos o conteúdo dos chunks (dado do cliente).
  });

  return { brandContext };
}

// ---------------------------------------------------------------------------
// 2. researchSeoGeoNode — SERP (People Also Ask, gaps, fatos recentes)
// ---------------------------------------------------------------------------

export function shouldResearch(state: OrganicStudioStateType): "research" | "bandit" {
  if (state.assetType === "geo_article" || state.researchEnabled) return "research";
  return "bandit";
}

export async function researchSeoGeoNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  const queryText = `${state.objective} ${state.productInput}`.trim();

  const insights = await searchWithCache({
    query: queryText,
    locale: "pt-BR",
    num: 10,
  });

  log.info("Pesquisa SERP concluída", {
    threadId: state.threadId,
    provider: insights.provider,
    paa: insights.people_also_ask.length,
    gaps: insights.competitor_gaps.length,
  });

  return { serpInsights: insights };
}

// ---------------------------------------------------------------------------
// 3. banditSelectorNode — Thompson Sampling (1 braço + 2 explorações)
// ---------------------------------------------------------------------------

interface ArmStatRow {
  arm_key: string;
  alpha: number;
  beta: number;
  pulls: number;
}

export async function banditSelectorNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  const supabase = createSupabaseAdminClient();
  const { data: stats, error } = await supabase
    .from("bandit_arm_stats")
    .select("arm_key, alpha, beta, pulls")
    .eq("tenant_id", state.tenantId)
    .eq("brand_id", state.brandId);

  if (error) {
    throw new Error(`Falha ao carregar os braços do bandit: ${error.message}`);
  }

  const selection = selectArms({ stats: (stats ?? []) as ArmStatRow[] });

  const toArm = (angle: AngleType, framework: Framework) => ({
    angle_type: angle,
    framework,
    arm_key: armKey(angle, framework),
  });

  return {
    selectedArm: toArm(selection.selected.angle_type, selection.selected.framework),
    explorationArms: selection.exploration.map((arm) => toArm(arm.angle_type, arm.framework)),
  };
}

// ---------------------------------------------------------------------------
// 3.5. strategyOrchestratorNode — Agente Orquestrador Científico (US$ 0)
// ---------------------------------------------------------------------------

export async function strategyOrchestratorNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  if (!state.brandContext) throw new Error("brandContextNode não executou antes do orquestrador.");
  if (!state.selectedArm) throw new Error("banditSelectorNode não executou antes do orquestrador.");

  let recentAssetCount = 0;
  try {
    const supabase = createSupabaseAdminClient();
    const { count } = await supabase
      .from("campaigns_and_assets")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", state.tenantId)
      .eq("brand_id", state.brandId);
    recentAssetCount = count ?? 0;
  } catch {
    recentAssetCount = 0;
  }

  const strategyBrief = crossReferenceAdvertisingContext({
    assetType: state.assetType,
    angleType: state.selectedArm.angle_type,
    framework: state.selectedArm.framework,
    objective: state.objective,
    productInput: state.productInput,
    brand: state.brandContext,
    recentAssetCount,
    seed: state.threadId,
  });

  log.info("Orquestração estratégica concluída", {
    threadId: state.threadId,
    visualTheme: strategyBrief.visualTheme,
    segment: strategyBrief.audienceAnalysis.segment,
    awarenessStage: strategyBrief.audienceAnalysis.awarenessStage,
    elmRoute: strategyBrief.audienceAnalysis.elmRoute,
    colorMood: strategyBrief.colorAnalysis.mood,
  });

  return { strategyBrief };
}

// ---------------------------------------------------------------------------
// 4. contentGeneratorNode — roteia modelo e gera JSON validado
// ---------------------------------------------------------------------------

export async function contentGeneratorNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  if (!state.brandContext) throw new Error("brandContextNode não executou antes do gerador.");
  if (!state.selectedArm) throw new Error("banditSelectorNode não executou antes do gerador.");

  const complianceFeedback =
    state.complianceReport && !state.complianceReport.approved
      ? buildRetryFeedback(state.complianceReport)
      : undefined;

  const result = await generateAssetContent({
    node: "contentGenerator",
    assetType: state.assetType,
    brand: state.brandContext,
    objective: state.objective,
    productInput: state.productInput,
    selectedArm: {
      angle_type: state.selectedArm.angle_type,
      framework: state.selectedArm.framework,
    },
    explorationArms: state.explorationArms.map((arm) => ({
      angle_type: arm.angle_type,
      framework: arm.framework,
    })),
    serpInsights: state.serpInsights,
    complianceFeedback,
  });

  // Guarda o modelo usado nos metadados do ativo (transparência de IA).
  return {
    draftPayload: result.payload as ContentPayload,
    tokenUsageLog: result.usage,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 5. complianceGuardrailNode
// ---------------------------------------------------------------------------

export async function complianceGuardrailNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  if (!state.draftPayload) throw new Error("Sem rascunho para revisar.");
  if (!state.brandContext) throw new Error("Sem contexto de marca para revisar tom de voz.");

  const hasAiImagery =
    state.assetType === "single_creative" || state.assetType === "hybrid_carousel";

  const { report, usage } = await evaluateCompliance({
    payload: state.draftPayload,
    assetType: state.assetType,
    tone: state.brandContext.tone_of_voice,
    hasAiImagery,
  });

  return {
    complianceReport: report,
    complianceAttempts: (state.complianceAttempts ?? 0) + (report.approved ? 0 : 1),
    tokenUsageLog: usage,
    ...(report.approved
      ? {}
      : { error: buildRetryFeedback(report).join(" | ") || "Conteúdo reprovado no guardrail." }),
  };
}

export function routeAfterCompliance(
  state: OrganicStudioStateType,
): "renderVisuals" | "generateContent" | "failRun" {
  if (state.complianceReport?.approved) return "renderVisuals";
  if ((state.complianceAttempts ?? 0) >= 2) return "failRun";
  return "generateContent";
}

export async function failedNode(state: OrganicStudioStateType): Promise<OrganicStudioUpdate> {
  return {
    error: state.error ?? "Não foi possível gerar um conteúdo conforme após 2 tentativas.",
    approvalStatus: "rejected",
  };
}

// ---------------------------------------------------------------------------
// 6. visualRenderNode — Satori/resvg + Storage privado
// ---------------------------------------------------------------------------

export async function visualRenderNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  if (!state.draftPayload || !state.brandContext) {
    throw new Error("Renderização exige rascunho e contexto de marca.");
  }

  try {
    const result = await renderAndUploadVisuals({
      tenantId: state.tenantId,
      brandId: state.brandId,
      threadId: state.threadId,
      assetType: state.assetType,
      format: state.visualFormat ?? "4:5",
      visualTheme: state.strategyBrief?.visualTheme,
      payload: state.draftPayload,
      brand: state.brandContext,
    });

    return { renderedVisualPaths: result.paths };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Falha na renderização visual", { threadId: state.threadId, message });
    // Falha técnica não invalida o texto: segue para aprovação sem visuais,
    // mas com erro visível para o usuário.
    return {
      renderedVisualPaths: [],
      error: `Renderização falhou: ${message}. O texto está pronto e pode ser exportado.`,
    };
  }
}

// ---------------------------------------------------------------------------
// 7. humanApprovalNode — interrupt() nativo do LangGraph
// ---------------------------------------------------------------------------

const approvalDecisionSchema = z.object({
  approved: z.boolean(),
  selected_hook_index: z.number().int().min(0).max(2).optional(),
  title: z.string().min(1).max(200).optional(),
  note: z.string().max(500).optional(),
});

export async function humanApprovalNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  const payload = state.draftPayload;
  if (!payload) throw new Error("Aprovação sem conteúdo para revisar.");

  const resumeValue = interrupt({
    type: "approval_required",
    threadId: state.threadId,
    assetType: state.assetType,
    title: deriveTitle(payload),
    hooks: hooksFromPayload(payload, state),
    compliance: state.complianceReport,
    visualPaths: state.renderedVisualPaths,
    creditsCost: creditsFor(state.assetType, state.researchEnabled),
    requires_transparency_label: state.complianceReport?.requires_transparency_label ?? false,
  });

  const parsed = approvalDecisionSchema.safeParse(resumeValue);
  if (!parsed.success) {
    throw new Error(`Decisão de aprovação inválida: ${parsed.error.issues[0]?.message ?? "formato"}`);
  }

  return {
    approvalStatus: parsed.data.approved ? "approved" : "rejected",
    approvalDecision: parsed.data,
  };
}

export function routeAfterApproval(state: OrganicStudioStateType): "persistAsset" | typeof END {
  return state.approvalStatus === "approved" ? "persistAsset" : END;
}

function creditsFor(assetType: OrganicStudioStateType["assetType"], researchEnabled = false): number {
  return totalRunCreditCost(assetType, researchEnabled);
}

// ---------------------------------------------------------------------------
// 8. finalizeAssetNode — grava ativo, ganchos e debita créditos atomicamente
// ---------------------------------------------------------------------------

export async function finalizeAssetNode(
  state: OrganicStudioStateType,
): Promise<OrganicStudioUpdate> {
  if (!state.draftPayload) throw new Error("Nada para persistir.");
  if (state.approvalStatus !== "approved") throw new Error("Ativo não aprovado.");

  const credits = creditsFor(state.assetType, state.researchEnabled);
  const title = state.approvalDecision?.title?.trim() || deriveTitle(state.draftPayload);
  const hooks = hooksFromPayload(state.draftPayload, state);
  const selectedIndex = state.approvalDecision?.selected_hook_index ?? 0;
  const hasAiImagery =
    state.assetType === "single_creative" || state.assetType === "hybrid_carousel";

  const payloadWithMeta = {
    ...state.draftPayload,
    _meta: {
      generated_at: new Date().toISOString(),
      models: state.tokenUsageLog.map((entry) => `${entry.provider}:${entry.model}`),
      compliance_reviewer: state.complianceReport?.reviewer ?? null,
      requires_transparency_label: state.complianceReport?.requires_transparency_label ?? false,
      bandit_arm: state.selectedArm?.arm_key ?? null,
      credits: credits,
    },
  };

  const jsonLd = buildJsonLdForAsset({
    payload: state.draftPayload,
    brand: state.brandContext!,
    productInput: state.productInput,
  });

  const assetId = await persistApprovedAsset({
    tenantId: state.tenantId,
    brandId: state.brandId,
    threadId: state.threadId,
    assetType: state.assetType,
    title,
    payload: payloadWithMeta,
    visualPaths: state.renderedVisualPaths,
    hasAiImagery,
    credits,
    hooks,
    selectedIndex,
    jsonLd,
  });

  log.info("Ativo persistido e créditos debitados", {
    threadId: state.threadId,
    assetId,
    credits,
  });

  return { assetId, creditsCharged: credits };
}

interface PersistInput {
  tenantId: string;
  brandId: string;
  threadId: string;
  assetType: OrganicStudioStateType["assetType"];
  title: string;
  payload: Record<string, unknown>;
  visualPaths: string[];
  hasAiImagery: boolean;
  credits: number;
  hooks: { angle_type: AngleType; framework: Framework; hook_text: string }[];
  selectedIndex: number;
  jsonLd: import("@/types/domain").JsonLdBundle | null;
}

/**
 * Duas rotas de persistência:
 *  - com SUPABASE_DB_URL: uma transação (ativo + ganchos + débito) — atômico;
 *  - sem DB URL (dev via PostgREST): inserts + RPC consume_credits, com estorno
 *    explícito se o débito falhar.
 */
async function persistApprovedAsset(input: PersistInput): Promise<string> {
  const jsonLd = input.jsonLd;

  if (getServerEnv().SUPABASE_DB_URL) {
    return withTransaction(async (client) => {
      const asset = await client.query<{ id: string }>(
        `insert into public.campaigns_and_assets
           (tenant_id, brand_id, thread_id, asset_type, status, title, content_payload,
            visual_urls, json_ld, credits_charged, has_ai_imagery)
         values ($1,$2,$3,$4,'approved',$5,$6::jsonb,$7,$8::jsonb,$9,$10)
         returning id`,
        [
          input.tenantId,
          input.brandId,
          input.threadId,
          input.assetType,
          input.title,
          JSON.stringify(input.payload),
          input.visualPaths,
          jsonLd ? JSON.stringify(jsonLd) : null,
          input.credits,
          input.hasAiImagery,
        ],
      );

      const assetId = asset.rows[0]?.id;
      if (!assetId) throw new Error("Falha ao criar o ativo.");

      for (const [index, hook] of input.hooks.entries()) {
        await client.query(
          `insert into public.hook_variants
             (tenant_id, asset_id, angle_type, framework, hook_text, is_selected)
           values ($1,$2,$3,$4,$5,$6)`,
          [
            input.tenantId,
            assetId,
            hook.angle_type,
            hook.framework,
            hook.hook_text,
            index === input.selectedIndex,
          ],
        );
      }

      await client.query(`select public.consume_credits($1,$2,$3,$4)`, [
        input.tenantId,
        -input.credits,
        input.assetType,
        assetId,
      ]);

      return assetId;
    });
  }

  const supabase = createSupabaseAdminClient();

  const { data: asset, error } = await supabase
    .from("campaigns_and_assets")
    .insert({
      tenant_id: input.tenantId,
      brand_id: input.brandId,
      thread_id: input.threadId,
      asset_type: input.assetType,
      status: "approved",
      title: input.title,
      content_payload: input.payload,
      visual_urls: input.visualPaths,
      json_ld: jsonLd,
      credits_charged: input.credits,
      has_ai_imagery: input.hasAiImagery,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !asset) throw new Error(`Falha ao criar o ativo: ${error?.message ?? "sem id"}`);

  const hookRows = input.hooks.map((hook, index) => ({
    tenant_id: input.tenantId,
    asset_id: asset.id,
    angle_type: hook.angle_type,
    framework: hook.framework,
    hook_text: hook.hook_text,
    is_selected: index === input.selectedIndex,
  }));

  const { error: hookError } = await supabase.from("hook_variants").insert(hookRows);
  if (hookError) {
    log.error("Falha ao gravar ganchos; mantendo ativo.", { assetId: asset.id, message: hookError.message });
  }

  const { error: creditError } = await supabase.rpc("consume_credits", {
    p_tenant_id: input.tenantId,
    p_delta: -input.credits,
    p_reason: input.assetType,
    p_reference_id: asset.id,
  });

  if (creditError) {
    // Não deixa ativo "grátis" por inconsistência: remove o ativo recém-criado.
    await supabase.from("campaigns_and_assets").delete().eq("id", asset.id);
    throw new Error(`Falha ao debitar créditos: ${creditError.message}`);
  }

  return asset.id;
}

// ---------------------------------------------------------------------------
// Helpers de apresentação
// ---------------------------------------------------------------------------

export function deriveTitle(payload: ContentPayload): string {
  switch (payload.kind) {
    case "short_script_kit":
      return (payload as ShortScriptKitOutput).hooks[0]?.hook_text.slice(0, 90) ?? "Kit de roteiro";
    case "typo_carousel":
    case "hybrid_carousel":
      return (payload as CarouselOutput).slides[0]?.title ?? "Carrossel";
    case "single_creative":
      return payload.headline;
    case "geo_article":
      return (payload as GeoArticleOutput).title;
    case "lp_copy":
      return payload.hero.headline;
  }
}

export function hooksFromPayload(
  payload: ContentPayload,
  state: OrganicStudioStateType,
): { angle_type: AngleType; framework: Framework; hook_text: string }[] {
  if (payload.kind === "short_script_kit") {
    return payload.hooks.map((hook) => ({
      angle_type: hook.angle_type,
      framework: hook.framework,
      hook_text: hook.hook_text,
    }));
  }

  const fallbackAngle = state.selectedArm?.angle_type ?? "vace_pattern_interrupt";
  const fallbackFramework = state.selectedArm?.framework ?? "hook_body_payoff";
  const text =
    payload.kind === "geo_article"
      ? payload.title
      : payload.kind === "lp_copy"
        ? payload.hero.headline
        : payload.kind === "single_creative"
          ? payload.headline
          : (payload.slides[0]?.title ?? "Conteúdo");

  return [{ angle_type: fallbackAngle, framework: fallbackFramework, hook_text: text.slice(0, 200) }];
}
