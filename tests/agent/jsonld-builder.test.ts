import { describe, expect, it } from "vitest";
import { buildJsonLdForAsset } from "@/lib/agent/jsonld-builder";
import { generateMockContent } from "@/lib/ai/mock-generator";
import { validateJsonLdBundle } from "@/lib/geo/jsonld";
import type { BrandContext } from "@/types/domain";

const brand: BrandContext = {
  brand_id: "11111111-1111-1111-1111-111111111111",
  brand_name: "Clínica Vitalis",
  website_url: "https://vitalis.example.com",
  icp_description: "Adultos em acompanhamento preventivo",
  tone_of_voice: { descriptors: ["direto"] },
  visual_tokens: {},
  entity_facts: [{ claim: "Atende desde 2014", source_url: "https://vitalis.example.com/sobre" }],
  top_chunks: [],
};

function payloadFor(assetType: Parameters<typeof generateMockContent>[0]["assetType"]) {
  return generateMockContent({
    assetType,
    brand,
    objective: "Aumentar a retenção do conteúdo orgânico",
    productInput: "acompanhamento preventivo",
    selectedArm: { angle_type: "vace_pattern_interrupt", framework: "hook_body_payoff" },
    explorationArms: [],
    serpInsights: null,
  });
}

describe("JSON-LD do ativo", () => {
  it("gera Article + FAQPage + Product válidos para artigo GEO", () => {
    const payload = payloadFor("geo_article");
    const bundle = buildJsonLdForAsset({ payload, brand, productInput: "acompanhamento preventivo" });

    expect(bundle).not.toBeNull();
    expect(bundle?.article?.["@type"]).toBe("Article");
    expect(bundle?.faq?.["@type"]).toBe("FAQPage");
    expect(bundle?.product?.["@type"]).toBe("Product");

    const validation = validateJsonLdBundle(bundle!);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  it("usa o site da marca como URL canônica", () => {
    const payload = payloadFor("geo_article");
    const bundle = buildJsonLdForAsset({ payload, brand, productInput: "oferta" });
    const article = bundle?.article as
      | { mainEntityOfPage?: { "@id"?: string }; publisher?: { name?: string } }
      | undefined;

    expect(article?.mainEntityOfPage?.["@id"]).toContain("vitalis.example.com");
    expect(article?.publisher?.name).toBe("Clínica Vitalis");
  });

  it("não gera JSON-LD para tipos que não são artigo", () => {
    for (const assetType of ["short_script_kit", "typo_carousel", "single_creative", "lp_copy"] as const) {
      expect(buildJsonLdForAsset({ payload: payloadFor(assetType), brand, productInput: "oferta" })).toBeNull();
    }
  });
});
