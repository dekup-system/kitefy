import type { ArticleSection, GeoArticlePayload } from "@/types/domain";

/**
 * Renderização de artigo GEO em Markdown e HTML.
 *
 * O payload é sempre tratado como texto: nada de HTML cru é reaproveitado.
 * Isso evita XSS tanto no Markdown (que pode ser servido como HTML) quanto no
 * HTML gerado para exportação.
 */

export interface ArticleMarkdownMeta {
  brandName: string;
  websiteUrl?: string;
}

const BLOCK_LABELS: Readonly<Record<ArticleSection["blocks"][number]["type"], string>> = {
  direct_fact: "Fato Direto",
  context: "Contexto",
  verifiable_data: "Dados Verificáveis",
};

const BLOCK_ORDER: readonly ArticleSection["blocks"][number]["type"][] = [
  "direct_fact",
  "context",
  "verifiable_data",
];

const READING_WORDS_PER_MINUTE = 200;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapa tags/entidades para o Markdown nunca conter HTML solto. */
function escapeMarkdown(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/[()\s<>]/g, (char) => encodeURIComponent(char));
}

function safeMarkdownUrl(raw: string): string | null {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  return url.replace(/\)/g, "%29");
}

function safeHref(raw: string): string {
  return safeHttpUrl(raw) ?? "#";
}

function sortedBlocks(section: ArticleSection): ArticleSection["blocks"] {
  return [...section.blocks].sort(
    (left, right) => BLOCK_ORDER.indexOf(left.type) - BLOCK_ORDER.indexOf(right.type),
  );
}

function footerSource(meta: ArticleMarkdownMeta | undefined): string | null {
  if (!meta) return null;
  const site = meta.websiteUrl?.trim();
  return site ? `${meta.brandName} — ${site}` : meta.brandName;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function articleToMarkdown(
  payload: GeoArticlePayload,
  meta: ArticleMarkdownMeta,
): string {
  const lines: string[] = [];

  lines.push(`# ${escapeMarkdown(payload.title)}`, "");
  if (payload.meta_description.trim().length > 0) {
    lines.push(escapeMarkdown(payload.meta_description), "");
  }

  for (const section of payload.sections) {
    lines.push(`## ${escapeMarkdown(section.heading)}`, "");
    for (const block of sortedBlocks(section)) {
      lines.push(`**${BLOCK_LABELS[block.type]}**`, "", escapeMarkdown(block.text), "");
    }
  }

  if (payload.key_takeaways.length > 0) {
    lines.push("## Principais aprendizados", "");
    for (const takeaway of payload.key_takeaways) {
      lines.push(`- ${escapeMarkdown(takeaway)}`);
    }
    lines.push("");
  }

  if (payload.faq.length > 0) {
    lines.push("## Perguntas frequentes", "");
    for (const item of payload.faq) {
      lines.push(`### ${escapeMarkdown(item.question)}`, "", escapeMarkdown(item.answer), "");
    }
  }

  if (payload.internal_links.length > 0) {
    lines.push("## Links internos", "");
    for (const link of payload.internal_links) {
      const url = safeMarkdownUrl(link.url);
      const anchor = escapeMarkdown(link.anchor);
      lines.push(url ? `- [${anchor}](${url})` : `- ${anchor}`);
    }
    lines.push("");
  }

  const source = footerSource(meta);
  if (source) {
    lines.push("---", "", `**Fonte:** ${escapeMarkdown(source)}`, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export function articleToHtml(payload: GeoArticlePayload, meta?: ArticleMarkdownMeta): string {
  const parts: string[] = [];
  const title = escapeHtml(payload.title);

  parts.push(`<article aria-labelledby="article-title">`);
  parts.push(`<header>`);
  parts.push(`<h1 id="article-title">${title}</h1>`);
  if (payload.meta_description.trim().length > 0) {
    parts.push(`<p class="meta-description">${escapeHtml(payload.meta_description)}</p>`);
  }
  parts.push(`</header>`);

  for (const section of payload.sections) {
    parts.push(`<section>`);
    parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    for (const block of sortedBlocks(section)) {
      parts.push(
        `<p><strong>${BLOCK_LABELS[block.type]}.</strong> ${escapeHtml(block.text)}</p>`,
      );
    }
    parts.push(`</section>`);
  }

  if (payload.key_takeaways.length > 0) {
    parts.push(`<section aria-labelledby="key-takeaways">`);
    parts.push(`<h2 id="key-takeaways">Principais aprendizados</h2>`);
    parts.push(`<ul>`);
    for (const takeaway of payload.key_takeaways) {
      parts.push(`<li>${escapeHtml(takeaway)}</li>`);
    }
    parts.push(`</ul>`);
    parts.push(`</section>`);
  }

  if (payload.faq.length > 0) {
    parts.push(`<section aria-labelledby="faq">`);
    parts.push(`<h2 id="faq">Perguntas frequentes</h2>`);
    parts.push(`<dl>`);
    for (const item of payload.faq) {
      parts.push(`<dt>${escapeHtml(item.question)}</dt>`);
      parts.push(`<dd>${escapeHtml(item.answer)}</dd>`);
    }
    parts.push(`</dl>`);
    parts.push(`</section>`);
  }

  if (payload.internal_links.length > 0) {
    parts.push(`<nav aria-label="Links internos">`);
    parts.push(`<h2>Links internos</h2>`);
    parts.push(`<ul>`);
    for (const link of payload.internal_links) {
      parts.push(
        `<li><a href="${escapeHtml(safeHref(link.url))}">${escapeHtml(link.anchor)}</a></li>`,
      );
    }
    parts.push(`</ul>`);
    parts.push(`</nav>`);
  }

  const source = footerSource(meta);
  if (source) {
    parts.push(`<footer><p><strong>Fonte:</strong> ${escapeHtml(source)}</p></footer>`);
  }

  parts.push(`</article>`);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Métricas e guarda de estrutura
// ---------------------------------------------------------------------------

/** Estimativa de leitura a 200 palavras por minuto (mínimo de 1 minuto). */
export function estimateReadingTime(words: number): number {
  if (!Number.isFinite(words) || words <= 0) return 0;
  return Math.max(1, Math.ceil(words / READING_WORDS_PER_MINUTE));
}

/**
 * Garante a estrutura mínima exigida pelo pipeline GEO:
 * ao menos 3 seções e, em cada uma, um fato direto e um dado verificável.
 */
export function assertGeoStructure(payload: GeoArticlePayload): void {
  const problems: string[] = [];

  if (payload.sections.length < 3) {
    problems.push(`seções insuficientes: ${payload.sections.length} (mínimo 3)`);
  }

  payload.sections.forEach((section, index) => {
    const label = section.heading.trim().length > 0 ? `"${section.heading}"` : `#${index + 1}`;
    if (section.heading.trim().length === 0) {
      problems.push(`seção ${label} sem título`);
    }

    const hasDirectFact = section.blocks.some(
      (block) => block.type === "direct_fact" && block.text.trim().length > 0,
    );
    const hasVerifiableData = section.blocks.some(
      (block) => block.type === "verifiable_data" && block.text.trim().length > 0,
    );

    if (!hasDirectFact) {
      problems.push(`seção ${label} sem bloco direct_fact`);
    }
    if (!hasVerifiableData) {
      problems.push(`seção ${label} sem bloco verifiable_data`);
    }
  });

  if (problems.length > 0) {
    throw new Error(`Estrutura GEO inválida: ${problems.join("; ")}.`);
  }
}
