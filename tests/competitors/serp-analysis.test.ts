import { describe, expect, it } from "vitest";
import { aggregateSerpCompetitors } from "@/lib/competitors/serp-analysis";
import type { SerpInsights } from "@/types/domain";

/**
 * O relatório por SERP é a base da análise de concorrentes no mercado
 * brasileiro. Os testes garantem que a agregação não repete pergunta/lacuna e
 * que o ranking de domínios reflete quantos temas cada site cobre.
 */

function insights(partial: Partial<SerpInsights>): SerpInsights {
  return {
    provider: "serper",
    query: "tema",
    fetched_at: "2026-11-22T00:00:00.000Z",
    people_also_ask: [],
    competitor_gaps: [],
    recent_facts: [],
    ...partial,
  };
}

describe("aggregateSerpCompetitors", () => {
  it("conta domínios por quantidade de temas cobertos", () => {
    const result = aggregateSerpCompetitors([
      {
        theme: "check-up",
        insights: insights({
          competitor_gaps: [
            { url: "https://a.com.br/x", title: "A", missing_topics: ["preco"] },
            { url: "https://b.com.br/y", title: "B", missing_topics: ["preco"] },
          ],
        }),
      },
      {
        theme: "exames",
        insights: insights({
          competitor_gaps: [{ url: "https://www.a.com.br/z", title: "A2", missing_topics: [] }],
        }),
      },
    ]);

    expect(result.domains[0]).toEqual({ domain: "a.com.br", themes: 2 });
    expect(result.domains.map((item) => item.domain)).toContain("b.com.br");
  });

  it("deduplica perguntas e lacunas vindas de temas diferentes", () => {
    const result = aggregateSerpCompetitors([
      {
        theme: "check-up",
        insights: insights({
          people_also_ask: [{ question: "Check-up todo ano é necessário?" }],
          competitor_gaps: [{ url: "https://a.com", title: "A", missing_topics: ["convênios"] }],
        }),
      },
      {
        theme: "exames",
        insights: insights({
          people_also_ask: [{ question: "check-up todo ano é necessário?" }],
          competitor_gaps: [{ url: "https://b.com", title: "B", missing_topics: ["Convênios"] }],
        }),
      },
    ]);

    expect(result.questions).toHaveLength(1);
    expect(result.gaps).toHaveLength(1);
  });

  it("ignora URLs inválidas sem quebrar", () => {
    const result = aggregateSerpCompetitors([
      {
        theme: "tema",
        insights: insights({
          competitor_gaps: [{ url: "nao-e-url", title: "X", missing_topics: [] }],
        }),
      },
    ]);

    expect(result.domains).toHaveLength(0);
    expect(result.themes[0]?.top).toHaveLength(1);
  });

  it("devolve estrutura vazia quando não há dados", () => {
    const result = aggregateSerpCompetitors([{ theme: "tema", insights: insights({}) }]);
    expect(result.domains).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.gaps).toEqual([]);
  });
});
