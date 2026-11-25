import { createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

import type { CarouselSlide, VisualThemeId } from "@/types/domain";

import { SATORI_FONT_FAMILY, SATORI_MONO_FAMILY } from "./fonts";
import type { ResolvedVisualTokens } from "./tokens";

/**
 * Templates editoriais do Motor Visual v2 (determinístico, sem custo de IA).
 *
 * Regras garantidas:
 *  - safe-area de 72 px em todos os lados;
 *  - título com no máximo 8 palavras, corpo com no máximo 35 palavras;
 *  - cores de texto sempre vêm de `ResolvedVisualTokens` (contraste AA garantido);
 *  - capa em fundo primário da marca (ritmo escuro -> miolo claro -> CTA escuro);
 *  - barra de progresso visual do carrossel + logomarca real do cliente (quando enviada);
 *  - quando há imagem (carrossel híbrido/criativo único), ela é composta como faixa
 *    superior e o texto fica em um painel sólido — a imagem nunca é removida.
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
  /** Logomarca real da marca embutida como data URL PNG (opcional). */
  brandLogoDataUrl?: string | null;
  /** Tema visual escolhido pelo Orquestrador (4 composições distintas). */
  visualTheme?: VisualThemeId;
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
  brandLogoDataUrl?: string | null;
  visualTheme?: VisualThemeId;
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
  brandLogoDataUrl?: string | null;
  visualTheme?: VisualThemeId;
}

interface ComposeOptions {
  background?: string;
  footerColor?: string;
  panelColor?: string;
  showPage?: boolean;
  topTag?: string;
  topStripeColor?: string;
  swipeCue?: boolean;
  isDarkSurface?: boolean;
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
    brandLogoDataUrl: input.brandLogoDataUrl ?? null,
    visualTheme: input.visualTheme ?? "editorial_classic",
  };
}

// ---------------------------------------------------------------------------
// Helpers de árvore
// ---------------------------------------------------------------------------

/** `React.createElement` com filhos nulos/booleanos/vazios removidos. */
function box(style: CSSProperties, ...children: ReactNode[]): ReactElement {
  const visible = children.filter(
    (child) => child !== null && child !== undefined && child !== false && child !== "",
  );
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
  if (length <= 28) return baseSize;
  if (length <= 44) return Math.round(baseSize * 0.9);
  if (length <= 62) return Math.round(baseSize * 0.8);
  if (length <= 86) return Math.round(baseSize * 0.7);
  return Math.max(40, Math.round(baseSize * 0.6));
}

// ---------------------------------------------------------------------------
// Peças visuais editoriais
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
      marginBottom: 10,
    },
    box({
      display: "flex",
      width: 36,
      height: 6,
      borderRadius: 3,
      backgroundColor: tokens.accent,
      marginRight: 14,
    }),
    box(
      {
        display: "flex",
        fontFamily: tokens.fontHeading,
        fontSize: 21,
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
      lineHeight: 1.08,
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
      lineHeight: 1.52,
      color,
      width,
      marginTop,
    },
    text,
  );
}

function pillLabel(
  label: string,
  tokens: ResolvedVisualTokens,
  background: string,
  color: string,
): ReactElement {
  return box(
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: background,
      borderRadius: 999,
      paddingLeft: 30,
      paddingRight: 30,
      paddingTop: 18,
      paddingBottom: 18,
      marginTop: 34,
    },
    box(
      {
        display: "flex",
        fontFamily: tokens.fontHeading,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: 0.4,
        color,
      },
      `${label} →`,
    ),
  );
}

/** Barra superior editorial com tag de seção e progresso segmentado do carrossel. */
function topBarElement(chrome: SlideChrome, options: ComposeOptions): ReactElement {
  const width = contentWidthFor(chrome.width);
  const textColor = options.footerColor ?? chrome.tokens.mutedOnBackground;
  const tagText = options.topTag ?? (chrome.total > 0 ? `SLIDE ${String(chrome.index).padStart(2, "0")}` : chrome.brandName);
  const segments = Math.min(10, Math.max(0, chrome.total));

  const progressBars =
    segments > 1
      ? box(
          {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          },
          ...Array.from({ length: segments }, (_, i) =>
            box({
              display: "flex",
              width: i + 1 === chrome.index ? 34 : 18,
              height: 6,
              borderRadius: 3,
              backgroundColor: i + 1 <= chrome.index ? chrome.tokens.accent : textColor,
              opacity: i + 1 <= chrome.index ? 1 : 0.25,
            }),
          ),
        )
      : box({ display: "flex", width: 1 });

  return box(
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width,
      marginBottom: 24,
    },
    box(
      {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 16,
        paddingRight: 18,
        paddingTop: 8,
        paddingBottom: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: options.isDarkSurface ? "rgba(255,255,255,0.22)" : "rgba(24,19,49,0.14)",
        backgroundColor: options.isDarkSurface ? "rgba(255,255,255,0.08)" : "rgba(24,19,49,0.04)",
      },
      box({
        display: "flex",
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: chrome.tokens.accent,
        marginRight: 10,
      }),
      box(
        {
          display: "flex",
          fontFamily: SATORI_MONO_FAMILY,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: textColor,
        },
        truncateChars(tagText.toUpperCase(), 26),
      ),
    ),
    progressBars,
  );
}

interface FooterOptions {
  brandName: string;
  brandLogoDataUrl?: string | null;
  width: number;
  color: string;
  page?: string;
  hasAiImagery?: boolean;
  swipeCue?: boolean;
  isDarkSurface?: boolean;
}

function footerElement(options: FooterOptions): ReactElement {
  const maxBrandChars = options.brandLogoDataUrl ? (options.hasAiImagery ? 16 : 22) : 34;
  const brand = truncateChars(options.brandName.toUpperCase(), maxBrandChars) || "MARCA";
  const label = options.hasAiImagery ? `${brand} · IA` : brand;

  const brandBlock = box(
    {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    options.brandLogoDataUrl
      ? box(
          {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 240,
            height: 78,
            paddingLeft: 12,
            paddingRight: 12,
            borderRadius: 16,
            backgroundColor: options.isDarkSurface ? "#FFFFFF" : "rgba(24,19,49,0.05)",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: options.isDarkSurface ? "rgba(255,255,255,0.28)" : "rgba(24,19,49,0.10)",
          },
          imageLayer(options.brandLogoDataUrl, {
            width: 216,
            height: 64,
            objectFit: "contain",
          }),
        )
      : null,
    box(
      {
        display: "flex",
        fontFamily: SATORI_FONT_FAMILY,
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: 1.8,
        color: options.color,
      },
      label,
    ),
  );

  const rightLabel = options.swipeCue
    ? options.page
      ? `DESLIZE →  ·  ${options.page}`
      : "DESLIZE →"
    : options.page;

  return box(
    {
      display: "flex",
      flexDirection: "column",
      width: options.width,
      marginTop: 28,
    },
    box({
      display: "flex",
      width: options.width,
      height: 1,
      backgroundColor: options.color,
      opacity: 0.24,
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
      brandBlock,
      rightLabel
        ? box(
            {
              display: "flex",
              fontFamily: SATORI_MONO_FAMILY,
              fontSize: 20,
              fontWeight: 700,
              color: options.color,
            },
            rightLabel,
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
  const stripeColor = options.topStripeColor ?? chrome.tokens.accent;
  const theme: VisualThemeId = chrome.visualTheme ?? "editorial_classic";

  const isForcedDark = theme === "dark_impact";
  const resolvedDark = isForcedDark || Boolean(options.isDarkSurface);
  const resolvedBg = isForcedDark
    ? chrome.tokens.primary
    : options.background ?? chrome.tokens.background;
  const resolvedFooterColor = isForcedDark
    ? chrome.tokens.textOnPrimary
    : options.footerColor ?? chrome.tokens.mutedOnBackground;

  const decorativeLayers: (ReactElement | null)[] =
    theme === "magazine_split"
      ? [
          // Faixa vertical lateral forte (estilo revista editorial)
          box({
            position: "absolute",
            top: 0,
            left: 0,
            width: 24,
            height: chrome.height,
            backgroundColor: stripeColor,
          }),
          // Numeração gigante em marca d'água no canto superior direito
          chrome.index > 0
            ? box(
                {
                  position: "absolute",
                  top: 36,
                  right: 52,
                  display: "flex",
                  fontFamily: chrome.tokens.fontHeading,
                  fontSize: 220,
                  fontWeight: 700,
                  lineHeight: 0.9,
                  color: resolvedDark ? "#FFFFFF" : chrome.tokens.primary,
                  opacity: resolvedDark ? 0.08 : 0.06,
                },
                String(chrome.index).padStart(2, "0"),
              )
            : null,
        ]
      : theme === "dark_impact"
        ? [
            // Moldura interna luminosa de alto contraste
            box({
              position: "absolute",
              top: 24,
              left: 24,
              width: chrome.width - 48,
              height: chrome.height - 48,
              borderRadius: 28,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: chrome.tokens.accent,
              opacity: 0.45,
            }),
            box({
              position: "absolute",
              bottom: -160,
              left: -120,
              width: 440,
              height: 440,
              borderRadius: 220,
              backgroundColor: chrome.tokens.accent,
              opacity: 0.16,
            }),
          ]
        : theme === "swiss_minimal"
          ? [
              // Grid arquitetônico suíço: linhas estruturais finas sem blobs
              box({
                position: "absolute",
                top: 0,
                left: 0,
                width: chrome.width,
                height: 6,
                backgroundColor: chrome.tokens.primary,
              }),
              box({
                position: "absolute",
                top: 44,
                left: 44,
                width: 18,
                height: 18,
                backgroundColor: chrome.tokens.accent,
              }),
              box({
                position: "absolute",
                top: 0,
                left: 52,
                width: 1,
                height: chrome.height,
                backgroundColor: resolvedDark ? "rgba(255,255,255,0.12)" : "rgba(24,19,49,0.08)",
              }),
            ]
          : [
              // Editorial Clássico: filete superior + círculo geométrico sutil
              box({
                position: "absolute",
                top: 0,
                left: 0,
                width: chrome.width,
                height: 10,
                backgroundColor: stripeColor,
              }),
              box({
                position: "absolute",
                top: -140,
                right: -140,
                width: 420,
                height: 420,
                borderRadius: 210,
                backgroundColor: chrome.tokens.accent,
                opacity: resolvedDark ? 0.14 : 0.07,
              }),
            ];

  return box(
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      position: "relative",
      width: chrome.width,
      boxSizing: "border-box",
      height: chrome.height,
      padding: SAFE_AREA,
      backgroundColor: resolvedBg,
      overflow: "hidden",
    },
    ...decorativeLayers,
    topBarElement(chrome, { ...options, isDarkSurface: resolvedDark, footerColor: resolvedFooterColor }),
    box(
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width,
        flexGrow: 1,
      },
      body,
    ),
    footerElement({
      brandName: chrome.brandName,
      brandLogoDataUrl: chrome.brandLogoDataUrl,
      width,
      color: resolvedFooterColor,
      page: showPage && chrome.total > 0 ? `${chrome.index}/${chrome.total}` : undefined,
      swipeCue: options.swipeCue,
      isDarkSurface: resolvedDark,
    }),
  );
}

type ImageCompositionMode = "full_bleed_hero" | "editorial_overlap" | "framed_gallery" | "dark_spotlight";

function resolveImageComposition(
  layout: TemplateLayout,
  index: number,
  visualTheme?: VisualThemeId,
): ImageCompositionMode {
  if (layout === "cover" || layout === "single") {
    return "full_bleed_hero";
  }
  const themeOffset =
    visualTheme === "magazine_split"
      ? 1
      : visualTheme === "dark_impact"
        ? 2
        : visualTheme === "swiss_minimal"
          ? 1
          : 0;
  const slot = (index + themeOffset) % 3;
  if (slot === 1) return "editorial_overlap";
  if (slot === 2) return "framed_gallery";
  return "dark_spotlight";
}

function imageSlide(
  chrome: SlideChrome,
  layout: TemplateLayout,
  body: ReactElement,
  imageDataUrl: string,
  bandHeight: number,
  options: ComposeOptions,
): ReactElement {
  const width = contentWidthFor(chrome.width);
  const showPage = options.showPage !== false;
  const pageText = showPage && chrome.total > 0 ? `${chrome.index}/${chrome.total}` : undefined;
  const mode = resolveImageComposition(layout, chrome.index, chrome.visualTheme);

  // 1) FULL-BLEED HERO (Capa e Post Único): foto editorial em tela cheia + gradiente escuro cinematográfico
  if (mode === "full_bleed_hero") {
    return box(
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: chrome.width,
        height: chrome.height,
        position: "relative",
        boxSizing: "border-box",
        padding: SAFE_AREA,
        backgroundColor: chrome.tokens.primary,
        overflow: "hidden",
      },
      imageLayer(imageDataUrl, {
        position: "absolute",
        top: 0,
        left: 0,
        width: chrome.width,
        height: chrome.height,
        objectFit: "cover",
      }),
      box({
        position: "absolute",
        top: 0,
        left: 0,
        width: chrome.width,
        height: chrome.height,
        backgroundImage:
          "linear-gradient(180deg, rgba(10,12,24,0.52) 0%, rgba(10,12,24,0.18) 34%, rgba(10,12,24,0.84) 72%, rgba(10,12,24,0.96) 100%)",
      }),
      box({
        position: "absolute",
        top: 0,
        left: 0,
        width: chrome.width,
        height: 10,
        backgroundColor: chrome.tokens.accent,
      }),
      box(
        { display: "flex", flexDirection: "column", width, position: "relative" },
        topBarElement(chrome, { ...options, isDarkSurface: true, footerColor: "#FFFFFF" }),
      ),
      box(
        {
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          width,
          flexGrow: 1,
          position: "relative",
          paddingBottom: 12,
        },
        body,
      ),
      box(
        { display: "flex", flexDirection: "column", width, position: "relative" },
        footerElement({
          brandName: chrome.brandName,
          brandLogoDataUrl: chrome.brandLogoDataUrl,
          width,
          color: "#FFFFFF",
          page: pageText,
          hasAiImagery: true,
          swipeCue: options.swipeCue,
          isDarkSurface: true,
        }),
      ),
    );
  }

  // 2) FRAMED GALLERY: ritmo invertido — texto editorial lidera no topo + foto emoldurada de revista abaixo
  if (mode === "framed_gallery") {
    const galleryHeight = Math.round(chrome.height * 0.34);
    const bg = options.background ?? chrome.tokens.background;
    const isDark = Boolean(options.isDarkSurface);
    return box(
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: chrome.width,
        height: chrome.height,
        position: "relative",
        boxSizing: "border-box",
        padding: SAFE_AREA,
        backgroundColor: bg,
        overflow: "hidden",
      },
      box({
        position: "absolute",
        top: 0,
        left: 0,
        width: chrome.width,
        height: 10,
        backgroundColor: options.topStripeColor ?? chrome.tokens.accent,
      }),
      topBarElement(chrome, { ...options, isDarkSurface: isDark }),
      box(
        {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          flexGrow: 1,
          gap: 28,
        },
        box({ display: "flex", flexDirection: "column", width }, body),
        box(
          {
            display: "flex",
            width,
            height: galleryHeight,
            borderRadius: 28,
            overflow: "hidden",
            borderWidth: 2,
            borderStyle: "solid",
            borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(24,19,49,0.12)",
            position: "relative",
          },
          imageLayer(imageDataUrl, {
            width,
            height: galleryHeight,
            objectFit: "cover",
          }),
        ),
      ),
      footerElement({
        brandName: chrome.brandName,
        brandLogoDataUrl: chrome.brandLogoDataUrl,
        width,
        color: options.footerColor ?? chrome.tokens.mutedOnBackground,
        page: pageText,
        hasAiImagery: true,
        swipeCue: options.swipeCue,
        isDarkSurface: isDark,
      }),
    );
  }

  // 3) DARK SPOTLIGHT: canvas escuro de alto contraste + faixa lateral em acento + foto emoldurada no topo
  if (mode === "dark_spotlight") {
    const photoHeight = Math.round(chrome.height * 0.34);
    return box(
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: chrome.width,
        height: chrome.height,
        position: "relative",
        boxSizing: "border-box",
        padding: SAFE_AREA,
        backgroundColor: chrome.tokens.primary,
        overflow: "hidden",
      },
      box({
        position: "absolute",
        top: 0,
        left: 0,
        width: 14,
        height: chrome.height,
        backgroundColor: chrome.tokens.accent,
      }),
      topBarElement(chrome, {
        ...options,
        isDarkSurface: true,
        footerColor: chrome.tokens.textOnPrimary,
      }),
      box(
        {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width,
          flexGrow: 1,
          gap: 28,
        },
        box(
          {
            display: "flex",
            width,
            height: photoHeight,
            borderRadius: 24,
            overflow: "hidden",
            borderWidth: 2,
            borderStyle: "solid",
            borderColor: "rgba(255,255,255,0.22)",
          },
          imageLayer(imageDataUrl, {
            width,
            height: photoHeight,
            objectFit: "cover",
          }),
        ),
        box({ display: "flex", flexDirection: "column", width }, body),
      ),
      footerElement({
        brandName: chrome.brandName,
        brandLogoDataUrl: chrome.brandLogoDataUrl,
        width,
        color: chrome.tokens.textOnPrimary,
        page: pageText,
        hasAiImagery: true,
        swipeCue: options.swipeCue,
        isDarkSurface: true,
      }),
    );
  }

  // 4) EDITORIAL OVERLAP: foto editorial superior ampla + cartão flutuante sobreposto com filete de acento
  const overlapOffset = 48;
  const panelTop = Math.max(220, bandHeight - overlapOffset);
  const panelHeight = chrome.height - panelTop;

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
      objectFit: "cover",
    }),
    box({
      position: "absolute",
      top: 0,
      left: 0,
      width: chrome.width,
      height: 140,
      backgroundImage: "linear-gradient(180deg, rgba(10,12,24,0.58) 0%, rgba(10,12,24,0) 100%)",
    }),
    box(
      {
        position: "absolute",
        top: 40,
        left: SAFE_AREA,
        width,
        display: "flex",
      },
      topBarElement(chrome, { ...options, isDarkSurface: true, footerColor: "#FFFFFF" }),
    ),
    box(
      {
        position: "absolute",
        top: panelTop,
        left: 0,
        width: chrome.width,
        height: panelHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxSizing: "border-box",
        paddingLeft: SAFE_AREA,
        paddingRight: SAFE_AREA,
        paddingTop: 48,
        paddingBottom: SAFE_AREA,
        backgroundColor: options.panelColor ?? options.background ?? chrome.tokens.background,
        borderTopLeftRadius: 44,
        borderTopRightRadius: 44,
        overflow: "hidden",
      },
      box({
        position: "absolute",
        top: 0,
        left: SAFE_AREA,
        width: 140,
        height: 8,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 4,
        backgroundColor: chrome.tokens.accent,
      }),
      box({ display: "flex", flexDirection: "column", justifyContent: "center", width, flexGrow: 1 }, body),
      footerElement({
        brandName: chrome.brandName,
        brandLogoDataUrl: chrome.brandLogoDataUrl,
        width,
        color: options.footerColor ?? chrome.tokens.mutedOnBackground,
        page: pageText,
        hasAiImagery: true,
        swipeCue: options.swipeCue,
        isDarkSurface: options.isDarkSurface,
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
    return imageSlide(chrome, layout, body, chrome.imageDataUrl, imageBandHeight(layout, chrome.height), options);
  }
  return noImageSlide(chrome, body, options);
}

/** Altura da imagem preparada (px) para cada layout e canvas. */
export function imageBandHeight(layout: TemplateLayout, height: number): number {
  switch (layout) {
    case "cover":
    case "single":
      return height;
    case "quote":
    case "data":
      return Math.round(height * 0.44);
    default:
      return Math.round(height * 0.44);
  }
}

// ---------------------------------------------------------------------------
// Layouts de carrossel (Motor Visual v2)
// ---------------------------------------------------------------------------

/** Capa em fundo primário da marca: alto impacto no feed + ritmo visual escuro -> claro. */
const coverLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 114 : 102) * (compact ? 0.92 : 1));
  const bodySize = Math.round((tall ? 36 : 34) * (compact ? 0.94 : 1));
  const coverTextColor = compact ? "#FFFFFF" : input.tokens.textOnPrimary;

  return composeSlide(
    chrome,
    "cover",
    box(
      { display: "flex", flexDirection: "column", width },
      accentBar(input.tokens, 112),
      titleElement(title, base, coverTextColor, input.tokens, width, 34),
      body
        ? box(
            {
              display: "flex",
              flexDirection: "row",
              alignItems: "stretch",
              width,
              marginTop: 28,
            },
            box({
              display: "flex",
              width: 6,
              borderRadius: 3,
              backgroundColor: input.tokens.accent,
              marginRight: 22,
            }),
            bodyElement(body, bodySize, coverTextColor, input.tokens, width - 28, 0),
          )
        : null,
    ),
    {
      background: input.tokens.primary,
      panelColor: input.tokens.primary,
      footerColor: input.tokens.textOnPrimary,
      topTag: "CAPA · GUIA",
      topStripeColor: input.tokens.accent,
      showPage: true,
      swipeCue: true,
      isDarkSurface: true,
    },
  );
};

/** Slide de ponto: cartão editorial elevado com numeral grande + barra de acento. */
const pointLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 86 : 78) * (compact ? 0.85 : 1));
  const bodySize = Math.round((tall ? 36 : 34) * (compact ? 0.9 : 1));
  const pad = compact ? 36 : 48;
  const innerWidth = width - pad * 2;
  const badgeSize = compact ? 58 : 70;

  const card = box(
    {
      display: "flex",
      flexDirection: "column",
      width,
      boxSizing: "border-box",
      padding: pad,
      borderRadius: input.tokens.radius + 10,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "rgba(24,19,49,0.12)",
      backgroundColor: "rgba(255,255,255,0.82)",
    },
    box(
      { display: "flex", flexDirection: "row", alignItems: "center", width: innerWidth },
      box(
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: badgeSize,
          height: badgeSize,
          borderRadius: 16,
          backgroundColor: input.tokens.primary,
          marginRight: 20,
        },
        box(
          {
            display: "flex",
            fontFamily: input.tokens.fontMono,
            fontSize: Math.round(badgeSize * 0.44),
            fontWeight: 700,
            color: input.tokens.textOnPrimary,
          },
          String(input.index).padStart(2, "0"),
        ),
      ),
      box({
        display: "flex",
        width: 72,
        height: 6,
        borderRadius: 3,
        backgroundColor: input.tokens.accent,
      }),
    ),
    titleElement(title, base, input.tokens.textOnBackground, input.tokens, innerWidth, 30),
    body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, innerWidth, 26) : null,
  );

  return composeSlide(chrome, "point", card, {
    topTag: `PONTO ${String(input.index).padStart(2, "0")}`,
    topStripeColor: input.tokens.primary,
  });
};

/** Slide de dado: destaque estrutural com barra lateral espessa em acento. */
const dataLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 92 : 84) * (compact ? 0.85 : 1));
  const bodySize = Math.round((tall ? 36 : 34) * (compact ? 0.9 : 1));
  const pad = compact ? 36 : 48;
  const innerWidth = width - pad * 2 - 12;

  const dataCard = box(
    {
      display: "flex",
      flexDirection: "row",
      width,
      boxSizing: "border-box",
      borderRadius: input.tokens.radius + 10,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "rgba(24,19,49,0.12)",
      backgroundColor: "rgba(255,255,255,0.88)",
      overflow: "hidden",
    },
    box({
      display: "flex",
      width: 12,
      backgroundColor: input.tokens.accent,
    }),
    box(
      {
        display: "flex",
        flexDirection: "column",
        padding: pad,
        width: width - 12,
        boxSizing: "border-box",
      },
      kicker("Dado em destaque", input.tokens, input.tokens.textOnBackground, innerWidth),
      titleElement(title, base, input.tokens.textOnBackground, input.tokens, innerWidth, 20),
      body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, innerWidth, 26) : null,
    ),
  );

  return composeSlide(chrome, "data", dataCard, {
    topTag: "DADO REAL",
    topStripeColor: input.tokens.accent,
  });
};

/** Slide de citação / regra de ouro: caixa editorial com aspas de impacto. */
const quoteLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 88 : 80) * (compact ? 0.85 : 1));
  const bodySize = Math.round((tall ? 36 : 34) * (compact ? 0.9 : 1));
  const pad = compact ? 36 : 48;
  const innerWidth = width - pad * 2;

  const quoteCard = box(
    {
      display: "flex",
      flexDirection: "column",
      width,
      boxSizing: "border-box",
      padding: pad,
      borderRadius: input.tokens.radius + 10,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "rgba(24,19,49,0.12)",
      backgroundColor: "rgba(255,255,255,0.75)",
    },
    box(
      {
        display: "flex",
        fontFamily: input.tokens.fontHeading,
        fontSize: compact ? 120 : 148,
        fontWeight: 700,
        lineHeight: 1,
        height: compact ? 88 : 108,
        color: input.tokens.accent,
      },
      "“",
    ),
    titleElement(title, base, input.tokens.textOnBackground, input.tokens, innerWidth, 10),
    body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, innerWidth, 26) : null,
  );

  return composeSlide(chrome, "quote", quoteCard, {
    topTag: "INSIGHT",
    topStripeColor: input.tokens.primary,
  });
};

/** Slide final (CTA): fundo primário da marca com cartão branco de conversão. */
const ctaLayout: SlideTemplate = (input) => {
  const width = contentWidthFor(input.width);
  const chrome = chromeFor(input);
  const title = truncateTitle(input.title);
  const body = truncateBody(input.body);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 80 : 72) * (compact ? 0.85 : 1));
  const bodySize = Math.round((tall ? 34 : 32) * (compact ? 0.9 : 1));
  const pad = compact ? 42 : 54;
  const innerWidth = width - pad * 2;

  const card = box(
    {
      display: "flex",
      flexDirection: "column",
      width,
      boxSizing: "border-box",
      backgroundColor: input.tokens.background,
      borderRadius: input.tokens.radius + 12,
      padding: pad,
    },
    kicker("Próximo passo", input.tokens, input.tokens.textOnBackground, innerWidth),
    titleElement(title, base, input.tokens.textOnBackground, input.tokens, innerWidth, 18),
    body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, innerWidth, 22) : null,
    pillLabel(
      `Conhecer ${truncateChars(input.brandName, 22)}`,
      input.tokens,
      input.tokens.primary,
      input.tokens.textOnPrimary,
    ),
  );

  return composeSlide(
    chrome,
    "cta",
    box({ display: "flex", flexDirection: "column", width, justifyContent: "center", flexGrow: 1 }, card),
    {
      background: input.tokens.primary,
      panelColor: input.tokens.primary,
      footerColor: input.tokens.textOnPrimary,
      topTag: "PRÓXIMO PASSO",
      topStripeColor: input.tokens.accent,
      isDarkSurface: true,
    },
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
      return point(input);
  }
}

// ---------------------------------------------------------------------------
// Criativo único (Motor Visual v2)
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
    brandLogoDataUrl: input.brandLogoDataUrl ?? null,
    visualTheme: input.visualTheme ?? "editorial_classic",
  };

  const headline = truncateTitle(input.headline);
  const subheadline = truncateChars(truncateWords(input.subheadline, MAX_SUBHEADLINE_WORDS), 180);
  const body = truncateBody(input.body);
  const ctaLabel = truncateChars(truncateWords(input.cta, MAX_CTA_WORDS), 90);
  const compact = Boolean(input.imageDataUrl);
  const tall = isTall(input.height);
  const base = Math.round((tall ? 98 : 88) * (compact ? 0.78 : 1));
  const subheadlineSize = Math.round((tall ? 38 : 36) * (compact ? 0.84 : 1));
  const bodySize = Math.round((tall ? 32 : 30) * (compact ? 0.9 : 1));
  const pad = compact ? 32 : 48;
  const innerWidth = width - pad * 2;

  const contentCard = box(
    {
      display: "flex",
      flexDirection: "column",
      width,
      boxSizing: "border-box",
      padding: pad,
      borderRadius: input.tokens.radius + 10,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "rgba(24,19,49,0.12)",
      backgroundColor: "rgba(255,255,255,0.88)",
    },
    accentBar(input.tokens, 92),
    titleElement(headline, base, input.tokens.textOnBackground, input.tokens, innerWidth, 30),
    subheadline
      ? box(
          {
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            width: innerWidth,
            marginTop: 26,
          },
          box({
            display: "flex",
            width: 6,
            borderRadius: 3,
            backgroundColor: input.tokens.accent,
            marginRight: 18,
          }),
          box(
            {
              display: "flex",
              fontFamily: input.tokens.fontHeading,
              fontSize: subheadlineSize,
              fontWeight: 600,
              lineHeight: 1.28,
              color: input.tokens.textOnBackground,
              width: innerWidth - 24,
            },
            subheadline,
          ),
        )
      : null,
    body ? bodyElement(body, bodySize, input.tokens.mutedOnBackground, input.tokens, innerWidth, 24) : null,
    ctaLabel
      ? pillLabel(ctaLabel, input.tokens, input.tokens.primary, input.tokens.textOnPrimary)
      : null,
  );

  return composeSlide(chrome, "single", contentCard, {
    showPage: false,
    topTag: input.brandName,
    topStripeColor: input.tokens.accent,
  });
}
