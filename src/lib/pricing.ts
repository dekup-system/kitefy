import type { AssetType, PlanTier } from "@/types/domain";

/**
 * Fonte única de verdade de preços e créditos.
 * Consumida por: UI de planos, billing (Mercado Pago), grafo de agentes e ledger.
 * Valores em centavos de BRL para evitar erro de ponto flutuante.
 */

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  tagline: string;
  priceCents: number;
  monthlyCredits: number;
  maxBrands: number;
  features: string[];
  /** Recursos exclusivos, usados para bloquear na UI/API. */
  includes: { csvImport: boolean; ga4Webhook: boolean; approvalLinks: boolean };
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  essential: {
    tier: "essential",
    name: "Essencial",
    tagline: "Para validar o orgânico com previsibilidade.",
    priceCents: 4990,
    monthlyCredits: 120,
    maxBrands: 1,
    includes: { csvImport: false, ga4Webhook: false, approvalLinks: false },
    features: [
      "1 marca e 120 créditos/mês",
      "Roteiros, carrosséis tipográficos e análise SERP",
      "Exportação em 1 clique (PNG, Markdown, JSON-LD)",
      "Loop de aprendizado por Thompson Sampling",
    ],
  },
  pro: {
    tier: "pro",
    name: "Crescimento Pro",
    tagline: "Para quem publica toda semana e mede tudo.",
    priceCents: 11990,
    monthlyCredits: 360,
    maxBrands: 3,
    includes: { csvImport: true, ga4Webhook: true, approvalLinks: false },
    features: [
      "3 marcas e 360 créditos/mês",
      "Importação CSV e webhook GA4 de telemetria",
      "Carrosséis híbridos com imagem IA",
      "Artigos GEO com Schema.org completo",
    ],
  },
  agency: {
    tier: "agency",
    name: "Agência Escala",
    tagline: "Para operar vários clientes sem perder padrão.",
    priceCents: 26990,
    monthlyCredits: 1000,
    maxBrands: 10,
    includes: { csvImport: true, ga4Webhook: true, approvalLinks: true },
    features: [
      "10 marcas e 1.000 créditos/mês",
      "Links externos de aprovação (senha + expiração)",
      "Pack completo de Landing Page",
      "Prioridade de fila nas gerações longas",
    ],
  },
};

export const PLAN_ORDER: PlanTier[] = ["essential", "pro", "agency"];

/** Custo em créditos por tipo de ativo. Débito só após entrega validada. */
export const CREDIT_COSTS = {
  short_script_kit: 1,
  typo_carousel: 1,
  serp_analysis: 1,
  single_creative: 2,
  hybrid_carousel: 3,
  lp_copy: 3,
  geo_article: 5,
} as const satisfies Record<AssetType | "serp_analysis", number>;

export type CostSubject = keyof typeof CREDIT_COSTS;

export function creditCost(subject: CostSubject): number {
  return CREDIT_COSTS[subject];
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function planFor(tier: PlanTier): PlanDefinition {
  return PLANS[tier];
}

/** Estimativa de ativos por mês para o plano (transparência na UI). */
export function monthlyCapacity(tier: PlanTier): { asset: AssetType; count: number }[] {
  const credits = PLANS[tier].monthlyCredits;
  return [
    { asset: "short_script_kit", count: Math.floor(credits / CREDIT_COSTS.short_script_kit) },
    { asset: "single_creative", count: Math.floor(credits / CREDIT_COSTS.single_creative) },
    { asset: "geo_article", count: Math.floor(credits / CREDIT_COSTS.geo_article) },
  ];
}
