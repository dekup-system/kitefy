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
    name: "Kitefy Start",
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
    name: "Kitefy Lift",
    tagline: "Para quem publica toda semana e mede tudo.",
    priceCents: 13990,
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
    name: "Kitefy Flow",
    tagline: "Para operar vários clientes sem perder padrão.",
    priceCents: 29990,
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

/** Preset do Carrossel Ilustrado (quantidade de slides e imagens geradas por IA). */
export type HybridCarouselPreset = "5_slides_2_ai" | "7_slides_3_ai";

/** Custo em créditos por tipo de ativo. Débito atômico no início com estorno automático em erro técnico. */
export const CREDIT_COSTS = {
  short_script_kit: 1,
  typo_carousel: 1,
  serp_analysis: 1,
  single_creative: 2,
  hybrid_carousel: 4,
  lp_copy: 3,
  geo_article: 5,
} as const satisfies Record<AssetType | "serp_analysis", number>;

export type CostSubject = keyof typeof CREDIT_COSTS;

export function creditCost(subject: CostSubject): number {
  return CREDIT_COSTS[subject];
}

/**
 * Custo total de uma geração no estúdio.
 * - Carrossel ilustrado: 4 créditos (5 slides · 2 imagens IA) ou 6 créditos (7 slides · 3 imagens IA).
 * - Quando a pesquisa de mercado (SERP) é ativada em formatos que não são
 *   artigos GEO (o artigo GEO já embute SERP nos seus 5 créditos), soma +1 crédito.
 */
export function totalRunCreditCost(
  assetType: AssetType,
  researchEnabled = false,
  carouselPreset?: HybridCarouselPreset,
): number {
  const base = CREDIT_COSTS[assetType];
  const extraCarousel =
    assetType === "hybrid_carousel" && carouselPreset === "7_slides_3_ai" ? 2 : 0;
  const extraSerp = researchEnabled && assetType !== "geo_article" ? CREDIT_COSTS.serp_analysis : 0;
  return base + extraCarousel + extraSerp;
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
