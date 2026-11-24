import type { AssetType, ContentPayload, PlanTier } from "@/types/domain";

/**
 * Funções puras e determinísticas de inteligência de workspace.
 * Usam exclusivamente dados reais já persistidos no banco — zero métricas simuladas.
 */

export const PACKAGE_NAME_BY_TIER: Record<PlanTier, string> = {
  essential: "Kitefy Start",
  pro: "Kitefy Lift",
  agency: "Kitefy Flow",
};

export function packageDisplayName(tier: PlanTier): string {
  return PACKAGE_NAME_BY_TIER[tier] ?? "Kitefy Start";
}

export interface BrandCompletenessInput {
  id: string;
  brand_name: string;
  website_url?: string | null;
  icp_description?: string | null;
  tone_of_voice?: {
    archetype?: string;
    descriptors?: string[];
    avoid?: string[];
    reading_level?: string;
    exemplars?: string[];
    formality?: string;
    energy?: string;
  } | null;
  visual_tokens?: { logo_path?: string; primary?: string; accent?: string } | null;
  entity_facts?: { claim: string; source_url?: string | null }[] | null;
  google_verification_token?: string | null;
}

export interface BrandCompletenessItem {
  key: string;
  label: string;
  done: boolean;
  href: string;
  weight: number;
}

export interface BrandCompletenessResult {
  score: number;
  items: BrandCompletenessItem[];
  missing: BrandCompletenessItem[];
}

export function computeBrandCompleteness(brand: BrandCompletenessInput): BrandCompletenessResult {
  const brandHref = `/settings/brand?brand=${brand.id}`;
  const googleHref = `/google?brand=${brand.id}`;
  const verifiedFacts = (brand.entity_facts ?? []).filter(
    (fact) => Boolean(fact.claim?.trim()) && Boolean(fact.source_url?.trim()),
  );

  const items: BrandCompletenessItem[] = [
    {
      key: "icp",
      label: "Público-alvo (ICP) definido",
      done: Boolean(brand.icp_description && brand.icp_description.trim().length >= 12),
      href: brandHref,
      weight: 20,
    },
    {
      key: "website",
      label: "Site oficial informado",
      done: Boolean(brand.website_url && brand.website_url.trim().length >= 8),
      href: brandHref,
      weight: 15,
    },
    {
      key: "logo",
      label: "Logomarca enviada no cofre privado",
      done: Boolean(brand.visual_tokens?.logo_path),
      href: brandHref,
      weight: 20,
    },
    {
      key: "voice",
      label: "Tom de voz configurado",
      done: Boolean(
        brand.tone_of_voice?.archetype?.trim() ||
          (brand.tone_of_voice?.descriptors && brand.tone_of_voice.descriptors.length > 0) ||
          (brand.tone_of_voice?.avoid && brand.tone_of_voice.avoid.length > 0) ||
          brand.tone_of_voice?.reading_level?.trim() ||
          (brand.tone_of_voice?.exemplars && brand.tone_of_voice.exemplars.length > 0) ||
          brand.tone_of_voice?.formality ||
          brand.tone_of_voice?.energy,
      ),
      href: brandHref,
      weight: 15,
    },
    {
      key: "facts",
      label: "Fatos verificáveis com fonte (GEO)",
      done: verifiedFacts.length > 0,
      href: brandHref,
      weight: 15,
    },
    {
      key: "google",
      label: "Token do Google Search Console salvo",
      done: Boolean(brand.google_verification_token && brand.google_verification_token.trim().length > 0),
      href: googleHref,
      weight: 15,
    },
  ];

  const score = items.reduce((acc, item) => acc + (item.done ? item.weight : 0), 0);
  return {
    score,
    items,
    missing: items.filter((item) => !item.done),
  };
}

export interface NextBestActionInput {
  brandCount: number;
  primaryBrandId?: string;
  primaryBrandName?: string;
  brandCompletenessScore?: number;
  pendingApprovalCount: number;
  firstPendingThreadId?: string;
  totalAssets: number;
  telemetryCount: number;
  creditBalance: number;
}

export interface NextBestAction {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  tone: "signal" | "navy" | "warning";
}

export function resolveNextBestAction(input: NextBestActionInput): NextBestAction {
  if (input.brandCount === 0) {
    return {
      eyebrow: "Passo 1 · Comece por aqui",
      title: "Cadastre sua primeira marca em 90 segundos",
      description:
        "Cole o endereço do seu site para extrair tom de voz, público e identidade antes de gerar seu primeiro conteúdo.",
      ctaLabel: "Configurar marca",
      href: "/onboarding",
      tone: "signal",
    };
  }

  if (input.pendingApprovalCount > 0 && input.firstPendingThreadId) {
    return {
      eyebrow: "Revisão pendente",
      title:
        input.pendingApprovalCount === 1
          ? "1 conteúdo pronto para sua aprovação"
          : `${input.pendingApprovalCount} conteúdos prontos para aprovação`,
      description:
        "Revise os ganchos, confira as imagens e aprove para liberar o download. Créditos só são debitados na aprovação.",
      ctaLabel: "Revisar agora",
      href: `/studio/${input.firstPendingThreadId}`,
      tone: "signal",
    };
  }

  if (input.creditBalance <= 2) {
    return {
      eyebrow: "Saldo baixo",
      title: `Você tem ${input.creditBalance} crédito${input.creditBalance === 1 ? "" : "s"} restante${input.creditBalance === 1 ? "" : "s"}`,
      description:
        "Renove seu pacote ou faça upgrade para continuar gerando roteiros, carrosséis e artigos GEO sem pausa.",
      ctaLabel: "Ver pacotes",
      href: "/settings/billing",
      tone: "warning",
    };
  }

  if (input.totalAssets === 0) {
    return {
      eyebrow: "Primeiro resultado",
      title: "Gere seu primeiro conteúdo no padrão da marca",
      description:
        "Um carrossel pronto ou roteiro com 3 ganchos A/B custa 1 crédito e sai em menos de 1 minuto.",
      ctaLabel: "Criar primeiro conteúdo",
      href: "/studio/new",
      tone: "signal",
    };
  }

  if (
    typeof input.brandCompletenessScore === "number" &&
    input.brandCompletenessScore < 70 &&
    input.primaryBrandId
  ) {
    return {
      eyebrow: `Saúde da marca · ${input.brandCompletenessScore}%`,
      title: `Complete o perfil de ${input.primaryBrandName ?? "sua marca"}`,
      description:
        "Adicionar logomarca, fatos verificáveis com fonte e token do Google aumenta a precisão visual e as citações em buscas.",
      ctaLabel: "Completar perfil",
      href: `/settings/brand?brand=${input.primaryBrandId}`,
      tone: "navy",
    };
  }

  if (input.telemetryCount === 0) {
    return {
      eyebrow: "Ative o aprendizado",
      title: "Registre o resultado de um conteúdo publicado",
      description:
        "Com o primeiro registro de impressões ou marcação 'Bombou', o estúdio passa a priorizar suas aberturas vencedoras.",
      ctaLabel: "Registrar resultado",
      href: "/telemetry",
      tone: "navy",
    };
  }

  return {
    eyebrow: "Ritmo editorial",
    title: "Mantenha sua semana ativa com um novo conteúdo",
    description:
      "Escolha uma das ideias prontas abaixo ou crie um artigo GEO para ampliar sua presença no Google e em IAs.",
    ctaLabel: "Criar conteúdo",
    href: "/studio/new",
    tone: "navy",
  };
}

export interface ContentScoreCheck {
  label: string;
  passed: boolean;
  detail: string;
  points: number;
}

export interface ContentScoreResult {
  score: number;
  tier: "excelente" | "bom" | "revisar";
  checks: ContentScoreCheck[];
}

export function computeContentScore(input: {
  payload: ContentPayload | null;
  hookCount: number;
  visualCount: number;
  compliancePassed: boolean;
  complianceIssuesCount: number;
  hasJsonLd: boolean;
}): ContentScoreResult {
  const kind = input.payload?.kind ?? null;
  const needsVisuals =
    kind === "typo_carousel" || kind === "hybrid_carousel" || kind === "single_creative";

  const hasCaptionOrBody = (() => {
    if (!input.payload) return false;
    if (
      input.payload.kind === "short_script_kit" ||
      input.payload.kind === "typo_carousel" ||
      input.payload.kind === "hybrid_carousel" ||
      input.payload.kind === "single_creative"
    ) {
      return input.payload.caption.seo.trim().length >= 40;
    }
    if (input.payload.kind === "geo_article") {
      return input.payload.sections.length >= 3;
    }
    if (input.payload.kind === "lp_copy") {
      return Boolean(input.payload.hero.headline.trim());
    }
    return false;
  })();

  const checks: ContentScoreCheck[] = [
    {
      label: "Ganchos A/B disponíveis",
      passed: input.hookCount >= 2 || kind === "geo_article" || kind === "lp_copy",
      detail:
        input.hookCount >= 2
          ? `${input.hookCount} variações de abertura prontas para escolha`
          : kind === "geo_article" || kind === "lp_copy"
            ? "Estrutura editorial completa"
            : "Apenas 1 gancho disponível",
      points: 25,
    },
    {
      label: "Conformidade e tom de marca",
      passed: input.compliancePassed && input.complianceIssuesCount === 0,
      detail:
        input.compliancePassed && input.complianceIssuesCount === 0
          ? "Sem alertas de promessa exagerada ou termos proibidos"
          : `${input.complianceIssuesCount} ponto(s) para revisar antes de publicar`,
      points: 30,
    },
    {
      label: "Estrutura de texto e chamada",
      passed: hasCaptionOrBody,
      detail: hasCaptionOrBody
        ? "Legenda/seções com densidade pronta para leitura"
        : "Texto curto — vale revisar antes de exportar",
      points: 25,
    },
    {
      label: needsVisuals ? "Artes renderizadas" : "Dados estruturados (SEO/GEO)",
      passed: needsVisuals ? input.visualCount > 0 : input.hasJsonLd || kind === "short_script_kit",
      detail: needsVisuals
        ? input.visualCount > 0
          ? `${input.visualCount} imagem(ns) gerada(s) no padrão da marca`
          : "Nenhuma imagem renderizada ainda"
        : input.hasJsonLd
          ? "Schema.org JSON-LD validado pronto para colar"
          : "Pronto para gravação ou publicação direta",
      points: 20,
    },
  ];

  const score = checks.reduce((sum, c) => sum + (c.passed ? c.points : 0), 0);
  const tier = score >= 85 ? "excelente" : score >= 60 ? "bom" : "revisar";
  return { score, tier, checks };
}

export function buildPublishChecklist(assetType: AssetType): string[] {
  switch (assetType) {
    case "typo_carousel":
    case "hybrid_carousel":
      return [
        "Baixe o ZIP ou salve os slides em ordem numérica (01 a 10).",
        "Copie a legenda otimizada + hashtags em 1 clique.",
        "Confira o corte dos primeiros 125 caracteres antes do 'ver mais'.",
        "Após publicar, registre impressões em Resultados para treinar os próximos ganchos.",
      ];
    case "short_script_kit":
      return [
        "Escolha o gancho principal e grave os primeiros 3 segundos com corte rápido.",
        "Use o guia de cena para variar enquadramento a cada bloco.",
        "Copie a legenda pronta e publique como Reels, Shorts ou TikTok.",
        "Marque como 'Bombou' ou registre retenção de 3s em Resultados.",
      ];
    case "single_creative":
      return [
        "Baixe a imagem final em alta resolução (1080×1350 ou 1080×1920).",
        "Copie a legenda pronta com a chamada para ação.",
        "Publique no Feed ou Story e registre o resultado após 48h.",
      ];
    case "geo_article":
      return [
        "Copie o HTML ou Markdown pronto e publique no blog do seu site.",
        "Cole o bloco JSON-LD (Schema.org) no <head> ou fim do artigo.",
        "Atualize o sitemap pelo Pacote Google e peça indexação no Search Console.",
      ];
    case "lp_copy":
      return [
        "Revise a promessa do Hero e os dados de prova social com números reais.",
        "Conecte o botão principal ao seu WhatsApp ou link de checkout.",
        "Publique e acompanhe cliques/conversões no seu GA4.",
      ];
  }
}
