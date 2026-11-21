/**
 * Inspeção dos ativos da marca Kitefy:
 *  - dimensões, canal alfa e cores dominantes reais (não presumidas do manual);
 *  - matriz de contraste da paleta oficial (WCAG 2.1) para provar AAA/AA onde dá
 *    e documentar honestamente onde a paleta imposta não permite AAA.
 *
 * Uso: npx tsx scripts/inspect-brand.ts
 */
import sharp from "sharp";
import { contrastRatio, parseColor } from "../src/lib/visual/tokens";

const ASSETS = [
  "public/brand/kitefy-icone-site.png",
  "public/brand/kitefy-logomarca-principal.png",
];

interface Dominant {
  hex: string;
  count: number;
}

async function inspect(file: string): Promise<void> {
  const image = sharp(file);
  const meta = await image.metadata();
  const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

  const counts = new Map<string, number>();
  let transparent = 0;
  let whiteish = 0;

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 255;

    if (a < 16) {
      transparent += 1;
      continue;
    }
    if (r > 245 && g > 245 && b > 245) {
      whiteish += 1;
      continue;
    }

    const key = `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = info.width * info.height;
  const dominant: Dominant[] = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  console.log(`\n=== ${file}`);
  console.log(`  ${meta.width}x${meta.height} · canais ${info.channels} · alpha: ${meta.hasAlpha ?? false}`);
  console.log(`  transparente: ${((transparent / total) * 100).toFixed(1)}% · branco/quase branco: ${((whiteish / total) * 100).toFixed(1)}%`);
  for (const item of dominant) {
    console.log(`  ${item.hex}  ${((item.count / total) * 100).toFixed(2)}%`);
  }
}

const PAIRS: [string, string, string][] = [
  ["texto body", "#3B3752", "#F8F8FA"],
  ["texto body s/ surface", "#3B3752", "#FFFFFF"],
  ["título navy", "#181331", "#F8F8FA"],
  ["título navy s/ surface", "#181331", "#FFFFFF"],
  ["muted", "#6E6A85", "#F8F8FA"],
  ["muted s/ subtle", "#6E6A85", "#F0F0F5"],
  ["branco s/ signal (CTA)", "#FFFFFF", "#FD3E01"],
  ["signal s/ branco (badge txt)", "#FD3E01", "#FFF0EB"],
  ["navy s/ branco", "#181331", "#FFFFFF"],
  ["branco s/ navy", "#FFFFFF", "#181331"],
  ["body s/ subtle", "#3B3752", "#F0F0F5"],
  ["badge flow", "#0F766E", "#E8F8F1"],
  ["badge start", "#181331", "#ECEBF5"],
  ["borda s/ canvas", "#E4E4EC", "#F8F8FA"],
  ["signal s/ navy", "#FD3E01", "#181331"],
];

async function main(): Promise<void> {
  for (const file of ASSETS) {
    await inspect(file);
  }

  console.log("\n=== Contraste WCAG 2.1 (AAA texto normal ≥ 7:1 · AA ≥ 4.5:1 · AA grande ≥ 3:1)");
  for (const [label, fg, bg] of PAIRS) {
    const ratio = contrastRatio(parseColor(fg), parseColor(bg));
    const verdict =
      ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA-grande" : "FALHA";
    console.log(
      `  ${label.padEnd(28)} ${fg} / ${bg}  ${ratio.toFixed(2).padStart(5)}:1  ${verdict}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("Falha na inspeção:", error);
  process.exitCode = 1;
});
