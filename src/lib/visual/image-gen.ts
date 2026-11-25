import { getServerEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

/**
 * Gerador leve de imagens editoriais via Google Imagen Fast (custo ~US$ 0,02/img).
 *
 * - Ativo quando `IMAGE_PROVIDER=google_nano_banana` (usa `IMAGE_PROVIDER_API_KEY`
 *   ou reutiliza `GOOGLE_GENERATIVE_AI_API_KEY`).
 * - Aplica guardrails semióticos no prompt (sem texto na imagem, sem marca d'água,
 *   estética editorial limpa e natural).
 * - Fallback seguro: qualquer falha retorna `null` e o Satori renderiza o tema
 *   editorial programático sem quebrar o estúdio.
 */

const log = createLogger("visual.image-gen");

const IMAGEN_FAST_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-fast-generate-001:predict";

export interface GenerateEditorialImageInput {
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "16:9";
  brandPrimaryHex?: string;
}

export function isLiveImageGenerationEnabled(): boolean {
  const env = getServerEnv();
  if (env.IMAGE_PROVIDER !== "google_nano_banana") return false;
  return Boolean(env.IMAGE_PROVIDER_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export async function generateEditorialImageDataUrl(
  input: GenerateEditorialImageInput,
): Promise<string | null> {
  if (!isLiveImageGenerationEnabled()) return null;

  const env = getServerEnv();
  const apiKey = env.IMAGE_PROVIDER_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  const cleanPrompt = input.prompt.replace(/\s+/g, " ").trim().slice(0, 600);
  if (cleanPrompt.length < 8) return null;

  const colorHint = input.brandPrimaryHex
    ? `Subtle color harmony inspired by ${input.brandPrimaryHex}. `
    : "";

  const finalPrompt =
    `${cleanPrompt}. ${colorHint}` +
    "Editorial studio photography or refined minimalist illustration, natural lighting, high visual clarity, clean composition. " +
    "Strictly NO text, NO words, NO letters, NO numbers, NO watermarks, NO logos, NO neon cyberpunk clutter.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${IMAGEN_FAST_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: finalPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: input.aspectRatio ?? "4:3",
          personGeneration: "dont_allow",
          safetySetting: "block_medium_and_above",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn("Imagen Fast retornou erro HTTP", { status: response.status });
      return null;
    }

    const data = (await response.json()) as {
      predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
    };
    const first = data.predictions?.[0];
    if (!first?.bytesBase64Encoded) return null;

    const mime = first.mimeType || "image/png";
    return `data:${mime};base64,${first.bytesBase64Encoded}`;
  } catch (error) {
    log.warn("Falha ao gerar imagem editorial via Imagen Fast (usando fallback tipográfico)", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
