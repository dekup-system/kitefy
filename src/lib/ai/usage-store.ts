import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import type { TokenUsageEntry } from "@/types/domain";

/**
 * Persistência do custo estimado de LLM por execução do agente.
 *
 * Best-effort: nunca derruba uma geração. `thread_id + sequence` é UNIQUE, então
 * retomar/retentar um run não duplica linhas — o `sequence` é o índice cumulativo
 * do `tokenUsageLog` no estado do grafo.
 */

const log = createLogger("ai.usage-store");

export interface UsageRecordContext {
  tenantId: string;
  threadId: string;
  assetType: string;
  startSequence: number;
}

export async function recordApiUsage(
  entries: readonly TokenUsageEntry[],
  context: UsageRecordContext,
): Promise<void> {
  if (entries.length === 0) return;
  // Sem service_role (testes/CI sem Supabase) não há tabela para gravar.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const admin = createSupabaseAdminClient();
    const rows = entries.map((entry, index) => ({
      tenant_id: context.tenantId,
      thread_id: context.threadId,
      asset_type: context.assetType,
      node: entry.node,
      provider: entry.provider,
      model: entry.model,
      input_tokens: Math.max(0, Math.round(entry.input_tokens)),
      output_tokens: Math.max(0, Math.round(entry.output_tokens)),
      cached_tokens: Math.max(0, Math.round(entry.cached_tokens)),
      cost_usd: Math.max(0, entry.cost_usd),
      sequence: context.startSequence + index,
    }));

    const { error } = await admin
      .from("api_usage_events")
      .upsert(rows, { onConflict: "thread_id,sequence", ignoreDuplicates: true });

    if (error) {
      log.warn("Falha ao registrar custo de API", {
        threadId: context.threadId,
        message: error.message,
      });
    }
  } catch (error) {
    log.warn("Registro de custo de API indisponível", {
      threadId: context.threadId,
      message: error instanceof Error ? error.message : "erro",
    });
  }
}
