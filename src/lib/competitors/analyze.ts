/**
 * Análise de concorrentes (MVP).
 *
 * Compara os tópicos que os concorrentes cobrem com os que a marca cobre,
 * a partir do HTML público de cada site (sem JS, respeitando robots.txt).
 *
 * Não faz juízo de qualidade: aponta ausência de assunto. A leitura do HTML é
 * a mesma do onboarding (`crawlBrandSite`), com o mesmo bloqueio de SSRF.
 */

import { crawlBrandSite, type SiteCrawlResult } from "@/lib/crawl/site";

export interface CompetitorSnapshot {
  url: string;
  brand_name: string;
  topics: string[];
  description: string;
  json_ld_types: string[];
  pages_read: number;
  blocked_by_robots: boolean;
}

export interface TopicGap {
  topic: string;
  covered_by: string[];
}

export interface CompetitorAnalysis {
  brand: CompetitorSnapshot;
  competitors: CompetitorSnapshot[];
  /** Tópicos que os concorrentes cobrem e a marca não. */
  gaps: TopicGap[];
  /** Tópicos presentes nos dois lados. */
  shared: string[];
  warnings: string[];
}

const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "da", "do", "das", "dos", "em", "no", "na",
  "nos", "nas", "para", "pra", "por", "com", "sem", "que", "e", "ou", "se", "ao", "aos", "up", "hi",
  "the", "of", "and", "to", "for", "in", "on", "with", "is", "are", "your", "you",
]);

/** Normaliza para comparação: sem acento, sem pontuação, sem stopwords. */
export function normalizeTopic(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .join(" ");
}

/** Dois tópicos são o mesmo assunto quando um contém o outro ou há forte sobreposição. */
export function topicsMatch(a: string, b: string): boolean {
  const left = normalizeTopic(a);
  const right = normalizeTopic(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  // "check up" e "checkup" são o mesmo assunto escrito de dois jeitos.
  const compactLeft = left.replace(/\s+/g, "");
  const compactRight = right.replace(/\s+/g, "");
  if (compactLeft === compactRight) return true;
  if (compactLeft.includes(compactRight) || compactRight.includes(compactLeft)) return true;

  const leftTokens = new Set(left.split(" "));
  const rightTokens = right.split(" ");
  // Prefixo de 5 letras aproxima flexões/grafias: "checkup" ~ "check",
  // "preventiva" ~ "preventivo".
  const sameWord = (a: string, b: string): boolean => {
    if (a === b) return true;
    if (a.length < 5 || b.length < 5) return false;
    return a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5));
  };
  const hits = rightTokens.filter((token) =>
    [...leftTokens].some((leftToken) => sameWord(leftToken, token)),
  ).length;
  return rightTokens.length > 0 && hits / rightTokens.length >= 0.75;
}

/** Rótulos de preço, menu e botão não são assunto de conteúdo. */
const JUNK_TOPIC =
  /^(precos?|preços?|planos?|pricing|starter|standard|enterprise|basic|free|gratis|grátis|login|entrar|cadastro|contato|home|menu|blog|noticias|notícias)$/i;

/** Entidades HTML podem vir duas vezes ("&amp;#x27;"). */
function decodeOnce(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

function isTopicCandidate(input: string): boolean {
  const clean = decodeOnce(input).replace(/[.:;!?]+$/, "").trim();
  if (clean.length < 12 || clean.length > 90) return false;
  if (/^[\s$€R\d]/.test(clean)) return false;
  if (JUNK_TOPIC.test(clean)) return false;
  // Frase de marketing (pergunta, CTA, ponto final) não é assunto.
  if (/[?!]/.test(input)) return false;
  // CTA imperativo não é assunto ("Create your account", "Comece agora").
  if (
    /^(create|join|get|start|try|book|buy|sign|learn|discover|explore|download|watch|read|see|check|request|schedule|contact|subscribe|follow|crie|comece|começar|assine|baixe|conheça|agende|solicite|fale|inscreva|garanta|aproveite)\b/i.test(
      clean,
    )
  ) {
    return false;
  }
  const words = clean.split(/\s+/).length;
  return words >= 2 && words <= 9;
}

function dedupeTopics(topics: string[]): string[] {
  const kept: string[] = [];
  for (const topic of topics) {
    const clean = decodeOnce(topic).replace(/[.:;!?]+$/, "").trim();
    if (!isTopicCandidate(clean)) continue;
    if (kept.some((existing) => topicsMatch(existing, clean))) continue;
    kept.push(clean);
  }
  return kept;
}

function toSnapshot(result: SiteCrawlResult): CompetitorSnapshot {
  return {
    url: result.source_url,
    brand_name: result.brand_name,
    topics: dedupeTopics(result.topics),
    description: result.description,
    json_ld_types: result.json_ld_types,
    pages_read: result.pages.length,
    blocked_by_robots: result.blocked_by_robots,
  };
}

/**
 * Monta a matriz de lacunas.
 *
 * Só entram como lacuna tópicos que **algum concorrente** cobre: ausência de
 * assunto é objetiva; "qualidade" exigiria julgamento que o sistema não faz.
 */
export function buildGapMatrix(
  brand: CompetitorSnapshot,
  competitors: CompetitorSnapshot[],
): { gaps: TopicGap[]; shared: string[] } {
  const gapMap = new Map<string, string[]>();
  const shared: string[] = [];

  for (const competitor of competitors) {
    for (const topic of competitor.topics) {
      const brandCovers = brand.topics.some((own) => topicsMatch(own, topic));

      if (brandCovers) {
        if (!shared.some((item) => topicsMatch(item, topic))) shared.push(topic);
        continue;
      }

      const existingKey = [...gapMap.keys()].find((key) => topicsMatch(key, topic));
      if (existingKey) {
        gapMap.get(existingKey)?.push(competitor.brand_name || competitor.url);
      } else {
        gapMap.set(topic, [competitor.brand_name || competitor.url]);
      }
    }
  }

  const gaps: TopicGap[] = [...gapMap.entries()]
    .map(([topic, coveredBy]) => ({ topic, covered_by: [...new Set(coveredBy)] }))
    .sort((a, b) => b.covered_by.length - a.covered_by.length || a.topic.length - b.topic.length)
    .slice(0, 12);

  return { gaps, shared: shared.slice(0, 12) };
}

export interface AnalyzeCompetitorsInput {
  brandUrl: string;
  competitorUrls: string[];
  budgetMs?: number;
}

export async function analyzeCompetitors(
  input: AnalyzeCompetitorsInput,
): Promise<CompetitorAnalysis> {
  const warnings: string[] = [];
  const budgetMs = input.budgetMs ?? 8_000;

  const urls = input.competitorUrls
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .slice(0, 3);

  if (!input.brandUrl.trim()) {
    throw new Error("Informe o site da sua marca para comparar.");
  }
  if (urls.length === 0) {
    throw new Error("Informe ao menos um site concorrente.");
  }

  const [brandCrawl, ...competitorCrawls] = await Promise.all([
    crawlBrandSite(input.brandUrl, { budgetMs, maxPages: 3 }).catch((error: unknown) => {
      warnings.push(`Site da marca: ${error instanceof Error ? error.message : "falha na leitura"}`);
      return null;
    }),
    ...urls.map((url) =>
      crawlBrandSite(url, { budgetMs, maxPages: 3 }).catch((error: unknown) => {
        warnings.push(`${url}: ${error instanceof Error ? error.message : "falha na leitura"}`);
        return null;
      }),
    ),
  ]);

  if (!brandCrawl) throw new Error("Não foi possível ler o site da sua marca.");

  const competitorSnapshots = competitorCrawls
    .filter((crawl): crawl is SiteCrawlResult => crawl !== null)
    .map(toSnapshot)
    .filter((snapshot) => snapshot.topics.length > 0);

  if (competitorSnapshots.length === 0) {
    throw new Error(
      "Nenhum concorrente pôde ser lido (site bloqueado, fora do ar ou sem títulos). Verifique as URLs.",
    );
  }

  const brand = toSnapshot(brandCrawl);
  const { gaps, shared } = buildGapMatrix(brand, competitorSnapshots);

  return { brand, competitors: competitorSnapshots, gaps, shared, warnings };
}
