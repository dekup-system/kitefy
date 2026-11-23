import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import type { PlanTier } from "@/types/domain";

/**
 * Métricas do console administrativo (funções puras).
 *
 * MRR usa o valor REAL autorizado (`amount_cents`), com fallback para o preço
 * de tabela do plano em assinaturas antigas sem o campo. Custos de API chegam em
 * USD; a conversão para BRL usa uma taxa configurável (ADMIN_USD_BRL_RATE) e só
 * serve para leitura gerencial — não é contabilidade.
 */

export interface SubscriptionRevenueRow {
  plan_tier: PlanTier;
  amount_cents: number | null;
  status: string;
}

export interface PlanRevenue {
  tier: PlanTier;
  name: string;
  count: number;
  mrrCents: number;
}

export interface MrrSummary {
  totalCents: number;
  activeCount: number;
  byPlan: PlanRevenue[];
}

export function computeMrr(rows: readonly SubscriptionRevenueRow[]): MrrSummary {
  const active = rows.filter((row) => row.status === "active");

  const byPlan = PLAN_ORDER.map((tier) => {
    const tierRows = active.filter((row) => row.plan_tier === tier);
    const mrrCents = tierRows.reduce(
      (total, row) => total + (row.amount_cents ?? PLANS[tier].priceCents),
      0,
    );

    return { tier, name: PLANS[tier].name, count: tierRows.length, mrrCents };
  });

  return {
    totalCents: byPlan.reduce((total, plan) => total + plan.mrrCents, 0),
    activeCount: active.length,
    byPlan,
  };
}

/** Custo de API em centavos de BRL (estimativa gerencial). */
export function costUsdToBrlCents(costUsd: number, usdBrlRate: number): number {
  if (!Number.isFinite(costUsd) || costUsd < 0) return 0;
  if (!Number.isFinite(usdBrlRate) || usdBrlRate <= 0) return 0;
  return Math.round(costUsd * usdBrlRate * 100);
}

/** Margem estimada = receita do período - custo de API do período (em BRL). */
export function computeMarginCents(input: {
  revenueCents: number;
  costUsd: number;
  usdBrlRate: number;
}): number {
  return Math.round(input.revenueCents) - costUsdToBrlCents(input.costUsd, input.usdBrlRate);
}

/** Variação percentual; `null` quando não há base de comparação. */
export function computeChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / previous;
}

export interface UsageAggregateRow {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens?: number;
  calls: number;
}

export interface UsageSummary {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  calls: number;
}

export function summarizeUsage(rows: readonly UsageAggregateRow[]): UsageSummary {
  return rows.reduce(
    (total, row) => ({
      costUsd: total.costUsd + row.cost_usd,
      inputTokens: total.inputTokens + row.input_tokens,
      outputTokens: total.outputTokens + row.output_tokens,
      cachedTokens: total.cachedTokens + (row.cached_tokens ?? 0),
      calls: total.calls + row.calls,
    }),
    { costUsd: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, calls: 0 },
  );
}

/** Receita média por assinatura ativa. */
export function computeArpuCents(mrrCents: number, activeCount: number): number {
  if (activeCount <= 0) return 0;
  return Math.round(mrrCents / activeCount);
}
