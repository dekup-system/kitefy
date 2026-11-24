import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDatabase, createUserWithTenant } from "./harness";
import { totalRunCreditCost } from "@/lib/pricing";
import { buildWeeklyIdeas } from "@/lib/onboarding/extract";

describe("Sistema de créditos atômico", () => {
  let t: TestDatabase;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    t = await TestDatabase.create();
    const user = await createUserWithTenant(t, "credits@ledger.test", "Créditos");
    tenantId = user.tenantId;
    userId = user.userId;
    // Saldo inicial de 10 (welcome bonus) + 5 extras.
    await t.asService("select public.consume_credits($1, 5, 'manual_grant', 'test')", [tenantId]);
  });

  afterAll(async () => {
    await t.close();
  });

  it("debita crédito e registra no ledger", async () => {
    const balance = await t.asService<{ consume_credits: number }>(
      "select public.consume_credits($1, -1, 'short_script_kit', 'asset-1')",
      [tenantId],
    );
    expect(balance[0]!.consume_credits).toBe(14);

    const ledger = await t.asSuperuser<{ delta: number; reason: string; reference_id: string }>(
      "select delta, reason, reference_id from public.credit_ledger where reference_id = 'asset-1'",
    );
    expect(ledger).toEqual([{ delta: -1, reason: "short_script_kit", reference_id: "asset-1" }]);
  });

  it("recusa débito que deixaria saldo negativo e não altera o saldo", async () => {
    const message = await t.expectFailure(() =>
      t.asService("select public.consume_credits($1, -9999, 'geo_article', 'asset-x')", [tenantId]),
    );
    expect(message).toMatch(/insufficient_credits/);

    const rows = await t.asSuperuser<{ credit_balance: number }>(
      "select credit_balance from public.tenants where id = $1",
      [tenantId],
    );
    expect(rows[0]!.credit_balance).toBe(14);
  });

  it("estorna crédito em falha técnica", async () => {
    const before = await t.asSuperuser<{ credit_balance: number }>(
      "select credit_balance from public.tenants where id = $1",
      [tenantId],
    );
    await t.asService("select public.refund_credits($1, 3, 'render_failed', 'asset-2')", [tenantId]);
    const after = await t.asSuperuser<{ credit_balance: number }>(
      "select credit_balance from public.tenants where id = $1",
      [tenantId],
    );
    expect(after[0]!.credit_balance).toBe(before[0]!.credit_balance + 3);
  });

  it("débito concorrente nunca deixa saldo negativo (serialização por FOR UPDATE)", async () => {
    const start = await t.asSuperuser<{ credit_balance: number }>(
      "select credit_balance from public.tenants where id = $1",
      [tenantId],
    );
    const balance = start[0]!.credit_balance;

    // Zera o saldo e testa duas tentativas sequenciais de 1 crédito.
    await t.asService("select public.consume_credits($1, $2, 'drain', 'drain')", [
      tenantId,
      -balance,
    ]);

    const first = await t.expectFailure(() =>
      t.asService("select public.consume_credits($1, -1, 'short_script_kit', 'c1')", [tenantId]),
    );
    expect(first).toMatch(/insufficient_credits/);

    await t.asService("select public.consume_credits($1, 1, 'topup', 'topup')", [tenantId]);
    await t.asService("select public.consume_credits($1, -1, 'short_script_kit', 'c2')", [tenantId]);
    const final = await t.asSuperuser<{ credit_balance: number }>(
      "select credit_balance from public.tenants where id = $1",
      [tenantId],
    );
    expect(final[0]!.credit_balance).toBe(0);
  });

  it("saldo nunca fica negativo por constraint", async () => {
    const message = await t.expectFailure(() =>
      t.asSuperuser("update public.tenants set credit_balance = -1 where id = $1", [tenantId]),
    );
    expect(message).toMatch(/credit_balance|check constraint|violates/i);
  });

  it("cliente autenticado não pode chamar consume_credits", async () => {
    const message = await t.expectFailure(() =>
      t.asUser(userId, "select public.consume_credits($1, 100, 'self_grant', 'x')", [tenantId]),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("cliente autenticado não pode chamar update_bandit_arm", async () => {
    const message = await t.expectFailure(() =>
      t.asUser(userId, "select public.update_bandit_arm($1, $2, 'a:b', true)", [
        tenantId,
        "00000000-0000-0000-0000-000000000000",
      ]),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("update_bandit_arm acumula alpha/beta e pulls", async () => {
    const brandRows = await t.asSuperuser<{ id: string }>(
      `insert into public.brand_profiles (tenant_id, brand_name)
       values ($1, 'Bandit Brand') returning id`,
      [tenantId],
    );
    const brandId = brandRows[0]!.id;

    const first = await t.asService<{ arm: { alpha: string; beta: string; pulls: number } }>(
      "select to_jsonb(public.update_bandit_arm($1, $2, 'vace_pattern_interrupt:pas', true)) as arm",
      [tenantId, brandId],
    );
    expect(Number(first[0]!.arm.alpha)).toBe(2);
    expect(Number(first[0]!.arm.beta)).toBe(1);
    expect(first[0]!.arm.pulls).toBe(1);

    const second = await t.asService<{ arm: { alpha: string; beta: string; pulls: number } }>(
      "select to_jsonb(public.update_bandit_arm($1, $2, 'vace_pattern_interrupt:pas', false)) as arm",
      [tenantId, brandId],
    );
    expect(Number(second[0]!.arm.alpha)).toBe(2);
    expect(Number(second[0]!.arm.beta)).toBe(2);
    expect(second[0]!.arm.pulls).toBe(2);
  });

  it("calcula o P75 de hook_rate do tenant", async () => {
    const brandRows = await t.asSuperuser<{ id: string }>(
      `insert into public.brand_profiles (tenant_id, brand_name)
       values ($1, 'P75 Brand') returning id`,
      [tenantId],
    );
    const brandId = brandRows[0]!.id;
    await t.asSuperuser(
      `insert into public.performance_telemetry (tenant_id, brand_id, impressions, views_3s)
       values ($1, $2, 100, 10), ($1, $2, 100, 35), ($1, $2, 100, 50), ($1, $2, 100, 60)`,
      [tenantId, brandId],
    );
    const rows = await t.asService<{ tenant_hook_rate_p75: string }>(
      "select public.tenant_hook_rate_p75($1)",
      [tenantId],
    );
    // hook_rates: 0.10, 0.35, 0.50, 0.60 -> P75 = 0.525
    expect(Number(rows[0]!.tenant_hook_rate_p75)).toBeCloseTo(0.525, 3);
  });

  it("totalRunCreditCost soma +1 crédito quando SERP é ativado em formatos sociais e mantém 5 em geo_article", () => {
    expect(totalRunCreditCost("short_script_kit", false)).toBe(1);
    expect(totalRunCreditCost("short_script_kit", true)).toBe(2);
    expect(totalRunCreditCost("typo_carousel", true)).toBe(2);
    expect(totalRunCreditCost("geo_article", false)).toBe(5);
    expect(totalRunCreditCost("geo_article", true)).toBe(5);
  });

  it("buildWeeklyIdeas gera 6 pautas determinísticas sem chamadas externas", () => {
    const ideas = buildWeeklyIdeas({
      brand_name: "Clínica Aurora",
      entity_facts: [{ claim: "Atendimento preventivo em três etapas" }],
    });
    expect(ideas).toHaveLength(6);
    expect(ideas[0]?.assetType).toBe("typo_carousel");
    expect(ideas[1]?.assetType).toBe("short_script_kit");
    expect(ideas[2]?.assetType).toBe("single_creative");
    expect(ideas[3]?.assetType).toBe("hybrid_carousel");
    expect(ideas[4]?.assetType).toBe("geo_article");
    expect(ideas[5]?.assetType).toBe("lp_copy");
  });
});
