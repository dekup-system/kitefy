import sharp, { type Metadata } from "sharp";
import { getServerEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSignedUrls } from "@/lib/visual/storage";
import {
  buildBrandLogoPath,
  isBrandLogoPath,
  type BrandLogoType,
} from "./logo";

/**
 * Upload/remoção/leitura da logomarca no bucket PRIVADO.
 *
 * - a imagem é re-encodada para PNG com no máximo 1024px de lado (remove EXIF,
 *   limita bombas de descompressão e mantém transparência);
 * - o upload usa service_role e `upsert: false`, então um caminho antigo nunca é
 *   sobrescrito silenciosamente;
 * - a UI recebe apenas URL assinada de curta duração; o path fica em
 *   `brand_profiles.visual_tokens.logo_path`.
 */

const log = createLogger("brand.logo-storage");

export const MAX_BRAND_LOGO_DIMENSION = 1024;
const MAX_INPUT_PIXELS = 25_000_000;
const MAX_PROCESSED_BYTES = 6 * 1024 * 1024;

export interface ProcessedBrandLogo {
  buffer: Buffer;
  type: BrandLogoType;
  mimeType: "image/png";
  extension: "png";
  width: number;
  height: number;
}

export async function processBrandLogo(input: Buffer): Promise<ProcessedBrandLogo> {
  let metadata: Metadata;

  try {
    metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new Error("Não foi possível ler a imagem enviada. Ela está corrompida?");
  }

  if (!metadata.width || !metadata.height) {
    throw new Error("A imagem enviada não tem dimensões válidas.");
  }
  if (metadata.width < 16 || metadata.height < 16) {
    throw new Error("A logomarca precisa ter pelo menos 16×16 pixels.");
  }

  let output: Buffer;

  try {
    output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: MAX_BRAND_LOGO_DIMENSION,
        height: MAX_BRAND_LOGO_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new Error("Não foi possível processar a imagem. Tente outro arquivo PNG, JPEG ou WebP.");
  }

  if (output.byteLength > MAX_PROCESSED_BYTES) {
    throw new Error("A logomarca ficou grande demais após o processamento. Use uma imagem menor.");
  }

  return {
    buffer: output,
    type: "png",
    mimeType: "image/png",
    extension: "png",
    width: metadata.width,
    height: metadata.height,
  };
}

/** Processa e grava a logomarca; devolve o path privado para salvar no JSONB. */
export async function uploadBrandLogo(input: {
  tenantId: string;
  brandId: string;
  buffer: Buffer;
}): Promise<{ path: string; meta: ProcessedBrandLogo }> {
  const processed = await processBrandLogo(input.buffer);
  const path = buildBrandLogoPath({
    tenantId: input.tenantId,
    brandId: input.brandId,
    type: processed.type,
  });

  const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.storage.from(bucket).upload(path, processed.buffer, {
    contentType: processed.mimeType,
    upsert: false,
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(
      `Não foi possível enviar a logomarca para o Storage privado (${error.message}). ` +
        "Verifique se o bucket existe e se SUPABASE_SERVICE_ROLE_KEY é válida.",
    );
  }

  return { path, meta: processed };
}

/**
 * Remove uma logomarca antiga. Best-effort: falha de Storage não pode impedir o
 * salvamento do novo path (o arquivo órfão é invisível ao cliente).
 */
export async function removeBrandLogo(path: string | null | undefined): Promise<boolean> {
  if (!path || !isBrandLogoPath(path)) return false;

  try {
    const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      log.warn("Falha ao remover logomarca antiga", { path, message: error.message });
      return false;
    }
    return true;
  } catch (error) {
    log.warn("Falha ao remover logomarca antiga", {
      path,
      message: error instanceof Error ? error.message : "erro",
    });
    return false;
  }
}

/** URL assinada para exibir a logomarca; `null` quando o arquivo não existe. */
export async function signBrandLogo(
  path: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path || !isBrandLogoPath(path)) return null;

  try {
    const [signed] = await createSignedUrls([path], expiresInSeconds);
    return signed?.signedUrl ?? null;
  } catch (error) {
    log.warn("Falha ao assinar URL da logomarca", {
      path,
      message: error instanceof Error ? error.message : "erro",
    });
    return null;
  }
}
