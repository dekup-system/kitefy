import { z } from "zod";

import type { VisualTokens } from "@/types/domain";

import { SATORI_FONT_FAMILY, SATORI_MONO_FAMILY } from "./fonts";

/**
 * Tokens visuais resolvidos para o renderizador.
 *
 * Todas as cores saem daqui como hex sRGB (`#rrggbb`), que é CSS válido tanto
 * para o satori quanto para o resvg. Entradas OKLCH são convertidas para o hex
 * sRGB equivalente (gamut clampado), o que torna a renderização determinística
 * e permite calcular contraste WCAG sem depender do navegador.
 *
 * Pares de texto (`textOnBackground`, `mutedOnBackground`, `textOnPrimary`,
 * `textOnAccent`) já vêm com contraste >= 4.5:1 garantido contra o fundo
 * correspondente — os templates nunca usam cor crua para texto.
 */
export interface ResolvedVisualTokens {
  theme: "light" | "dark";
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
  /** Texto principal sobre `background` (WCAG AA). */
  textOnBackground: string;
  /** Texto secundário sobre `background` (WCAG AA). */
  mutedOnBackground: string;
  /** Texto sobre preenchimentos com `primary` (WCAG AA). */
  textOnPrimary: string;
  /** Texto sobre preenchimentos com `accent` (WCAG AA). */
  textOnAccent: string;
  /** Família realmente embutida no satori (Geist). */
  fontHeading: string;
  fontBody: string;
  fontMono: string;
  /** Raio de borda em px (0-96). */
  radius: number;
}

/** Canais sRGB inteiros no intervalo 0-255. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Resultado de `ensureContrast`: par seguro + razão de contraste final. */
export interface ContrastResult {
  fg: string;
  bg: string;
  /** Razão WCAG (1 a 21). */
  ratio: number;
  /** `true` quando a cor de texto precisou ser ajustada. */
  adjusted: boolean;
}

const MIN_TEXT_CONTRAST = 4.5;
const MAX_CONTRAST = 21;

/**
 * Defaults neutros de alto contraste. O tema claro é o padrão do produto
 * (fundo #fdfdfd, texto #17171a, primário #1f1f23, accent #3f3f46).
 */
const LIGHT_DEFAULTS = {
  background: "#fdfdfd",
  foreground: "#17171a",
  primary: "#1f1f23",
  secondary: "#52525b",
  accent: "#3f3f46",
  muted: "#52525b",
} as const;

/** Variante escura: mesmos papéis, com luminosidade invertida. */
const DARK_DEFAULTS = {
  background: "#131316",
  foreground: "#f5f5f6",
  primary: "#f5f5f6",
  secondary: "#d4d4d8",
  accent: "#d4d4d8",
  muted: "#b9b9c0",
} as const;

export const DEFAULT_VISUAL_TOKENS = LIGHT_DEFAULTS;

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `oklch(L C H)` com L em [0,1] ou %, C numérico ou % (100% = 0.4, conforme
 * CSS Color 4), H em deg (padrão), grad, rad ou turn. Alpha é aceito na
 * sintaxe, porém ignorado: os tokens são opacos e o contraste é calculado
 * sobre a cor sólida.
 */
const OKLCH_PATTERN =
  /^oklch\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))(%?)\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))(%?)\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+)|none)(deg|grad|rad|turn)?(?:\s*\/\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:%?))?\s*\)$/i;

const WHITE: RgbColor = { r: 255, g: 255, b: 255 };
const BLACK: RgbColor = { r: 0, g: 0, b: 0 };

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clampNumber(value, 0, 1);
}

function parseHexColor(hex: string): RgbColor {
  const body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    const expand = (position: number): number => parseInt(body.charAt(position).repeat(2), 16);
    return { r: expand(0), g: expand(1), b: expand(2) };
  }
  const read = (position: number): number => parseInt(body.slice(position, position + 2), 16);
  return { r: read(0), g: read(2), b: read(4) };
}

/** Encode linear-light sRGB (0-1) em canal sRGB (0-255), aplicando gamma. */
function linearToSrgbChannel(linear: number): number {
  const value = clamp01(linear);
  const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  return Math.round(clamp01(encoded) * 255);
}

/** OKLCH -> sRGB usando a fórmula OKLab padrão (Björn Ottosson). */
function parseOklchColor(match: RegExpExecArray): RgbColor {
  const lightnessRaw = Number(match[1]);
  const lightness = clamp01(match[2] === "%" ? lightnessRaw / 100 : lightnessRaw);

  const chromaRaw = Number(match[3]);
  const chroma = Math.max(0, match[4] === "%" ? (chromaRaw / 100) * 0.4 : chromaRaw);

  const hueRaw = match[5] === "none" ? 0 : Number(match[5]);
  const unit = (match[6] ?? "deg").toLowerCase();
  const degrees =
    unit === "grad" ? hueRaw * 0.9 : unit === "rad" ? (hueRaw * 180) / Math.PI : unit === "turn" ? hueRaw * 360 : hueRaw;
  const hueRadians = ((degrees % 360) + 360) % 360 * (Math.PI / 180);

  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);

  // OKLab -> LMS cônico
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime * lPrime * lPrime;
  const m = mPrime * mPrime * mPrime;
  const s = sPrime * sPrime * sPrime;

  // LMS -> sRGB linear
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: linearToSrgbChannel(red),
    g: linearToSrgbChannel(green),
    b: linearToSrgbChannel(blue),
  };
}

/** Converte hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) ou `oklch(...)` em RGB. */
export function parseColorOrNull(value: unknown): RgbColor | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (input.length === 0) return null;

  if (HEX_PATTERN.test(input)) {
    return parseHexColor(input);
  }

  const oklch = OKLCH_PATTERN.exec(input);
  if (oklch) {
    const rgb = parseOklchColor(oklch);
    if ([rgb.r, rgb.g, rgb.b].every((channel) => Number.isFinite(channel))) return rgb;
    return null;
  }

  return null;
}

/** Igual a `parseColorOrNull`, mas lança erro com mensagem acionável. */
export function parseColor(value: string): RgbColor {
  const parsed = parseColorOrNull(value);
  if (!parsed) {
    throw new Error(
      `Cor não suportada: "${value.slice(0, 80)}". Use hex (#rgb ou #rrggbb) ou oklch(L C H).`,
    );
  }
  return parsed;
}

/** Indica se o valor é uma cor aceita pelo motor visual. */
export function isSupportedColor(value: unknown): boolean {
  return parseColorOrNull(value) !== null;
}

/** RGB -> hex minúsculo `#rrggbb`. */
export function rgbToHex(color: RgbColor): string {
  const toHex = (channel: number): string =>
    Math.round(clampNumber(channel, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/** Luminância relativa sRGB (WCAG 2.x). */
export function relativeLuminance(color: RgbColor): number {
  const linear = (channel: number): number => {
    const normalized = clampNumber(channel, 0, 255) / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Mistura linear em sRGB: `t=0` devolve `from`, `t=1` devolve `to`. */
function mixRgb(from: RgbColor, to: RgbColor, t: number): RgbColor {
  const ratio = clamp01(t);
  return {
    r: from.r + (to.r - from.r) * ratio,
    g: from.g + (to.g - from.g) * ratio,
    b: from.b + (to.b - from.b) * ratio,
  };
}

/**
 * Ajusta a luminosidade do texto até alcançar `minRatio` (padrão 4.5:1 — AA).
 *
 * A direção é escolhida pelo maior contraste alcançável contra o fundo
 * (preto ou branco). O resultado é o menor desvio possível do `fg` original,
 * preservando ao máximo a cor de marca. Texto preto sobre fundo branco já
 * passa e é devolvido intacto.
 */
export function ensureContrast(fg: string, bg: string, minRatio = MIN_TEXT_CONTRAST): ContrastResult {
  const fgRgb = parseColor(fg);
  const bgRgb = parseColor(bg);
  const targetRatio = clampNumber(minRatio, 1, MAX_CONTRAST);

  const background = rgbToHex(bgRgb);
  const initial = contrastRatio(fgRgb, bgRgb);
  if (initial >= targetRatio) {
    return { fg: rgbToHex(fgRgb), bg: background, ratio: initial, adjusted: false };
  }

  const contrastWithWhite = contrastRatio(WHITE, bgRgb);
  const contrastWithBlack = contrastRatio(BLACK, bgRgb);
  const destination = contrastWithWhite >= contrastWithBlack ? WHITE : BLACK;

  const steps = 512;
  for (let step = 1; step <= steps; step += 1) {
    const candidate = mixRgb(fgRgb, destination, step / steps);
    const ratio = contrastRatio(candidate, bgRgb);
    if (ratio >= targetRatio) {
      return { fg: rgbToHex(candidate), bg: background, ratio, adjusted: true };
    }
  }

  // Não foi possível atingir o alvo: devolve o maior contraste disponível.
  return { fg: rgbToHex(destination), bg: background, ratio: contrastRatio(destination, bgRgb), adjusted: true };
}

function resolveColor(value: unknown, fallback: string): string {
  const parsed = parseColorOrNull(value);
  return parsed ? rgbToHex(parsed) : rgbToHex(parseColor(fallback));
}

/**
 * Texto para preenchimentos de marca (botões, cards).
 *
 * Diferente do texto sobre o fundo, aqui não vale a pena preservar a cor
 * original: um CTA pastoso não parece um CTA. Partimos do extremo de maior
 * contraste (branco ou preto) e só ajustamos se necessário, garantindo AA.
 */
function highestContrastText(background: string): string {
  const bg = parseColor(background);
  const candidate = contrastRatio(WHITE, bg) >= contrastRatio(BLACK, bg) ? "#ffffff" : "#000000";
  return ensureContrast(candidate, background).fg;
}

function resolveRadius(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 24;
  return Math.round(clampNumber(value, 0, 96));
}

/**
 * Resolve tokens parciais (JSONB do banco) em um contrato completo e seguro.
 *
 * É tolerante por design: campos ausentes ou inválidos caem em defaults, de
 * modo que um `visual_tokens` corrompido nunca quebra um lote inteiro. Para
 * validação estrita na borda de entrada use `visualTokensSchema`.
 */
export function resolveVisualTokens(input: VisualTokens | null | undefined): ResolvedVisualTokens {
  const source: VisualTokens = input ?? {};
  const theme: "light" | "dark" = source.theme === "dark" ? "dark" : "light";
  const defaults = theme === "dark" ? DARK_DEFAULTS : LIGHT_DEFAULTS;

  const background = resolveColor(source.background, defaults.background);
  const foreground = resolveColor(source.foreground, defaults.foreground);
  const primary = resolveColor(source.primary, defaults.primary);
  const secondary = resolveColor(source.secondary, defaults.secondary);
  const accent = resolveColor(source.accent, defaults.accent);
  const muted = resolveColor(source.muted, defaults.muted);

  return {
    theme,
    background,
    foreground,
    primary,
    secondary,
    accent,
    muted,
    textOnBackground: ensureContrast(foreground, background).fg,
    mutedOnBackground: ensureContrast(muted, background).fg,
    textOnPrimary: highestContrastText(primary),
    textOnAccent: highestContrastText(accent),
    fontHeading: SATORI_FONT_FAMILY,
    fontBody: SATORI_FONT_FAMILY,
    fontMono: SATORI_MONO_FAMILY,
    radius: resolveRadius(source.radius),
  };
}

const colorSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => isSupportedColor(value), {
    message: "Cor inválida: use hex (#rgb/#rrggbb) ou oklch(L C H).",
  });

/**
 * Schema Zod para o JSONB `brand_profiles.visual_tokens`.
 *
 * Campos desconhecidos são descartados; cores fora do formato suportado
 * falham com mensagem explícita. Use em rotas/actions antes de persistir.
 */
export const visualTokensSchema = z.object({
  primary: colorSchema.optional(),
  secondary: colorSchema.optional(),
  accent: colorSchema.optional(),
  background: colorSchema.optional(),
  foreground: colorSchema.optional(),
  muted: colorSchema.optional(),
  font_heading: z.string().trim().min(1).max(80).optional(),
  font_body: z.string().trim().min(1).max(80).optional(),
  font_mono: z.string().trim().min(1).max(80).optional(),
  logo_path: z.string().trim().min(1).max(500).optional(),
  radius: z.number().min(0).max(96).optional(),
  theme: z.enum(["light", "dark"]).optional(),
});

export type VisualTokensInput = z.infer<typeof visualTokensSchema>;
