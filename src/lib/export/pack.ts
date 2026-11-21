import type { CampaignAssetRow, ContentPayload, GeoArticlePayload } from "@/types/domain";
import { articleToHtml, articleToMarkdown } from "@/lib/geo/markdown";
import { serializeJsonLd } from "@/lib/geo/jsonld";
import { safeFileStem, slugify } from "@/lib/utils";
import { createZip } from "@/lib/export/zip";

/**
 * Pacote de exportação sem atrito — nenhuma integração com rede social.
 *
 * Formatos:
 *  - `zip`: PNGs/JPEGs + conteúdo em Markdown + JSON-LD + payload JSON completo;
 *  - `md`, `html`, `json`, `jsonld`: arquivo único.
 */

export type ExportFormat = "zip" | "md" | "html" | "json" | "jsonld";

export interface ExportFile {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface BuildExportInput {
  asset: CampaignAssetRow;
  brandName: string;
  websiteUrl?: string | null;
  /** Buffers dos visuais, na ordem de `asset.visual_urls`. */
  visuals?: { fileName: string; data: Buffer }[];
  format: ExportFormat;
}

export function buildContentMarkdown(
  payload: ContentPayload,
  meta: { title: string; brandName: string; websiteUrl?: string | null; credits: number; models?: string[]; transparency?: boolean },
): string {
  if (payload.kind === "geo_article") {
    // O artigo tem formatação própria (GEO), mas recebe o mesmo rodapé de
    // transparência/créditos dos outros formatos.
    return [
      articleToMarkdown(payload as GeoArticlePayload, {
        brandName: meta.brandName,
        websiteUrl: meta.websiteUrl ?? undefined,
      }),
      "",
      buildFooter(meta),
    ].join("\n");
  }

  const lines: string[] = [`# ${meta.title}`, ""];

  switch (payload.kind) {
    case "short_script_kit": {
      lines.push("## Ganchos A/B", "");
      payload.hooks.forEach((hook, index) => {
        lines.push(`### ${index + 1}. ${hook.hook_text}`, "");
        lines.push(`- Ângulo: \`${hook.angle_type}\``);
        lines.push(`- Framework: \`${hook.framework}\``);
        lines.push(`- Por que funciona: ${hook.rationale}`, "");
      });
      lines.push(`## Corpo (${payload.body.framework}, ~${payload.body.estimated_seconds}s)`, "");
      payload.body.beats.forEach((beat) => {
        lines.push(`- **${beat.label}** (${beat.seconds}s): ${beat.direction}`);
      });
      lines.push("", payload.body.script, "", "## Payoff", "", payload.payoff, "");
      lines.push("## Guia de cena", "");
      payload.scene_guide.forEach((scene) => {
        lines.push(`- Cena ${scene.scene}: ${scene.visual} — na tela: "${scene.on_screen_text}"`);
      });
      lines.push("", "## Notas de gravação", "");
      payload.recording_notes.forEach((note) => lines.push(`- ${note}`));
      lines.push("", "## Legenda SEO (até 2.200 caracteres)", "", payload.caption.seo);
      lines.push("", "## Legenda estendida (TikTok, até 4.000)", "", payload.caption.extended);
      lines.push("", `Hashtags: ${payload.caption.hashtags.join(" ")}`);
      break;
    }
    case "typo_carousel":
    case "hybrid_carousel": {
      lines.push(`## Slides (${payload.slides.length})`, "");
      payload.slides.forEach((slide) => {
        lines.push(`### Slide ${slide.index + 1} — ${slide.title}`, "", slide.body, "");
      });
      lines.push("", "## Legenda", "", payload.caption.seo, "", payload.caption.hashtags.join(" "));
      break;
    }
    case "single_creative": {
      lines.push(`## ${payload.headline}`, "", payload.subheadline, "", payload.body, "");
      lines.push(`**CTA:** ${payload.cta}`, "");
      lines.push("## Legenda", "", payload.caption.seo, "", payload.caption.hashtags.join(" "));
      if (payload.has_ai_imagery) {
        lines.push("", "> Imagem ilustrativa gerada por IA. Recomenda-se rotular o conteúdo como sintético.");
      }
      break;
    }
    case "lp_copy": {
      lines.push("## Hero", "", `**${payload.hero.eyebrow}**`, "", payload.hero.headline, "", payload.hero.subheadline, "", `CTA: ${payload.hero.cta}`, "");
      lines.push(`## ${payload.problem.title}`, "", ...payload.problem.bullets.map((b) => `- ${b}`), "");
      lines.push(`## ${payload.solution.title}`, "", ...payload.solution.bullets.map((b) => `- ${b}`), "");
      lines.push(`## ${payload.proof.title}`, "");
      payload.proof.items.forEach((item) => lines.push(`- ${item.claim}${item.source ? ` (${item.source})` : ""}`));
      lines.push("", "## FAQ", "");
      payload.faq.forEach((item) => lines.push(`**${item.question}**`, "", item.answer, ""));
      lines.push(`## ${payload.final_cta.headline}`, "", `CTA: ${payload.final_cta.cta}`);
      break;
    }
  }

  lines.push("", buildFooter(meta));

  return lines.join("\n");
}

interface FooterMeta {
  title: string;
  brandName: string;
  websiteUrl?: string | null;
  credits: number;
  models?: string[];
  transparency?: boolean;
}

/** Rodapé comum: créditos, modelos usados e aviso de conteúdo sintético. */
export function buildFooter(meta: FooterMeta): string {
  const lines = [
    "---",
    "",
    `Gerado por Kitefy para ${meta.brandName}. Créditos consumidos: ${meta.credits}. Revisão humana recomendada antes da publicação.`,
  ];

  if (meta.models && meta.models.length > 0) {
    lines.push(`Modelos utilizados: ${[...new Set(meta.models)].join(", ")}.`);
  }
  if (meta.transparency) {
    lines.push(
      "Aviso: este ativo contém imagem sintética fotorrealista; rotule como conteúdo gerado por IA.",
    );
  }

  return lines.join("\n");
}

export function buildContentHtml(markdownHtml: string, title: string, brandName: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 46rem; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.6; }
  h1,h2,h3 { line-height: 1.2; }
  pre,code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  footer { margin-top: 3rem; border-top: 1px solid #e5e5e5; padding-top: 1rem; font-size: 0.85rem; opacity: 0.75; }
</style>
</head>
<body>
<article>
${markdownHtml}
</article>
<footer>Gerado por Kitefy para ${escapeHtml(brandName)}. Revisão humana recomendada.</footer>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildExportFile(input: BuildExportInput): ExportFile {
  const stem = safeFileStem(input.asset.title, input.asset.asset_type);
  const meta = {
    title: input.asset.title,
    brandName: input.brandName,
    websiteUrl: input.websiteUrl ?? null,
    credits: input.asset.credits_charged,
    models: extractModels(input.asset.content_payload),
    transparency: input.asset.has_ai_imagery,
  };

  const markdown = buildContentMarkdown(input.asset.content_payload, meta);
  const jsonLd = input.asset.json_ld ? serializeJsonLd(input.asset.json_ld) : null;

  switch (input.format) {
    case "md":
      return {
        fileName: `${stem}.md`,
        mimeType: "text/markdown; charset=utf-8",
        buffer: Buffer.from(markdown, "utf8"),
      };
    case "html": {
      const htmlBody = articleToHtmlOrMarkdown(input.asset.content_payload, input.brandName, input.websiteUrl ?? null);
      return {
        fileName: `${stem}.html`,
        mimeType: "text/html; charset=utf-8",
        buffer: Buffer.from(buildContentHtml(htmlBody, input.asset.title, input.brandName), "utf8"),
      };
    }
    case "json":
      return {
        fileName: `${stem}.json`,
        mimeType: "application/json; charset=utf-8",
        buffer: Buffer.from(
          JSON.stringify(
            {
              schema: "brandpulse.asset.v1",
              asset: input.asset,
              json_ld: input.asset.json_ld,
              exported_at: new Date().toISOString(),
            },
            null,
            2,
          ),
          "utf8",
        ),
      };
    case "jsonld":
      return {
        fileName: `${stem}-jsonld.json`,
        mimeType: "application/json; charset=utf-8",
        buffer: Buffer.from(jsonLd ?? JSON.stringify({ "@context": "https://schema.org" }, null, 2), "utf8"),
      };
    case "zip": {
      const entries: { name: string; data: Buffer; compress?: boolean }[] = [
        { name: "conteudo.md", data: Buffer.from(markdown, "utf8") },
        {
          name: "payload.json",
          data: Buffer.from(JSON.stringify(input.asset.content_payload, null, 2), "utf8"),
        },
      ];

      if (jsonLd) {
        entries.push({ name: "json-ld.json", data: Buffer.from(jsonLd, "utf8") });
      }

      for (const visual of input.visuals ?? []) {
        entries.push({ name: `imagens/${visual.fileName}`, data: visual.data, compress: false });
      }

      entries.push({
        name: "LEIA-ME.txt",
        data: Buffer.from(
          [
            `Ativo: ${input.asset.title}`,
            `Marca: ${input.brandName}`,
            `Tipo: ${input.asset.asset_type}`,
            `Créditos consumidos: ${input.asset.credits_charged}`,
            "",
            "Este pacote não publica em redes sociais. Copie o texto e suba as imagens manualmente,",
            "ou use o webhook/CMS próprio da sua marca.",
            input.asset.has_ai_imagery
              ? "Atenção: este ativo contém imagem gerada por IA. Rotule como conteúdo sintético."
              : "",
            "",
            `Exportado em ${new Date().toISOString()}.`,
          ]
            .filter(Boolean)
            .join("\n"),
          "utf8",
        ),
      });

      return {
        fileName: `${stem}.zip`,
        mimeType: "application/zip",
        buffer: createZip(entries),
      };
    }
  }
}

function articleToHtmlOrMarkdown(
  payload: ContentPayload,
  brandName: string,
  websiteUrl: string | null,
): string {
  if (payload.kind === "geo_article") {
    return articleToHtml(payload);
  }
  // Para os demais tipos, um HTML simples com o Markdown convertido em blocos.
  const markdown = buildContentMarkdown(payload, {
    title: payload.kind === "lp_copy" ? payload.hero.headline : brandName,
    brandName,
    websiteUrl,
    credits: 0,
  });
  return markdownToBasicHtml(markdown);
}

export function markdownToBasicHtml(markdown: string): string {
  const escaped = escapeHtml(markdown);
  const lines = escaped.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const listMatch = /^[-*]\s+(.*)$/.exec(trimmed);
    if (listMatch) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${listMatch[1]}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }

    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("### ")) out.push(`<h3>${trimmed.slice(4)}</h3>`);
    else if (trimmed.startsWith("## ")) out.push(`<h2>${trimmed.slice(3)}</h2>`);
    else if (trimmed.startsWith("# ")) out.push(`<h1>${trimmed.slice(2)}</h1>`);
    else if (trimmed.startsWith("> ")) out.push(`<blockquote>${trimmed.slice(2)}</blockquote>`);
    else if (trimmed === "---") out.push("<hr />");
    else out.push(`<p>${trimmed}</p>`);
  }
  if (inList) out.push("</ul>");

  return out.join("\n");
}

function extractModels(payload: ContentPayload): string[] {
  const meta = (payload as unknown as { _meta?: { models?: string[] } })._meta;
  return Array.isArray(meta?.models) ? meta.models : [];
}

export function exportFileNameFor(asset: CampaignAssetRow, format: ExportFormat): string {
  const stem = safeFileStem(asset.title || slugify(asset.asset_type), asset.asset_type);
  return `${stem}.${format === "jsonld" ? "jsonld.json" : format}`;
}
