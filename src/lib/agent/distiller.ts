import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { SourceType } from "@/types/domain";
import { embedOne, toPgVector } from "@/lib/ai/embeddings";
import { isSuccessPull } from "@/lib/agent/bandit";
import { createLogger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Grafo assíncrono de destilação de telemetria.
 *
 * Disparado depois que uma linha de performance_telemetry é registrada
 * (manual, CSV ou GA4). Faz duas coisas, nesta ordem:
 *
 *  1. Atualiza o braço do bandit (alpha/beta/pulls) com a regra do produto:
 *     alpha += 1 se hook_rate >= 0.35 OU acima do P75 do tenant; senão beta += 1.
 *  2. Se a peça venceu, indexa o conteúdo em knowledge_chunks (source_type
 *     'winning_post') com embedding — é assim que o estúdio aprende o que
 *     funcionou e reaproveita no contexto de marca.
 *
 * Acesso a dados via PostgREST (service_role): funciona apenas com as chaves de
 * API, sem exigir conexão direta ao Postgres.
 */

const log = createLogger("agent.distiller");

const DistillerState = Annotation.Root({
  tenantId: Annotation<string>,
  brandId: Annotation<string>,
  assetId: Annotation<string>,
  hookRate: Annotation<number>,
  p75: Annotation<number | null>,
  armKey: Annotation<string | null>,
  success: Annotation<boolean | null>,
  reindexed: Annotation<boolean>,
  error: Annotation<string | null>,
});

export interface DistillInput {
  tenantId: string;
  brandId: string;
  assetId: string;
  hookRate: number;
  p75?: number | null;
}

interface ArmKeyRow {
  content_payload: { _meta?: { bandit_arm?: string } } | null;
}

async function loadP75(tenantId: string): Promise<number | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("tenant_hook_rate_p75", { p_tenant_id: tenantId });

  if (error) {
    log.warn("Falha ao calcular P75 do tenant", { message: error.message });
    return null;
  }

  const value = data as number | string | null;
  return value === null || value === undefined ? null : Number(value);
}

async function loadArmKey(tenantId: string, assetId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  const asset = await supabase
    .from("campaigns_and_assets")
    .select("content_payload")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .maybeSingle<ArmKeyRow>();

  const fromMeta = asset.data?.content_payload?._meta?.bandit_arm;
  if (typeof fromMeta === "string" && fromMeta.includes(":")) return fromMeta;

  const hooks = await supabase
    .from("hook_variants")
    .select("angle_type, framework")
    .eq("asset_id", assetId)
    .eq("tenant_id", tenantId)
    .order("is_selected", { ascending: false })
    .limit(1)
    .maybeSingle<{ angle_type: string; framework: string }>();

  if (!hooks.data) return null;
  return `${hooks.data.angle_type}:${hooks.data.framework}`;
}

function assetToChunkText(payload: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };
  walk(payload);
  return parts.join("\n").slice(0, 6000);
}

async function alreadyIndexed(tenantId: string, assetId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("source_type", "winning_post")
    .contains("metadata", { asset_id: assetId });

  if (error) throw new Error(`Falha ao verificar chunk existente: ${error.message}`);
  return (count ?? 0) > 0;
}

async function reindexWinningAsset(input: {
  tenantId: string;
  brandId: string;
  assetId: string;
  hookRate: number;
}): Promise<boolean> {
  if (await alreadyIndexed(input.tenantId, input.assetId)) return false;

  const supabase = createSupabaseAdminClient();
  const asset = await supabase
    .from("campaigns_and_assets")
    .select("title, content_payload, asset_type")
    .eq("id", input.assetId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle<{ title: string; content_payload: unknown; asset_type: string }>();

  if (!asset.data) return false;

  const text = `${asset.data.title}\n\n${assetToChunkText(asset.data.content_payload)}`;
  const embedding = await embedOne(text);
  const sourceType: SourceType = "winning_post";

  const { error } = await supabase.from("knowledge_chunks").insert({
    tenant_id: input.tenantId,
    brand_id: input.brandId,
    source_type: sourceType,
    content: text.slice(0, 8000),
    metadata: {
      asset_id: input.assetId,
      asset_type: asset.data.asset_type,
      hook_rate: input.hookRate,
      distilled_at: new Date().toISOString(),
    },
    embedding: toPgVector(embedding),
    performance_score: input.hookRate,
  });

  if (error) throw new Error(`Falha ao reindexar o ativo vencedor: ${error.message}`);
  return true;
}

export function buildTelemetryDistillerGraph() {
  return new StateGraph(DistillerState)
    .addNode("distill", async (state) => {
      const p75 = state.p75 ?? (await loadP75(state.tenantId));
      const success = isSuccessPull(state.hookRate, p75);
      const armKey = await loadArmKey(state.tenantId, state.assetId);

      if (!armKey) {
        return { p75, success, armKey: null, error: "Ativo sem braço de bandit associado." };
      }

      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.rpc("update_bandit_arm", {
        p_tenant_id: state.tenantId,
        p_brand_id: state.brandId,
        p_arm_key: armKey,
        p_success: success,
      });

      if (error) {
        return { p75, success, armKey, error: `Falha ao atualizar o bandit: ${error.message}` };
      }

      let reindexed = false;
      if (success) {
        reindexed = await reindexWinningAsset({
          tenantId: state.tenantId,
          brandId: state.brandId,
          assetId: state.assetId,
          hookRate: state.hookRate,
        });
      }

      return { p75, success, armKey, reindexed };
    })
    .addEdge(START, "distill")
    .addEdge("distill", END)
    .compile();
}

let compiled: ReturnType<typeof buildTelemetryDistillerGraph> | null = null;

function getDistiller() {
  if (!compiled) compiled = buildTelemetryDistillerGraph();
  return compiled;
}

export interface DistillResult {
  success: boolean;
  armKey: string | null;
  reindexed: boolean;
  p75: number | null;
  error: string | null;
}

export async function runTelemetryDistiller(input: DistillInput): Promise<DistillResult> {
  try {
    const result = await getDistiller().invoke({
      tenantId: input.tenantId,
      brandId: input.brandId,
      assetId: input.assetId,
      hookRate: input.hookRate,
      p75: input.p75 ?? null,
      armKey: null,
      success: null,
      reindexed: false,
      error: null,
    });

    log.info("Telemetria destilada", {
      assetId: input.assetId,
      success: result.success,
      armKey: result.armKey,
      reindexed: result.reindexed,
    });

    return {
      success: Boolean(result.success),
      armKey: result.armKey ?? null,
      reindexed: Boolean(result.reindexed),
      p75: result.p75 ?? null,
      error: result.error ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Falha ao destilar telemetria", { assetId: input.assetId, message });
    return { success: false, armKey: null, reindexed: false, p75: null, error: message };
  }
}
