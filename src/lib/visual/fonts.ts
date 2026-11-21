import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Font } from "satori";

/**
 * Fontes Geist embutidas no repositório (`src/assets/fonts`).
 *
 * O motor visual é 100% determinístico e sem download em runtime: qualquer
 * texto vira path no SVG gerado pelo satori, então não dependemos de fontes do
 * sistema operacional (o resvg roda com `loadSystemFonts: false`).
 */

/** Família usada em títulos/corpo (Geist Sans). */
export const SATORI_FONT_FAMILY = "Geist";

/** Família usada em números/eyebrows (Geist Mono). */
export const SATORI_MONO_FAMILY = "Geist Mono";

interface FontFile {
  fileName: string;
  weight: 400 | 600 | 700;
}

const FONT_FILES: readonly FontFile[] = [
  { fileName: "GeistSans-Regular.ttf", weight: 400 },
  { fileName: "GeistSans-SemiBold.ttf", weight: 600 },
  { fileName: "GeistSans-Bold.ttf", weight: 700 },
];

const MONO_FILES: readonly FontFile[] = [{ fileName: "GeistMono-Regular.ttf", weight: 400 }];

let fontsCache: Font[] | null = null;
let fontsDirectoryCache: string | null = null;

/**
 * Diretórios candidatos para a pasta de fontes.
 *
 * - `process.cwd()` cobre `next dev`, `next build` e o vitest rodando na raiz;
 * - o caminho relativo ao módulo cobre execução de dentro de `src/lib/visual`.
 */
function fontDirectoryCandidates(): string[] {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "src", "assets", "fonts"),
    path.resolve(moduleDirectory, "..", "..", "assets", "fonts"),
  ];
  return [...new Set(candidates)];
}

function isCompleteFontDirectory(directory: string): boolean {
  return [...FONT_FILES, ...MONO_FILES].every((font) => {
    try {
      return fs.statSync(path.join(directory, font.fileName)).isFile();
    } catch {
      return false;
    }
  });
}

function resolveFontsDirectory(): string {
  if (fontsDirectoryCache) return fontsDirectoryCache;

  const candidates = fontDirectoryCandidates();
  for (const candidate of candidates) {
    if (isCompleteFontDirectory(candidate)) {
      fontsDirectoryCache = candidate;
      return candidate;
    }
  }

  throw new Error(
    `Fontes Geist não encontradas. Procurei em: ${candidates.join(", ")}. ` +
      "Garanta que src/assets/fonts contém GeistSans-Regular.ttf, GeistSans-SemiBold.ttf, " +
      "GeistSans-Bold.ttf e GeistMono-Regular.ttf no checkout do projeto.",
  );
}

function readFont(directory: string, fileName: string): Buffer {
  const filePath = path.join(directory, fileName);
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao ler a fonte "${filePath}": ${reason}`);
  }
}

/**
 * Carrega (uma única vez) os TTFs e devolve no formato exigido pelo satori.
 * O cache em memória evita reler ~4 arquivos a cada slide de um carrossel.
 */
export function getSatoriFonts(): Font[] {
  if (fontsCache) return fontsCache;

  const directory = resolveFontsDirectory();
  const fonts: Font[] = [];

  for (const font of FONT_FILES) {
    fonts.push({
      name: SATORI_FONT_FAMILY,
      data: readFont(directory, font.fileName),
      weight: font.weight,
      style: "normal",
    });
  }

  for (const font of MONO_FILES) {
    fonts.push({
      name: SATORI_MONO_FAMILY,
      data: readFont(directory, font.fileName),
      weight: font.weight,
      style: "normal",
    });
  }

  fontsCache = fonts;
  return fontsCache;
}

/** Somente para testes: limpa o cache em memória. */
export function resetSatoriFontsCache(): void {
  fontsCache = null;
  fontsDirectoryCache = null;
}
