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

/**
 * Analisa os pixels da logomarca (48x48) e devolve 3 variações de paleta
 * derivadas das cores predominantes (Claro, Suave e Escuro).
 */
export async function extractLogoPalettes(buffer: Buffer): Promise<LogoPaletteVariation[]> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(48, 48, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const buckets = new Map<string, { count: number; r: number; g: number; b: number; sat: number }>();

    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = info.channels >= 4 ? (data[i + 3] ?? 255) : 255;

      // Ignora pixels transparentes e fundo branco/quase branco
      if (a < 180) continue;
      const { s, l } = rgbToHsl(r, g, b);
      if (l > 0.93) continue;

      const qr = Math.round(r / 24) * 24;
      const qg = Math.round(g / 24) * 24;
      const qb = Math.round(b / 24) * 24;
      const key = `${qr},${qg},${qb}`;
      const prev = buckets.get(key);
      if (prev) {
        prev.count += 1;
        prev.r += r;
        prev.g += g;
        prev.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b, sat: s });
      }
    }

    if (buckets.size === 0) return [];

    // Ordena priorizando prevalência + saturação (cores de marca reais antes de cinza neutro)
    const ranked = [...buckets.values()]
      .map((entry) => ({
        avg: [entry.r / entry.count, entry.g / entry.count, entry.b / entry.count] as [
          number,
          number,
          number,
        ],
        score: entry.count * (1 + entry.sat * 1.4),
      }))
      .sort((a, b) => b.score - a.score);

    const primaryRgb = ranked[0]?.avg;
    if (!primaryRgb) return [];

    // Busca uma segunda cor prevalente visualmente distinta para o acento
    const accentEntry = ranked.find((entry) => colorDistance(entry.avg, primaryRgb) >= 65);
    const accentRgb = accentEntry?.avg ?? [
      Math.min(255, primaryRgb[0] + 45),
      Math.min(255, primaryRgb[1] + 45),
      Math.min(255, primaryRgb[2] + 45),
    ];

    const primaryHex = toHex(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    const accentHex = toHex(accentRgb[0], accentRgb[1], accentRgb[2]);
    const deepDarkBg = darkenHex(primaryRgb[0], primaryRgb[1], primaryRgb[2], 0.24);

    return [
      {
        label: "Da logo · Claro",
        primary: primaryHex,
        background: "#fdfdfd",
        accent: accentHex,
      },
      {
        label: "Da logo · Editorial",
        primary: primaryHex,
        background: "#f4f4f8",
        accent: accentHex,
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
