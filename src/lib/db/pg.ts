import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getServerEnv } from "@/lib/env";

/**
 * Pool Postgres direto.
 *
 * Usado onde o PostgREST não serve:
 *  - PostgresSaver (checkpoints do LangGraph, schema `langgraph`);
 *  - pgmq (enfileiramento/consumo de jobs);
 *  - RPCs que exigem transação com FOR UPDATE (créditos).
 */

type PgGlobal = typeof globalThis & { __brandpulsePool?: Pool };

const globalForPg = globalThis as PgGlobal;

export function getPgPool(): Pool {
  if (globalForPg.__brandpulsePool) return globalForPg.__brandpulsePool;

  const env = getServerEnv();
  if (!env.SUPABASE_DB_URL) {
    throw new Error("SUPABASE_DB_URL ausente: pool Postgres indisponível.");
  }

  const isLocal =
    env.SUPABASE_DB_URL.includes("localhost") || env.SUPABASE_DB_URL.includes("127.0.0.1");

  const pool = new Pool({
    connectionString: env.SUPABASE_DB_URL,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    application_name: "brandpulse",
  });

  // Um erro em cliente idle não deve derrubar o processo.
  pool.on("error", (error) => {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "pg.pool",
        message: error.message,
      }),
    );
  });

  globalForPg.__brandpulsePool = pool;
  return pool;
}

/** Query tipada com log de latência. */
export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const startedAt = Date.now();
  const pool = getPgPool();
  const result = await pool.query<T>(sql, params);

  const durationMs = Date.now() - startedAt;
  if (durationMs > 800) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "pg.slow_query",
        durationMs,
        sql: sql.slice(0, 180),
      }),
    );
  }

  return result.rows;
}

/** Executa em transação, garantindo rollback em erro. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closePgPool(): Promise<void> {
  if (globalForPg.__brandpulsePool) {
    await globalForPg.__brandpulsePool.end();
    globalForPg.__brandpulsePool = undefined;
  }
}
