import sharp from "sharp";
import type { AssetType, BrandContext, ContentPayload, VisualThemeId, VisualTokens } from "@/types/domain";
import type { RenderFormat } from "@/lib/visual/render";
import { createLogger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import {
  renderCarousel,
  renderSingleCreative,
  uploadRenderedAssets,
  type RenderedAsset,
} from "@/lib/visual";
import { generateEditorialImageDataUrl, isLiveImageGenerationEnabled } from "@/lib/visual/image-gen";
import type { CarouselOutput, SingleCreativeOutput } from "@/lib/ai/content-schemas";
import type { HybridCarouselPreset } from "@/lib/pricing";

/**
 * Adaptador fino entre o grafo e o motor visual.
 *
 * Motivo de existir: o grafo não deve conhecer detalhes de Satori/resvg/Storage.
 * Se o motor visual mudar a assinatura, apenas este arquivo muda.
 */

const log = createLogger("agent.visual");

export interface RenderVisualInput {
  tenantId: string;
  brandId: string;
  threadId: string;
  assetType: AssetType;
  /** Formato dos slides: feed (4:5) ou story/reels (9:16). */
  format?: RenderFormat;
  /** Tema visual escolhido pelo Orquestrador Estratégico (4 estilos distintos). */
  visualTheme?: VisualThemeId;
  /** Preset do carrossel ilustrado (5 slides / 2 IA ou 7 slides / 3 IA). */
  carouselPreset?: HybridCarouselPreset;
  payload: ContentPayload;
  brand: BrandContext;
}

export interface RenderVisualResult {
  paths: string[];
  hasAiImagery: boolean;
  warnings: string[];
}

function needsVisual(assetType: AssetType): boolean {
  return (
    assetType === "typo_carousel" ||
    assetType === "hybrid_carousel" ||
    assetType === "single_creative"
  );
}

async function loadBrandLogoDataUrl(logoPath: string | undefined): Promise<string | null> {
  if (!logoPath || !logoPath.trim()) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
    const { data, error } = await supabase.storage.from(bucket).download(logoPath);
    if (error || !data) {
      log.warn("Logomarca não encontrada no Storage ao renderizar ativo", {
        logoPath,
        error: error?.message,
      });
      return null;
    }
    const raw = Buffer.from(await data.arrayBuffer());
    // Dimensões fixas (216x64) com fundo transparente: o Satori exige width e
    // height explícitos em <img> para não colapsar a largura para 0px.
    const resized = await sharp(raw, { failOn: "error" })
      .resize(216, 64, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch (err) {
    log.warn("Falha ao processar logomarca para renderização", {
      logoPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function renderAndUploadVisuals(input: RenderVisualInput): Promise<RenderVisualResult> {
  if (!needsVisual(input.assetType)) {
    return { paths: [], hasAiImagery: false, warnings: [] };
  }

  const tokens: VisualTokens = input.brand.visual_tokens ?? {};
  const warnings: string[] = [];
  const format: RenderFormat = input.format ?? "4:5";
  const brandLogoDataUrl = await loadBrandLogoDataUrl(tokens.logo_path);

  let assets: RenderedAsset[] = [];
  let hasAiImagery = false;

  if (input.assetType === "single_creative") {
    const payload = input.payload as SingleCreativeOutput;
    const generatedUrl =
      payload.image_prompt && isLiveImageGenerationEnabled()
        ? await generateEditorialImageDataUrl({
            prompt: payload.image_prompt,
            aspectRatio: "4:3",
            brandPrimaryHex: tokens.primary,
          })
        : null;
    hasAiImagery = Boolean(generatedUrl);
    const rendered = await renderSingleCreative({
      headline: payload.headline,
      subheadline: payload.subheadline,
      body: payload.body,
      cta: payload.cta,
      brandName: input.brand.brand_name,
      tokens,
      format,
      visualTheme: input.visualTheme,
      output: "png",
      imageUrl: generatedUrl,
      hasAiImagery,
      brandLogoDataUrl,
    });
    assets = [...rendered.assets];
    warnings.push(...rendered.warnings);
  } else {
    const payload = input.payload as CarouselOutput;
    let slides = payload.slides;

    // Carrossel híbrido: gera 2 imagens IA (preset 5 slides) ou 3 imagens IA (preset 7 slides)
    // com direção de arte distinta por slide dentro da mesma identidade da marca.
    if (input.assetType === "hybrid_carousel" && isLiveImageGenerationEnabled()) {
      const targetImageCount = input.carouselPreset === "7_slides_3_ai" ? 3 : 2;
      const chosenIndexes = new Set<number>([0]);
      payload.slides.forEach((slide, idx) => {
        if (chosenIndexes.size < targetImageCount && slide.has_ai_imagery) {
          chosenIndexes.add(idx);
        }
      });
      // Garante distribuição visual equilibrada (ex.: [0, 2] ou [0, 2, 4]) se o LLM marcou menos slides.
      const fallbackSlots =
        targetImageCount === 3
          ? [0, Math.min(2, payload.slides.length - 1), Math.min(4, payload.slides.length - 1)]
          : [0, Math.min(2, payload.slides.length - 1)];
      for (const slot of fallbackSlots) {
        if (chosenIndexes.size >= targetImageCount) break;
        chosenIndexes.add(slot);
      }

      const artDirectionBySlot = [
        "Hero magazine cover editorial photography, dramatic architectural lighting, deep focal depth, clean negative space",
        "Modern minimalist studio lifestyle scene, warm natural shadows, crisp editorial composition",
        "Close-up conceptual visual metaphor, refined textures, contemporary luxury editorial aesthetic",
      ];

      // Geração sequencial para evitar rate-limit (HTTP 429) no provedor de imagem IA
      // quando o carrossel pede 2 ou 3 ilustrações na mesma requisição.
      let slotOrder = 0;
      const enrichedSlides = [];
      for (let idx = 0; idx < payload.slides.length; idx += 1) {
        const slide = payload.slides[idx]!;
        if (!chosenIndexes.has(idx) || slide.image_url) {
          enrichedSlides.push(slide);
          continue;
        }
        const direction = artDirectionBySlot[slotOrder % artDirectionBySlot.length]!;
        slotOrder += 1;
        const img = await generateEditorialImageDataUrl({
          prompt: `${slide.title}. ${slide.body}. ${direction}. Brand: ${input.brand.brand_name}`,
          aspectRatio: idx === 0 ? "3:4" : "4:3",
          brandPrimaryHex: tokens.primary,
        });
        enrichedSlides.push(img ? { ...slide, image_url: img, has_ai_imagery: true } : slide);
      }
      slides = enrichedSlides;
    }

    const rendered = await renderCarousel({
      slides,
      brandName: input.brand.brand_name,
      tokens,
      format,
      visualTheme: input.visualTheme,
      output: "png",
      brandLogoDataUrl,
    });
    assets = [...rendered.assets];
    warnings.push(...rendered.warnings);
    hasAiImagery = rendered.assets.some((asset) => asset.hasAiImagery);
  }

  if (assets.length === 0) {
    throw new Error("Renderização não produziu nenhum arquivo.");
  }

  const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
  let paths: string[] = [];

  try {
    paths = await uploadRenderedAssets({
      tenantId: input.tenantId,
      brandId: input.brandId,
      assetId: input.threadId,
      assets,
      bucket,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao gravar ativos no Storage (${bucket}): ${message}`);
  }

  log.info("Ativos visuais renderizados", {
    threadId: input.threadId,
    files: paths.length,
    hasAiImagery,
    warnings: warnings.length,
  });

  return { paths, hasAiImagery, warnings };
}

/** Utilitário usado pela UI para gerar URLs assinadas sob demanda. */
export async function signVisualPaths(paths: string[], expiresIn = 3600): Promise<string[]> {
  if (paths.length === 0) return [];
  const supabase = createSupabaseAdminClient();
  const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error) throw new Error(`Falha ao assinar URLs: ${error.message}`);
  return (data ?? [])
    .map((item) => item.signedUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}
