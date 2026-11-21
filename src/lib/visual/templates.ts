import { createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

import type { CarouselSlide } from "@/types/domain";

import { SATORI_FONT_FAMILY, SATORI_MONO_FAMILY } from "./fonts";
import type { ResolvedVisualTokens } from "./tokens";

/**
 * Templates tipográficos do motor visual.
 *
 * Regras (determinísticas, sem IA de imagem):
 *  - safe-area de 72 px em todos os lados;
 *  - título com no máximo 8 palavras, corpo com no máximo 35 palavras;
 *  - cores de texto sempre vêm de `ResolvedVisualTokens` (contraste AA garantido);
 *  - rodapé com marca + paginação `n/N` em todos os slides de carrossel;
 *  - quando há imagem (carrossel híbrido), ela é composta como faixa de fundo
 *    e o texto fica em um painel sólido — a imagem nunca é removida.
 *
 * Este arquivo usa `React.createElement` (e não JSX) para não depender de
 * configuração de JSX no tsconfig.
 */

/** Área segura obrigatória em px. */
export const SAFE_AREA = 72;

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT_4_5 = 1350;
export const SLIDE_HEIGHT_9_16 = 1920;

export const MAX_TITLE_WORDS = 8;
export const MAX_BODY_WORDS = 35;

/** Layouts de slide suportados + o layout único do criativo avulso. */
export type TemplateLayout = CarouselSlide["layout"] | "single";

export interface SlideTemplateInput {
  title: string;
  body: string;
  tokens: ResolvedVisualTokens;
  brandName: string;
  /** Posição 1-based do slide no carrossel. */
  index: number;
  total: number;
  width: number;
  height: number;
  /** Imagem já redimensionada, embutida como data URL (opcional). */
  imageDataUrl?: string | null;
}

export interface SingleCreativeTemplateInput {
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
  tokens: ResolvedVisualTokens;
  brandName: string;
  width: number;
  height: number;
  imageDataUrl?: string | null;
}

export type SlideTemplate = (input: SlideTemplateInput) => ReactElement;

interface SlideChrome {
  tokens: ResolvedVisualTokens;
  brandName: string;
  index: number;
  total: number;
  width: number;
  height: number;
  imageDataUrl?: string | null;
}

interface ComposeOptions {
  background?: string;
  footerColor?: string;
  panelColor?: string;
  showPage?: boolean;
}

function chromeFor(input: SlideTemplateInput): SlideChrome {
  return {
    tokens: input.tokens,
    brandName: input.brandName,
    index: input.index,
    total: input.total,
    width: input.width,
    height: input.height,
    imageDataUrl: input.imageDataUrl ?? null,
  };
}

// ---------------------------------------------------------------------------
// Helpers de árvore
// ---------------------------------------------------------------------------

/** `React.createElement` com filhos nulos/booleanos/vazios removidos. */
function box(style: CSSProperties, ...children: ReactNode[]): ReactElement {
  const visible = children.filter((child) => child !== null && child !== undefined && child !== false && child !== "");
  return createElement("div", { style }, ...visible);
}

function imageLayer(src: string, style: CSSProperties): ReactElement {
  return createElement("img", { src, alt: "", style });
}

// ---------------------------------------------------------------------------
// Texto: normalização e truncamento
// ---------------------------------------------------------------------------

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Trunca em `maxWords` palavras preservando a primeira parte do texto e
 * sinalizando o corte com reticências. Nunca corta palavra no meio.
 */
export function truncateWords(text: string, maxWords: number): string {
  const normalized = collapseWhitespace(text);
  if (normalized.length === 0) return "";
  const words = normalized.split(" ");
  if (words.length <= maxWords) return normalized;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/** Limita por caracteres respeitando pares substitutos (sem partir emoji). */
function truncateChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = Array.from(text).slice(0, Math.max(1, maxChars - 1)).join("").trimEnd();
  return `${cut}…`;
}

/** Título de slide: até 8 palavras e 160 caracteres. */
export function truncateTitle(text: string): string {
  return truncateChars(truncateWords(text, MAX_TITLE_WORDS), 160);
}

/** Corpo de slide: até 35 palavras e 560 caracteres (proteção contra palavras gigantes). */
export function truncateBody(text: string): string {
  return truncateChars(truncateWords(text, MAX_BODY_WORDS), 560);
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

function contentWidthFor(width: number): number {
  return width - SAFE_AREA * 2;
}

function isTall(height: number): boolean {
  return height >= 1700;
}

/** Reduz a fonte do título conforme o texto cresce, mantendo hierarquia. */
function titleFontSize(text: string, baseSize: number): number {
  const length = text.length;
  if (length <= 30) return baseSize;
  if (length <= 46) return Math.round(baseSize * 0.9);
  if (length <= 64) return Math.round(baseSize * 0.8);
  if (length <= 88) return Math.round(baseSize * 0.7);
  return Math.max(40, Math.round(baseSize * 0.6));
}

// ---------------------------------------------------------------------------
// Peças visuais
// ---------------------------------------------------------------------------

function accentBar(tokens: ResolvedVisualTokens, width = 96): ReactElement {
  return box({
    display: "flex",
    width,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.accent,
  });
}

function kicker(text: string, tokens: ResolvedVisualTokens, color: string, width: number): ReactElement {
  return box(
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      width,
      marginBottom: 8,
    },
    box({ display: "flex", width: 44, height: 6, borderRadius: 3, backgroundColor: tokens.accent, marginRight: 16 }),
    box(
      {
        display: "flex",
        fontFamily: tokens.fontHeading,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 3,
        color,
      },
      text.toUpperCase(),
    ),
  );
}

function titleElement(
  text: string,
  baseSize: number,
  color: string,
  tokens: ResolvedVisualTokens,
  width: number,
  marginTop: number,
): ReactElement {
  const fontSize = titleFontSize(text, baseSize);
  return box(
    {
      display: "flex",
      fontFamily: tokens.fontHeading,
      fontSize,
      fontWeight: 700,
      lineHeight: 1.06,
      letterSpacing: -Math.round(fontSize * 0.02),
      color,
      width,
      marginTop,
    },
    text,
  );
}

function bodyElement(
  text: string,
  fontSize: number,
  color: string,
  tokens: ResolvedVisualTokens,
  width: number,
  marginTop: number,
): ReactElement {
  return box(
    {
      display: "flex",
      fontFamily: tokens.fontBody,
      fontSize,
      fontWeight: 400,
      lineHeight: 1.5,
      color,
      width,
      marginTop,
    },
    text,
  );
}

function pillLabel(label: string, tokens: ResolvedVisualTokens, background: string, color: string): ReactElement {
  return box(
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: background,
      borderRadius: 999,
      paddingLeft: 28,
      paddingRight: 28,
      paddingTop: 16,
      paddingBottom: 16,
      marginTop: 36,
    },
    box(
      {
        display: "flex",
        fontFamily: tokens.fontHeading,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: 0.5,
        color,
      },
      label,
    ),
  );
}

interface FooterOptions {
  brandName: string;
  width: number;
  color: string;
  page?: string;
}

function footerElement(options: FooterOptions): ReactElement {
  const brand = truncateChars(options.brandName.toUpperCase(), 42) || "MARCA";

  return box(
    {
      display: "flex",
      flexDirection: "column",
      width: options.width,
      marginTop: 32,
    },
    box({
      display: "flex",
      width: options.width,
      height: 1,
      backgroundColor: options.color,
      opacity: 0.28,
      marginBottom: 18,
    }),
    box(
      {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: options.width,
      },
      box(
        {
          display: "flex",
          fontFamily: SATORI_FONT_FAMILY,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: 2,
          color: options.color,
        },
        brand,
      ),
      options.page
        ? box(
            {
              display: "flex",
              fontFamily: SATORI_MONO_FAMILY,
              fontSize: 22,
              fontWeight: 400,
              color: options.color,
            },
            options.page,
          )
        : box({ display: "flex", width: 1 }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Estrutura do slide (com e sem imagem)
// ---------------------------------------------------------------------------

function noImageSlide(chrome: SlideChrome, body: ReactElement, options: ComposeOptions): ReactElement {
  const width = contentWidthFor(chrome.width);
  const showPage = options.showPage !== false;

  return box(
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: chrome.width,
      boxSizing: "border-box",
      height: chrome.height,
      padding: SAFE_AREA,
      backgroundColor: options.background ?? chrome.tokens.background,
    },
    box({ display: "flex", flexDirection: "column", justifyContent: "center", width, flexGrow: 1 }, body),
    footerElement({
      brandName: chrome.brandName,
      width,
      color: options.footerColor ?? chrome.tokens.mutedOnBackground,
      page: showPage && chrome.total > 0 ? `${chrome.index}/${chrome.total}` : undefined,
    }),
  );
}

function imageSlide(
  chrome: SlideChrome,
  body: ReactElement,
  imageDataUrl: string,
  bandHeight: number,
  options: ComposeOptions,
): ReactElement {
  const width = contentWidthFor(chrome.width);
  const panelHeight = chrome.height - bandHeight;
  const showPage = options.showPage !== false;

  return box(
    {
      display: "flex",
      flexDirection: "column",
      width: chrome.width,
      height: chrome.height,
      position: "relative",
      boxSizing: "border-box",
      backgroundColor: options.background ?? chrome.tokens.background,
      overflow: "hidden",
    },
    imageLayer(imageDataUrl, {
      position: "absolute",
      top: 0,
      left: 0,
      width: chrome.width,
      height: bandHeight,
    }),
    box(
      {
        position: "absolute",
        top: bandHeight,
        left: 0,
        width: chrome.width,
        height: panelHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxSizing: "border-box",
        padding: SAFE_AREA,
        backgroundColor: options.panelColor ?? options.background ?? chrome.tokens.background,
        borderTopLeftRadius: 40,
        borderTopRightRadius: 40,
        overflow: "hidden",
      },
      box({ display: "flex", flexDirection: "column", justifyContent: "center", width, flexGrow: 1 }, body),
      footerElement({
        brandName: chrome.brandName,
        width,
        color: options.footerColor ?? chrome.tokens.mutedOnBackground,
        page: showPage && chrome.total > 0 ? `${chrome.index}/${chrome.total}` : undefined,
      }),
    ),
  );
}

function composeSlide(
  chrome: SlideChrome,
  layout: TemplateLayout,
  body: ReactElement,
  options: ComposeOptions = {},
): ReactElement {
  if (chrome.imageDataUrl) {
    return imageSlide(chrome, body, chrome.imageDataUrl, imageBandHeight(layout, chrome.height), options);
  }
  return noImageSlide(chrome, body, options);
}

/** Altura da faixa de imagem (px) para cada layout e canvas. */
export function imageBandHeight(layout: TemplateLayout, height: number): number {
  switch (layout) {
    case "cover":
      return Math.round(height * 0.4);
    case "single":
      return Math.round(height * 0.32);
    case "quote":
    case "data":
      return Math.round(height * 0.3);
    default:
      return Math.round(height * 0.3);
  }
}

// ---------------------------------------------------------------------------
// Layouts de carrossel
// ---------------------------------------------------------------------------

const coverLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 116 : 104) * (compact ? 0.86 : 1));
  const bodySize = Math.round((tall ? 36 : 34) * (compact ? 0.9 : 1));

  return composeSlide(
    chrome,
    "cover",
    box(
      { display: "flex", flexDirection: "column", width },
      accentBar(input.tokens),
      titleElement(title, base, input.tokens.textOnBackground, input.tokens, width, 40),
      body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, width, 32) : null,
    ),
    { showPage: true },
  );
};

const pointLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 88 : 80) * (compact ? 0.86 : 1));
  const bodySize = Math.round((tall ? 36 : 34) * (compact ? 0.9 : 1));
  const badgeSize = compact ? 60 : 72;

  return composeSlide(
    chrome,
    "point",
    box(
      { display: "flex", flexDirection: "column", width },
      box(
        { display: "flex", flexDirection: "row", alignItems: "center", width },
        box(
          {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: input.tokens.primary,
            marginRight: 20,
          },
          box(
            {
              display: "flex",
              fontFamily: input.tokens.fontMono,
              fontSize: Math.round(badgeSize * 0.4),
              fontWeight: 700,
              color: input.tokens.textOnPrimary,
            },
            String(input.index).padStart(2, "0"),
          ),
        ),
        box({ display: "flex", width: 64, height: 4, borderRadius: 2, backgroundColor: input.tokens.accent }),
      ),
      titleElement(title, base, input.tokens.textOnBackground, input.tokens, width, 32),
      body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, width, 28) : null,
    ),
  );
};

const dataLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 92 : 84) * (compact ? 0.86 : 1));
  const bodySize = Math.round((tall ? 36 : 34) * (compact ? 0.9 : 1));

  return composeSlide(
    chrome,
    "data",
    box(
      { display: "flex", flexDirection: "column", width },
      kicker("Dado", input.tokens, input.tokens.textOnBackground, width),
      titleElement(title, base, input.tokens.textOnBackground, input.tokens, width, 24),
      body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, width, 28) : null,
    ),
  );
};

const quoteLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 90 : 82) * (compact ? 0.86 : 1));
  const bodySize = Math.round((tall ? 36 : 34) * (compact ? 0.9 : 1));

  return composeSlide(
    chrome,
    "quote",
    box(
      { display: "flex", flexDirection: "column", width },
      box(
        {
          display: "flex",
          fontFamily: input.tokens.fontHeading,
          fontSize: compact ? 132 : 156,
          fontWeight: 700,
          lineHeight: 1,
          height: compact ? 100 : 118,
          color: input.tokens.accent,
        },
        "“",
      ),
      titleElement(title, base, input.tokens.textOnBackground, input.tokens, width, 16),
      body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, width, 28) : null,
    ),
  );
};

const ctaLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 82 : 74) * (compact ? 0.86 : 1));
  const bodySize = Math.round((tall ? 34 : 32) * (compact ? 0.9 : 1));
  const card = box(
    {
      display: "flex",
      flexDirection: "column",
      width,
      boxSizing: "border-box",
      backgroundColor: input.tokens.background,
      borderRadius: input.tokens.radius,
      padding: compact ? 44 : 56,
    },
    kicker("Próximo passo", input.tokens, input.tokens.textOnBackground, width - (compact ? 88 : 112)),
    titleElement(title, base, input.tokens.textOnBackground, input.tokens, width - (compact ? 88 : 112), 20),
    body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, width - (compact ? 88 : 112), 24) : null,
    pillLabel(`Conhecer ${truncateChars(input.brandName, 24)}`, input.tokens, input.tokens.primary, input.tokens.textOnPrimary),
  );

  return composeSlide(
    chrome,
    "cta",
    box({ display: "flex", flexDirection: "column", width, justifyContent: "center", flexGrow: 1 }, card),
    { background: input.tokens.primary, panelColor: input.tokens.primary, footerColor: input.tokens.textOnPrimary },
  );
};

export const cover: SlideTemplate = coverLayout;
export const point: SlideTemplate = pointLayout;
export const data: SlideTemplate = dataLayout;
export const quote: SlideTemplate = quoteLayout;
export const cta: SlideTemplate = ctaLayout;

/** Escolhe o template pelo `layout` declarado no slide. */
export function renderSlideTemplate(layout: CarouselSlide["layout"], input: SlideTemplateInput): ReactElement {
  switch (layout) {
    case "cover":
      return cover(input);
    case "point":
      return point(input);
    case "data":
      return data(input);
    case "quote":
      return quote(input);
    case "cta":
      return cta(input);
    default:
      // Defesa em profundidade: o renderer já normaliza layouts desconhecidos.
      return point(input);
  }
}

// ---------------------------------------------------------------------------
// Criativo único
// ---------------------------------------------------------------------------

const MAX_SUBHEADLINE_WORDS = 14;
const MAX_CTA_WORDS = 6;

export function singleCreative(input: SingleCreativeTemplateInput): ReactElement {
  const width = contentWidthFor(input.width);
  const chrome: SlideChrome = {
    tokens: input.tokens,
    brandName: input.brandName,
    index: 1,
    total: 0,
    width: input.width,
    height: input.height,
    imageDataUrl: input.imageDataUrl ?? null,
  };

  const headline = truncateTitle(input.headline);
  const subheadline = truncateChars(truncateWords(input.subheadline, MAX_SUBHEADLINE_WORDS), 180);
  const body = truncateBody(input.body);
  const ctaLabel = truncateChars(truncateWords(input.cta, MAX_CTA_WORDS), 90);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 104 : 94) * (compact ? 0.78 : 1));
  const subheadlineSize = Math.round((tall ? 40 : 38) * (compact ? 0.84 : 1));
  const bodySize = Math.round((tall ? 32 : 30) * (compact ? 0.9 : 1));

  return composeSlide(
    chrome,
    "single",
    box(
      { display: "flex", flexDirection: "column", width, justifyContent: "center", flexGrow: 1 },
      accentBar(input.tokens),
      titleElement(headline, base, input.tokens.textOnBackground, input.tokens, width, 36),
      subheadline
        ? box(
            {
              display: "flex",
              fontFamily: input.tokens.fontHeading,
              fontSize: subheadlineSize,
              fontWeight: 600,
              lineHeight: 1.25,
              color: input.tokens.textOnBackground,
              width,
              marginTop: 24,
            },
            subheadline,
          )
        : null,
      body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, width, 24) : null,
      ctaLabel
        ? pillLabel(ctaLabel, input.tokens, input.tokens.primary, input.tokens.textOnPrimary)
        : null,
    ),
    { showPage: false },
  );
}
