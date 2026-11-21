import { describe, expect, it } from "vitest";

import {
  buildArticleJsonLd,
  buildFaqJsonLd,
  buildJsonLdBundle,
  buildProductJsonLd,
  serializeJsonLd,
  validateJsonLdBundle,
  type ArticleJsonLdInput,
  type FaqItem,
  type ProductJsonLdInput,
} from "@/lib/geo/jsonld";
import type { ArticleSection } from "@/types/domain";

const sections: ArticleSection[] = [
  {
    heading: "O que é conteúdo orgânico",
    blocks: [
      { type: "direct_fact", text: "Conteúdo orgânico é o que atrai tráfego sem mídia paga." },
      { type: "verifiable_data", text: "61% das empresas brasileiras mantêm blog corporativo." },
    ],
  },
  {
    heading: "Como medir resultado",
    blocks: [
      { type: "direct_fact", text: "Meça por objetivo de negócio, não por volume isolado." },
      { type: "verifiable_data", text: "O ciclo típico de maturação é de 3 a 6 meses." },
    ],
  },
  {
    heading: "Erros comuns",
    blocks: [
      { type: "direct_fact", text: "Copiar concorrentes sem contexto é o erro mais comum." },
      { type: "verifiable_data", text: "42% dos projetos abandonam a medição no primeiro trimestre." },
    ],
  },
];

const articleInput: ArticleJsonLdInput = {
  title: "Conteúdo orgânico: guia prático para 2026",
  description: "Guia direto sobre conteúdo orgânico, com dados verificáveis e perguntas frequentes.",
  slug: "conteudo-organico-guia-2026",
  authorName: "Marina Costa",
  brandName: "BrandPulse",
  websiteUrl: "https://brandpulse.com.br/",
  publishedAt: "2026-02-01T12:00:00.000Z",
  sections,
};

const faq: FaqItem[] = [
  { question: "O que é conteúdo orgânico?", answer: "É o tráfego conquistado sem mídia paga." },
  { question: "Quanto tempo leva?", answer: "Entre três e seis meses, em média." },
];

const productInput: ProductJsonLdInput = {
  name: "BrandPulse Pro",
  description: "Plataforma de conteúdo orgânico multi-agente.",
  brandName: "BrandPulse",
  websiteUrl: "https://brandpulse.com.br/",
  offers: { price: 297, priceCurrency: "BRL" },
};

describe("buildArticleJsonLd", () => {
  it("produz Article com autor, publisher e seções", () => {
    const article = buildArticleJsonLd(articleInput);

    expect(article["@context"]).toBe("https://schema.org");
    expect(article["@type"]).toBe("Article");
    expect(article.headline).toBe(articleInput.title);
    expect(article.inLanguage).toBe("pt-BR");
    expect(article.articleSection).toEqual(sections.map((section) => section.heading));
    expect(article.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": "https://brandpulse.com.br/conteudo-organico-guia-2026",
    });

    const author = article.author as Record<string, unknown>;
    expect(author).toMatchObject({ "@type": "Person", name: "Marina Costa" });

    const publisher = article.publisher as Record<string, unknown>;
    expect(publisher).toMatchObject({ "@type": "Organization", name: "BrandPulse" });
    const logo = publisher.logo as Record<string, unknown>;
    expect(logo.url).toBe("https://brandpulse.com.br/logo.png");
  });
});

describe("buildFaqJsonLd e buildProductJsonLd", () => {
  it("gera FAQPage com respostas aceitas", () => {
    const faqLd = buildFaqJsonLd(faq);
    expect(faqLd["@type"]).toBe("FAQPage");
    const mainEntity = faqLd.mainEntity as Record<string, unknown>[];
    expect(mainEntity).toHaveLength(2);
    expect(mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: faq[0]?.question,
      acceptedAnswer: { "@type": "Answer", text: faq[0]?.answer },
    });
  });

  it("gera Product com oferta", () => {
    const product = buildProductJsonLd(productInput);
    expect(product["@type"]).toBe("Product");
    expect(product.name).toBe("BrandPulse Pro");
    expect(product.offers).toMatchObject({
      "@type": "Offer",
      price: "297",
      priceCurrency: "BRL",
    });
  });
});

describe("validateJsonLdBundle", () => {
  it("aprova bundle completo", () => {
    const bundle = buildJsonLdBundle({ article: articleInput, faq, product: productInput });
    const result = validateJsonLdBundle(bundle);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("omite chaves não aplicáveis", () => {
    const bundle = buildJsonLdBundle({ article: articleInput });
    expect(bundle.article).toBeDefined();
    expect(bundle.faq).toBeUndefined();
    expect(bundle.product).toBeUndefined();
  });

  it("aponta headline acima de 110 caracteres", () => {
    const bundle = buildJsonLdBundle({
      article: { ...articleInput, title: "T".repeat(120) },
    });
    const result = validateJsonLdBundle(bundle);

    expect(result.valid).toBe(false);
    expect(result.issues.join(" ")).toContain("headline");
    expect(result.issues.join(" ")).toContain("110");
  });

  it("rejeita bundle vazio", () => {
    const result = validateJsonLdBundle({});
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/vazio/i);
  });
});

describe("serializeJsonLd", () => {
  it("escapa </script> e U+2028 mantendo o JSON válido", () => {
    const bundle = buildJsonLdBundle({
      article: {
        ...articleInput,
        title: 'Fim </script><script>alert("x")</script>',
        description: "Linha\u2028seguinte\u2029fim",
      },
    });

    const serialized = serializeJsonLd(bundle);

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(serialized)).toEqual(bundle);
  });

  it("escapa & e > para impedir quebra de contexto", () => {
    const serialized = serializeJsonLd({ article: { title: "A & B > C" } });
    expect(serialized).not.toContain("&");
    expect(serialized).not.toContain(">");
    expect(JSON.parse(serialized)).toEqual({ article: { title: "A & B > C" } });
  });
});
