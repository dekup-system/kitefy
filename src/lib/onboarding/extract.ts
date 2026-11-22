import type { EntityFact, ToneOfVoice, VisualTokens } from "@/types/domain";
import { inferBrandSeed } from "@/lib/ai/mock-generator";
import { createSerpProvider } from "@/lib/serp/client";
import { crawlBrandSite, type SiteCrawlResult } from "@/lib/crawl/site";
import { createLogger } from "@/lib/logger";

/**
 * Onboarding em menos de 90 segundos, sem blank canvas.
 *
 * Entrada permitida: uma URL do site OU uma descrição livre do produto.
 * Saída: rascunho de marca pronto para revisar + primeiro ativo demonstrativo.
 *
 * Nunca faz crawl pesado nem exige configuração: o que não for inferível
 * fica como "a revisar" e a UI mostra isso explicitamente.
 */

const log = createLogger("onboarding.extract");

export interface BrandDraft {
  brand_name: string;
  website_url: string | null;
  icp_description: string;
  tone_of_voice: ToneOfVoice;
  visual_tokens: VisualTokens;
  entity_facts: EntityFact[];
  niche: string;
  confidence: "baixa" | "média" | "alta";
  needs_review: string[];
  /** Resultado da leitura do site (quando havia URL). */
  site_analysis: {
    pages_read: number;
    topics: string[];
    json_ld_types: string[];
    blocked_by_robots: boolean;
  } | null;
}

export interface NicheTemplate {
  id: string;
  label: string;
  description: string;
  example_input: string;
  tone: ToneOfVoice;
  visual_tokens: VisualTokens;
  icp_description: string;
  seed_facts: string[];
}

/** Três templates clicáveis exibidos no onboarding junto do campo único. */
export const NICHE_TEMPLATES: NicheTemplate[] = [
  {
    id: "saude",
    label: "Saúde e bem-estar",
    description: "Clínicas, consultórios e profissionais de saúde.",
    example_input: "Clínica de fisioterapia esportiva em São Paulo",
    tone: {
      archetype: "especialista acessível",
      descriptors: ["cuidadoso", "direto", "sem alarmismo"],
      avoid: ["promessa de cura", "linguagem técnica sem explicação", "antes e depois"],
      reading_level: "ensino médio",
      exemplars: ["Explicamos o porquê antes do como."],
    },
    visual_tokens: {
      primary: "#0f3d3e",
      secondary: "#e7f2f1",
      accent: "#1f7a6e",
      background: "#fbfdfc",
      foreground: "#12211f",
      theme: "light",
      radius: 16,
    },
    icp_description:
      "Adultos de 30 a 55 anos que buscam prevenção e melhora de desempenho, com pouco tempo e alta desconfiança de promessas.",
    seed_facts: [
      "Equipe multidisciplinar com atendimento presencial e teleorientação",
      "Protocolo próprio de avaliação em três etapas",
    ],
  },
  {
    id: "ecommerce",
    label: "E-commerce e produto físico",
    description: "Marcas de moda, casa, beleza e acessórios.",
    example_input: "Marca de tênis minimalistas feitos no Brasil",
    tone: {
      archetype: "curador confiável",
      descriptors: ["visual", "concreto", "sem hype"],
      avoid: ["superlativo vazio", "urgência fabricada", "promessa de transformação"],
      reading_level: "ensino médio",
      exemplars: ["Material, costura e prazo: o que muda no uso diário."],
    },
    visual_tokens: {
      primary: "#1a1a1a",
      secondary: "#f2efe9",
      accent: "#b08968",
      background: "#fdfcfb",
      foreground: "#171310",
      theme: "light",
      radius: 8,
    },
    icp_description:
      "Pessoas de 25 a 40 anos que compram menos e melhor, comparam material e durabilidade antes do preço.",
    seed_facts: [
      "Produção nacional com fornecedores auditados",
      "Troca gratuita em 30 dias",
    ],
  },
  {
    id: "b2b",
    label: "B2B e SaaS",
    description: "Software, consultorias e serviços para empresas.",
    example_input: "Plataforma de gestão de frotas para transportadoras",
    tone: {
      archetype: "parceiro técnico",
      descriptors: ["preciso", "pragmático", "com dado"],
      avoid: ["jargão de marketing", "promessa de ROI garantido", "case genérico"],
      reading_level: "superior",
      exemplars: ["O ganho aparece no fechamento do mês, não no dashboard."],
    },
    visual_tokens: {
      primary: "#1b1f2a",
      secondary: "#eef1f6",
      accent: "#3f5efb",
      background: "#fbfbfd",
      foreground: "#14161c",
      theme: "light",
      radius: 10,
    },
    icp_description:
      "Gestores de operações e marketing em empresas de 50 a 500 pessoas, cobrados por eficiência e previsibilidade.",
    seed_facts: [
      "Implantação assistida em até 30 dias",
      "Suporte em português com SLA definido",
    ],
  },
];

/**
 * Gera o rascunho da marca a partir do input do onboarding.
 * Tenta enriquecer com SERP (perguntas do público) — se falhar, segue adiante.
 */
export async function extractBrandDraft(
  input: string,
  templateId?: string,
): Promise<BrandDraft> {
  const seed = inferBrandSeed(input);
  const template = NICHE_TEMPLATES.find((item) => item.id === templateId);

  const needsReview: string[] = [];
  let icp = template?.icp_description ?? seed.icp_description;
  const facts: EntityFact[] = [];
  let confidence: BrandDraft["confidence"] = "média";

  if (template) {
    confidence = "alta";
    for (const claim of template.seed_facts) {
      facts.push({ claim, source_url: seed.website_url ?? undefined });
    }
  }

  // Enriquecimento opcional: perguntas reais do público (PAA).
  try {
    const provider = createSerpProvider();
    const insights = await provider.search({
      query: `${seed.brand_name} ${template?.label ?? ""} ${input}`.trim().slice(0, 180),
      locale: "pt-BR",
      num: 5,
    });

    const questions = insights.people_also_ask.slice(0, 3).map((item) => item.question);
    if (questions.length > 0) {
      icp = `${icp} Perguntas recorrentes do público: ${questions.join("; ")}.`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("Enriquecimento SERP indisponível no onboarding", { message });
    needsReview.push("Não foi possível consultar a busca agora; o público foi inferido do texto.");
  }

  // Leitura do site: transforma contexto declarado em contexto observado.
  let siteAnalysis: BrandDraft["site_analysis"] = null;
  let site: SiteCrawlResult | null = null;
  let brandName = seed.brand_name;

  if (seed.website_url) {
    try {
      site = await crawlBrandSite(seed.website_url, { budgetMs: 12_000 });
      siteAnalysis = {
        pages_read: site.pages.length,
        topics: site.topics.slice(0, 6),
        json_ld_types: site.json_ld_types,
        blocked_by_robots: site.blocked_by_robots,
      };

      if (site.brand_name) brandName = site.brand_name;

      if (site.description.length > 40) {
        icp = template
          ? `${site.description} ${template.icp_description}`
          : site.description;
      }

      if (site.facts.length > 0) {
        facts.length = 0;
        for (const fact of site.facts.slice(0, 5)) {
          facts.push({ claim: fact.claim, source_url: fact.source_url });
        }
        needsReview.push(
          `${facts.length} fato(s) extraído(s) do site — confirme cada afirmação antes de publicar.`,
        );
      }

      if (site.pages.length >= 2) confidence = "alta";
      if (site.blocked_by_robots) {
        needsReview.push("O robots.txt do site impede leitura automática; revise o contexto manualmente.");
      }
      for (const warning of site.warnings.slice(0, 2)) needsReview.push(warning);
    } catch (error) {
      needsReview.push(
        `Não foi possível ler o site (${error instanceof Error ? error.message : "falha"}). Contexto inferido do texto.`,
      );
    }
  }

  if (!seed.website_url) {
    needsReview.push("Sem site informado: adicione a URL para reforçar sinais de entidade (GEO).");
  }
  if (facts.length === 0) {
    needsReview.push("Nenhum fato verificável cadastrado: adicione números com fonte para artigos GEO.");
  }
  if (confidence !== "alta") {
    needsReview.push("Tom de voz inferido do texto. Revise os descritores em Configurações da marca.");
  }

  return {
    brand_name: brandName,
    website_url: seed.website_url,
    icp_description: icp,
    tone_of_voice: template?.tone ?? {
      archetype: "especialista acessível",
      descriptors: ["direto", "concreto"],
      avoid: ["promessa absoluta", "superlativo sem prova"],
      reading_level: "ensino médio",
      exemplars: [],
    },
    visual_tokens: template?.visual_tokens ?? {
      primary: "#1f1f23",
      secondary: "#f2f2f4",
      accent: "#3f3f46",
      background: "#fdfdfd",
      foreground: "#17171a",
      theme: "light",
      radius: 12,
    },
    entity_facts: facts,
    niche: template?.id ?? seed.niche,
    confidence,
    needs_review: needsReview,
    site_analysis: siteAnalysis,
  };
}

/** Sugestão de primeiro ativo para o onboarding (zero blank canvas). */
export function firstAssetSuggestion(niche: string): {
  assetType: "short_script_kit" | "typo_carousel" | "geo_article";
  objective: string;
  productInput: string;
  rationale: string;
} {
  switch (niche) {
    case "saude":
      return {
        assetType: "short_script_kit",
        objective: "Explicar o valor da avaliação preventiva em 45 segundos",
        productInput: "avaliação preventiva em três etapas",
        rationale: "Roteiro curto mostra o padrão de voz e é gravável hoje, sem avatar.",
      };
    case "ecommerce":
      return {
        assetType: "typo_carousel",
        objective: "Mostrar o que realmente diferencia o produto no uso diário",
        productInput: "produto principal da marca",
        rationale: "Carrossel tipográfico sai pronto em minutos e custa 1 crédito.",
      };
    case "b2b":
      return {
        assetType: "geo_article",
        objective: "Responder a pergunta que o comprador faz antes da demo",
        productInput: "principal dor operacional do cliente",
        rationale: "Artigo GEO é o ativo com maior chance de citação em respostas de IA.",
      };
    default:
      return {
        assetType: "short_script_kit",
        objective: "Explicar a promessa central da marca em 45 segundos",
        productInput: "principal oferta da marca",
        rationale: "Começar pelo roteiro valida o tom de voz antes de investir em artigos.",
      };
  }
}
