import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { RenderedAsset } from "./render";

/**
 * Persistência dos assets renderizados no bucket privado do Supabase Storage.
 *
 * Convenções não-negociáveis:
 *  - o nome do bucket vem de `SUPABASE_STORAGE_BUCKET` (default `brand-assets`);
 *  - caminho: `<tenantId>/<brandId>/<assetId>/<fileName>`;
 *  - `upsert: false` — reprocessar um asset gera erro em vez de sobrescrever
 *    silenciosamente uma peça já aprovada;
 *  - a API devolve PATHS, nunca URLs públicas. URLs assinadas são geradas sob
 *    demanda por `createSignedUrls`.
 */

const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

export interface UploadRenderedAssetsInput {
  tenantId: string;
  brandId: string;
  assetId: string;
  assets: readonly RenderedAsset[];
  /**
   * Opcional. Quando omitido (recomendado), usa `SUPABASE_STORAGE_BUCKET`.
   * Só existe para callers que já resolveram o bucket e querem evitar uma
   * segunda leitura do ambiente.
   */
  bucket?: string;
}

export interface SignedAssetUrl {
  path: string;
  signedUrl: string;
}

function assertSegment(label: string, value: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0 || !SEGMENT_PATTERN.test(trimmed)) {
    throw new Error(
      `${label} inválido para o Storage: "${String(value).slice(0, 60)}". ` +
        'Use apenas letras, números, "_" e "-" (sem "/", ".." ou espaços).',
    );
  }
  return trimmed;
}

function assertFileName(fileName: string): string {
  const trimmed = typeof fileName === "string" ? fileName.trim() : "";
  if (trimmed.length === 0 || !FILE_NAME_PATTERN.test(trimmed) || trimmed.includes("..")) {
    throw new Error(
      `fileName inválido para o Storage: "${String(fileName).slice(0, 80)}". ` +
        'Use apenas letras, números, ".", "_" e "-", sem "..".',
    );
  }
  return trimmed;
}

function assertAsset(asset: RenderedAsset): void {
  if (!Buffer.isBuffer(asset.buffer) || asset.buffer.length === 0) {
    throw new Error(`Asset "${String(asset.fileName)}" está vazio; nada para enviar ao Storage.`);
  }
  if (asset.mimeType !== "image/png" && asset.mimeType !== "image/jpeg") {
    throw new Error(`Asset "${String(asset.fileName)}" tem mimeType não suportado: "${String(asset.mimeType)}".`);
  }
}

/**
 * Envia os assets renderizados em ordem e devolve os PATHS gravados, na mesma
 * ordem de `assets`. Em qualquer falha, lança erro com o caminho problemático
 * e o que já havia sido enviado.
 */
export async function uploadRenderedAssets(input: UploadRenderedAssetsInput): Promise<string[]> {
  const tenantId = assertSegment("tenantId", input.tenantId);
  const brandId = assertSegment("brandId", input.brandId);
  const assetId = assertSegment("assetId", input.assetId);

  const assets = Array.isArray(input.assets) ? input.assets : [];
  if (assets.length === 0) return [];

  const bucket = input.bucket?.trim() || getServerEnv().SUPABASE_STORAGE_BUCKET;
  const supabase = createSupabaseAdminClient();
  const paths: string[] = [];

  for (const asset of assets) {
    assertAsset(asset);
    const fileName = assertFileName(asset.fileName);
    const path = `${tenantId}/${brandId}/${assetId}/${fileName}`;

    const { error } = await supabase.storage.from(bucket).upload(path, asset.buffer, {
      contentType: asset.mimeType,
      upsert: false,
      cacheControl: "3600",
    });

    if (error) {
      throw new Error(
        `Falha ao enviar "${path}" para o bucket privado "${bucket}" ` +
          `(${paths.length} de ${assets.length} arquivos já enviados): ${error.message}. ` +
          "Verifique se o bucket existe, se SUPABASE_SERVICE_ROLE_KEY é válida e se o assetId " +
          "ainda não foi usado (upsert: false).",
      );
    }

    paths.push(path);
  }

  return paths;
}

/**
 * Gera URLs assinadas temporárias para PATHS já gravados no bucket privado.
 * Mantém a ordem de entrada e falha com mensagem explícita se algum path não
 * puder ser assinado.
 */
export async function createSignedUrls(
  paths: readonly string[],
  expiresInSeconds = 3600,
): Promise<SignedAssetUrl[]> {
  if (!Array.isArray(paths) || paths.length === 0) return [];

  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error("expiresInSeconds deve ser um número positivo (em segundos).");
  }

  const normalized = paths.map((path) => {
    const trimmed = typeof path === "string" ? path.trim() : "";
    if (trimmed.length === 0 || trimmed.includes("..")) {
      throw new Error(`Path inválido para signed URL: "${String(path).slice(0, 120)}".`);
    }
    return trimmed;
  });

  const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(normalized, Math.floor(expiresInSeconds));

  if (error) {
    throw new Error(
      `Falha ao criar signed URLs para ${normalized.length} caminho(s) no bucket "${bucket}": ` +
        `${error.message}. Verifique as permissões da service role e se os arquivos existem.`,
    );
  }
  if (!data) {
    throw new Error(`O Storage não retornou signed URLs para o bucket "${bucket}".`);
  }

  return data.map((item, index) => {
    const fallbackPath = normalized[index] ?? "";
    const path = item.path ?? fallbackPath;
    const signedUrl = item.signedUrl ?? item.signedURL ?? "";

    if (item.error || signedUrl.length === 0) {
      throw new Error(
        `Falha ao assinar "${path}": ${item.error ?? "URL vazia"}. ` +
          `Verifique se o objeto existe no bucket "${bucket}".`,
      );
    }

    return { path, signedUrl };
  });
}
