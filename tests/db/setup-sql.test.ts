import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

/**
 * `supabase/kitefy-setup.sql` é o caminho sem Docker: o usuário cola o arquivo no
 * SQL Editor do Supabase. Se ele quebrar, o onboarding do cliente quebra junto —
 * então aplicamos o arquivo REAL duas vezes num banco limpo e conferimos o schema.
 */

const SETUP_SQL = join(process.cwd(), "supabase", "kitefy-setup.sql");

const BOOTSTRAP = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;

  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.uid() to authenticated, service_role;
`;

const TABLES = [
  "tenants",
  "tenant_members",
  "brand_profiles",
  "knowledge_chunks",
  "campaigns_and_assets",
  "hook_variants",
  "performance_telemetry",
  "bandit_arm_stats",
  "credit_ledger",
  "mp_subscriptions",
  "mp_webhook_events",
  "discount_coupons",
  "coupon_redemptions",
  "billing_revenue_events",
  "api_usage_events",
  "admin_audit_log",
];

describe("supabase/kitefy-setup.sql", () => {
  it("aplica o script completo duas vezes (idempotente) e cria o schema esperado", async () => {
    const db = await PGlite.create({ extensions: { vector, pgcrypto, pg_trgm } });

    try {
      await db.exec(BOOTSTRAP);

      const sql = readFileSync(SETUP_SQL, "utf8");
      await db.exec(sql);
      await db.exec(sql); // segunda execução prova idempotência

      const tables = await db.query<{ tablename: string; rowsecurity: boolean }>(
        `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
      );
      const names = tables.rows.map((row) => row.tablename);
      for (const table of TABLES) {
        expect(names, `tabela ausente: ${table}`).toContain(table);
        const row = tables.rows.find((item) => item.tablename === table);
        expect(row?.rowsecurity, `RLS desligada em ${table}`).toBe(true);
      }

      const functions = await db.query<{ proname: string }>(
        `select p.proname
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'`,
      );
      const fnNames = functions.rows.map((row) => row.proname);
      for (const fn of [
        "consume_credits",
        "refund_credits",
        "match_knowledge_chunks",
        "match_brand_chunks",
        "update_bandit_arm",
        "handle_new_user",
        "is_tenant_member",
        "enqueue_job",
        "confirm_coupon_redemption",
      ]) {
        expect(fnNames, `função ausente: ${fn}`).toContain(fn);
      }

      const hnsw = await db.query<{ indexdef: string }>(
        `select indexdef from pg_indexes
          where schemaname = 'public' and tablename = 'knowledge_chunks'`,
      );
      expect(hnsw.rows.some((row) => row.indexdef.includes("USING hnsw"))).toBe(true);

      const generated = await db.query<{ attgenerated: string }>(
        `select a.attgenerated
           from pg_attribute a
           join pg_class c on c.oid = a.attrelid
          where c.relname = 'performance_telemetry' and a.attname = 'hook_rate'`,
      );
      expect(generated.rows[0]?.attgenerated).toBe("s");

      const amountColumn = await db.query<{ count: number }>(
        `select count(*)::int as count
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'mp_subscriptions'
            and column_name = 'amount_cents'`,
      );
      expect(amountColumn.rows[0]?.count).toBe(1);
    } finally {
      await db.close();
    }
  }, 120_000);
});
