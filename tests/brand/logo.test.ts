import { describe, expect, it } from "vitest";
import {
  MAX_BRAND_LOGO_BYTES,
  buildBrandLogoPath,
  detectBrandLogoType,
  isBrandLogoPath,
  validateBrandLogo,
} from "@/lib/brand/logo";

const TENANT = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BRAND = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function withPrefix(prefix: number[], size = 128): Buffer {
  return Buffer.concat([Buffer.from(prefix), Buffer.alloc(Math.max(0, size - prefix.length), 0x00)]);
}

const PNG = withPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = withPrefix([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.alloc(100, 0x00),
]);

describe("detectBrandLogoType", () => {
  it("reconhece PNG, JPEG e WebP pelos magic bytes", () => {
    expect(detectBrandLogoType(PNG)).toBe("png");
    expect(detectBrandLogoType(JPEG)).toBe("jpeg");
    expect(detectBrandLogoType(WEBP)).toBe("webp");
  });

  it("rejeita formatos não suportados mesmo com nome de imagem", () => {
    expect(detectBrandLogoType(Buffer.from("GIF89a................"))).toBeNull();
    expect(detectBrandLogoType(Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"))).toBeNull();
    expect(detectBrandLogoType(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(detectBrandLogoType(Buffer.alloc(0))).toBeNull();
  });
});

describe("validateBrandLogo", () => {
  it("aceita imagem real dentro do limite", () => {
    const result = validateBrandLogo({ buffer: PNG });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.type).toBe("png");
      expect(result.mimeType).toBe("image/png");
      expect(result.extension).toBe("png");
    }
  });

  it("recusa arquivo vazio ou pequeno demais", () => {
    expect(validateBrandLogo({ buffer: Buffer.alloc(0) }).ok).toBe(false);
    expect(validateBrandLogo({ buffer: Buffer.alloc(10) }).ok).toBe(false);
  });

  it("recusa imagem acima de 2 MB", () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_BRAND_LOGO_BYTES)]);
    const result = validateBrandLogo({ buffer: big });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("2 MB");
  });

  it("recusa conteúdo que não é imagem", () => {
    const result = validateBrandLogo({ buffer: withPrefix([...Buffer.from("not-an-image")]) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("PNG, JPEG ou WebP");
  });
});

describe("buildBrandLogoPath", () => {
  it("usa <tenantId>/<brandId>/brand/logo-<timestamp>.<ext>", () => {
    const path = buildBrandLogoPath({
      tenantId: TENANT,
      brandId: BRAND,
      type: "png",
      now: new Date(1_700_000_000_000),
    });
    expect(path).toBe(`${TENANT}/${BRAND}/brand/logo-1700000000000.png`);
  });

  it("respeita a extensão do formato", () => {
    const jpeg = buildBrandLogoPath({ tenantId: TENANT, brandId: BRAND, type: "jpeg" });
    const webp = buildBrandLogoPath({ tenantId: TENANT, brandId: BRAND, type: "webp" });
    expect(jpeg.endsWith(".jpeg")).toBe(true);
    expect(webp.endsWith(".webp")).toBe(true);
  });

  it("rejeita ids que não são UUID (evita path traversal)", () => {
    expect(() =>
      buildBrandLogoPath({ tenantId: "../outro", brandId: BRAND, type: "png" }),
    ).toThrow(/tenantId inválido/);
    expect(() =>
      buildBrandLogoPath({ tenantId: TENANT, brandId: "../../etc", type: "png" }),
    ).toThrow(/brandId inválido/);
  });
});

describe("isBrandLogoPath", () => {
  it("aceita exatamente o caminho gerado", () => {
    const path = buildBrandLogoPath({ tenantId: TENANT, brandId: BRAND, type: "png" });
    expect(isBrandLogoPath(path)).toBe(true);
  });

  it("não confunde com caminho de ativo renderizado", () => {
    expect(isBrandLogoPath(`${TENANT}/${BRAND}/asset-1/slide-1.png`)).toBe(false);
  });

  it("recusa traversal, path absoluto e extensão arbitrária", () => {
    expect(isBrandLogoPath(`${TENANT}/${BRAND}/brand/../logo-1.png`)).toBe(false);
    expect(isBrandLogoPath(`/${TENANT}/${BRAND}/brand/logo-1.png`)).toBe(false);
    expect(isBrandLogoPath(`${TENANT}/${BRAND}/brand/logo-1.svg`)).toBe(false);
  });
});
