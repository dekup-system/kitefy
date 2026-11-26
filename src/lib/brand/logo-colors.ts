import sharp from "sharp";

/**
 * Extrai as cores prevalentes da logomarca enviada (via pixels reais com sharp)
 * e gera 3 variações harmônicas prontas para o usuário escolher nos carrosséis.
 */

export interface LogoPaletteVariation {
  label: string;
  primary: string;
  background: string;
  accent: string;
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function darkenHex(r: number, g: number, b: number, factor = 0.28): string {
  return toHex(r * factor, g * factor, b * factor);
}

function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

/**
 * Analisa os pixels reais da logomarca (64x64) separando a base escura das
 * cores cromáticas vibrantes (ex.: fundo escuro + laranja + azul) e devolve
 * 3 variações harmônicas fiéis que aproveitam TODAS as cores principais da marca.
 */
export async function extractLogoPalettes(buffer: Buffer): Promise<LogoPaletteVariation[]> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(64, 64, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const buckets = new Map<
      string,
      { count: number; r: number; g: number; b: number; satSum: number; lightSum: number }
    >();

    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = info.channels >= 4 ? (data[i + 3] ?? 255) : 255;

      // Ignora pixels transparentes e fundo branco/quase branco
      if (a < 180) continue;
      const { s, l } = rgbToHsl(r, g, b);
      if (l > 0.93) continue;

      const qr = Math.round(r / 20) * 20;
      const qg = Math.round(g / 20) * 20;
      const qb = Math.round(b / 20) * 20;
      const key = `${qr},${qg},${qb}`;
      const prev = buckets.get(key);
      if (prev) {
        prev.count += 1;
        prev.r += r;
        prev.g += g;
        prev.b += b;
        prev.satSum += s;
        prev.lightSum += l;
      } else {
        buckets.set(key, { count: 1, r, g, b, satSum: s, lightSum: l });
      }
    }

    if (buckets.size === 0) return [];

    const allColors = [...buckets.values()].map((entry) => {
      const avg: [number, number, number] = [
        entry.r / entry.count,
        entry.g / entry.count,
        entry.b / entry.count,
      ];
      const hsl = rgbToHsl(avg[0], avg[1], avg[2]);
      return {
        avg,
        hsl,
        count: entry.count,
        isDarkNeutral: hsl.l < 0.22 || (hsl.s < 0.16 && hsl.l < 0.35),
        isChromatic: hsl.s >= 0.25 && hsl.l >= 0.14 && hsl.l <= 0.86,
      };
    });

    // 1. Base escura real da logo (se existir)
    const darkBase = allColors
      .filter((c) => c.isDarkNeutral)
      .sort((a, b) => b.count - a.count)[0];

    // 2. Cores cromáticas vibrantes distintas (ex.: laranja e azul nunca colapsam entre si)
    const chromaticRanked = allColors
      .filter((c) => c.isChromatic)
      .sort((a, b) => b.count * (1 + b.hsl.s * 2.2) - a.count * (1 + a.hsl.s * 2.2));

    const distinctChromatics: typeof chromaticRanked = [];
    for (const candidate of chromaticRanked) {
      const tooClose = distinctChromatics.some(
        (existing) =>
          colorDistance(existing.avg, candidate.avg) < 72 &&
          hueDistance(existing.hsl.h, candidate.hsl.h) < 32,
      );
      if (!tooClose) {
        distinctChromatics.push(candidate);
      }
      if (distinctChromatics.length >= 3) break;
    }

    // Caso A: Logo rica com 2+ cores vibrantes (ex.: fundo escuro + azul + laranja)
    if (distinctChromatics.length >= 2) {
      const colorA = distinctChromatics[0]!;
      const colorB = distinctChromatics[1]!;
      const hexA = toHex(colorA.avg[0], colorA.avg[1], colorA.avg[2]);
      const hexB = toHex(colorB.avg[0], colorB.avg[1], colorB.avg[2]);
      const darkHex = darkBase
        ? toHex(darkBase.avg[0], darkBase.avg[1], darkBase.avg[2])
        : darkenHex(colorA.avg[0], colorA.avg[1], colorA.avg[2], 0.22);
      const safeDark = darkHex === "#000000" ? "#14161e" : darkHex;

      return [
        {
          label: "Da logo · Principal (2 cores)",
          primary: hexA,
          background: "#fdfdfd",
          accent: hexB,
        },
        {
          label: "Da logo · Destaque invertido",
          primary: hexB,
          background: "#f7f8fb",
          accent: hexA,
        },
        {
          label: "Da logo · Base escura",
          primary: safeDark,
          background: "#f4f5f8",
          accent: hexB,
        },
      ];
    }

    // Caso B: Logo com 1 cor vibrante + base escura ou monocromática
    const mainColor = distinctChromatics[0] ?? allColors.sort((a, b) => b.count - a.count)[0];
    if (!mainColor) return [];

    const primaryHex = darkBase
      ? toHex(darkBase.avg[0], darkBase.avg[1], darkBase.avg[2])
      : toHex(mainColor.avg[0], mainColor.avg[1], mainColor.avg[2]);
    const accentHex = toHex(mainColor.avg[0], mainColor.avg[1], mainColor.avg[2]);
    const deepDarkBg = darkenHex(mainColor.avg[0], mainColor.avg[1], mainColor.avg[2], 0.24);

    return [
      {
        label: "Da logo · Claro",
        primary: primaryHex === "#000000" ? "#18181f" : primaryHex,
        background: "#fdfdfd",
        accent: accentHex,
      },
      {
        label: "Da logo · Vibrante",
        primary: accentHex,
        background: "#f4f4f8",
        accent: primaryHex === "#000000" ? "#18181f" : primaryHex,
      },
      {
        label: "Da logo · Escuro",
        primary: "#f5f5f7",
        background: deepDarkBg === "#000000" ? "#141418" : deepDarkBg,
        accent: accentHex,
      },
    ];
  } catch {
    return [];
  }
}
