import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import type { ReactElement } from "react";

import type { CarouselSlide, VisualThemeId, VisualTokens } from "@/types/domain";
import { assertSafePublicUrl } from "@/lib/crawl/site";

import { getSatoriFonts } from "./fonts";
import {
  imageBandHeight,
  renderSlideTemplate,
  singleCreative as singleCreativeTemplate,
  type SingleCreativeTemplateInput,
  type SlideTemplateInput,
} from "./templates";
import { resolveVisualTokens, type ResolvedVisualTokens } from "./tokens";

/**
 * Renderizador programático de imagens (custo $0, sem IA de imagem).
 *
 * Pipeline: React element (templates) -> satori -> SVG -> resvg -> PNG.
 * JPEG é derivado do PNG via sharp. Nenhuma etapa depende de rede, exceto o
 * download opcional de `image_url` em carrosséis híbridos.
 */

export const FORMAT_DIMENSIONS = {
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
} as const;

export type RenderFormat = keyof typeof FORMAT_DIMENSIONS;
export type RenderOutput = "png" | "jpeg";

export interface RenderedAsset {
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
  buffer: Buffer;
  width: number;
  height: number;
  /** `true` somente quando uma imagem de IA foi efetivamente composta. */
  hasAiImagery: boolean;
}

/**
 * Lista de assets com avisos do lote anexados como propriedades não
 * enumeráveis:
 *  - `result.warnings`: avisos de imagens/ layouts inválidos;
 *  - `result.assets`: alias da própria lista, para quem prefere o formato
 *    `{ assets, warnings }`.
 *
 * Continua sendo um `Array<RenderedAsset>` (funciona com `map`, `filter`,
 * `length` e spread), mas expõe os avisos sem quebrá-lo.
 */
export interface RenderResult extends Array<RenderedAsset> {
  readonly warnings: string[];
  readonly assets: RenderedAsset[];
}

export interface RenderCarouselInput {
  slides: CarouselSlide[];
  tokens: VisualTokens | null;
  brandName: string;
  format: RenderFormat;
  visualTheme?: VisualThemeId;
  output?: RenderOutput;
  /** 1-100 (padrão 92). Só tem efeito em `output: "jpeg"`. */
  quality?: number;
  /** Logomarca real da marca embutida como data URL PNG (opcional). */
  brandLogoDataUrl?: string | null;
}

export interface RenderSingleCreativeInput {
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
  tokens: VisualTokens | null;
  brandName: string;
  format: RenderFormat;
  visualTheme?: VisualThemeId;
  output?: RenderOutput;
  quality?: number;
  /** Imagem opcional (data URL ou http/https) composta como faixa de fundo. */
  imageUrl?: string | null;
  /** Sinaliza que o conteúdo foi planejado com imagem de IA. */
  hasAiImagery?: boolean;
  /** Logomarca real da marca embutida como data URL PNG (opcional). */
  brandLogoDataUrl?: string | null;
}

const DEFAULT_JPEG_QUALITY = 92;
const IMAGE_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 2000;
const MAX_SHARP_PIXELS = 40_000_000;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVALID_XML_CHARS = /[\uFFFE\uFFFF]/g;
const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;

/**
 * Sanitiza texto vindo do LLM/banco antes de entrar no SVG.
 *
 * Remove caracteres de controle e code points inválidos em XML (que
 * invalidariam o SVG), normaliza espaços e limita a 2000 caracteres por
 * campo, sem partir pares substitutos.
 */
export function sanitizeText(value: unknown, maxChars = MAX_TEXT_CHARS): string {
  if (typeof value !== "string") return "";

  let text = value.normalize("NFC").replace(/\r\n?/g, "\n");
  text = text.replace(CONTROL_CHARS, " ").replace(INVALID_XML_CHARS, "");
  text = text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  text = text.replace(/\s+/g, " ").trim();

  const characters = Array.from(text);
  if (characters.length > maxChars) {
    const cut = characters.slice(0, Math.max(1, maxChars - 1)).join("").trimEnd();
    text = `${cut}…`;
  }

  return text;
}

function clampQuality(quality: number | undefined): number {
  if (typeof quality !== "number" || !Number.isFinite(quality)) return DEFAULT_JPEG_QUALITY;
  return Math.min(100, Math.max(1, Math.round(quality)));
}

function formatSlug(format: RenderFormat): string {
  return format.replace(":", "x");
}

function extensionFor(output: RenderOutput): "png" | "jpg" {
  return output === "jpeg" ? "jpg" : "png";
}

function mimeTypeFor(output: RenderOutput): RenderedAsset["mimeType"] {
  return output === "jpeg" ? "image/jpeg" : "image/png";
}

const KNOWN_LAYOUTS: readonly CarouselSlide["layout"][] = ["cover", "point", "data", "quote", "cta"];

function resolveLayout(value: unknown): CarouselSlide["layout"] | null {
  if (typeof value !== "string") return null;
  return (KNOWN_LAYOUTS as readonly string[]).includes(value) ? (value as CarouselSlide["layout"]) : null;
}

// ---------------------------------------------------------------------------
// Imagens (carrossel híbrido)
// ---------------------------------------------------------------------------

function describeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "URL inválida";
  }
}

async function normalizeImageBuffer(buffer: Buffer, width: number, height: number): Promise<string> {
  const resized = await sharp(buffer, { failOn: "error", limitInputPixels: MAX_SHARP_PIXELS })
    .resize(width, height, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return `data:image/png;base64,${resized.toString("base64")}`;
}

function decodeDataUrl(rawUrl: string): Buffer {
  const match = DATA_URL_PATTERN.exec(rawUrl);
  if (!match || !match[2]) {
    throw new Error("data URL de imagem inválida (esperado base64).");
  }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (buffer.length === 0) throw new Error("data URL de imagem vazia.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("imagem maior que 8 MB.");
  return buffer;
}

async function downloadImage(rawUrl: string): Promise<Buffer> {
  let current = assertSafePublicUrl(rawUrl);
  let response: Response | null = null;

  for (let hop = 0; hop <= 5; hop += 1) {
    const candidate = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: { accept: "image/*" },
    });

    if (candidate.status >= 300 && candidate.status < 400) {
      const location = candidate.headers.get("location");
      if (!location) {
        response = candidate;
        break;
      }
      current = assertSafePublicUrl(new URL(location, current).toString());
      continue;
    }

    response = candidate;
    break;
  }

  if (!response) {
    throw new Error("limite de redirecionamentos excedido.");
  }

  if (!response.ok) {
    throw new Error(`download falhou com HTTP ${response.status}.`);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(`content-type inesperado (${contentType.length > 0 ? contentType : "ausente"}).`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error("imagem maior que 8 MB.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("imagem vazia.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("imagem maior que 8 MB.");
  return buffer;
}

/**
 * Baixa (ou decodifica) a imagem do slide e devolve um data URL já
 * redimensionado para a faixa. Qualquer falha é tratada pelo chamador — o
 * lote nunca é abortado por causa de uma imagem.
 */
async function prepareImage(rawUrl: string, width: number, height: number): Promise<string> {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) throw new Error("URL de imagem vazia.");

  if (trimmed.toLowerCase().startsWith("data:")) {
    return normalizeImageBuffer(decodeDataUrl(trimmed), width, height);
  }

  const buffer = await downloadImage(trimmed);
  return normalizeImageBuffer(buffer, width, height);
}

// ---------------------------------------------------------------------------
// Pipeline satori -> resvg -> sharp
// ---------------------------------------------------------------------------

async function renderToPng(element: ReactElement, width: number, height: number): Promise<Buffer> {
  const svg = await satori(element, {
    width,
    height,
    fonts: getSatoriFonts(),
    embedFont: true,
    convertColors: true,
    onStyleError: () => {
      // Estilos CSS não suportados pelo satori são ignorados de propósito:
      // os templates usam apenas propriedades suportadas e o fallback é
      // preferível a derrubar um lote inteiro.
    },
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: false },
    logLevel: "off",
  });

  return resvg.render().asPng();
}

async function toJpeg(png: Buffer, quality: number | undefined): Promise<Buffer> {
  return sharp(png).toColourspace("srgb").jpeg({ quality: clampQuality(quality), mozjpeg: true }).toBuffer();
}

async function produceAsset(options: {
  element: ReactElement;
  width: number;
  height: number;
  fileName: string;
  output: RenderOutput;
  quality: number | undefined;
  hasAiImagery: boolean;
}): Promise<RenderedAsset> {
  const png = await renderToPng(options.element, options.width, options.height);
  const buffer = options.output === "jpeg" ? await toJpeg(png, options.quality) : png;

  return {
    fileName: options.fileName,
    mimeType: mimeTypeFor(options.output),
    buffer,
    width: options.width,
    height: options.height,
    hasAiImagery: options.hasAiImagery,
  };
}

function finalize(assets: RenderedAsset[], warnings: string[]): RenderResult {
  const result = assets as RenderResult;
  Object.defineProperty(result, "warnings", {
    value: Object.freeze([...warnings]),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  // Alias para o formato `{ assets, warnings }` sem duplicar a lista.
  Object.defineProperty(result, "assets", {
    value: result,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return result;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Renderiza um carrossel completo. Uma falha de imagem vira warning e o slide
 * correspondente é renderizado como tipográfico puro.
 */
export async function renderCarousel(input: RenderCarouselInput): Promise<RenderResult> {
  const dimensions = FORMAT_DIMENSIONS[input.format];
  const tokens = resolveVisualTokens(input.tokens);
  const brandName = sanitizeText(input.brandName, 80);
  const output: RenderOutput = input.output ?? "png";
  const extension = extensionFor(output);
  const slug = formatSlug(input.format);

  const warnings: string[] = [];
  const assets: RenderedAsset[] = [];
  const slides = Array.isArray(input.slides) ? input.slides : [];

  if (slides.length === 0) {
    warnings.push("Carrossel sem slides: nenhum arquivo foi gerado.");
    return finalize(assets, warnings);
  }

  for (let position = 0; position < slides.length; position += 1) {
    const slide = slides[position];
    if (!slide) continue;

    const layout = resolveLayout(slide.layout);
    if (!layout) {
      warnings.push(`Slide ${position + 1}: layout "${String(slide.layout)}" desconhecido, usando "point".`);
    }
    const resolvedLayout = layout ?? "point";

    let imageDataUrl: string | null = null;
    const rawImageUrl = typeof slide.image_url === "string" ? slide.image_url.trim() : "";

    if (rawImageUrl.length > 0) {
      try {
        imageDataUrl = await prepareImage(
          rawImageUrl,
          dimensions.width,
          imageBandHeight(resolvedLayout, dimensions.height),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : "erro desconhecido";
        warnings.push(
          `Slide ${position + 1}: imagem de ${describeUrl(rawImageUrl)} ignorada (${reason}). ` +
            "Slide renderizado como tipográfico puro.",
        );
      }
    } else if (slide.has_ai_imagery) {
      warnings.push(
        `Slide ${position + 1}: marcado com has_ai_imagery, mas sem image_url. Renderizado como tipográfico puro.`,
      );
    }

    const templateInput: SlideTemplateInput = {
      title: sanitizeText(slide.title),
      body: sanitizeText(slide.body),
      tokens,
      brandName,
      index: position + 1,
      total: slides.length,
      width: dimensions.width,
      height: dimensions.height,
      imageDataUrl,
      brandLogoDataUrl: input.brandLogoDataUrl ?? null,
      visualTheme: input.visualTheme ?? "editorial_classic",
    };

    const element = renderSlideTemplate(resolvedLayout, templateInput);
    const fileName = `slide-${String(position + 1).padStart(2, "0")}-${slug}.${extension}`;

    assets.push(
      await produceAsset({
        element,
        width: dimensions.width,
        height: dimensions.height,
        fileName,
        output,
        quality: input.quality,
        hasAiImagery: imageDataUrl !== null,
      }),
    );
  }

  return finalize(assets, warnings);
}

/** Renderiza um criativo único (1080x1350 ou 1080x1920). */
export async function renderSingleCreative(input: RenderSingleCreativeInput): Promise<RenderResult> {
  const dimensions = FORMAT_DIMENSIONS[input.format];
  const tokens: ResolvedVisualTokens = resolveVisualTokens(input.tokens);
  const brandName = sanitizeText(input.brandName, 80);
  const output: RenderOutput = input.output ?? "png";
  const slug = formatSlug(input.format);
  const warnings: string[] = [];

  let imageDataUrl: string | null = null;
  const rawImageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";

  if (rawImageUrl.length > 0) {
    try {
      imageDataUrl = await prepareImage(
        rawImageUrl,
        dimensions.width,
        imageBandHeight("single", dimensions.height),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "erro desconhecido";
      warnings.push(
        `Imagem de ${describeUrl(rawImageUrl)} ignorada (${reason}). Criativo renderizado como tipográfico puro.`,
      );
    }
  } else if (input.hasAiImagery) {
    warnings.push(
      "Criativo marcado com has_ai_imagery, mas sem imageUrl. Renderizado como tipográfico puro.",
    );
  }

  const templateInput: SingleCreativeTemplateInput = {
    headline: sanitizeText(input.headline),
    subheadline: sanitizeText(input.subheadline),
    body: sanitizeText(input.body),
    cta: sanitizeText(input.cta),
    tokens,
    brandName,
    width: dimensions.width,
    height: dimensions.height,
    imageDataUrl,
    brandLogoDataUrl: input.brandLogoDataUrl ?? null,
    visualTheme: input.visualTheme ?? "editorial_classic",
  };

  const asset = await produceAsset({
    element: singleCreativeTemplate(templateInput),
    width: dimensions.width,
    height: dimensions.height,
    fileName: `single-creative-${slug}.${extensionFor(output)}`,
    output,
    quality: input.quality,
    hasAiImagery: imageDataUrl !== null,
  });

  return finalize([asset], warnings);
}
