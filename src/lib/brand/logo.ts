/**
 * Logomarca de marca — validação pura (sem rede, sem Storage).
 *
 * O upload real acontece em `logo-storage.ts` (service_role + sharp), mas as
 * regras de segurança ficam aqui para serem testadas sem I/O:
 *  - só PNG, JPEG ou WebP de verdade (magic bytes, não a extensão do arquivo);
 *  - tamanho máximo de 2 MB;
 *  - caminho no bucket privado sempre `<tenantId>/<brandId>/brand/logo-<ts>.<ext>`.
 *
 * O caminho começa pelo `tenant_id` porque a policy de Storage usa essa pasta
 * para validar membership (`public.is_tenant_member`).
 */

export const MAX_BRAND_LOGO_BYTES = 2 * 1024 * 1024;
/** Menor que isso não é uma imagem útil: evita upload de arquivo vazio/corrompido. */
export const MIN_BRAND_LOGO_BYTES = 64;

export type BrandLogoType = "png" | "jpeg" | "webp";

export interface BrandLogoTypeInfo {
  type: BrandLogoType;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: BrandLogoType;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIGNATURE = Buffer.from("RIFF", "ascii");
const WEBP_SIGNATURE = Buffer.from("WEBP", "ascii");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGO_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/brand\/logo-\d+\.(png|jpeg|webp)$/i;

const TYPE_INFO: Record<BrandLogoType, BrandLogoTypeInfo> = {
  png: { type: "png", mimeType: "image/png", extension: "png" },
  jpeg: { type: "jpeg", mimeType: "image/jpeg", extension: "jpeg" },
  webp: { type: "webp", mimeType: "image/webp", extension: "webp" },
};

export function brandLogoTypeInfo(type: BrandLogoType): BrandLogoTypeInfo {
  return TYPE_INFO[type];
}

/** Detecta o formato pelos magic bytes. Extensão/MIME informados pelo browser são ignorados. */
export function detectBrandLogoType(input: Buffer | Uint8Array): BrandLogoType | null {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);

  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }
  if (bytes.length >= JPEG_SIGNATURE.length && bytes.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).equals(RIFF_SIGNATURE) &&
    bytes.subarray(8, 12).equals(WEBP_SIGNATURE)
  ) {
    return "webp";
  }

  return null;
}

export type BrandLogoValidation =
  | { ok: true; type: BrandLogoType; mimeType: BrandLogoTypeInfo["mimeType"]; extension: BrandLogoType }
  | { ok: false; error: string };

export function validateBrandLogo(input: {
  buffer: Buffer | Uint8Array;
  maxBytes?: number;
}): BrandLogoValidation {
  const maxBytes = input.maxBytes ?? MAX_BRAND_LOGO_BYTES;
  const size = input.buffer.byteLength;

  if (size === 0) {
    return { ok: false, error: "O arquivo da logomarca está vazio." };
  }
  if (size < MIN_BRAND_LOGO_BYTES) {
    return { ok: false, error: "A imagem é pequena demais para ser uma logomarca válida." };
  }
  if (size > maxBytes) {
    return {
      ok: false,
      error: `A logomarca deve ter no máximo ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    };
  }

  const type = detectBrandLogoType(input.buffer);
  if (!type) {
    return {
      ok: false,
      error: "Formato não suportado. Envie uma imagem PNG, JPEG ou WebP.",
    };
  }

  const info = brandLogoTypeInfo(type);
  return { ok: true, type, mimeType: info.mimeType, extension: info.extension };
}

function assertUuid(label: string, value: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(trimmed)) {
    throw new Error(`${label} inválido para o caminho da logomarca.`);
  }
  return trimmed;
}

/** Caminho canônico no bucket privado. O timestamp evita cache de logo antiga. */
export function buildBrandLogoPath(input: {
  tenantId: string;
  brandId: string;
  type: BrandLogoType;
  now?: Date;
}): string {
  const tenantId = assertUuid("tenantId", input.tenantId);
  const brandId = assertUuid("brandId", input.brandId);
  const timestamp = (input.now ?? new Date()).getTime();

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error("Data inválida para nomear a logomarca.");
  }

  return `${tenantId}/${brandId}/brand/logo-${timestamp}.${brandLogoTypeInfo(input.type).extension}`;
}

/**
 * Só apaga caminhos que obedecem exatamente ao padrão de logomarca.
 * Protege contra exclusão de ativos renderizados por um valor inesperado no JSONB.
 */
export function isBrandLogoPath(path: string): boolean {
  return typeof path === "string" && LOGO_PATH_PATTERN.test(path.trim());
}
