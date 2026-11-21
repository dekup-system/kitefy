import { buildJsonLdBundle, validateJsonLdBundle } from "@/lib/geo/jsonld";
import type { BrandContext, ContentPayload, GeoArticlePayload, JsonLdBundle } from "@/types/domain";
import { createLogger } from "@/lib/logger";

/**
 * Monta o JSON-LD (Article + FAQPage + Product) para artigos GEO.
 *
 * Regra: só publicamos JSON-LD validado. Se a validação falhar, o ativo é
 * persistido sem JSON-LD e o problema é registrado — nunca mentimos sobre a
 * estrutura do schema.
 */

const log = createLogger("agent.jsonld");

export function buildJsonLdForAsset(input: {
  payload: ContentPayload;
  brand: BrandContext;
  productInput: string;
}): JsonLdBundle | null {
  if (input.payload.kind !== "geo_article") return null;

  const payload = input.payload as GeoArticlePayload;
  const websiteUrl = input.brand.website_url ?? `https://${input.payload.slug}.example.com`;
  const publishedAt = new Date().toISOString();

  const bundle = buildJsonLdBundle({
    article: {
      title: payload.title,
      description: payload.meta_description,
      slug: payload.slug,
      authorName: input.brand.brand_name,
      brandName: input.brand.brand_name,
      websiteUrl,
      publishedAt,
      sections: payload.sections,
    },
    faq: payload.faq,
    product: {
      name: input.productInput.slice(0, 160),
      description: payload.meta_description,
      brandName: input.brand.brand_name,
      websiteUrl,
    },
  });

  const validation = validateJsonLdBundle(bundle);
  if (!validation.valid) {
    log.warn("JSON-LD reprovado na validação; ativo será salvo sem schema.", {
      issues: validation.issues.slice(0, 6),
    });
    return null;
  }

  return bundle;
}
