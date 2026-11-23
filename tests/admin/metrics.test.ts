import { describe, expect, it } from "vitest";
import {
  computeArpuCents,
  computeChange,
  computeMarginCents,
  computeMrr,
  costUsdToBrlCents,
  summarizeUsage,
} from "@/lib/admin/metrics";
import { PLANS } from "@/lib/pricing";

describe("computeMrr", () => {
  it("soma apenas assinaturas ativas e usa o valor real", () => {
    const mrr = computeMrr([
      { plan_tier: "pro", amount_cents: 9990, status: "active" },
      { plan_tier: "essential", amount_cents: null, status: "active" },
      { plan_tier: "agency", amount_cents: 26990, status: "cancelled" },
    ]);

    expect(mrr.activeCount).toBe(2);
    expect(mrr.totalCents).toBe(9990 + PLANS.essential.priceCents);
    expect(mrr.byPlan.find((plan) => plan.tier === "pro")).toEqual({
      tier: "pro",
      name: PLANS.pro.name,
      count: 1,
      mrrCents: 9990,
    });
    expect(mrr.byPlan.find((plan) => plan.tier === "agency")?.count).toBe(0);
  });

  it("devolve zero sem assinaturas", () => {
    expect(computeMrr([])).toEqual({
      totalCents: 0,
      activeCount: 0,
      byPlan: expect.any(Array),
    });
  });
});

describe("custos e margem", () => {
  it("converte USD em centavos de BRL", () => {
    expect(costUsdToBrlCents(1.5, 5.4)).toBe(810);
    expect(costUsdToBrlCents(0, 5.4)).toBe(0);
    expect(costUsdToBrlCents(Number.NaN, 5.4)).toBe(0);
  });

  it("calcula margem em centavos", () => {
    expect(computeMarginCents({ revenueCents: 10_000, costUsd: 1, usdBrlRate: 5.4 })).toBe(
      10_000 - 540,
    );
  });

  it("variação percentual lida com base zero", () => {
    expect(computeChange(150, 100)).toBe(0.5);
    expect(computeChange(50, 100)).toBe(-0.5);
    expect(computeChange(100, 0)).toBeNull();
  });
});

describe("summarizeUsage", () => {
  it("soma chamadas, tokens e custo", () => {
    const summary = summarizeUsage([
      { cost_usd: 0.5, input_tokens: 1000, output_tokens: 200, calls: 2, cached_tokens: 100 },
      { cost_usd: 1.25, input_tokens: 3000, output_tokens: 800, calls: 1 },
    ]);

    expect(summary.costUsd).toBe(1.75);
    expect(summary.inputTokens).toBe(4000);
    expect(summary.outputTokens).toBe(1000);
    expect(summary.cachedTokens).toBe(100);
    expect(summary.calls).toBe(3);
  });
});

describe("computeArpuCents", () => {
  it("divide MRR pelas assinaturas ativas", () => {
    expect(computeArpuCents(10_000, 4)).toBe(2500);
    expect(computeArpuCents(10_000, 0)).toBe(0);
  });
});
