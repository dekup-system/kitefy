import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDatabase } from "./harness";

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
] as const;

describe("Schema invariantes (11 tabelas, RLS e índices)", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await TestDatabase.create();
  });

  afterAll(async () => {
    await t.close();
  });

  it("aplica todas as migrations sem erro", async () => {
    const rows = await t.asSuperuser<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(TABLES.length);
  });

  it("tem row level security habilitada nas 11 tabelas", async () => {
    const rows = await t.asSuperuser<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const byName = new Map(rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const table of TABLES) {
      expect(byName.get(table), `RLS ausente em ${table}`).toBe(true);
    }
  });

  it("tem políticas em todas as tabelas, exceto mp_webhook_events", async () => {
    const rows = await t.asSuperuser<{ tablename: string; policies: number }>(
      `select tablename, count(*)::int as policies
         from pg_policies where schemaname = 'public'
        group by tablename`,
    );
    const byName = new Map(rows.map((r) => [r.tablename, r.policies]));
    for (const table of TABLES) {
      if (table === "mp_webhook_events") {
        expect(byName.get(table) ?? 0, "mp_webhook_events não deve ter política").toBe(0);
      } else {
        expect(byName.get(table) ?? 0, `sem política em ${table}`).toBeGreaterThan(0);
      }
    }
  });

  it("knowledge_chunks usa vetor de 768 dimensões", async () => {
    const rows = await t.asSuperuser<{ formatted: string }>(
      `select format_type(a.atttypid, a.atttypmod) as formatted
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'knowledge_chunks' and a.attname = 'embedding'`,
    );
    expect(rows[0]!.formatted).toBe("extensions.vector(768)");
  });

  it("knowledge_chunks tem índice B-tree (tenant_id, brand_id) e HNSW", async () => {
    const rows = await t.asSuperuser<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'knowledge_chunks'`,
    );
    const defs = rows.map((r) => r.indexdef);
    expect(defs.some((d) => d.includes("USING btree (tenant_id, brand_id)"))).toBe(true);
    expect(
      defs.some((d) => d.includes("USING hnsw") && d.includes("vector_cosine_ops")),
      "índice HNSW ausente",
    ).toBe(true);
  });

  it("hook_rate é coluna gerada (generated always as)", async () => {
    const rows = await t.asSuperuser<{ attgenerated: string }>(
      `select a.attgenerated
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
        where c.relname = 'performance_telemetry' and a.attname = 'hook_rate'`,
    );
    expect(rows[0]!.attgenerated).toBe("s");
  });

  it("bandit_arm_stats tem unicidade por (tenant_id, brand_id, arm_key)", async () => {
    const rows = await t.asSuperuser<{ conname: string }>(
      `select conname from pg_constraint
        where conrelid = 'public.bandit_arm_stats'::regclass and contype = 'u'`,
    );
    expect(rows.map((r) => r.conname)).toContain("bandit_arm_stats_unique");
  });

  it("tabelas do LangGraph ficam no schema dedicado, fora do public", async () => {
    const rows = await t.asSuperuser<{ nspname: string; tablename: string }>(
      `select schemaname as nspname, tablename
         from pg_tables
        where schemaname in ('public', 'langgraph')
          and (tablename like 'checkpoint%')`,
    );
    expect(rows).toHaveLength(0);
    const schema = await t.asSuperuser<{ nspname: string }>(
      "select nspname from pg_namespace where nspname = 'langgraph'",
    );
    expect(schema).toHaveLength(1);
  });

  it("cria o tenant e o membership no signup (trigger auth.users)", async () => {
    const user = await t.asSuperuser<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('founder@schemacheck.com', '{"brand_name":"Schema Check"}'::jsonb)
       returning id`,
    );
    const userId = user[0]!.id;

    const members = await t.asSuperuser<{ role: string; tenant_id: string }>(
      "select role, tenant_id from public.tenant_members where user_id = $1",
      [userId],
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe("owner");

    const tenant = await t.asSuperuser<{ name: string; credit_balance: number }>(
      "select name, credit_balance from public.tenants where id = $1",
      [members[0]!.tenant_id],
    );
    expect(tenant[0]!.name).toBe("Schema Check");
    expect(tenant[0]!.credit_balance).toBe(10);

    const ledger = await t.asSuperuser<{ delta: number; reason: string }>(
      "select delta, reason from public.credit_ledger where tenant_id = $1",
      [members[0]!.tenant_id],
    );
    expect(ledger).toEqual([{ delta: 10, reason: "welcome_bonus" }]);
  });
});
