import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { clamp, slugify, truncate } from "@/lib/utils";
import type { SerpInsights } from "@/types/domain";

import type { SerpProvider, SerpProviderId, SerpSearchInput } from "./types";

export type { SerpProvider, SerpProviderId, SerpSearchInput } from "./types";

const logger = createLogger("serp");

const SERPER_ENDPOINT = "https://google.serper.dev/search";
const SERPER_TIMEOUT_MS = 12_000;
/** TTL padrão do cache em memória: 15 minutos. */
export const SERP_CACHE_TTL_MS = 15 * 60 * 1000;

const MAX_COMPETITORS = 5;
const MAX_MISSING_TOPICS = 5;
const MAX_RECENT_FACTS = 3;

// ---------------------------------------------------------------------------
// Utilidades determinísticas
// ---------------------------------------------------------------------------

/** FNV-1a 32 bits: estável entre processos e suficiente para variar o mock. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Acesso circular seguro a listas literais (noUncheckedIndexedAccess). */
function pick<T>(items: readonly T[], index: number): T {
  const normalized = ((index % items.length) + items.length) % items.length;
  const value = items[normalized];
  if (value === undefined) {
    throw new Error("Catálogo do provedor mock vazio: configuração interna inválida.");
  }
  return value;
}

function capitalize(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "entre",
  "essa",
  "esse",
  "eu",
  "foi",
  "mais",
  "mas",
  "meu",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "pela",
  "pelo",
  "por",
  "qual",
  "que",
  "quem",
  "se",
  "sem",
  "sua",
  "tem",
  "um",
  "uma",
  "voce",
]);

function significantTokens(text: string): string[] {
  return normalizeWords(text).filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Tópicos ausentes = perguntas do PAA (e buscas relacionadas) cujos termos
 * relevantes não aparecem no título nem no snippet do concorrente.
 */
function computeMissingTopics(
  title: string,
  snippet: string,
  candidates: readonly string[],
): string[] {
  const covered = new Set(significantTokens(`${title} ${snippet}`));
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const topic = candidate.trim();
    if (topic.length === 0) continue;
    const tokens = significantTokens(topic);
    if (tokens.length === 0) continue;
    const isCovered = tokens.every((token) => covered.has(token));
    if (isCovered) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    missing.push(truncate(topic, 90));
    if (missing.length >= MAX_MISSING_TOPICS) break;
  }

  return missing;
}

function localeToSerper(locale: string): { gl: string; hl: string } {
  const parts = locale.trim().toLowerCase().split(/[-_]/);
  const language = parts[0] ?? "";
  const region = parts[1] ?? "";
  return {
    gl: /^[a-z]{2}$/.test(region) ? region : "br",
    hl: /^[a-z]{2}$/.test(language) ? language : "pt",
  };
}

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isTimeoutError(error: unknown): boolean {
  const name = errorName(error);
  return name === "AbortError" || name === "TimeoutError";
}

// ---------------------------------------------------------------------------
// Mock determinístico (PT-BR)
// ---------------------------------------------------------------------------

/**
 * O mock é determinístico por contrato: `fetched_at` também deriva do hash da
 * consulta, nunca do relógio. Isso permite comparar duas execuções com deep
 * equal em testes e em ambientes offline.
 */
const MOCK_EPOCH_MS = Date.UTC(2026, 0, 1, 12, 0, 0);
const MOCK_DAY_MS = 86_400_000;

const MOCK_QUESTION_TEMPLATES: readonly ((query: string) => string)[] = [
  (query) => `O que é ${query} e como funciona na prática?`,
  (query) => `Como aplicar ${query} em uma pequena empresa?`,
  (query) => `Quanto custa investir em ${query} em 2026?`,
  (query) => `${capitalize(query)} vale a pena para marcas locais?`,
  (query) => `Quais erros evitar ao estruturar ${query}?`,
];

const MOCK_ANSWERS: readonly string[] = [
  "A definição varia por mercado; o consenso é medir resultado por objetivo de negócio, não por volume isolado.",
  "Comece com um diagnóstico de base, defina uma métrica principal e revise o plano a cada trimestre.",
  "O custo depende do escopo, do nível de personalização e do volume de conteúdo produzido por mês.",
  "Vale a pena quando existe demanda de busca recorrente e capacidade interna de manter a execução.",
  "Os erros mais comuns são copiar concorrentes sem contexto, ignorar dados primários e abandonar a medição cedo.",
];

const MOCK_COMPETITOR_DOMAINS: readonly string[] = [
  "https://www.agenciaexemplo.com.br",
  "https://www.consultoriaexemplo.com.br",
  "https://www.portalexemplo.com.br",
  "https://www.mercadoexemplo.com.br",
];

const MOCK_COMPETITOR_ANGLES: readonly string[] = [
  "guia definitivo",
  "checklist para iniciantes",
  "comparativo de ferramentas",
  "estudo de caso brasileiro",
];

const MOCK_TOPICS: readonly string[] = [
  "preço médio no Brasil",
  "prazo de implementação",
  "métricas de sucesso",
  "comparativo com concorrentes",
  "requisitos técnicos",
  "erros mais comuns",
];

const MOCK_FACTS: readonly ((query: string) => string)[] = [
  (query) =>
    `O volume de buscas por ${query} cresceu 38% no Brasil em 2025, segundo levantamento setorial.`,
  (query) =>
    `Pequenas e médias empresas respondem por 61% dos projetos de ${query} iniciados no último ano.`,
  (query) =>
    `Profissionais de marketing citam ${query} entre as três prioridades de investimento para 2026.`,
];

const MOCK_FACT_SOURCES: readonly string[] = [
  "https://www.gov.br/mcom/pt-br/noticias",
  "https://www.sebrae.com.br/sites/PortalSebrae/artigos",
  "https://www.ibge.gov.br/estatisticas/economicas",
];

class MockSerpProvider implements SerpProvider {
  readonly id = "mock" as const;

  async search(input: SerpSearchInput): Promise<SerpInsights> {
    const query = input.query.trim() || "conteúdo orgânico";
    // Determinismo baseado apenas na query: locale/num não mudam o conteúdo.
    const hash = fnv1a(query);
    const slug = slugify(query) || "conteudo-organico";
    const fetchedAt = new Date(MOCK_EPOCH_MS + (hash % 21) * MOCK_DAY_MS).toISOString();

    const peopleAlsoAsk = MOCK_QUESTION_TEMPLATES.map((template, index) => ({
      question: template(query),
      answer: pick(MOCK_ANSWERS, hash + index),
    }));

    const competitorGaps = [0, 1, 2].map((index) => {
      const domain = pick(MOCK_COMPETITOR_DOMAINS, hash + index);
      const angle = pick(MOCK_COMPETITOR_ANGLES, hash + index * 2);
      const missingTopics = [
        pick(MOCK_TOPICS, hash + index * 3),
        pick(MOCK_TOPICS, hash + index * 3 + 1),
      ];
      return {
        url: `${domain}/${slug}`,
        title: `${capitalize(query)}: ${angle}`,
        missing_topics: missingTopics,
      };
    });

    const recentFacts = [0, 1, 2].map((index) => {
      const claim = pick(MOCK_FACTS, hash + index)(query);
      const sourceUrl = pick(MOCK_FACT_SOURCES, hash + index);
      const publishedAt = new Date(
        MOCK_EPOCH_MS - (3 + ((hash + index * 5) % 25)) * MOCK_DAY_MS,
      ).toISOString();
      return { claim, source_url: sourceUrl, published_at: publishedAt };
    });

    return {
      provider: "mock",
      query,
      fetched_at: fetchedAt,
      people_also_ask: peopleAlsoAsk,
      competitor_gaps: competitorGaps,
      recent_facts: recentFacts,
    };
  }
}

// ---------------------------------------------------------------------------
// Serper
// ---------------------------------------------------------------------------

const serperOrganicItemSchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  snippet: z.string().optional(),
  position: z.number().optional(),
});

const serperPeopleAlsoAskSchema = z.object({
  question: z.string(),
  snippet: z.string().optional(),
  link: z.string().optional(),
});

const serperRelatedSearchSchema = z.object({
  query: z.string(),
});

const serperResponseSchema = z.object({
  organic: z.array(serperOrganicItemSchema).optional(),
  peopleAlsoAsk: z.array(serperPeopleAlsoAskSchema).optional(),
  relatedSearches: z.array(serperRelatedSearchSchema).optional(),
});

class SerperProvider implements SerpProvider {
  readonly id = "serper" as const;

  async search(input: SerpSearchInput): Promise<SerpInsights> {
    const query = input.query.trim();
    if (query.length === 0) {
      throw new Error("Busca SERP inválida: informe uma query com pelo menos um caractere.");
    }

    const apiKey = getServerEnv().SERPER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "SERP_PROVIDER=serper exige SERPER_API_KEY. Defina a variável ou use SERP_PROVIDER=mock.",
      );
    }

    const { gl, hl } = localeToSerper(input.locale);
    const requestedNum = Number.isFinite(input.num) ? input.num : 10;
    const num = clamp(Math.trunc(requestedNum), 1, 100);

    let response: Response;
    try {
      response = await fetch(SERPER_ENDPOINT, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num, gl, hl }),
        signal: AbortSignal.timeout(SERPER_TIMEOUT_MS),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new Error(
          `Serper excedeu o tempo limite de ${SERPER_TIMEOUT_MS / 1000}s. Tente novamente ou use SERP_PROVIDER=mock.`,
        );
      }
      throw new Error(
        `Falha de rede ao consultar o Serper: ${truncate(errorMessage(error), 160)}. Verifique conectividade e a cota do provedor.`,
      );
    }

    if (!response.ok) {
      const rawDetail = await response.text().catch(() => "");
      // Defesa em profundidade: nenhuma mensagem de erro pode conter a chave.
      const detail = truncate(rawDetail.split(apiKey).join("[redacted]").trim(), 160);
      throw new Error(
        `Serper respondeu HTTP ${response.status}${detail ? `: ${detail}` : ""}. Verifique SERPER_API_KEY, cota e parâmetros da consulta.`,
      );
    }

    const json: unknown = await response.json().catch(() => null);
    const parsed = serperResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        "Resposta do Serper em formato inesperado: não foi possível mapear organic/peopleAlsoAsk.",
      );
    }

    const organic = parsed.data.organic ?? [];
    const peopleAlsoAsk = (parsed.data.peopleAlsoAsk ?? [])
      .filter((item) => item.question.trim().length > 0)
      .map((item) => {
        const answer = item.snippet?.trim();
        return answer ? { question: item.question.trim(), answer } : { question: item.question.trim() };
      });
    const relatedQueries = (parsed.data.relatedSearches ?? [])
      .map((item) => item.query.trim())
      .filter((item) => item.length > 0);

    // O contrato SerpInsights não possui campo de buscas relacionadas; elas são
    // incorporadas aos gaps como tópicos que o concorrente não cobre.
    const gapCandidates = [...peopleAlsoAsk.map((item) => item.question), ...relatedQueries];

    const competitorGaps = organic.slice(0, MAX_COMPETITORS).map((item) => ({
      url: item.link ?? "",
      title: item.title?.trim() || item.link || "Resultado sem título",
      missing_topics: computeMissingTopics(item.title ?? "", item.snippet ?? "", gapCandidates),
    }));

    const recentFacts = organic
      .filter((item) => (item.snippet?.trim().length ?? 0) > 0 && (item.link?.length ?? 0) > 0)
      .slice(0, MAX_RECENT_FACTS)
      .map((item) => ({
        claim: truncate(item.snippet?.trim() ?? "", 240),
        source_url: item.link ?? "",
      }));

    const result: SerpInsights = {
      provider: "serper",
      query,
      fetched_at: new Date().toISOString(),
      people_also_ask: peopleAlsoAsk,
      competitor_gaps: competitorGaps,
      recent_facts: recentFacts,
    };

    logger.info("busca serper concluída", {
      query,
      organic: organic.length,
      people_also_ask: peopleAlsoAsk.length,
      gaps: competitorGaps.length,
    });

    return result;
  }
}

// ---------------------------------------------------------------------------
// Gemini Grounding (adaptador sem inventar API)
// ---------------------------------------------------------------------------

/**
 * O grounding real pertence ao módulo de LLM (outro dono no projeto). Este
 * adaptador mantém o contrato e falha de forma explícita, sem chamadas de rede
 * silenciosas nem resultados fabricados.
 */
class GeminiGroundingProvider implements SerpProvider {
  readonly id = "gemini_grounding" as const;

  async search(input: SerpSearchInput): Promise<SerpInsights> {
    const env = getServerEnv();
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error(
        "gemini_grounding exige GOOGLE_GENERATIVE_AI_API_KEY. Defina a chave ou use SERP_PROVIDER=serper/mock.",
      );
    }

    logger.warn("gemini_grounding indisponível neste adaptador", { query: input.query });
    throw new Error(
      "gemini_grounding não é executado por este adaptador de SERP: o grounding é responsabilidade do módulo de LLM. Use SERP_PROVIDER=serper ou mock.",
    );
  }
}

// ---------------------------------------------------------------------------
// Fábrica e cache
// ---------------------------------------------------------------------------

export function createSerpProvider(): SerpProvider {
  const env = getServerEnv();
  switch (env.SERP_PROVIDER) {
    case "serper":
      return new SerperProvider();
    case "gemini_grounding":
      return new GeminiGroundingProvider();
    case "mock":
      return new MockSerpProvider();
    default: {
      const exhaustive: never = env.SERP_PROVIDER;
      throw new Error(`SERP_PROVIDER inválido: ${String(exhaustive)}.`);
    }
  }
}

interface SerpCacheEntry {
  expiresAt: number;
  result: SerpInsights;
}

const cache = new Map<string, SerpCacheEntry>();
let defaultProvider: SerpProvider | null = null;

function getDefaultProvider(): SerpProvider {
  defaultProvider ??= createSerpProvider();
  return defaultProvider;
}

function cacheKey(provider: SerpProviderId, input: SerpSearchInput): string {
  return [
    provider,
    input.query.trim().toLowerCase(),
    input.locale.trim().toLowerCase(),
    String(Math.trunc(input.num)),
  ].join("|");
}

/**
 * Busca com cache em memória por consulta (provider + query + locale + num).
 * O cache evita gastar cota do Serper em chamadas repetidas do grafo.
 */
export async function searchWithProviderCache(
  provider: SerpProvider,
  input: SerpSearchInput,
  ttlMs: number = SERP_CACHE_TTL_MS,
): Promise<SerpInsights> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    return provider.search(input);
  }

  const key = cacheKey(provider.id, input);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    logger.debug("cache de SERP reutilizado", { provider: provider.id, query: input.query });
    return hit.result;
  }

  const result = await provider.search(input);
  cache.set(key, { result, expiresAt: now + ttlMs });
  return result;
}

/** Atalho com o provedor configurado por `SERP_PROVIDER`. */
export async function searchWithCache(
  input: SerpSearchInput,
  ttlMs: number = SERP_CACHE_TTL_MS,
): Promise<SerpInsights> {
  return searchWithProviderCache(getDefaultProvider(), input, ttlMs);
}

/** Só para testes: limpa cache e provedor padrão (permite trocar o env). */
export function resetSerpCache(): void {
  cache.clear();
  defaultProvider = null;
}
