import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDatabase, createUserWithTenant } from "./harness";

/**
 * Prova de isolamento estrito entre tenants.
 * Cada asserção roda como `authenticated` (RLS ativa) e nunca como superusuário.
 */
describe("Isolamento RLS entre tenants", () => {
  let t: TestDatabase;
  let userA: { userId: string; tenantId: string };
  let userB: { userId: string; tenantId: string };
  let brandA: string;
  let brandB: string;
  let assetA: string;

  beforeAll(async () => {
    t = await TestDatabase.create();
    userA = await createUserWithTenant(t, "owner-a@rls.test", "Marca A");
    userB = await createUserWithTenant(t, "owner-b@rls.test", "Marca B");

    const bA = await t.asSuperuser<{ id: string }>(
      `insert into public.brand_profiles (tenant_id, brand_name, website_url)
       values ($1, 'Marca A', 'https://a.example') returning id`,
      [userA.tenantId],
    );
    const bB = await t.asSuperuser<{ id: string }>(
      `insert into public.brand_profiles (tenant_id, brand_name, website_url)
       values ($1, 'Marca B', 'https://b.example') returning id`,
      [userB.tenantId],
    );
    brandA = bA[0]!.id;
    brandB = bB[0]!.id;

    const aA = await t.asSuperuser<{ id: string }>(
      `insert into public.campaigns_and_assets
         (tenant_id, brand_id, thread_id, asset_type, status, title, content_payload, credits_charged)
       values ($1, $2, 'thread-a', 'short_script_kit', 'approved', 'Ativo A', '{}'::jsonb, 1)
       returning id`,
      [userA.tenantId, brandA],
    );
    assetA = aA[0]!.id;

    await t.asSuperuser(
      `insert into public.campaigns_and_assets
         (tenant_id, brand_id, thread_id, asset_type, status, title, content_payload, credits_charged)
       values ($1, $2, 'thread-b', 'geo_article', 'draft', 'Ativo B', '{}'::jsonb, 5)`,
      [userB.tenantId, brandB],
    );

    await t.asSuperuser(
      `insert into public.performance_telemetry
         (tenant_id, brand_id, asset_id, impressions, views_3s)
       values ($1, $2, $3, 1000, 400)`,
      [userA.tenantId, brandA, assetA],
    );
    await t.asSuperuser(
      `insert into public.performance_telemetry (tenant_id, brand_id, impressions, views_3s)
       values ($1, $2, 500, 100)`,
      [userB.tenantId, brandB],
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it("tenant A enxerga apenas o próprio tenant", async () => {
    const rows = await t.asUser<{ id: string }>(
      userA.userId,
      "select id from public.tenants order by created_at",
    );
    expect(rows.map((r) => r.id)).toEqual([userA.tenantId]);
  });

  it("tenant A enxerga apenas as próprias marcas", async () => {
    const rows = await t.asUser<{ id: string; brand_name: string }>(
      userA.userId,
      "select id, brand_name from public.brand_profiles",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.brand_name).toBe("Marca A");
  });

  it("tenant A enxerga apenas os próprios ativos", async () => {
    const rows = await t.asUser<{ title: string }>(
      userA.userId,
      "select title from public.campaigns_and_assets",
    );
    expect(rows.map((r) => r.title)).toEqual(["Ativo A"]);
  });

  it("tenant A enxerga apenas a própria telemetria", async () => {
    const rows = await t.asUser<{ impressions: number }>(
      userA.userId,
      "select impressions from public.performance_telemetry",
    );
    expect(rows.map((r) => r.impressions)).toEqual([1000]);
  });

  it("UPDATE cruzado não afeta a marca do outro tenant", async () => {
    const updated = await t.asUser<{ id: string }>(
      userA.userId,
      "update public.brand_profiles set brand_name = 'Invadido' where id = $1 returning id",
      [brandB],
    );
    expect(updated).toHaveLength(0);

    const check = await t.asSuperuser<{ brand_name: string }>(
      "select brand_name from public.brand_profiles where id = $1",
      [brandB],
    );
    expect(check[0]!.brand_name).toBe("Marca B");
  });

  it("DELETE cruzado não remove a marca do outro tenant", async () => {
    const deleted = await t.asUser<{ id: string }>(
      userA.userId,
      "delete from public.brand_profiles where id = $1 returning id",
      [brandB],
    );
    expect(deleted).toHaveLength(0);
  });

  it("INSERT com tenant_id de outra organização é bloqueado pelo WITH CHECK", async () => {
    const message = await t.expectFailure(() =>
      t.asUser(
        userA.userId,
        `insert into public.brand_profiles (tenant_id, brand_name)
         values ($1, 'Invasora')`,
        [userB.tenantId],
      ),
    );
    expect(message).toMatch(/row-level security|violates/i);
  });

  it("INSERT com brand_id de outra organização é bloqueado", async () => {
    const message = await t.expectFailure(() =>
      t.asUser(
        userA.userId,
        `insert into public.campaigns_and_assets
           (tenant_id, brand_id, thread_id, asset_type, status, title)
         values ($1, $2, 'thread-x', 'single_creative', 'draft', 'Invasor')`,
        [userA.tenantId, brandB],
      ),
    );
    expect(message).toMatch(/row-level security|violates/i);
  });

  it("credit_ledger não aceita escrita pelo cliente", async () => {
    const message = await t.expectFailure(() =>
      t.asUser(
        userA.userId,
        "insert into public.credit_ledger (tenant_id, delta, reason) values ($1, 999, 'hack')",
        [userA.tenantId],
      ),
    );
    expect(message).toMatch(/permission denied|row-level security|violates/i);
  });

  it("credit_ledger permite leitura do próprio tenant", async () => {
    const rows = await t.asUser<{ delta: number }>(
      userA.userId,
      "select delta from public.credit_ledger",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.delta === 10)).toBe(true);
  });

  it("mp_subscriptions e mp_webhook_events bloqueiam escrita e leitura indevida", async () => {
    const insertError = await t.expectFailure(() =>
      t.asUser(
        userA.userId,
        `insert into public.mp_subscriptions
           (tenant_id, mp_preapproval_id, payment_method, plan_tier, status)
         values ($1, 'pre-1', 'pix_automatico', 'pro', 'authorized')`,
        [userA.tenantId],
      ),
    );
    expect(insertError).toMatch(/permission denied|row-level security|violates/i);

    const webhookRows = await t.asUser<{ n: number }>(
      userA.userId,
      "select count(*)::int as n from public.mp_webhook_events",
    );
    expect(webhookRows[0]!.n).toBe(0);
  });

  it("bandit_arm_stats é somente leitura para o cliente", async () => {
    const message = await t.expectFailure(() =>
      t.asUser(
        userA.userId,
        `insert into public.bandit_arm_stats (tenant_id, brand_id, arm_key)
         values ($1, $2, 'vace_pattern_interrupt:pas')`,
        [userA.tenantId, brandA],
      ),
    );
    expect(message).toMatch(/permission denied|row-level security|violates/i);
  });

  it("viewer não pode escrever em brand_profiles", async () => {
    const viewer = await createUserWithTenant(t, "viewer@rls.test", "Marca Viewer");
    await t.asSuperuser(
      `insert into public.tenant_members (tenant_id, user_id, role)
       values ($1, $2, 'viewer') on conflict do nothing`,
      [userB.tenantId, viewer.userId],
    );
    // Ajusta o papel do membership criado pelo trigger para esta organização.
    await t.asSuperuser(
      `update public.tenant_members set role = 'viewer' where tenant_id = $1 and user_id = $2`,
      [viewer.tenantId, viewer.userId],
    );

    const read = await t.asUser<{ n: number }>(
      viewer.userId,
      "select count(*)::int as n from public.brand_profiles",
    );
    expect(read[0]!.n).toBe(1);

    const message = await t.expectFailure(() =>
      t.asUser(
        viewer.userId,
        `insert into public.brand_profiles (tenant_id, brand_name) values ($1, 'Nova')`,
        [viewer.tenantId],
      ),
    );
    expect(message).toMatch(/row-level security|violates/i);
  });

  it("dados administrativos ficam inacessíveis para o cliente", async () => {
    for (const table of [
      "discount_coupons",
      "coupon_redemptions",
      "billing_revenue_events",
      "api_usage_events",
      "admin_audit_log",
    ]) {
      const message = await t.expectFailure(() =>
        t.asUser(userA.userId, `select count(*)::int from public.${table}`),
      );
      expect(message).toMatch(/permission denied/i);
    }
  });

  it("anônimo não lê nenhuma tabela de negócio", async () => {
    const message = await t.expectFailure(() =>
      t.asAnon("select count(*)::int from public.tenants"),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("hook_variants respeita o vínculo com o tenant do ativo", async () => {
    const inserted = await t.asUser<{ id: string }>(
      userA.userId,
      `insert into public.hook_variants (tenant_id, asset_id, angle_type, framework, hook_text)
       values ($1, $2, 'vace_pattern_interrupt', 'pas', 'Pare de perder alcance hoje mesmo')
       returning id`,
      [userA.tenantId, assetA],
    );
    expect(inserted).toHaveLength(1);

    const other = await t.expectFailure(() =>
      t.asUser(
        userB.userId,
        `insert into public.hook_variants (tenant_id, asset_id, angle_type, framework, hook_text)
         values ($1, $2, 'aida', 'pas', 'x')`,
        [userB.tenantId, assetA],
      ),
    );
    expect(other).toMatch(/row-level security|violates/i);
  });
});
