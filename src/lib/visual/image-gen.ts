import { getServerEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

/**
 * Gerador multi-provedor de imagens editoriais com teto de custo e fallback seguro.
 *
 * Provedores suportados:
 *  - `siliconflow` (`https://api.siliconflow.com/v1/images/generations`):
 *    suporta modelos chineses econômicos e de alta fidelidade como `Qwen/Qwen-Image`,
 *    `Tongyi-MAI/Z-Image-Turbo`, `black-forest-labs/FLUX.1-schnell` e `FLUX.2-flex`.
 *    Usa `SILICONFLOW_API_KEY` (ou `IMAGE_PROVIDER_API_KEY`).
 *  - `google_nano_banana` (Google Imagen 3 Fast):
 *    usa `IMAGE_PROVIDER_API_KEY` ou reutiliza `GOOGLE_GENERATIVE_AI_API_KEY`.
 *
 * Fallback seguro: qualquer falha retorna `null` e o Satori renderiza o tema
 * editorial programático sem quebrar o estúdio.
 */

const log = createLogger("visual.image-gen");

const IMAGEN_FAST_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-fast-generate-001:predict";
const SILICONFLOW_IMAGE_ENDPOINT = "https://api.siliconflow.com/v1/images/generations";

export interface GenerateEditorialImageInput {
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "16:9";
  brandPrimaryHex?: string;
}

export function isLiveImageGenerationEnabled(): boolean {
  const env = getServerEnv();
  if (env.IMAGE_PROVIDER === "siliconflow") {
    return Boolean(env.SILICONFLOW_API_KEY || env.IMAGE_PROVIDER_API_KEY);
  }
  if (env.IMAGE_PROVIDER === "google_nano_banana") {
    return Boolean(env.IMAGE_PROVIDER_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY);
  }
  return false;
}

function buildGuardedPrompt(input: GenerateEditorialImageInput): string | null {
  const cleanPrompt = input.prompt.replace(/\s+/g, " ").trim().slice(0, 600);
  if (cleanPrompt.length < 8) return null;

  const colorHint = input.brandPrimaryHex
    ? `Subtle color harmony inspired by ${input.brandPrimaryHex}. `
    : "";

  return (
    `${cleanPrompt}. ${colorHint}` +
    "Editorial studio photography or refined minimalist illustration, natural lighting, high visual clarity, clean composition. " +
    "Strictly NO text, NO words, NO letters, NO numbers, NO watermarks, NO logos, NO neon cyberpunk clutter."
  );
}

function siliconFlowSizeFor(aspectRatio: GenerateEditorialImageInput["aspectRatio"]): string {
  switch (aspectRatio) {
    case "3:4":
      return "768x1024";
    case "4:3":
      return "1024x768";
    case "16:9":
      return "1024x576";
    default:
      return "1024x1024";
  }
}

async function generateViaSiliconFlow(
  finalPrompt: string,
  aspectRatio: GenerateEditorialImageInput["aspectRatio"],
): Promise<string | null> {
  const env = getServerEnv();
  const apiKey = env.SILICONFLOW_API_KEY ?? env.IMAGE_PROVIDER_API_KEY;
  if (!apiKey) return null;

  const model = env.SILICONFLOW_IMAGE_MODEL || "black-forest-labs/FLUX.2-flex";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);

  try {
    const response = await fetch(SILICONFLOW_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: finalPrompt,
        image_size: siliconFlowSizeFor(aspectRatio),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn("SiliconFlow Image retornou erro HTTP", { status: response.status, model });
      return null;
    }

    const data = (await response.json()) as {
      images?: { url?: string }[];
      data?: { url?: string; b64_json?: string }[];
    };
    const b64 = data.data?.[0]?.b64_json;
    if (b64) return `data:image/png;base64,${b64}`;

    const imageUrl = data.images?.[0]?.url ?? data.data?.[0]?.url;
    if (!imageUrl) return null;

    const imgResponse = await fetch(imageUrl, { signal: controller.signal });
    if (!imgResponse.ok) return null;

    const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await imgResponse.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    log.warn("Falha ao gerar imagem editorial via SiliconFlow (usando fallback tipográfico)", {
      model,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateViaGoogleImagen(
  finalPrompt: string,
  aspectRatio: GenerateEditorialImageInput["aspectRatio"],
): Promise<string | null> {
  const env = getServerEnv();
  const apiKey = env.IMAGE_PROVIDER_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

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
          aspectRatio: aspectRatio ?? "4:3",
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

export async function generateEditorialImageDataUrl(
  input: GenerateEditorialImageInput,
): Promise<string | null> {
  if (!isLiveImageGenerationEnabled()) return null;

  const finalPrompt = buildGuardedPrompt(input);
  if (!finalPrompt) return null;

  const env = getServerEnv();
  if (env.IMAGE_PROVIDER === "siliconflow") {
    return generateViaSiliconFlow(finalPrompt, input.aspectRatio);
  }
  if (env.IMAGE_PROVIDER === "google_nano_banana") {
    return generateViaGoogleImagen(finalPrompt, input.aspectRatio);
  }
  return null;
}
