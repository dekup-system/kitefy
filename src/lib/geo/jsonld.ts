import type { ArticleSection, JsonLdBundle } from "@/types/domain";

/**
 * JSON-LD para o estúdio GEO.
 *
 * Regras de ouro:
 *  - Todo dado vem de payload tipado (nunca de string HTML).
 *  - `serializeJsonLd` é a única forma segura de injetar o resultado dentro de
 *    `<script type="application/ld+json">`.
 *  - `validateJsonLdBundle` cobre os requisitos mínimos do Google para os
 *    rich results de Artigo, FAQ e Produto.
 */

export interface ArticleJsonLdInput {
  title: string;
  description: string;
  slug: string;
  authorName: string;
  brandName: string;
  websiteUrl: string;
  /** Data ISO 8601, por exemplo `2026-02-01T12:00:00.000Z`. */
  publishedAt: string;
  sections: ArticleSection[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ProductOfferInput {
  price: number | string;
  priceCurrency: string;
  availability?: string;
  url?: string;
}

export interface ProductJsonLdInput {
  name: string;
  description: string;
  brandName: string;
  websiteUrl: string;
  offers?: ProductOfferInput;
}

export interface JsonLdBundleInput {
  article?: ArticleJsonLdInput;
  faq?: FaqItem[];
  product?: ProductJsonLdInput;
}

export interface JsonLdValidationResult {
  valid: boolean;
  issues: string[];
}

const SCHEMA_ORG = "https://schema.org";
const IN_LANGUAGE = "pt-BR";
const MAX_HEADLINE = 110;
const MAX_DESCRIPTION = 165;

function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  const cleanBase = trimTrailingSlash(base);
  const cleanPath = path.trim().replace(/^\/+/, "");
  if (cleanBase.length === 0) return cleanPath;
  return cleanPath.length === 0 ? cleanBase : `${cleanBase}/${cleanPath}`;
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function readName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return isNonEmptyString(value.name) ? value.name : null;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const canonicalUrl = joinUrl(input.websiteUrl, input.slug);
  const logoSuffix = trimTrailingSlash(input.websiteUrl);
  const logoUrl = logoSuffix.length > 0 ? `${logoSuffix}/logo.png` : "";

  return {
    "@context": SCHEMA_ORG,
    "@type": "Article",
    headline: input.title,
    description: input.description,
    datePublished: input.publishedAt,
    dateModified: input.publishedAt,
    inLanguage: IN_LANGUAGE,
    articleSection: input.sections.map((section) => section.heading),
    url: canonicalUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    author: {
      "@type": "Person",
      name: input.authorName,
    },
    publisher: {
      "@type": "Organization",
      name: input.brandName,
      url: trimTrailingSlash(input.websiteUrl),
      logo: {
        "@type": "ImageObject",
        url: logoUrl,
      },
    },
  };
}

export function buildFaqJsonLd(faq: readonly FaqItem[]): Record<string, unknown> {
  return {
    "@context": SCHEMA_ORG,
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const product: Record<string, unknown> = {
    "@context": SCHEMA_ORG,
    "@type": "Product",
    name: input.name,
    description: input.description,
    brand: {
      "@type": "Brand",
      name: input.brandName,
    },
    url: trimTrailingSlash(input.websiteUrl),
  };

  if (input.offers) {
    product.offers = {
      "@type": "Offer",
      price: String(input.offers.price),
      priceCurrency: input.offers.priceCurrency,
      availability: input.offers.availability ?? `${SCHEMA_ORG}/InStock`,
      url: input.offers.url ?? trimTrailingSlash(input.websiteUrl),
    };
  }

  return product;
}

/** Monta o bundle com apenas as chaves aplicáveis ao ativo. */
export function buildJsonLdBundle(payload: JsonLdBundleInput): JsonLdBundle {
  const bundle: JsonLdBundle = {};

  if (payload.article) {
    bundle.article = buildArticleJsonLd(payload.article);
  }
  if (payload.faq && payload.faq.length > 0) {
    bundle.faq = buildFaqJsonLd(payload.faq);
  }
  if (payload.product) {
    bundle.product = buildProductJsonLd(payload.product);
  }

  return bundle;
}

// ---------------------------------------------------------------------------
// Serialização segura
// ---------------------------------------------------------------------------

const JSON_ESCAPE_MAP: Readonly<Record<string, string>> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Serializa qualquer valor JSON para uso dentro de
 * `<script type="application/ld+json">`. Escapa `<`, `>`, `&` e os separadores
 * de linha U+2028/U+2029, impedindo `</script>` e quebra de contexto.
 */
export function serializeJsonLdValue(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) => JSON_ESCAPE_MAP[char] ?? char,
  );
}

/**
 * Serializa um bundle JSON-LD (Article/FAQ/Product). Mantido por compatibilidade:
 * delega para `serializeJsonLdValue`.
 */
export function serializeJsonLd(bundle: JsonLdBundle): string {
  return serializeJsonLdValue(bundle);
}

// ---------------------------------------------------------------------------
// Validação (requisitos Google)
// ---------------------------------------------------------------------------

export function validateJsonLdBundle(bundle: JsonLdBundle): JsonLdValidationResult {
  const issues: string[] = [];
  const keys: (keyof JsonLdBundle)[] = ["article", "faq", "product"];
  const presentKeys = keys.filter((key) => bundle[key] !== undefined);

  if (presentKeys.length === 0) {
    issues.push("Bundle JSON-LD vazio: informe ao menos article, faq ou product.");
    return { valid: false, issues };
  }

  if (bundle.article) {
    validateArticle(bundle.article, issues);
  }
  if (bundle.faq) {
    validateFaq(bundle.faq, issues);
  }
  if (bundle.product) {
    validateProduct(bundle.product, issues);
  }

  return { valid: issues.length === 0, issues };
}

function validateArticle(article: Record<string, unknown>, issues: string[]): void {
  if (article["@type"] !== "Article") {
    issues.push('article["@type"] deve ser "Article".');
  }

  const headline = article.headline;
  if (!isNonEmptyString(headline)) {
    issues.push("article.headline ausente.");
  } else if (characterCount(headline) > MAX_HEADLINE) {
    issues.push(
      `article.headline tem ${characterCount(headline)} caracteres (máximo ${MAX_HEADLINE}).`,
    );
  }

  const description = article.description;
  if (!isNonEmptyString(description)) {
    issues.push("article.description ausente.");
  } else if (characterCount(description) > MAX_DESCRIPTION) {
    issues.push(
      `article.description tem ${characterCount(description)} caracteres (máximo ${MAX_DESCRIPTION}).`,
    );
  }

  if (!isIsoDate(article.datePublished)) {
    issues.push("article.datePublished deve ser uma data ISO 8601 válida.");
  }

  if (!readName(article.author)) {
    issues.push("article.author.name ausente.");
  }

  if (!readName(article.publisher)) {
    issues.push("article.publisher.name ausente.");
  }

  if (article.inLanguage !== IN_LANGUAGE) {
    issues.push(`article.inLanguage deve ser "${IN_LANGUAGE}".`);
  }

  const sections = article.articleSection;
  if (!Array.isArray(sections) || sections.length === 0) {
    issues.push("article.articleSection deve listar ao menos uma seção.");
  }
}

function validateFaq(faq: Record<string, unknown>, issues: string[]): void {
  if (faq["@type"] !== "FAQPage") {
    issues.push('faq["@type"] deve ser "FAQPage".');
  }

  const mainEntity = faq.mainEntity;
  if (!Array.isArray(mainEntity) || mainEntity.length === 0) {
    issues.push("faq.mainEntity deve conter ao menos uma pergunta.");
    return;
  }

  mainEntity.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push(`faq.mainEntity[${index}] inválido.`);
      return;
    }
    if (!isNonEmptyString(item.name)) {
      issues.push(`faq.mainEntity[${index}].name ausente.`);
    }
    const answer = item.acceptedAnswer;
    if (!isRecord(answer) || !isNonEmptyString(answer.text)) {
      issues.push(`faq.mainEntity[${index}].acceptedAnswer.text ausente.`);
    }
  });
}

function validateProduct(product: Record<string, unknown>, issues: string[]): void {
  if (product["@type"] !== "Product") {
    issues.push('product["@type"] deve ser "Product".');
  }
  if (!isNonEmptyString(product.name)) {
    issues.push("product.name ausente.");
  }
  if (!isNonEmptyString(product.description)) {
    issues.push("product.description ausente.");
  }
  if (!readName(product.brand)) {
    issues.push("product.brand.name ausente.");
  }

  if (product.offers !== undefined) {
    if (!isRecord(product.offers)) {
      issues.push("product.offers deve ser um objeto Offer.");
      return;
    }
    const price = product.offers.price;
    if (typeof price !== "string" && typeof price !== "number") {
      issues.push("product.offers.price ausente.");
    }
    if (!isNonEmptyString(product.offers.priceCurrency)) {
      issues.push("product.offers.priceCurrency ausente.");
    }
  }
}
