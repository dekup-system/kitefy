import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TestDatabase, createUserWithTenant } from "../db/harness";

/**
 * Integração das queries do /admin contra PGlite com as migrations reais.
 * O mock troca o pool de produção pelo banco em memória; o SQL é exatamente o
 * que roda em produção, então erro de sintaxe/agregação aparece aqui.
 */

let testDb: TestDatabase | null = null;

vi.mock("@/lib/db/pg", () => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (!testDb) throw new Error("PGlite não inicializado");
    return testDb.asSuperuser(sql, params);
  },
}));

let tenantId = "";

beforeAll(async () => {
  testDb = await TestDatabase.create();
  const user = await createUserWithTenant(testDb, "admin-data@test", "Admin Data");
  tenantId = user.tenantId;

  await testDb.asSuperuser(
    `update public.tenants set plan_tier = 'pro', credit_balance = 42 where id = $1`,
    [tenantId],
  );

  const brand = await testDb.asSuperuser<{ id: string }>(
    `insert into public.brand_profiles (tenant_id, brand_name, website_url)
     values ($1, 'Admin Data', 'https://admin-data.test') returning id`,
    [tenantId],
  );
  const brandId = brand[0]!.id;

  await testDb.asSuperuser(
    `insert into public.campaigns_and_assets
       (tenant_id, brand_id, thread_id, asset_type, status, title, content_payload, credits_charged)
     values ($1, $2, 'thread-admin', 'geo_article', 'approved', 'Artigo', '{"kind":"geo_article"}'::jsonb, 5)`,
    [tenantId, brandId],
  );

  await testDb.asSuperuser(
    `insert into public.mp_subscriptions
       (tenant_id, mp_preapproval_id, payment_method, plan_tier, status, amount_cents)
     values ($1, 'pre-admin-1', 'card_preapproval', 'pro', 'active', 9990)`,
    [tenantId],
  );

  await testDb.asSuperuser(
    `insert into public.billing_revenue_events
       (source, external_id, tenant_id, plan_tier, amount_cents, occurred_at)
     values ('subscription', 'ext-1', $1, 'pro', 9990, now()),
            ('payment', 'ext-2', $1, 'pro', 5000, now() - interval '40 days')`,
    [tenantId],
  );

  await testDb.asSuperuser(
    `insert into public.api_usage_events
       (tenant_id, thread_id, node, provider, model, input_tokens, output_tokens, cost_usd, sequence, created_at)
     values ($1, 'th-1', 'content', 'deepseek', 'deepseek-chat', 1000, 500, 0.010, 0, now()),
            ($1, 'th-1', 'guardrail', 'deepseek', 'deepseek-chat', 500, 100, 0.002, 1, now()),
            ($1, 'th-old', 'content', 'deepseek', 'deepseek-chat', 2000, 1000, 0.030, 0, now() - interval '40 days')`,
    [tenantId],
  );

  await testDb.asSuperuser(
    `insert into public.discount_coupons (code, percent_off, max_redemptions, times_redeemed)
     values ('KITE-ADMIN1', 20, 10, 1)
     on conflict (code) do nothing`,
  );

  const coupon = await testDb.asSuperuser<{ id: string }>(
    `select id from public.discount_coupons where code = 'KITE-ADMIN1'`,
  );
  await testDb.asSuperuser(
    `insert into public.coupon_redemptions
       (coupon_id, tenant_id, preapproval_id, percent_off, amount_cents)
     values ($1, $2, 'pre-admin-1', 20, 9990)`,
    [coupon[0]!.id, tenantId],
  );
});

afterAll(async () => {
  await testDb?.close();
});

describe("queries do console administrativo", () => {
  it("monta a visão geral com MRR, receita e custo", async () => {
    const { getAdminOverview } = await import("@/lib/admin/data");
    const overview = await getAdminOverview();

    expect(overview.counts.tenants).toBe(1);
    expect(overview.counts.brands).toBe(1);
    expect(overview.counts.activeCoupons).toBe(1);
    expect(overview.mrr.totalCents).toBe(9990);
    expect(overview.mrr.activeCount).toBe(1);
    expect(overview.revenue.last30Cents).toBe(9990);
    expect(overview.revenue.previous30Cents).toBe(5000);
    expect(overview.revenue.allTimeCents).toBe(14990);
    expect(overview.usage.calls).toBe(2);
    expect(overview.usageCurrentCostUsd).toBeCloseTo(0.012, 6);
    expect(overview.usagePreviousCostUsd).toBeCloseTo(0.03, 6);
    expect(overview.recentTenants[0]?.owner_email).toBe("admin-data@test");
    expect(overview.recentUsage).toHaveLength(3);
  });

  it("lista e busca contas com receita e custo por tenant", async () => {
    const { getAdminAccounts } = await import("@/lib/admin/data");
    const accounts = await getAdminAccounts("admin-data");

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.id).toBe(tenantId);
    expect(accounts[0]?.subscription_amount_cents).toBe(9990);
    expect(accounts[0]?.revenue_cents).toBe(14990);
    expect(accounts[0]?.usage_cost_usd).toBeCloseTo(0.012, 6);
  });

  it("monta a página de receita e custos", async () => {
    const { getAdminRevenuePage } = await import("@/lib/admin/data");
    const page = await getAdminRevenuePage();

    expect(page.mrr.totalCents).toBe(9990);
    const pro = page.byPlan.find((row) => row.plan_tier === "pro");
    expect(pro?.cents_last30).toBe(9990);
    expect(page.usage.calls).toBe(2);
    expect(page.recentRevenue).toHaveLength(2);
    expect(page.marginCents).toBe(9990 - 6);
  });

  it("expõe cupons com resgates confirmados", async () => {
    const { getAdminCoupons } = await import("@/lib/admin/data");
    const coupons = await getAdminCoupons();
    const coupon = coupons.find((row) => row.code === "KITE-ADMIN1");

    expect(coupon).toBeTruthy();
    expect(coupon?.times_redeemed).toBe(1);
    expect(coupon?.confirmed_redemptions).toBe(1);
    expect(coupon?.redeemed_amount_cents).toBe(9990);
  });

  it("carrega o detalhe da conta e devolve null para id desconhecido", async () => {
    const { getAdminTenant } = await import("@/lib/admin/data");
    const detail = await getAdminTenant(tenantId);

    expect(detail?.account.credit_balance).toBe(42);
    expect(detail?.usageRows).toHaveLength(1);
    expect(detail?.usageRows[0]?.calls).toBe(2);
    expect(detail?.revenueAllTimeCents).toBe(14990);
    expect(await getAdminTenant("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
