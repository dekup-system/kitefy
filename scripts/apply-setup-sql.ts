/**
 * Aplica um arquivo SQL no Postgres de produção (idempotente).
 *
 * Uso:
 *   npm run db:apply-setup -- supabase/migrations/20260101000008_admin_console.sql --apply
 *   npm run db:apply-setup -- supabase/kitefy-setup.sql --apply
 *
 * Sem `--apply` apenas valida a conexão e mostra o que seria executado.
 * Nunca imprime a senha da connection string.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

function mask(url: string): string {
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1••••••$3");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const file = resolve(fileArg ?? "supabase/kitefy-setup.sql");

  let sql: string;
  try {
    sql = readFileSync(file, "utf8");
  } catch {
    console.error(`Arquivo não encontrado: ${file}`);
    process.exitCode = 1;
    return;
  }

  const rawUrl = process.env.SUPABASE_DB_URL ?? "";
  if (!rawUrl.trim()) {
    console.error("SUPABASE_DB_URL ausente no .env.local.");
    process.exitCode = 1;
    return;
  }

  let host = "";
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    console.error("SUPABASE_DB_URL inválida.");
    process.exitCode = 1;
    return;
  }

  const isLocal = host === "localhost" || host === "127.0.0.1";
  console.log(`Arquivo ...: ${file}`);
  console.log(`Conexão ...: ${mask(rawUrl)}`);
  console.log(`Tamanho ...: ${sql.length.toLocaleString("pt-BR")} caracteres`);

  if (!apply) {
    console.log("\nModo validação (dry-run). Rode novamente com --apply para executar.");
    return;
  }

  const pool = new Pool({
    connectionString: rawUrl,
    max: 1,
    connectionTimeoutMillis: 15_000,
    query_timeout: 180_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  try {
    console.log("\nAplicando SQL...");
    await pool.query(sql);
    console.log("SQL aplicado com sucesso.");

    const version = await pool.query<{ version: string }>("select version()");
    console.log(`  ${version.rows[0]?.version.split(" on ")[0] ?? "Postgres"}`);

    const tables = await pool.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity
         from pg_tables
        where schemaname = 'public'
          and tablename in (
            'discount_coupons', 'coupon_redemptions', 'billing_revenue_events',
            'api_usage_events', 'admin_audit_log'
          )
        order by tablename`,
    );

    for (const row of tables.rows) {
      console.log(`  ${row.tablename}: RLS ${row.rowsecurity ? "on" : "OFF"}`);
    }

    const column = await pool.query<{ count: number }>(
      `select count(*)::int as count
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'mp_subscriptions'
          and column_name = 'amount_cents'`,
    );
    console.log(`  mp_subscriptions.amount_cents: ${column.rows[0]?.count === 1 ? "ok" : "AUSENTE"}`);
  } catch (error) {
    console.error("\nFalha ao aplicar SQL:");
    console.error(" ", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Falha:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
