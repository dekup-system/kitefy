import { generateText } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/models";
import { parseJsonObject } from "@/lib/ai/generate";
import { getServerEnv, isMockMode } from "@/lib/env";
import { searchWithCache } from "@/lib/serp/client";
import { crawlBrandSite } from "@/lib/crawl/site";
import { formatTargetRegions } from "@/lib/brand/regions";
import type { EntityFact, ToneOfVoice } from "@/types/domain";

/**
 * Descoberta de concorrentes diretos por marca + regiões de atuação no Brasil
 * e Agente de IA interno para análise comparativa + geração de conceitos aplicáveis.
 */

export interface DirectCompetitorCandidate {
  name: string;
  url: string;
  domain: string;
  snippet: string;
  regionLabel: string;
}

export interface CompetitorComparisonRow {
  dimension: string;
  competitorApproach: string;
  brandAdvantage: string;
}

export interface CompetitorCreativeConcept {
  title: string;
  angle: string;
  assetType: "typo_carousel" | "hybrid_carousel" | "short_script_kit" | "single_creative" | "geo_article";
  objective: string;
  productInput: string;
  rationale: string;
}

export interface DirectCompetitorAiReport {
  competitorName: string;
  competitorUrl: string;
  regionLabel: string;
  summary: string;
  comparison: CompetitorComparisonRow[];
  creativeConcepts: CompetitorCreativeConcept[];
  generatedAt: string;
}

const IGNORED_DOMAINS = new Set([
  "wikipedia.org",
  "pt.wikipedia.org",
  "youtube.com",
  "gov.br",
  "reclameaqui.com.br",
  "jusbrasil.com.br",
  "mercadolivre.com.br",
  "amazon.com.br",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
]);

function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export async function discoverDirectCompetitors(input: {
  brandName: string;
  websiteUrl?: string | null;
  icpDescription?: string | null;
  entityFacts?: EntityFact[];
  targetRegions?: string[];
}): Promise<DirectCompetitorCandidate[]> {
  const regionLabel = formatTargetRegions(input.targetRegions);
  const ownDomain = input.websiteUrl ? extractDomain(input.websiteUrl) : "";

  const nicheTerm =
    input.entityFacts?.[0]?.claim?.slice(0, 60) ||
    input.icpDescription?.slice(0, 60) ||
    input.brandName;

  const regionQuery =
    regionLabel === "Todo o Brasil" ? "Brasil" : `região ${regionLabel} Brasil`;

  const query = `${nicheTerm} empresas concorrentes ${regionQuery}`.trim().slice(0, 180);

  const serp = await searchWithCache({
    query,
    locale: "pt-BR",
    num: 10,
  });

  const seenDomains = new Set<string>();
  const candidates: DirectCompetitorCandidate[] = [];

  for (const gap of serp.competitor_gaps) {
    const domain = extractDomain(gap.url);
    if (!domain || domain === ownDomain) continue;
    if (seenDomains.has(domain)) continue;
    if ([...IGNORED_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`))) continue;

    seenDomains.add(domain);
    const cleanTitle = gap.title.split(/\s*[|•·—–-]\s*/)[0]?.trim() || domain;
    candidates.push({
      name: cleanTitle.slice(0, 80),
      url: gap.url,
      domain,
      snippet: gap.title.slice(0, 180),
      regionLabel,
    });
    if (candidates.length >= 6) break;
  }

  return candidates;
}

const aiReportSchema = z.object({
  summary: z.string().min(20).max(500),
  comparison: z
    .array(
      z.object({
        dimension: z.string().min(3).max(80),
        competitorApproach: z.string().min(8).max(260),
        brandAdvantage: z.string().min(8).max(260),
      }),
    )
    .min(3)
    .max(5),
  creativeConcepts: z
    .array(
      z.object({
        title: z.string().min(6).max(110),
        angle: z.string().min(4).max(90),
        assetType: z.enum([
          "typo_carousel",
          "hybrid_carousel",
          "short_script_kit",
          "single_creative",
          "geo_article",
        ]),
        objective: z.string().min(12).max(260),
        productInput: z.string().min(4).max(180),
        rationale: z.string().min(10).max(260),
      }),
    )
    .min(2)
    .max(4),
});

function buildDeterministicReport(input: {
  brandName: string;
  brandUvp: string;
  brandFacts: string[];
  competitorName: string;
  competitorUrl: string;
  competitorTopics: string[];
  regionLabel: string;
}): DirectCompetitorAiReport {
  const topTopic = input.competitorTopics[0] || "posicionamento digital e oferta principal";
  const mainFact = input.brandFacts[0] || input.brandUvp || `solução principal de ${input.brandName}`;

  return {
    competitorName: input.competitorName,
    competitorUrl: input.competitorUrl,
    regionLabel: input.regionLabel,
    summary: `${input.competitorName} concentra sua comunicação em "${topTopic}" atuando em ${input.regionLabel}. ${input.brandName} pode se destacar explorando clareza prática e seus diferenciais próprios (${mainFact}).`,
    comparison: [
      {
        dimension: "Proposta de valor",
        competitorApproach: `Destaca "${topTopic}" de forma institucional e ampla.`,
        brandAdvantage: `${input.brandName} pode ancorar a promessa diretamente em: ${mainFact}.`,
      },
      {
        dimension: "Prova e especificidade",
        competitorApproach: "Comunicação focada em atributos gerais da categoria.",
        brandAdvantage: "Usar termos próprios, processo claro e exemplos concretos do público regional.",
      },
      {
        dimension: "Aderência regional",
        competitorApproach: "Mensagem padronizada sem conexão direta com a rotina local.",
        brandAdvantage: `Adaptar objeções e linguagem para clientes de ${input.regionLabel}.`,
      },
    ],
    creativeConcepts: [
      {
        title: `Contra-posicionamento: o que ${input.competitorName} não explica sobre ${topTopic}`,
        angle: "Mito vs. Verdade",
        assetType: "hybrid_carousel",
        objective: `Comparar de forma educativa a abordagem comum do mercado (${topTopic}) com o diferencial prático de ${input.brandName} para o público de ${input.regionLabel}`,
        productInput: mainFact.slice(0, 160),
        rationale: "Captura atenção de quem já pesquisou o concorrente e mostra por que o método da sua marca entrega mais clareza.",
      },
      {
        title: `Roteiro rápido: 3 critérios antes de contratar em ${input.regionLabel}`,
        angle: "Erro comum a evitar",
        assetType: "short_script_kit",
        objective: `Mostrar os 3 critérios práticos que o cliente em ${input.regionLabel} precisa conferir antes de escolher uma solução, destacando ${mainFact}`,
        productInput: mainFact.slice(0, 160),
        rationale: "Usa a mesma intenção de busca do concorrente, mas educa o decisor nos critérios onde sua marca vence.",
      },
      {
        title: `Guia definitivo (GEO): como escolher a melhor solução em ${input.regionLabel}`,
        angle: "Foco no resultado prático",
        assetType: "geo_article",
        objective: `Responder às dúvidas reais de quem pesquisa alternativas no segmento em ${input.regionLabel}, posicionando ${input.brandName} como referência citável no Google e em IAs`,
        productInput: mainFact.slice(0, 160),
        rationale: "Ataca diretamente o tráfego orgânico de fundo de funil onde o concorrente aparece.",
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export async function analyzeCompetitorWithAi(input: {
  brandName: string;
  icpDescription?: string | null;
  toneOfVoice?: ToneOfVoice | null;
  entityFacts?: EntityFact[];
  competitorUrl: string;
  competitorName: string;
}): Promise<DirectCompetitorAiReport> {
  const regionLabel = formatTargetRegions(input.toneOfVoice?.target_regions);
  const brandFacts = (input.entityFacts ?? []).map((f) => f.claim).filter(Boolean);
  const brandUvp = input.toneOfVoice?.uvp?.trim() || "";

  let competitorDescription = "";
  let competitorTopics: string[] = [];
  try {
    const crawled = await crawlBrandSite(input.competitorUrl, { budgetMs: 8_000, maxPages: 2 });
    competitorDescription = crawled.description;
    competitorTopics = crawled.topics;
  } catch {
    competitorDescription = "";
    competitorTopics = [];
  }

  if (isMockMode()) {
    return buildDeterministicReport({
      brandName: input.brandName,
      brandUvp,
      brandFacts,
      competitorName: input.competitorName,
      competitorUrl: input.competitorUrl,
      competitorTopics,
      regionLabel,
    });
  }

  try {
    const env = getServerEnv();
    const model = getLanguageModel(env.MODEL_ROUTER);

    const prompt = [
      "Você é um estrategista sênior de inteligência competitiva e direção criativa (Marketing Científico).",
      "Analise o concorrente abaixo e correlacione os textos criativos e posicionamento dele com o DNA da nossa marca e região de atuação.",
      "NUNCA sugira copiar o concorrente; transforme as lacunas e ângulos dele em conceitos criativos superiores e éticos (CONAR-compliant) para a nossa marca.",
      "",
      `NOSSA MARCA: ${input.brandName}`,
      `Região de atuação: ${regionLabel}`,
      `Público-alvo (ICP): ${input.icpDescription ?? "não informado"}`,
      `Proposta de valor (UVP): ${brandUvp || "não informada"}`,
      `Diferenciais próprios: ${brandFacts.join(" | ") || "não informados"}`,
      "",
      `CONCORRENTE ANALISADO: ${input.competitorName} (${input.competitorUrl})`,
      `Descrição lida do site: ${competitorDescription || "não disponível"}`,
      `Tópicos/títulos criativos encontrados: ${competitorTopics.join(" | ") || "não disponíveis"}`,
      "",
      "Responda APENAS com um objeto JSON válido seguindo exatamente:",
      JSON.stringify(
        {
          summary: "Resumo executivo comparativo (2 a 3 frases em PT-BR)",
          comparison: [
            {
              dimension: "Nome da dimensão (ex.: Proposta de Valor, Comunicação Criativa, Diferenciais, Aderência Regional)",
              competitorApproach: "Como o concorrente comunica/atua",
              brandAdvantage: "Como nossa marca vence ou se diferencia",
            },
          ],
          creativeConcepts: [
            {
              title: "Título do conceito criativo",
              angle: "Ângulo persuasivo (ex.: Mito vs. Verdade, Prova prática)",
              assetType: "hybrid_carousel | typo_carousel | short_script_kit | single_creative | geo_article",
              objective: "Objetivo editorial completo pronto para colar no estúdio (máx 240 chars)",
              productInput: "Serviço/diferencial da nossa marca a destacar no fechamento",
              rationale: "Por que este conceito supera a comunicação do concorrente",
            },
          ],
        },
        null,
        2,
      ),
    ].join("\n");

    const result = await generateText({
      model,
      prompt,
      temperature: 0.45,
      maxOutputTokens: 2000,
      maxRetries: 0,
    });

    const parsed = aiReportSchema.safeParse(parseJsonObject(result.text));
    if (!parsed.success) {
      return buildDeterministicReport({
        brandName: input.brandName,
        brandUvp,
        brandFacts,
        competitorName: input.competitorName,
        competitorUrl: input.competitorUrl,
        competitorTopics,
        regionLabel,
      });
    }

    return {
      competitorName: input.competitorName,
      competitorUrl: input.competitorUrl,
      regionLabel,
      summary: parsed.data.summary,
      comparison: parsed.data.comparison,
      creativeConcepts: parsed.data.creativeConcepts,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return buildDeterministicReport({
      brandName: input.brandName,
      brandUvp,
      brandFacts,
      competitorName: input.competitorName,
      competitorUrl: input.competitorUrl,
      competitorTopics,
      regionLabel,
    });
  }
}
