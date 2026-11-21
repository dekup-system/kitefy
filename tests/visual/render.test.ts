import { isValidElement, type ReactNode } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import type { CarouselSlide } from "@/types/domain";

import { renderCarousel, renderSingleCreative, type RenderResult } from "@/lib/visual/render";
import {
  MAX_BODY_WORDS,
  MAX_TITLE_WORDS,
  point,
  truncateBody,
  truncateTitle,
} from "@/lib/visual/templates";
import { contrastRatio, ensureContrast, parseColor, resolveVisualTokens, visualTokensSchema } from "@/lib/visual/tokens";

/**
 * Testes do motor visual.
 *
 * Nenhum teste toca rede ou Supabase: as imagens inválidas usam URLs que
 * falham na validação de protocolo/URL antes de qualquer `fetch`.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
/** PNG 1x1 válido — usado como imagem embutida (sem rede). */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SLIDES: CarouselSlide[] = [
  {
    index: 0,
    title: "O gancho que para o scroll",
    body: "Um corpo curto com contexto suficiente para a capa do carrossel.",
    layout: "cover",
  },
  {
    index: 1,
    title: "Três passos para sair do genérico",
    body: "Contexto, prova e uma chamada clara para a ação no fim do post.",
    layout: "point",
  },
  {
    index: 2,
    title: "Salve para aplicar hoje",
    body: "Marque alguém que precisa rever a estratégia de conteúdo orgânico.",
    layout: "cta",
  },
];

// ---------------------------------------------------------------------------
// Parsers manuais (sem dependência nova)
// ---------------------------------------------------------------------------

function readPngDimensions(buffer: Buffer): { width: number; height: number } {
  expect(buffer.length).toBeGreaterThan(24);
  expect([...buffer.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } {
  expect([...buffer.subarray(0, 3)]).toEqual(JPEG_SIGNATURE);

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer.readUInt8(offset) !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = buffer.readUInt8(offset + 1);
    while (marker === 0xff) {
      offset += 1;
      marker = buffer.readUInt8(offset + 1);
    }

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }

    offset += 2 + length;
  }

  throw new Error("SOF não encontrado no JPEG");
}

/** Média de todas as tabelas de quantização (DQT) do JPEG. */
function averageQuantizationValue(buffer: Buffer): number {
  const values: number[] = [];
  let offset = 2;

  while (offset + 3 < buffer.length) {
    if (buffer.readUInt8(offset) !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = buffer.readUInt8(offset + 1);
    while (marker === 0xff) {
      offset += 1;
      marker = buffer.readUInt8(offset + 1);
    }

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xdb) {
      let cursor = offset + 4;
      const end = offset + 2 + length;
      while (cursor < end) {
        const info = buffer.readUInt8(cursor);
        cursor += 1;
        const tableSize = (info >> 4) === 0 ? 64 : 128;
        for (let index = 0; index < tableSize && cursor + index < end; index += 1) {
          values.push(buffer.readUInt8(cursor + index));
        }
        cursor += tableSize;
      }
    }

    offset += 2 + length;
  }

  if (values.length === 0) throw new Error("Nenhuma tabela DQT encontrada no JPEG.");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Coleta todos os nós de texto de uma árvore React (templates satori). */
function collectText(node: ReactNode, accumulator: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return accumulator;

  if (typeof node === "string" || typeof node === "number") {
    accumulator.push(String(node));
    return accumulator;
  }

  if (Array.isArray(node)) {
    for (const child of node) collectText(child, accumulator);
    return accumulator;
  }

  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    collectText(props.children, accumulator);
  }

  return accumulator;
}

// ---------------------------------------------------------------------------
// Lotes renderizados uma única vez
// ---------------------------------------------------------------------------

let carousel45: RenderResult;
let carousel916: RenderResult;
let jpeg92: RenderResult;
let jpeg30: RenderResult;
let jpeg95: RenderResult;
let singleCreativeAsset: RenderResult;
let hybridWithInvalidImage: RenderResult;
let hybridWithDataUrl: RenderResult;

beforeAll(async () => {
  carousel45 = await renderCarousel({
    slides: SLIDES,
    tokens: null,
    brandName: "BrandPulse",
    format: "4:5",
    output: "png",
  });

  carousel916 = await renderCarousel({
    slides: SLIDES,
    tokens: null,
    brandName: "BrandPulse",
    format: "9:16",
    output: "png",
  });

  jpeg92 = await renderCarousel({
    slides: SLIDES,
    tokens: null,
    brandName: "BrandPulse",
    format: "4:5",
    output: "jpeg",
  });

  jpeg30 = await renderCarousel({
    slides: SLIDES.slice(0, 1),
    tokens: null,
    brandName: "BrandPulse",
    format: "4:5",
    output: "jpeg",
    quality: 30,
  });

  jpeg95 = await renderCarousel({
    slides: SLIDES.slice(0, 1),
    tokens: null,
    brandName: "BrandPulse",
    format: "4:5",
    output: "jpeg",
    quality: 95,
  });

  singleCreativeAsset = await renderSingleCreative({
    headline: "Sua marca merece uma estratégia, não sorte",
    subheadline: "Conteúdo orgânico com método e previsibilidade",
    body: "Diagnóstico, plano editorial e medição em um único fluxo de trabalho.",
    cta: "Começar agora",
    tokens: null,
    brandName: "BrandPulse",
    format: "4:5",
  });

  hybridWithInvalidImage = await renderCarousel({
    slides: [
      SLIDES[0]!,
      {
        index: 1,
        title: "Slide com imagem quebrada",
        body: "O lote precisa continuar mesmo quando a imagem não puder ser baixada.",
        layout: "point",
        image_url: "nao-e-uma-url-valida",
        has_ai_imagery: true,
      },
    ],
    tokens: null,
    brandName: "BrandPulse",
    format: "4:5",
  });

  hybridWithDataUrl = await renderCarousel({
    slides: [
      {
        index: 0,
        title: "Imagem embutida como data URL",
        body: "A faixa superior mostra a imagem composta, sem remover o ativo visual.",
        layout: "cover",
        image_url: `data:image/png;base64,${TINY_PNG_BASE64}`,
        has_ai_imagery: true,
      },
    ],
    tokens: null,
    brandName: "BrandPulse",
    format: "4:5",
  });
}, 180_000);

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------

describe("renderCarousel — PNG", () => {
  it("gera um PNG 1080x1350 por slide no formato 4:5", () => {
    expect(carousel45).toHaveLength(SLIDES.length);
    expect(carousel45.warnings).toEqual([]);
    expect(carousel45.assets).toBe(carousel45);

    for (const asset of carousel45) {
      expect(asset.mimeType).toBe("image/png");
      expect(asset.buffer.subarray(0, 8)).toEqual(Buffer.from(PNG_SIGNATURE));
      expect(readPngDimensions(asset.buffer)).toEqual({ width: 1080, height: 1350 });
      expect(asset.hasAiImagery).toBe(false);
      expect(asset.fileName).toMatch(/^slide-\d{2}-4x5\.png$/);
    }

    const names = new Set(carousel45.map((asset) => asset.fileName));
    expect(names.size).toBe(SLIDES.length);
  });

  it("gera um PNG 1080x1920 por slide no formato 9:16", () => {
    expect(carousel916).toHaveLength(SLIDES.length);

    for (const asset of carousel916) {
      expect(readPngDimensions(asset.buffer)).toEqual({ width: 1080, height: 1920 });
      expect(asset.fileName).toMatch(/^slide-\d{2}-9x16\.png$/);
    }
  });

  it("renderiza criativo único em 1080x1350", () => {
    expect(singleCreativeAsset).toHaveLength(1);
    const asset = singleCreativeAsset[0];
    expect(asset).toBeDefined();
    if (!asset) return;
    expect(asset.mimeType).toBe("image/png");
    expect(readPngDimensions(asset.buffer)).toEqual({ width: 1080, height: 1350 });
    expect(asset.fileName).toBe("single-creative-4x5.png");
  });
});

describe("renderCarousel — JPEG", () => {
  it("converte para JPEG com magic bytes, mimeType e dimensões corretas", () => {
    expect(jpeg92).toHaveLength(SLIDES.length);

    for (const asset of jpeg92) {
      expect(asset.mimeType).toBe("image/jpeg");
      expect(asset.buffer.subarray(0, 3)).toEqual(Buffer.from(JPEG_SIGNATURE));
      expect(readJpegDimensions(asset.buffer)).toEqual({ width: 1080, height: 1350 });
      expect(asset.fileName).toMatch(/^slide-\d{2}-4x5\.jpg$/);
    }
  });

  it("aplica a qualidade informada (quantização menor em quality alto)", () => {
    const low = jpeg30[0];
    const high = jpeg95[0];
    expect(low).toBeDefined();
    expect(high).toBeDefined();
    if (!low || !high) return;

    expect(averageQuantizationValue(low.buffer)).toBeGreaterThan(averageQuantizationValue(high.buffer));
    expect(low.buffer.length).toBeLessThan(high.buffer.length);
  });
});

describe("carrossel híbrido com image_url inválida", () => {
  it("não quebra o lote e registra warning", () => {
    expect(hybridWithInvalidImage).toHaveLength(2);
    expect(hybridWithInvalidImage.warnings.length).toBeGreaterThanOrEqual(1);
    expect(hybridWithInvalidImage.warnings.join(" ")).toMatch(/imagem/i);
    expect(hybridWithInvalidImage.warnings.join(" ")).toMatch(/tipográfico/i);

    for (const asset of hybridWithInvalidImage) {
      expect(asset.mimeType).toBe("image/png");
      expect(readPngDimensions(asset.buffer)).toEqual({ width: 1080, height: 1350 });
      expect(asset.hasAiImagery).toBe(false);
    }
  });

  it("compõe imagem embutida (data URL) e marca hasAiImagery", () => {
    expect(hybridWithDataUrl).toHaveLength(1);
    expect(hybridWithDataUrl.warnings).toEqual([]);

    const asset = hybridWithDataUrl[0];
    expect(asset).toBeDefined();
    if (!asset) return;
    expect(asset.hasAiImagery).toBe(true);
    expect(readPngDimensions(asset.buffer)).toEqual({ width: 1080, height: 1350 });
    // A imagem composta adiciona bytes ao PNG; um slide tipográfico puro
    // equivalente fica bem abaixo disso.
    expect(asset.buffer.length).toBeGreaterThan(2_000);
  });
});

// ---------------------------------------------------------------------------
// Tokens e contraste
// ---------------------------------------------------------------------------

describe("ensureContrast", () => {
  it("mantém preto sobre branco (já passa em AA)", () => {
    const result = ensureContrast("#000000", "#ffffff");
    expect(result.adjusted).toBe(false);
    expect(result.fg).toBe("#000000");
    expect(result.bg).toBe("#ffffff");
    expect(result.ratio).toBeCloseTo(21, 1);
  });

  it("escurece cinza claro sobre branco até >= 4.5:1", () => {
    const result = ensureContrast("#cccccc", "#ffffff");
    expect(result.adjusted).toBe(true);
    expect(result.fg).not.toBe("#cccccc");
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(parseColor(result.fg), parseColor(result.bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("aceita OKLCH na entrada e devolve par seguro", () => {
    const result = ensureContrast("oklch(0.9 0.02 250)", "#ffffff");
    expect(result.adjusted).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
    expect(result.fg).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("resolveVisualTokens", () => {
  it("aplica defaults neutros de alto contraste", () => {
    const tokens = resolveVisualTokens(null);
    expect(tokens.background).toBe("#fdfdfd");
    expect(tokens.foreground).toBe("#17171a");
    expect(tokens.primary).toBe("#1f1f23");
    expect(tokens.accent).toBe("#3f3f46");
    expect(tokens.theme).toBe("light");
    expect(tokens.fontHeading).toBe("Geist");
    expect(tokens.fontMono).toBe("Geist Mono");
    expect(tokens.radius).toBe(24);
  });

  it("normaliza hex curto (#rgb) para #rrggbb", () => {
    const tokens = resolveVisualTokens({ primary: "#08f" });
    expect(tokens.primary).toBe("#0088ff");
  });

  it("converte OKLCH para hex sRGB equivalente", () => {
    const tokens = resolveVisualTokens({ primary: "oklch(0.628 0.2577 29.23)" });
    const red = parseColor(tokens.primary);

    expect(tokens.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(red.r).toBeGreaterThan(245);
    expect(red.g).toBeLessThan(15);
    expect(red.b).toBeLessThan(15);
  });

  it("garante contraste AA nos pares de texto derivados", () => {
    const tokens = resolveVisualTokens({ primary: "#f5d90a", muted: "#dddddd" });
    expect(contrastRatio(parseColor(tokens.textOnBackground), parseColor(tokens.background))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(parseColor(tokens.mutedOnBackground), parseColor(tokens.background))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(parseColor(tokens.textOnPrimary), parseColor(tokens.primary))).toBeGreaterThanOrEqual(4.5);
  });

  it("valida o JSONB com visualTokensSchema", () => {
    expect(visualTokensSchema.safeParse({ primary: "#0f766e", radius: 24, theme: "dark" }).success).toBe(true);
    expect(visualTokensSchema.safeParse({ accent: "oklch(0.7 0.15 250)" }).success).toBe(true);
    expect(visualTokensSchema.safeParse({ primary: "tomate" }).success).toBe(false);
    expect(visualTokensSchema.safeParse({ radius: 400 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

describe("templates — limites tipográficos", () => {
  const longTitle = "um dois três quatro cinco seis sete oito nove dez onze doze";
  const longBody = Array.from({ length: 45 }, (_, index) => `palavra${index + 1}`).join(" ");

  it("trunca título em 8 palavras e corpo em 35 palavras", () => {
    expect(truncateTitle(longTitle)).toBe("um dois três quatro cinco seis sete oito…");
    expect(truncateTitle(longTitle).split(" ")).toHaveLength(MAX_TITLE_WORDS);
    expect(truncateBody(longBody).split(" ")).toHaveLength(MAX_BODY_WORDS);
    expect(truncateBody(longBody).endsWith("…")).toBe(true);
  });

  it("aplica o truncamento no template e mantém marca + paginação", () => {
    const element = point({
      title: longTitle,
      body: longBody,
      tokens: resolveVisualTokens(null),
      brandName: "BrandPulse",
      index: 2,
      total: 5,
      width: 1080,
      height: 1350,
    });

    const texts = collectText(element);
    expect(texts).toContain(truncateTitle(longTitle));
    expect(texts).toContain(truncateBody(longBody));
    expect(texts).not.toContain(longTitle);
    expect(texts).not.toContain(longBody);
    expect(texts).toContain("BRANDPULSE");
    expect(texts).toContain("2/5");
  });
});
