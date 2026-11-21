import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { getServerEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

/**
 * Checkpointer do grafo.
 *
 * Produção: PostgresSaver no schema `langgraph` (isolado do PostgREST).
 *   - `checkpointer.setup()` roda SOMENTE via `npm run db:langgraph-setup`,
 *     nunca no boot da aplicação (cria/migra tabelas).
 *
 * Sem SUPABASE_DB_URL (dev local, demo, CI): MemorySaver — o thread vive no
 * processo, o que é suficiente para testar o fluxo e não vaza estado.
 */

const log = createLogger("agent.checkpointer");

let cached: BaseCheckpointSaver | null = null;
let cachedMode: "postgres" | "memory" = "memory";

export function getCheckpointerMode(): "postgres" | "memory" {
  return getServerEnv().SUPABASE_DB_URL ? "postgres" : "memory";
}

export function getCheckpointer(): BaseCheckpointSaver {
  if (cached) return cached;

  const env = getServerEnv();

  if (!env.SUPABASE_DB_URL) {
    log.warn("SUPABASE_DB_URL ausente: usando MemorySaver (estado não persiste entre processos).");
    cached = new MemorySaver();
    cachedMode = "memory";
    return cached;
  }

  cached = PostgresSaver.fromConnString(env.SUPABASE_DB_URL, { schema: "langgraph" });
  cachedMode = "postgres";
  return cached;
}

/** Apenas o script de migração deve chamar isto. */
export async function setupCheckpointerSchema(): Promise<void> {
  const checkpointer = getCheckpointer();
  if (!(checkpointer instanceof PostgresSaver)) {
    throw new Error(
      "setupCheckpointerSchema exige SUPABASE_DB_URL configurado (PostgresSaver).",
    );
  }
  await checkpointer.setup();
}

/**
 * Remove todo o histórico do agente para um thread (LGPD Art. 18).
 * Idempotente: thread inexistente não lança.
 */
export async function deleteThread(threadId: string): Promise<void> {
  const checkpointer = getCheckpointer();
  try {
    await checkpointer.deleteThread(threadId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // MemorySaver não implementa deleteThread em todas as versões.
    if (cachedMode === "memory" || /not implemented|undefined/.test(message)) {
      log.warn("deleteThread indisponível no backend atual.", { threadId, mode: cachedMode });
      return;
    }
    throw error;
  }
}

/** Somente para testes. */
export function resetCheckpointer(): void {
  cached = null;
  cachedMode = "memory";
}
