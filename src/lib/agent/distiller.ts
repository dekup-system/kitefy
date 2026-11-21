import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { SourceType } from "@/types/domain";
import { query, withTransaction } from "@/lib/db/pg";
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
 * Idempotência: a reindexação usa reference ao asset_id em metadata e só
 * insere uma vez por (asset_id, source_type).
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

async function loadP75(tenantId: string): Promise<number | null> {
  const rows = await query<{ p75: number | string | null }>(
    "select public.tenant_hook_rate_p75($1) as p75",
    [tenantId],
  );
  const value = rows[0]?.p75;
  return value === null || value === undefined ? null : Number(value);
}

async function loadArmKey(assetId: string): Promise<string | null> {
  const rows = await query<{ arm_key: string | null }>(
    `select coalesce(
              content_payload -> '_meta' ->> 'bandit_arm',
              (select hv.angle_type || ':' || hv.framework
                 from public.hook_variants hv
                where hv.asset_id = ca.id
                order by hv.is_selected desc, hv.created_at asc
                limit 1)
            ) as arm_key
       from public.campaigns_and_assets ca
      where ca.id = $1`,
    [assetId],
  );
  return rows[0]?.arm_key ?? null;
}

function assetToChunkText(payload: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(walk);
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

  const rows = await query<{ title: string; content_payload: unknown; asset_type: string }>(
    `select title, content_payload, asset_type
       from public.campaigns_and_assets
      where id = $1 and tenant_id = $2`,
    [input.assetId, input.tenantId],
  );

  const asset = rows[0];
  if (!asset) return false;

  const text = `${asset.title}\n\n${assetToChunkText(asset.content_payload)}`;
  const embedding = await embedOne(text);
  const sourceType: SourceType = "winning_post";

  await withTransaction(async (client) => {
    await client.query(
      `insert into public.knowledge_chunks
         (tenant_id, brand_id, source_type, content, metadata, embedding, performance_score)
       values ($1,$2,$3,$4,$5::jsonb,$6::extensions.vector,$7)`,
      [
        input.tenantId,
        input.brandId,
        sourceType,
        text.slice(0, 8000),
        JSON.stringify({
          asset_id: input.assetId,
          asset_type: asset.asset_type,
          hook_rate: input.hookRate,
          distilled_at: new Date().toISOString(),
        }),
        toPgVector(embedding),
        input.hookRate,
      ],
    );
  });

  return true;
}

export function buildTelemetryDistillerGraph() {
  return new StateGraph(DistillerState)
    .addNode("distill", async (state) => {
      const p75 = state.p75 ?? (await loadP75(state.tenantId));
      const success = isSuccessPull(state.hookRate, p75);
      const armKey = await loadArmKey(state.assetId);

      if (!armKey) {
        return { p75, success, armKey: null, error: "Ativo sem braço de bandit associado." };
      }

      await query("select public.update_bandit_arm($1,$2,$3,$4)", [
        state.tenantId,
        state.brandId,
        armKey,
        success,
      ]);

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
