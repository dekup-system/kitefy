import { CREDIT_COSTS, PLANS, formatBRL } from "@/lib/pricing";
import type { PlanTier } from "@/types/domain";

/**
 * Pacotes comerciais da Kitefy.
 *
 * Os três pacotes são a tradução comercial dos planos de cobrança já existentes
 * (`PLANS`): preço, créditos e limite de marcas vêm de uma única fonte, então a
 * landing nunca promete algo que o checkout não entrega.
 */
export type PackageId = "start" | "lift" | "flow";

export interface KitefyPackage {
  id: PackageId;
  tier: PlanTier;
  name: string;
  kicker: string;
  promise: string;
  priceLabel: string;
  cadence: string;
  credits: number;
  brands: number;
  deliverables: string[];
  badge: string;
  badgeStyle: "start" | "signal" | "flow";
  ctaLabel: string;
  ctaStyle: "outline" | "primary" | "navy";
  highlighted: boolean;
}

const TIER_BY_PACKAGE: Record<PackageId, PlanTier> = {
  start: "essential",
  lift: "pro",
  flow: "agency",
};

function build(id: PackageId, base: Omit<KitefyPackage, "tier" | "priceLabel" | "credits" | "brands" | "cadence">): KitefyPackage {
  const tier = TIER_BY_PACKAGE[id];
  const plan = PLANS[tier];

  return {
    ...base,
    tier,
    priceLabel: formatBRL(plan.priceCents),
    cadence: "por mês",
    credits: plan.monthlyCredits,
    brands: plan.maxBrands,
  };
}

export const KITEFY_PACKAGES: KitefyPackage[] = [
  build("start", {
    id: "start",
    name: "Kitefy Start",
    kicker: "Diagnóstico & base",
    promise: "Descubra o que a sua marca já tem de bom e transforme em conteúdo publicável.",
    deliverables: [
      `${CREDIT_COSTS.short_script_kit} crédito por roteiro com 3 ganchos A/B`,
      `${CREDIT_COSTS.typo_carousel} crédito por carrossel tipográfico de 7 a 10 slides`,
      "Perfil de marca extraído da URL em menos de 90 segundos",
      "Exportação em PNG, Markdown, HTML e JSON-LD",
    ],
    badge: "Primeiro ativo no mesmo dia",
    badgeStyle: "start",
    ctaLabel: "Começar no Start",
    ctaStyle: "outline",
    highlighted: false,
  }),
  build("lift", {
    id: "lift",
    name: "Kitefy Lift",
    kicker: "Tração & alcance",
    promise: "Pare de publicar no escuro: ângulo vencedor escolhido por dado, não por opinião.",
    deliverables: [
      "Tudo do Start, com 3 marcas",
      "Carrosséis com ilustração e aviso de transparência",
      "Telemetria por CSV e webhook GA4 alimentando o Thompson Sampling",
      "Artigo GEO com Schema.org (Article + FAQPage + Product)",
    ],
    badge: "Mais escolhido",
    badgeStyle: "signal",
    ctaLabel: "Destravar meu perfil",
    ctaStyle: "primary",
    highlighted: true,
  }),
  build("flow", {
    id: "flow",
    name: "Kitefy Flow",
    kicker: "Consistência & escala",
    promise: "Operação de conteúdo com padrão de agência, sem a agência no meio do caminho.",
    deliverables: [
      "Tudo do Lift, com 10 marcas",
      "Links externos de aprovação (senha e expiração opcionais)",
      "Pack completo de landing page em 3 créditos",
      "Prioridade de fila nas gerações longas",
    ],
    badge: "Escala orgânica",
    badgeStyle: "flow",
    ctaLabel: "Escalar com o Flow",
    ctaStyle: "navy",
    highlighted: false,
  }),
];

export function packageById(id: PackageId): KitefyPackage {
  const found = KITEFY_PACKAGES.find((item) => item.id === id);
  if (!found) throw new Error(`Pacote desconhecido: ${id}`);
  return found;
}
