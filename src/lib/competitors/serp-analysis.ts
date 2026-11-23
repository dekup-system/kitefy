/**
 * Análise de concorrentes por SERP (mercado brasileiro).
 *
 * Em vez de adivinhar "assunto" a partir de headings, consulta o Google para os
 * temas da marca e devolve o que aparece de fato: quem ranqueia, quais perguntas
 * o público faz e quais tópicos os resultados deixam de fora.
 *
 * Locale fixo em pt-BR: o produto atende apenas o Brasil.
 */

import { searchWithCache } from "@/lib/serp/client";
import type { SerpInsights } from "@/types/domain";

export interface SerpThemeResult {
  theme: string;
  top: { title: string; url: string }[];
  questions: string[];
  gaps: string[];
}

export interface SerpCompetitorAnalysis {
  themes: SerpThemeResult[];
  /** Domínios que mais aparecem, com quantos temas cobrem. */
  domains: { domain: string; themes: number }[];
  /** Perguntas reais do público, sem repetição. */
  questions: string[];
  /** Lacunas de conteúdo agregadas. */
  gaps: string[];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (clean.length === 0) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** Função pura: agrega várias buscas em um relatório único. */
export function aggregateSerpCompetitors(
  inputs: { theme: string; insights: SerpInsights }[],
): SerpCompetitorAnalysis {
  const themes: SerpThemeResult[] = inputs.map(({ theme, insights }) => ({
    theme,
    top: insights.competitor_gaps.slice(0, 5).map((gap) => ({
      title: gap.title,
      url: gap.url,
    })),
    questions: insights.people_also_ask.map((item) => item.question),
    gaps: insights.competitor_gaps.flatMap((gap) => gap.missing_topics),
  }));

  const domainCount = new Map<string, number>();
  for (const theme of themes) {
    const seenInTheme = new Set<string>();
    for (const item of theme.top) {
      const host = hostOf(item.url);
      if (!host || seenInTheme.has(host)) continue;
      seenInTheme.add(host);
      domainCount.set(host, (domainCount.get(host) ?? 0) + 1);
    }
  }

  return {
    themes,
    domains: [...domainCount.entries()]
      .map(([domain, count]) => ({ domain, themes: count }))
      .sort((a, b) => b.themes - a.themes || a.domain.localeCompare(b.domain))
      .slice(0, 8),
    questions: uniqueStrings(themes.flatMap((theme) => theme.questions)).slice(0, 10),
    gaps: uniqueStrings(themes.flatMap((theme) => theme.gaps)).slice(0, 12),
  };
}

export interface AnalyzeThemesInput {
  themes: string[];
}

export async function analyzeCompetitorsByTheme(
  input: AnalyzeThemesInput,
): Promise<SerpCompetitorAnalysis> {
  const themes = input.themes
    .map((theme) => theme.trim())
    .filter((theme) => theme.length >= 4)
    .slice(0, 4);

  if (themes.length === 0) {
    throw new Error("Informe ao menos um tema com 4 caracteres ou mais.");
  }

  const results = await Promise.all(
    themes.map(async (theme) => ({
      theme,
      insights: await searchWithCache({ query: theme, locale: "pt-BR", num: 10 }),
    })),
  );

  return aggregateSerpCompetitors(results);
}
