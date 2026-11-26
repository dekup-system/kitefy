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
    monthlyCredits: 800,
    maxBrands: 10,
    includes: { csvImport: true, ga4Webhook: true, approvalLinks: true },
    features: [
      "10 marcas e 800 créditos/mês",
      "Integração automática com Google Analytics 4 (GA4)",
      "Pack completo de Landing Page e Agenda semanal",
      "Prioridade de fila nas gerações longas",
    ],
  },
};

export const PLAN_ORDER: PlanTier[] = ["essential", "pro", "agency"];

/** Pacotes extras de créditos avulsos (Pix) para quando o saldo acabar antes da renovação. */
export type CreditTopUpPackId = "extra_50" | "extra_100";

export interface CreditTopUpPack {
  id: CreditTopUpPackId;
  name: string;
  credits: number;
  priceCents: number;
  tagline: string;
}

export const CREDIT_TOPUP_PACKS: Record<CreditTopUpPackId, CreditTopUpPack> = {
  extra_50: {
    id: "extra_50",
    name: "Pacote Extra +50 créditos",
    credits: 50,
    priceCents: 3000,
    tagline: "Recarga rápida para continuar produzindo sem esperar a renovação.",
  },
  extra_100: {
    id: "extra_100",
    name: "Pacote Extra +100 créditos",
    credits: 100,
    priceCents: 5000,
    tagline: "Melhor custo por crédito avulso (R$ 0,50/crédito) para picos de campanha.",
  },
};

export const CREDIT_TOPUP_ORDER: CreditTopUpPackId[] = ["extra_50", "extra_100"];

/** Preset do Carrossel Ilustrado (quantidade de slides e imagens geradas por IA). */
export type HybridCarouselPreset = "5_slides_2_ai" | "7_slides_3_ai";

/** Custo em créditos por tipo de ativo. Débito atômico no início com estorno automático em erro técnico. */
export const CREDIT_COSTS = {
  short_script_kit: 1,
  typo_carousel: 1,
  serp_analysis: 1,
  brand_analysis: 2,
  single_creative: 2,
  hybrid_carousel: 4,
  lp_copy: 3,
  geo_article: 5,
} as const satisfies Record<AssetType | "serp_analysis" | "brand_analysis", number>;

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
