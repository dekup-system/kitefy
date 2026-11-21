/**
 * Diagnóstico do projeto Supabase configurado no ambiente.
 *
 * Uso: npx tsx scripts/check-supabase.ts
 *
 * Verifica, em ordem, o que cada credencial permite:
 *  1. URL + chave publicável respondem (Auth health);
 *  2. PostgREST enxerga as tabelas (migrations aplicadas?);
 *  3. bucket privado existe;
 *  4. service_role está configurada (rotas administrativas).
 *
 * Nunca imprime chaves.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function main(): Promise<void> {
  const { getServerEnv } = await import("../src/lib/env");
  const env = getServerEnv();

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes.");
    process.exitCode = 1;
    return;
  }

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  console.log(`Projeto: ${url}`);
  console.log(`Chave: ${key.slice(0, 12)}… (${key.startsWith("sb_publishable_") ? "publicável" : "legada"})\n`);

  const health = await fetch(`${url}/auth/v1/health`, { headers });
  console.log(`Auth health .......... ${health.status} ${health.ok ? "OK" : "FALHA"}`);

  for (const table of ["tenants", "brand_profiles", "campaigns_and_assets", "knowledge_chunks"]) {
    const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers });
    const body = response.ok ? "ok" : ((await response.json()) as { code?: string }).code ?? "erro";
    console.log(`Tabela ${table.padEnd(22)} ${response.status} ${body}`);
  }

  const buckets = await fetch(`${url}/storage/v1/bucket`, { headers });
  const bucketList = buckets.ok ? ((await buckets.json()) as { name: string }[]) : [];
  console.log(
    `Buckets ............... ${buckets.status} [${bucketList.map((bucket) => bucket.name).join(", ") || "nenhum"}]`,
  );

  const storageOk = bucketList.some((bucket) => bucket.name === env.SUPABASE_STORAGE_BUCKET);
  console.log(`Bucket "${env.SUPABASE_STORAGE_BUCKET}" . ${storageOk ? "existe" : "AUSENTE"}`);

  console.log(`\nservice_role .......... ${env.SUPABASE_SERVICE_ROLE_KEY ? "configurada" : "AUSENTE (rotas de servidor indisponíveis)"}`);
  console.log(`SUPABASE_DB_URL ....... ${env.SUPABASE_DB_URL ? "configurada" : "ausente (MemorySaver)"}`);

  if (!env.SUPABASE_SERVICE_ROLE_KEY || !storageOk) {
    console.log("\nPróximos passos:");
    if (!storageOk) console.log("  • Rode supabase/kitefy-setup.sql no SQL Editor (cria bucket + tabelas).");
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("  • Configure SUPABASE_SERVICE_ROLE_KEY (Project Settings > API Keys > Secret keys).");
    }
  }
}

main().catch((error: unknown) => {
  console.error("Falha no diagnóstico:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
