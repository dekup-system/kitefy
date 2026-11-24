import { createZip } from "@/lib/export/zip";
import type { ExportFile } from "@/lib/export/pack";
import { serializeJsonLdValue } from "@/lib/geo/jsonld";
import { safeFileStem, truncate } from "@/lib/utils";

/**
 * Pacote Google: ZIP para publicar no site da marca, sem integração com CMS.
 *
 * Conteúdo:
 *  - `sitemap.xml` — homepage + artigos GEO aprovados/exportados da marca;
 *  - `robots.txt` — libera buscadores e crawlers de IA (GPTBot, OAI-SearchBot,
 *    PerplexityBot, ClaudeBot, Google-Extended) e aponta o sitemap;
 *  - `index.html` — canonical, Open Graph, Twitter Card, JSON-LD (Organization,
 *    WebSite, ItemList) e o `<meta google-site-verification>` quando houver token;
 *  - `LEIA-ME.txt` — instruções de instalação e de verificação no Search Console.
 *
 * Tudo é texto gerado a partir de dados tipados e escapado: nenhum HTML do
 * usuário é reaproveitado cru. O token do Search Console nunca é segredo, mas
 * passa por validação de formato para não quebrar o `<meta>`.
 */

export class GooglePackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GooglePackError";
  }
}

export interface GooglePackArticle {
  slug: string;
  title: string;
  /** Meta description do artigo (usada só no LEIA-ME/Index, opcional). */
  description?: string | null;
  /** Data ISO de criação/atualização do artigo. */
  updatedAt?: string | null;
}

export interface GooglePackBrand {
  name: string;
  websiteUrl: string | null;
  description?: string | null;
}

export interface BuildGooglePackInput {
  brand: GooglePackBrand;
  articles?: readonly GooglePackArticle[];
  verificationToken?: string | null;
  generatedAt?: Date;
}

const TOKEN_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const HTML_VERIFICATION_FILE_PATTERN = /^google[a-z0-9]{8,40}\.html$/i;

export type VerificationTokenParse =
  | { ok: true; token: string | null }
  | { ok: false; error: string };

/** Identifica se o valor salvo é o nome do arquivo HTML do Search Console (ex.: google5dda...html). */
export function isHtmlVerificationFile(token: string | null | undefined): boolean {
  return typeof token === "string" && HTML_VERIFICATION_FILE_PATTERN.test(token.trim());
}

/**
 * Normaliza a verificação do Search Console. Aceita os 4 formatos reais do Google:
 *  - arquivo HTML (`google5dda2a5b17e98494.html`) ou conteúdo (`google-site-verification: google5dda...html`);
 *  - a meta tag inteira colada (`<meta name="google-site-verification" content="..." />`);
 *  - registro TXT (`google-site-verification=abc...`);
 *  - o token puro (`abcDEF123...`).
 */
export function parseVerificationToken(raw: string | null | undefined): VerificationTokenParse {
  if (raw === null || raw === undefined) return { ok: true, token: null };

  let value = String(raw).trim();
  if (value.length === 0) return { ok: true, token: null };

  const htmlFileMatch = /google-site-verification\s*:\s*(google[a-z0-9]{8,40}\.html)/i.exec(value);
  if (htmlFileMatch?.[1]) {
    return { ok: true, token: htmlFileMatch[1].trim() };
  }

  if (HTML_VERIFICATION_FILE_PATTERN.test(value)) {
    return { ok: true, token: value };
  }

  const metaMatch = /content\s*=\s*["']([^"']+)["']/i.exec(value);
  if (metaMatch?.[1]) {
    value = metaMatch[1].trim();
  } else {
    value = value.replace(/^google-site-verification\s*=\s*/i, "").trim();
  }

  if (!TOKEN_PATTERN.test(value)) {
    return {
      ok: false,
      error:
        "Token do Search Console inválido. Cole o nome do arquivo HTML (ex.: google5dda….html), a tag <meta … /> inteira ou o código de verificação.",
    };
  }

  return { ok: true, token: value };
}

/** URL base do site, sem barra final e sem query/hash. Exige http(s). */
export function normalizeSiteUrl(raw: string | null | undefined): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length === 0) {
    throw new GooglePackError(
      "Cadastre o site da marca antes de gerar o Pacote Google (Configurações > Marca e voz).",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GooglePackError("O site da marca precisa ser uma URL completa, como https://suamarca.com.br.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GooglePackError("O site da marca precisa usar http:// ou https://.");
  }
  if (!url.hostname) {
    throw new GooglePackError("O site da marca não tem um domínio válido.");
  }
  if (url.username || url.password) {
    throw new GooglePackError("Remova usuário e senha da URL do site antes de gerar o pacote.");
  }

  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSlug(input: string): string | null {
  if (typeof input !== "string") return null;

  const cleaned = input.trim().replace(/^\/+|\/+$/g, "");
  if (cleaned.length === 0) return null;

  const segments = cleaned.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }

  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function dateOnly(value: string | Date | null | undefined, fallback: Date): string {
  const parsed = value instanceof Date ? value : value ? new Date(value) : fallback;
  const safe = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  return safe.toISOString().slice(0, 10);
}

interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: "weekly" | "monthly";
  priority: string;
}

function buildSitemapEntries(
  siteUrl: string,
  articles: readonly GooglePackArticle[],
  generatedAt: Date,
): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    {
      loc: `${siteUrl}/`,
      lastmod: dateOnly(generatedAt, generatedAt),
      changefreq: "weekly",
      priority: "1.0",
    },
  ];
  const seen = new Set(entries.map((entry) => entry.loc));

  for (const article of articles) {
    const slug = normalizeSlug(article.slug);
    if (!slug) continue;

    const loc = `${siteUrl}/${slug}`;
    if (seen.has(loc)) continue;
    seen.add(loc);

    entries.push({
      loc,
      lastmod: dateOnly(article.updatedAt, generatedAt),
      changefreq: "monthly",
      priority: "0.8",
    });
  }

  return entries;
}

export function buildSitemapXml(input: {
  siteUrl: string;
  articles?: readonly GooglePackArticle[];
  generatedAt?: Date;
}): string {
  const generatedAt = input.generatedAt ?? new Date();
  const entries = buildSitemapEntries(input.siteUrl, input.articles ?? [], generatedAt);

  const body = entries
    .map(
      (entry) =>
        [
          "  <url>",
          `    <loc>${escapeXml(entry.loc)}</loc>`,
          `    <lastmod>${entry.lastmod}</lastmod>`,
          `    <changefreq>${entry.changefreq}</changefreq>`,
          `    <priority>${entry.priority}</priority>`,
          "  </url>",
        ].join("\n"),
    )
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * robots.txt que libera explicitamente os crawlers de IA mais relevantes.
 * Sem isso, GPTBot/PerplexityBot podem herdar bloqueios genéricos de CDN/WAF e
 * a marca perde citação em respostas geradas.
 */
export function buildRobotsTxt(siteUrl: string): string {
  return [
    "# robots.txt gerado pelo Kitefy — buscadores e assistentes de IA liberados.",
    "User-agent: *",
    "Allow: /",
    "",
    "# Crawlers de IA (GEO/AEO): permissão explícita.",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "",
    "User-agent: ChatGPT-User",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: Perplexity-User",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    "User-agent: Claude-User",
    "Allow: /",
    "",
    "User-agent: CCBot",
    "Allow: /",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

export function buildIndexHtml(input: {
  brand: GooglePackBrand;
  siteUrl: string;
  articles?: readonly GooglePackArticle[];
  verificationToken?: string | null;
  generatedAt?: Date;
}): string {
  const generatedAt = input.generatedAt ?? new Date();
  const name = input.brand.name.trim() || "Marca";
  const description = truncate(
    input.brand.description?.trim() || `Site oficial de ${name}.`,
    160,
  );
  const canonical = `${input.siteUrl}/`;
  const logoUrl = `${input.siteUrl}/logo.png`;
  const token =
    input.verificationToken === null || input.verificationToken === undefined
      ? null
      : parseVerificationToken(input.verificationToken);

  if (token && !token.ok) {
    throw new GooglePackError(token.error);
  }

  const articles = (input.articles ?? [])
    .map((article) => {
      const slug = normalizeSlug(article.slug);
      return slug ? { ...article, slug } : null;
    })
    .filter((article): article is GooglePackArticle & { slug: string } => article !== null)
    .slice(0, 50);

  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${canonical}#organization`,
      name,
      url: canonical,
      logo: { "@type": "ImageObject", url: logoUrl },
    },
    {
      "@type": "WebSite",
      "@id": `${canonical}#website`,
      url: canonical,
      name,
      inLanguage: "pt-BR",
      publisher: { "@id": `${canonical}#organization` },
    },
  ];

  if (articles.length > 0) {
    graph.push({
      "@type": "ItemList",
      name: `Conteúdos de ${name}`,
      itemListElement: articles.map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${input.siteUrl}/${article.slug}`,
        name: article.title,
      })),
    });
  }

  const jsonLd = serializeJsonLdValue({ "@context": "https://schema.org", "@graph": graph });

  const articleItems = articles
    .map(
      (article) =>
        `        <li><a href="${escapeHtml(`${input.siteUrl}/${article.slug}`)}">${escapeHtml(article.title)}</a></li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(name)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(name)}" />
  <meta property="og:title" content="${escapeHtml(name)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(logoUrl)}" />
  <meta property="og:locale" content="pt_BR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(name)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(logoUrl)}" />${
    token?.token && !isHtmlVerificationFile(token.token)
      ? `\n  <meta name="google-site-verification" content="${escapeHtml(token.token)}" />`
      : ""
  }
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 46rem; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.6; }
    h1, h2 { line-height: 1.2; }
    footer { margin-top: 3rem; border-top: 1px solid #e5e5e5; padding-top: 1rem; font-size: 0.85rem; opacity: 0.75; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(name)}</h1>
    <p>${escapeHtml(description)}</p>
  </header>
  <main>
    <section aria-labelledby="conteudos">
      <h2 id="conteudos">Conteúdos</h2>
      ${
        articles.length > 0
          ? `<ul>\n${articleItems}\n      </ul>`
          : "<p>Os próximos artigos publicados aparecerão aqui e no sitemap.</p>"
      }
    </section>
  </main>
  <footer>
    <p>© ${generatedAt.getUTCFullYear()} ${escapeHtml(name)} · <a href="${escapeHtml(canonical)}">${escapeHtml(canonical)}</a></p>
    <p>Página inicial gerada pelo Kitefy. Revise o conteúdo antes de publicar.</p>
  </footer>
</body>
</html>
`;
}

function buildReadme(input: {
  brandName: string;
  siteUrl: string;
  articleCount: number;
  hasToken: boolean;
  generatedAt: Date;
}): string {
  return [
    `Pacote Google — ${input.brandName}`,
    `Site: ${input.siteUrl}`,
    `Gerado em: ${input.generatedAt.toISOString()}`,
    "",
    "O que vai neste ZIP:",
    "  index.html   — página inicial com canonical, Open Graph, Twitter Card, JSON-LD",
    "                 (Organization, WebSite e ItemList) e o meta de verificação.",
    "  sitemap.xml  — homepage + artigos GEO aprovados/exportados no Kitefy.",
    "  robots.txt   — libera buscadores e crawlers de IA (GPTBot, OAI-SearchBot,",
    "                 PerplexityBot, ClaudeBot, Google-Extended) e aponta o sitemap.",
    "",
    "Como publicar:",
    "  1. Envie sitemap.xml e robots.txt para a RAIZ do domínio",
    "     (https://www.seudominio.com.br/robots.txt).",
    "  2. index.html deve ficar na raiz. Se o site já tem uma home, copie para ela",
    "     as tags do <head>: canonical, og:*, twitter:* e o <script type=\"application/ld+json\">.",
    "  3. A imagem de Open Graph usa o caminho /logo.png do site — envie sua logomarca",
    "     pública nesse caminho (o Storage do Kitefy é privado e não serve para OG).",
    "  4. No Google Search Console, adicione a propriedade e use o token informado.",
    "     O meta google-site-verification já está incluído neste index.html.",
    "",
    input.hasToken
      ? "Token do Search Console: incluído no index.html."
      : "Token do Search Console: não configurado (adicione no Kitefy e gere o pacote novamente).",
    `Artigos no sitemap: ${input.articleCount}.`,
    "",
    "Este pacote não publica nada automaticamente: você controle o upload e a revisão.",
    "",
  ].join("\n");
}

/** Gera o ZIP completo do Pacote Google. */
export function buildGooglePack(input: BuildGooglePackInput): ExportFile {
  const siteUrl = normalizeSiteUrl(input.brand.websiteUrl);
  const tokenResult = parseVerificationToken(input.verificationToken);
  if (!tokenResult.ok) {
    throw new GooglePackError(tokenResult.error);
  }

  const generatedAt = input.generatedAt ?? new Date();
  const articles = input.articles ?? [];
  const brandName = input.brand.name.trim() || "Marca";

  const indexHtml = buildIndexHtml({
    brand: { ...input.brand, name: brandName, websiteUrl: siteUrl },
    siteUrl,
    articles,
    verificationToken: tokenResult.token,
    generatedAt,
  });
  const sitemap = buildSitemapXml({ siteUrl, articles, generatedAt });
  const robots = buildRobotsTxt(siteUrl);
  const readme = buildReadme({
    brandName,
    siteUrl,
    articleCount: Math.max(0, buildSitemapEntries(siteUrl, articles, generatedAt).length - 1),
    hasToken: Boolean(tokenResult.token),
    generatedAt,
  });

  const entries = [
    { name: "index.html", data: Buffer.from(indexHtml, "utf8"), compress: true },
    { name: "sitemap.xml", data: Buffer.from(sitemap, "utf8"), compress: true },
    { name: "robots.txt", data: Buffer.from(robots, "utf8"), compress: true },
    { name: "LEIA-ME.txt", data: Buffer.from(readme, "utf8"), compress: true },
  ];

  if (tokenResult.token && isHtmlVerificationFile(tokenResult.token)) {
    entries.push({
      name: tokenResult.token,
      data: Buffer.from(`google-site-verification: ${tokenResult.token}\n`, "utf8"),
      compress: true,
    });
  }

  return {
    fileName: `pacote-google-${safeFileStem(brandName, "marca")}.zip`,
    mimeType: "application/zip",
    buffer: createZip(entries, generatedAt),
  };
}
