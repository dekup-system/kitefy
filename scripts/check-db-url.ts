/**
 * Valida a connection string do Postgres antes de usá-la no deploy.
 *
 * Uso: npm run db:ping        (lê SUPABASE_DB_URL do .env.local)
 *      npm run db:ping -- "postgresql://..."
 *
 * Nunca imprime a senha. Mostra host/porta/usuário/banco, testa a conexão e diz
 * se o schema `langgraph` já existe.
 */
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const PASSWORD_MASK = "••••••";

function mask(url: string): string {
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, `$1${PASSWORD_MASK}$3`);
}

async function main(): Promise<void> {
  const raw = process.argv[2] ?? process.env.SUPABASE_DB_URL ?? "";

  if (!raw.trim()) {
    console.error(
      [
        "SUPABASE_DB_URL ausente.",
        "",
        "Onde encontrar (painel novo do Supabase):",
        "  1. Abra o projeto e clique no botão [ Connect ] no topo.",
        "  2. Escolha 'Connection pooling' (ou 'Direct connection').",
        "  3. Copie a URI (aba 'URI') e troque [YOUR-PASSWORD] pela senha do banco.",
        "",
        "Se não souber a senha: Project Settings > Database > Reset database password.",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.error(`String inválida: ${mask(raw)}`);
    console.error("Ela precisa começar com postgresql:// e ter o formato:");
    console.error("  postgresql://USUARIO:SENHA@HOST:PORTA/postgres");
    process.exitCode = 1;
    return;
  }

  console.log("String:", mask(raw));
  console.log("  host ....", parsed.hostname);
  console.log("  porta ...", parsed.port || "(padrão 5432)");
  console.log("  usuário .", decodeURIComponent(parsed.username));
  console.log("  banco ...", parsed.pathname.replace("/", "") || "(vazio)");

  const isPooler = parsed.hostname.includes("pooler.supabase.com");
  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  console.log(
    `  modo .... ${isPooler ? "pooler (IPv4)" : isLocal ? "local" : "conexão direta"}` +
      (parsed.port === "6543" ? " · transaction (6543)" : ""),
  );

  // O parser de URL percent-encoda colchetes, então procuramos no texto cru
  // e no valor decodificado.
  let decodedPassword = parsed.password;
  try {
    decodedPassword = decodeURIComponent(parsed.password);
  } catch {
    decodedPassword = parsed.password;
  }

  if (/\[YOUR[-_]PASSWORD\]/i.test(raw) || /\[YOUR[-_]PASSWORD\]/i.test(decodedPassword)) {
    console.error("\nA string ainda tem o placeholder [YOUR-PASSWORD]. Substitua pela senha real do banco.");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({
    connectionString: raw,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  try {
    const version = await pool.query<{ version: string }>("select version()");
    console.log("\nConexão ...: OK");
    console.log("  ", version.rows[0]?.version.split(" on ")[0]);

    const schemas = await pool.query<{ nspname: string }>(
      "select nspname from pg_namespace where nspname in ('public','langgraph')",
    );
    const hasPublic = schemas.rows.some((row) => row.nspname === "public");
    const hasLanggraph = schemas.rows.some((row) => row.nspname === "langgraph");
    console.log(`  schema public ....: ${hasPublic ? "existe" : "AUSENTE"}`);
    console.log(`  schema langgraph .: ${hasLanggraph ? "existe" : "ausente (rode npm run db:langgraph-setup)"}`);

    if (hasPublic) {
      const tables = await pool.query<{ n: string }>(
        "select count(*)::int::text as n from information_schema.tables where table_schema = 'public'",
      );
      console.log(`  tabelas em public : ${tables.rows[0]?.n}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\nConexão ...: FALHOU");
    console.error("  ", message);
    console.error(
      "\nCausas comuns: senha errada, placeholder não substituído, caractere especial na senha sem " +
        "URL-encode (@ vira %40, # vira %23) ou rede bloqueando IPv6. Nesse último caso use a URI do " +
        "'Connection pooling' (host *.pooler.supabase.com).",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Falha:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
