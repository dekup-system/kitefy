/**
 * Migração explícita das tabelas do PostgresSaver no schema `langgraph`.
 *
 * NUNCA roda no boot da aplicação: apenas via `npm run db:langgraph-setup`.
 * Requer SUPABASE_DB_URL no .env.local.
 */
process.env.LANGGRAPH_STRICT_MSGPACK = "true";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function main(): Promise<void> {
  const { getServerEnv } = await import("../src/lib/env");
  const { setupCheckpointerSchema } = await import("../src/lib/agent/checkpointer");

  const env = getServerEnv();
  if (!env.SUPABASE_DB_URL) {
    console.error(
      [
        "SUPABASE_DB_URL ausente.",
        "Defina a connection string do Postgres do Supabase e rode novamente:",
        "  SUPABASE_DB_URL=postgresql://... npm run db:langgraph-setup",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log("Aplicando migrations do PostgresSaver no schema 'langgraph'...");
  await setupCheckpointerSchema();
  console.log("OK: tabelas checkpoint_* prontas no schema 'langgraph'.");

  const { closePgPool } = await import("../src/lib/db/pg");
  await closePgPool();
}

main().catch((error: unknown) => {
  console.error("Falha ao migrar o schema langgraph:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
