import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";

/**
 * LGPD Art. 18, inciso II/V — direito de acesso.
 *
 * Exporta tudo o que é dado pessoal ou dado do cliente em um JSON único:
 * perfil, marca, conhecimento (sem embeddings — são derivados e inúteis fora do
 * sistema), ativos, ganchos, telemetria, extrato de créditos e assinaturas.
 *
 * Nunca inclui: tokens de terceiros, chaves, payloads de webhook de pagamento
 * (contêm dados de terceiros) nem histórico interno de prompts.
 */

const log = createLogger("privacy.export");

export interface TenantExport {
  schema: "brandpulse.export.v1";
  generated_at: string;
  tenant: Record<string, unknown> | null;
  brands: Record<string, unknown>[];
  knowledge_chunks: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  hook_variants: Record<string, unknown>[];
  performance_telemetry: Record<string, unknown>[];
  bandit_arms: Record<string, unknown>[];
  credit_ledger: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
  notes: string[];
}

function stripEmbedding<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const { embedding: _embedding, ...rest } = row;
  return rest;
}

export async function exportTenantData(tenantId: string): Promise<TenantExport> {
  const supabase = createSupabaseAdminClient();

  const [tenant, brands, chunks, assets, hooks, telemetry, arms, ledger, subs] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    supabase.from("brand_profiles").select("*").eq("tenant_id", tenantId),
    supabase.from("knowledge_chunks").select("*").eq("tenant_id", tenantId),
    supabase.from("campaigns_and_assets").select("*").eq("tenant_id", tenantId),
    supabase.from("hook_variants").select("*").eq("tenant_id", tenantId),
    supabase.from("performance_telemetry").select("*").eq("tenant_id", tenantId),
    supabase.from("bandit_arm_stats").select("*").eq("tenant_id", tenantId),
    supabase.from("credit_ledger").select("*").eq("tenant_id", tenantId),
    supabase.from("mp_subscriptions").select("*").eq("tenant_id", tenantId),
  ]);

  for (const [label, result] of Object.entries({ tenant, brands, chunks, assets, hooks, telemetry, arms, ledger, subs })) {
    if (result.error) {
      throw new Error(`Falha ao exportar ${label}: ${result.error.message}`);
    }
  }

  const exportPayload: TenantExport = {
    schema: "brandpulse.export.v1",
    generated_at: new Date().toISOString(),
    tenant: (tenant.data as Record<string, unknown> | null) ?? null,
    brands: (brands.data ?? []) as Record<string, unknown>[],
    knowledge_chunks: ((chunks.data ?? []) as Record<string, unknown>[]).map(stripEmbedding),
    assets: (assets.data ?? []) as Record<string, unknown>[],
    hook_variants: (hooks.data ?? []) as Record<string, unknown>[],
    performance_telemetry: (telemetry.data ?? []) as Record<string, unknown>[],
    bandit_arms: (arms.data ?? []) as Record<string, unknown>[],
    credit_ledger: (ledger.data ?? []) as Record<string, unknown>[],
    subscriptions: (subs.data ?? []) as Record<string, unknown>[],
    notes: [
      "Embeddings vetoriais são derivados e foram omitidos por não constituírem dado pessoal relevante.",
      "Payloads brutos de webhook do Mercado Pago não são exportados por conterem dados de terceiros.",
      "O histórico interno de execução do agente pode ser solicitado separadamente e é apagado na exclusão.",
    ],
  };

  log.info("Exportação LGPD gerada", {
    tenantId,
    assets: exportPayload.assets.length,
    chunks: exportPayload.knowledge_chunks.length,
  });

  return exportPayload;
}

export function exportFileName(tenantSlug: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `brandpulse-${tenantSlug || "dados"}-${stamp}.json`;
}
