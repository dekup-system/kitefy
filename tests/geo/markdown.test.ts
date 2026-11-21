import { describe, expect, it } from "vitest";

import {
  articleToHtml,
  articleToMarkdown,
  assertGeoStructure,
  estimateReadingTime,
} from "@/lib/geo/markdown";
import type { ArticleSection, GeoArticlePayload } from "@/types/domain";

function makeSections(): ArticleSection[] {
  return [
    {
      heading: "O que é conteúdo orgânico",
      blocks: [
        { type: "context", text: "Contexto geral sobre o tema." },
        { type: "verifiable_data", text: "61% das empresas mantêm blog corporativo." },
        { type: "direct_fact", text: "É o tráfego conquistado sem mídia paga." },
      ],
    },
    {
      heading: "Como medir resultado",
      blocks: [
        { type: "direct_fact", text: "Meça por objetivo de negócio." },
        { type: "verifiable_data", text: "O ciclo típico é de 3 a 6 meses." },
      ],
    },
    {
      heading: "Erros comuns",
      blocks: [
        { type: "direct_fact", text: "Copiar concorrentes sem contexto." },
        { type: "verifiable_data", text: "42% abandonam a medição no primeiro trimestre." },
      ],
    },
  ];
}

function makePayload(overrides: Partial<GeoArticlePayload> = {}): GeoArticlePayload {
  return {
    kind: "geo_article",
    title: "Conteúdo orgânico: guia prático",
    slug: "conteudo-organico-guia",
    meta_description: "Guia direto sobre conteúdo orgânico com dados verificáveis.",
    sections: makeSections(),
    faq: [
      { question: "O que é conteúdo orgânico?", answer: "É o tráfego sem mídia paga." },
      { question: "Quanto tempo leva?", answer: "Entre 3 e 6 meses, em média." },
    ],
    key_takeaways: ["Meça por objetivo", "Revise o plano a cada trimestre"],
    internal_links: [
      { anchor: "Guia de SEO", url: "https://brandpulse.com.br/seo" },
      { anchor: "Blog", url: "https://brandpulse.com.br/blog" },
    ],
    word_count: 900,
    ...overrides,
  };
}

describe("articleToMarkdown", () => {
  it("gera H1, H2 por seção, blocos em negrito e FAQ", () => {
    const markdown = articleToMarkdown(makePayload(), {
      brandName: "BrandPulse",
      websiteUrl: "https://brandpulse.com.br",
    });

    expect(markdown.startsWith("# Conteúdo orgânico: guia prático")).toBe(true);
    expect(markdown).toContain("## O que é conteúdo orgânico");
    expect(markdown).toContain("## Como medir resultado");
    expect(markdown).toContain("## Erros comuns");
    expect(markdown).toContain("**Fato Direto**");
    expect(markdown).toContain("**Contexto**");
    expect(markdown).toContain("**Dados Verificáveis**");
    expect(markdown).toContain("## Perguntas frequentes");
    expect(markdown).toContain("### O que é conteúdo orgânico?");
    expect(markdown).toContain("## Principais aprendizados");
    expect(markdown).toContain("## Links internos");
    expect(markdown).toContain("[Guia de SEO](https://brandpulse.com.br/seo)");
    expect(markdown).toContain("**Fonte:** BrandPulse — https://brandpulse.com.br");
  });

  it("não deixa HTML solto no Markdown", () => {
    const markdown = articleToMarkdown(
      makePayload({
        title: '<script>alert("x")</script>',
        sections: [
          {
            heading: "Bloco <b>perigoso</b>",
            blocks: [
              { type: "direct_fact", text: "<img src=x onerror=alert(1)>" },
              { type: "verifiable_data", text: "42% dos casos." },
            ],
          },
        ],
      }),
      { brandName: "BrandPulse" },
    );

    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("<img");
    expect(markdown).toContain("&lt;script&gt;");
    expect(markdown).toContain("&lt;img");
  });
});

describe("articleToHtml", () => {
  it("usa HTML semântico e escapa o conteúdo", () => {
    const html = articleToHtml(
      makePayload({
        title: '<script>alert("x")</script>',
        sections: [
          {
            heading: "Seção <b>perigosa</b>",
            blocks: [
              { type: "direct_fact", text: "<img src=x onerror=alert(1)>" },
              { type: "verifiable_data", text: "42% dos casos." },
            ],
          },
          ...makeSections().slice(1),
        ],
      }),
      { brandName: "BrandPulse", websiteUrl: "https://brandpulse.com.br" },
    );

    expect(html).toContain("<article");
    expect(html).toContain("<h1");
    expect(html).toContain("<section");
    expect(html).toContain("<h2");
    expect(html).toContain("<dl>");
    expect(html).toContain("<dt>");
    expect(html).toContain("<dd>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  it("neutraliza URLs não http(s) em links internos", () => {
    const html = articleToHtml(
      makePayload({
        internal_links: [{ anchor: "Perigoso", url: "javascript:alert(1)" }],
      }),
    );
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });
});

describe("assertGeoStructure", () => {
  it("aceita payload com 3 seções e blocos obrigatórios", () => {
    expect(() => assertGeoStructure(makePayload())).not.toThrow();
  });

  it("rejeita seção sem bloco verifiable_data", () => {
    const sections = makeSections();
    sections[1] = {
      heading: "Como medir resultado",
      blocks: [{ type: "direct_fact", text: "Meça por objetivo de negócio." }],
    };

    expect(() => assertGeoStructure(makePayload({ sections }))).toThrow(/verifiable_data/);
  });

  it("rejeita payload com menos de 3 seções", () => {
    expect(() => assertGeoStructure(makePayload({ sections: makeSections().slice(0, 2) }))).toThrow(
      /mínimo 3/,
    );
  });
});

describe("estimateReadingTime", () => {
  it("usa 200 palavras por minuto com mínimo de 1", () => {
    expect(estimateReadingTime(0)).toBe(0);
    expect(estimateReadingTime(199)).toBe(1);
    expect(estimateReadingTime(200)).toBe(1);
    expect(estimateReadingTime(401)).toBe(3);
  });
});
