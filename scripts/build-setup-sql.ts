/**
 * Gera `supabase/kitefy-setup.sql`: um único script idempotente para colar no
 * SQL Editor do Supabase (sem Docker, sem CLI, sem senha do banco).
 *
 * Uso: npx tsx scripts/build-setup-sql.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const OUT = join(process.cwd(), "supabase", "kitefy-setup.sql");

function main(): void {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const header = `-- =============================================================================
-- Kitefy — setup completo do banco (idempotente)
--
-- COMO USAR (sem Docker, sem CLI):
--   1. Supabase Dashboard > SQL Editor > New query
--   2. Cole TODO este arquivo e clique em Run
--   3. Verifique em Table Editor: 11 tabelas em public + schema langgraph
--
-- O que este script faz:
--   * extensões: pgcrypto, vector (pgvector), pg_trgm, pgmq (best-effort)
--   * 11 tabelas com CHECK constraints, índices B-tree e HNSW
--   * funções: consume_credits (FOR UPDATE), match_knowledge_chunks (RPC),
--     match_brand_chunks (service_role), update_bandit_arm, bootstrap de tenant
--   * Row Level Security + grants em todas as tabelas
--   * bucket privado brand-assets + policies de Storage
--   * filas pgmq e fallback private.job_queue
--
-- É seguro rodar mais de uma vez: tudo usa IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS.
--
-- DEPOIS deste script:
--   * Storage > bucket "brand-assets" deve existir (criado na migration 5)
--   * Authentication > Providers > Google: habilite e informe as credenciais
--   * Checkpoints do LangGraph exigem a connection string:
--       SUPABASE_DB_URL=postgresql://... npm run db:langgraph-setup
-- =============================================================================

`;

  const body = files
    .map((file) => {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8").trimEnd();
      return `-- ###########################################################################\n-- # ${file}\n-- ###########################################################################\n\n${sql}\n`;
    })
    .join("\n\n");

  const footer = `
-- =============================================================================
-- Fim. Confira rapidamente:
--   select count(*) from information_schema.tables where table_schema = 'public';
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- =============================================================================
`;

  writeFileSync(OUT, `${header}${body}${footer}`, "utf8");
  console.log(`Gerado ${OUT} com ${files.length} migrations.`);
}

main();
