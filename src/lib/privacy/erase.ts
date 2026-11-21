import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { deleteThread } from "@/lib/agent/checkpointer";
import { createLogger } from "@/lib/logger";

/**
 * LGPD Art. 18, inciso VI — direito de eliminação.
 *
 * Ordem da exclusão (importa):
 *  1. histórico do agente por thread (checkpointer.deleteThread);
 *  2. arquivos no Storage privado (prefixo do tenant);
 *  3. conhecimento vetorial + telemetria + ganchos + ativos + marcas;
 *  4. registros fiscais: anonimizados (ledger movido para tenant técnico);
 *  5. tenant (cascade) e, se solicitado, o usuário do Auth.
 *
 * Idempotente por desenho: cada etapa tolera ausência de registros.
 */

const log = createLogger("privacy.erase");

/** Tenant técnico que guarda apenas somas fiscais sem vínculo pessoal. */
const FISCAL_TENANT_SLUG = "anonimo-fiscal";
const FISCAL_TENANT_NAME = "Anônimo (registros fiscais)";

export interface EraseResult {
  deleted: {
    threads: number;
    storageObjects: number;
    knowledgeChunks: number;
    assets: number;
    hookVariants: number;
    telemetry: number;
    banditArms: number;
    brands: number;
    subscriptions: number;
    anonymizedLedgerRows: number;
    tenants: number;
    users: number;
  };
  warnings: string[];
}

async function ensureFiscalTenant(): Promise<string> {
  const supabase = createSupabaseAdminClient();

  const existing = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", FISCAL_TENANT_SLUG)
    .maybeSingle<{ id: string }>();

  if (existing.data) return existing.data.id;

  const created = await supabase
    .from("tenants")
    .insert({
      name: FISCAL_TENANT_NAME,
      slug: FISCAL_TENANT_SLUG,
      plan_tier: "essential",
      credit_balance: 0,
    })
    .select("id")
    .single<{ id: string }>();

  if (created.error || !created.data) {
    throw new Error(`Falha ao criar tenant fiscal: ${created.error?.message ?? "sem id"}`);
  }

  return created.data.id;
}

async function listStorageObjects(prefix: string): Promise<string[]> {
  const supabase = createSupabaseAdminClient();
  const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
  const paths: string[] = [];

  // Storage lista por "pasta" (prefixo); percorremos dois níveis
  // (<tenant>/<brand>) e acumulamos os objetos.
  const level1 = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (level1.error) {
    throw new Error(`Falha ao listar Storage (${prefix}): ${level1.error.message}`);
  }

  for (const entry of level1.data ?? []) {
    const childPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      const level2 = await supabase.storage.from(bucket).list(childPath, { limit: 1000 });
      for (const leaf of level2.data ?? []) {
        const leafPath = `${childPath}/${leaf.name}`;
        if (leaf.id === null) {
          const level3 = await supabase.storage.from(bucket).list(leafPath, { limit: 1000 });
          for (const file of level3.data ?? []) {
            if (file.id !== null) paths.push(`${leafPath}/${file.name}`);
          }
        } else {
          paths.push(leafPath);
        }
      }
    } else {
      paths.push(childPath);
    }
  }

  return paths;
}

async function purgeStoragePrefix(prefix: string): Promise<{ removed: number; warnings: string[] }> {
  const supabase = createSupabaseAdminClient();
  const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
  const warnings: string[] = [];

  const objects = await listStorageObjects(prefix);
  if (objects.length === 0) return { removed: 0, warnings };

  // remove() aceita até 1000 caminhos por chamada.
  let removed = 0;
  for (let index = 0; index < objects.length; index += 500) {
    const batch = objects.slice(index, index + 500);
    const result = await supabase.storage.from(bucket).remove(batch);
    if (result.error) {
      warnings.push(`Storage parcialmente removido: ${result.error.message}`);
      continue;
    }
    removed += batch.length;
  }

  return { removed, warnings };
}

export async function eraseTenant(input: {
  tenantId: string;
  deleteAuthUser?: boolean;
  userId?: string;
}): Promise<EraseResult> {
  const supabase = createSupabaseAdminClient();
  const warnings: string[] = [];
  const deleted: EraseResult["deleted"] = {
    threads: 0,
    storageObjects: 0,
    knowledgeChunks: 0,
    assets: 0,
    hookVariants: 0,
    telemetry: 0,
    banditArms: 0,
    brands: 0,
    subscriptions: 0,
    anonymizedLedgerRows: 0,
    tenants: 0,
    users: 0,
  };

  // 1. Histórico do agente
  const threads = await supabase
    .from("campaigns_and_assets")
    .select("thread_id")
    .eq("tenant_id", input.tenantId);

  const threadIds = [...new Set((threads.data ?? []).map((row) => (row as { thread_id: string }).thread_id))];
  for (const threadId of threadIds) {
    try {
      await deleteThread(threadId);
      deleted.threads += 1;
    } catch (error) {
      warnings.push(`Thread ${threadId} não pôde ser apagada: ${error instanceof Error ? error.message : "erro"}`);
    }
  }

  // 2. Storage
  const storage = await purgeStoragePrefix(input.tenantId);
  deleted.storageObjects = storage.removed;
  warnings.push(...storage.warnings);

  // 3. Registros fiscais anonimizados (mantém somas, remove vínculo pessoal)
  const ledger = await supabase
    .from("credit_ledger")
    .select("id, delta, reason, created_at")
    .eq("tenant_id", input.tenantId);

  if (ledger.error) {
    warnings.push(`Leitura do ledger falhou: ${ledger.error.message}`);
  } else if ((ledger.data ?? []).length > 0) {
    const fiscalTenantId = await ensureFiscalTenant();
    const rows = (ledger.data ?? []).map((row) => {
      const item = row as { delta: number; reason: string; created_at: string };
      return {
        tenant_id: fiscalTenantId,
        delta: item.delta,
        // Reason é tipo de ativo/evento, não dado pessoal.
        reason: `anonimizado:${item.reason}`,
        reference_id: null,
        created_at: item.created_at,
      };
    });

    const insert = await supabase.from("credit_ledger").insert(rows);
    if (insert.error) {
      warnings.push(`Anonimização do ledger falhou: ${insert.error.message}`);
    } else {
      deleted.anonymizedLedgerRows = rows.length;
    }
  }

  // 4. Dados operacionais (contadores via select count antes do delete)
  const countOf = async (table: string, column = "tenant_id") => {
    const result = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, input.tenantId);
    return result.count ?? 0;
  };

  deleted.knowledgeChunks = await countOf("knowledge_chunks");
  deleted.assets = await countOf("campaigns_and_assets");
  deleted.hookVariants = await countOf("hook_variants");
  deleted.telemetry = await countOf("performance_telemetry");
  deleted.banditArms = await countOf("bandit_arm_stats");
  deleted.brands = await countOf("brand_profiles");
  deleted.subscriptions = await countOf("mp_subscriptions");

  for (const table of [
    "knowledge_chunks",
    "performance_telemetry",
    "bandit_arm_stats",
    "hook_variants",
    "campaigns_and_assets",
    "mp_subscriptions",
    "credit_ledger",
    "tenant_members",
    "brand_profiles",
  ]) {
    const removal = await supabase.from(table).delete().eq("tenant_id", input.tenantId);
    if (removal.error) {
      // tenant_members não tem coluna tenant_id em alguns snapshots antigos.
      if (table === "tenant_members") {
        const fallback = await supabase.from(table).delete().eq("tenant_id", input.tenantId);
        if (fallback.error) warnings.push(`Falha ao limpar ${table}: ${fallback.error.message}`);
      } else {
        warnings.push(`Falha ao limpar ${table}: ${removal.error.message}`);
      }
    }
  }

  // 5. Tenant (cascade final)
  const tenantRemoval = await supabase.from("tenants").delete().eq("id", input.tenantId);
  if (tenantRemoval.error) {
    warnings.push(`Falha ao remover o tenant: ${tenantRemoval.error.message}`);
  } else {
    deleted.tenants = 1;
  }

  // 6. Usuário do Auth (opcional: exclusão de conta)
  if (input.deleteAuthUser && input.userId) {
    const authRemoval = await supabase.auth.admin.deleteUser(input.userId);
    if (authRemoval.error) {
      warnings.push(`Falha ao remover usuário do Auth: ${authRemoval.error.message}`);
    } else {
      deleted.users = 1;
    }
  }

  log.info("Exclusão LGPD executada", { tenantId: input.tenantId, ...deleted, warnings: warnings.length });

  return { deleted, warnings };
}

/** Exclusão de uma marca específica, mantendo a conta. */
export async function eraseBrand(input: { tenantId: string; brandId: string }): Promise<EraseResult> {
  const supabase = createSupabaseAdminClient();
  const warnings: string[] = [];
  const deleted: EraseResult["deleted"] = {
    threads: 0,
    storageObjects: 0,
    knowledgeChunks: 0,
    assets: 0,
    hookVariants: 0,
    telemetry: 0,
    banditArms: 0,
    brands: 0,
    subscriptions: 0,
    anonymizedLedgerRows: 0,
    tenants: 0,
    users: 0,
  };

  const assets = await supabase
    .from("campaigns_and_assets")
    .select("thread_id")
    .eq("tenant_id", input.tenantId)
    .eq("brand_id", input.brandId);

  const threadIds = [...new Set((assets.data ?? []).map((row) => (row as { thread_id: string }).thread_id))];
  for (const threadId of threadIds) {
    try {
      await deleteThread(threadId);
      deleted.threads += 1;
    } catch (error) {
      warnings.push(`Thread ${threadId}: ${error instanceof Error ? error.message : "erro"}`);
    }
  }

  const storage = await purgeStoragePrefix(`${input.tenantId}/${input.brandId}`);
  deleted.storageObjects = storage.removed;
  warnings.push(...storage.warnings);

  const scoped = [
    ["knowledge_chunks", "brand_id"],
    ["performance_telemetry", "brand_id"],
    ["bandit_arm_stats", "brand_id"],
    ["campaigns_and_assets", "brand_id"],
  ] as const;

  for (const [table, column] of scoped) {
    const count = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", input.tenantId)
      .eq(column, input.brandId);
    if (table === "knowledge_chunks") deleted.knowledgeChunks = count.count ?? 0;
    if (table === "performance_telemetry") deleted.telemetry = count.count ?? 0;
    if (table === "bandit_arm_stats") deleted.banditArms = count.count ?? 0;
    if (table === "campaigns_and_assets") deleted.assets = count.count ?? 0;

    const removal = await supabase
      .from(table)
      .delete()
      .eq("tenant_id", input.tenantId)
      .eq(column, input.brandId);
    if (removal.error) warnings.push(`Falha ao limpar ${table}: ${removal.error.message}`);
  }

  const brandRemoval = await supabase
    .from("brand_profiles")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("id", input.brandId);

  if (brandRemoval.error) warnings.push(`Falha ao remover a marca: ${brandRemoval.error.message}`);
  else deleted.brands = 1;

  log.info("Marca excluída (LGPD)", { tenantId: input.tenantId, brandId: input.brandId, ...deleted });

  return { deleted, warnings };
}
