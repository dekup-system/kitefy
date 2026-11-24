import sharp from "sharp";
import type { AssetType, BrandContext, ContentPayload, VisualTokens } from "@/types/domain";
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
import type { CarouselOutput, SingleCreativeOutput } from "@/lib/ai/content-schemas";

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
    if (error || !data) return null;
    const raw = Buffer.from(await data.arrayBuffer());
    const resized = await sharp(raw, { failOn: "error" })
      .resize(160, 48, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch {
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
    hasAiImagery = Boolean(payload.has_ai_imagery);
    const rendered = await renderSingleCreative({
      headline: payload.headline,
      subheadline: payload.subheadline,
      body: payload.body,
      cta: payload.cta,
      brandName: input.brand.brand_name,
      tokens,
      format,
      output: "png",
      imageUrl: null,
      hasAiImagery,
      brandLogoDataUrl,
    });
    assets = [...rendered.assets];
    warnings.push(...rendered.warnings);
  } else {
    const payload = input.payload as CarouselOutput;
    const rendered = await renderCarousel({
      slides: payload.slides,
      brandName: input.brand.brand_name,
      tokens,
      format,
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
