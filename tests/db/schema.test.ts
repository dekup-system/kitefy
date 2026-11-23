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
  "discount_coupons",
  "coupon_redemptions",
  "billing_revenue_events",
  "api_usage_events",
  "admin_audit_log",
] as const;

/** Tabelas internas: RLS ligada, sem policy para `authenticated` (só service_role). */
const INTERNAL_TABLES = new Set([
  "mp_webhook_events",
  "discount_coupons",
  "coupon_redemptions",
  "billing_revenue_events",
  "api_usage_events",
  "admin_audit_log",
]);

describe("Schema invariantes (16 tabelas, RLS e índices)", () => {
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

  it("tem row level security habilitada em todas as tabelas", async () => {
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

  it("tem políticas em todas as tabelas de negócio; internas ficam só com service_role", async () => {
    const rows = await t.asSuperuser<{ tablename: string; policies: number }>(
      `select tablename, count(*)::int as policies
         from pg_policies where schemaname = 'public'
        group by tablename`,
    );
    const byName = new Map(rows.map((r) => [r.tablename, r.policies]));
    for (const table of TABLES) {
      if (INTERNAL_TABLES.has(table)) {
        expect(byName.get(table) ?? 0, `${table} não deve ter política`).toBe(0);
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

  it("brand_profiles tem token do Search Console opcional e limitado a 200", async () => {
    const column = await t.asSuperuser<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'brand_profiles'
          and column_name = 'google_verification_token'`,
    );
    expect(column).toHaveLength(1);
    expect(column[0]!.data_type).toBe("text");
    expect(column[0]!.is_nullable).toBe("YES");

    const constraints = await t.asSuperuser<{ conname: string }>(
      `select conname from pg_constraint
        where conrelid = 'public.brand_profiles'::regclass and contype = 'c'`,
    );
    expect(constraints.map((row) => row.conname)).toContain(
      "brand_profiles_google_token_length",
    );

    const tenant = await t.asSuperuser<{ id: string }>(
      `insert into public.tenants (name, slug) values ('Token Check', 'token-check') returning id`,
    );
    const message = await t.expectFailure(() =>
      t.asSuperuser(
        `insert into public.brand_profiles (tenant_id, brand_name, google_verification_token)
         values ($1, 'Token Longo', repeat('a', 201))`,
        [tenant[0]!.id],
      ),
    );
    expect(message).toMatch(/brand_profiles_google_token_length|check constraint/i);
  });

  it("mp_subscriptions guarda o valor recorrente real (amount_cents)", async () => {
    const column = await t.asSuperuser<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'mp_subscriptions'
          and column_name = 'amount_cents'`,
    );
    expect(column).toHaveLength(1);
    expect(column[0]!.data_type).toBe("integer");
    expect(column[0]!.is_nullable).toBe("YES");
  });

  it("api_usage_events é idempotente por (thread_id, sequence)", async () => {
    const indexes = await t.asSuperuser<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'api_usage_events'`,
    );
    expect(
      indexes.some(
        (row) => /unique/i.test(row.indexdef) && row.indexdef.includes("(thread_id, sequence)"),
      ),
    ).toBe(true);
  });

  it("discount_coupons valida código e limite de usos", async () => {
    await t.asSuperuser(
      `insert into public.discount_coupons (code, percent_off, max_redemptions)
       values ('KITE-TEST01', 20, 2)`,
    );

    const overLimit = await t.expectFailure(() =>
      t.asSuperuser(
        `update public.discount_coupons set times_redeemed = 3 where code = 'KITE-TEST01'`,
      ),
    );
    expect(overLimit).toMatch(/discount_coupons_usage|check constraint/i);

    const badCode = await t.expectFailure(() =>
      t.asSuperuser(
        `insert into public.discount_coupons (code, percent_off)
         values ('kite-bad', 10)`,
      ),
    );
    expect(badCode).toMatch(/discount_coupons_code_format|check constraint/i);
  });

  it("confirm_coupon_redemption é idempotente e respeita o limite", async () => {
    await t.asSuperuser(
      `insert into public.discount_coupons (code, percent_off, max_redemptions)
       values ('KITE-TEST01', 20, 2)
       on conflict (code) do nothing`,
    );

    const tenant = await t.asSuperuser<{ id: string }>(
      `insert into public.tenants (name, slug) values ('Cupom Check', 'cupom-check') returning id`,
    );
    const tenantId = tenant[0]!.id;

    const first = await t.asSuperuser<{ times_redeemed: number }>(
      `select * from public.confirm_coupon_redemption('KITE-TEST01', $1, 'pre-test-1', 3992)`,
      [tenantId],
    );
    expect(first[0]!.times_redeemed).toBe(1);

    const duplicate = await t.asSuperuser<{ times_redeemed: number }>(
      `select * from public.confirm_coupon_redemption('KITE-TEST01', $1, 'pre-test-1', 3992)`,
      [tenantId],
    );
    expect(duplicate[0]!.times_redeemed).toBe(1);

    const second = await t.asSuperuser<{ times_redeemed: number }>(
      `select * from public.confirm_coupon_redemption('KITE-TEST01', $1, 'pre-test-2', 3992)`,
      [tenantId],
    );
    expect(second[0]!.times_redeemed).toBe(2);

    const exhausted = await t.expectFailure(() =>
      t.asSuperuser(
        `select * from public.confirm_coupon_redemption('KITE-TEST01', $1, 'pre-test-3', 3992)`,
        [tenantId],
      ),
    );
    expect(exhausted).toMatch(/coupon_exhausted/i);
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
