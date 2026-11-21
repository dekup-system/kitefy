import { describe, expect, it } from "vitest";
import { buildExportFile, buildContentMarkdown, markdownToBasicHtml } from "@/lib/export/pack";
import { generateMockContent } from "@/lib/ai/mock-generator";
import type { AssetType, BrandContext, CampaignAssetRow } from "@/types/domain";

/**
 * Exportação é a entrega final do produto: precisa funcionar para todos os
 * tipos de ativo, sem depender de rede e sem vazar HTML/JSON inválido.
 */

const brand: BrandContext = {
  brand_id: "11111111-1111-1111-1111-111111111111",
  brand_name: "Marca Teste",
  website_url: "https://marca.example.com",
  icp_description: "Público de teste",
  tone_of_voice: { descriptors: ["direto"] },
  visual_tokens: { primary: "#111111" },
  entity_facts: [{ claim: "Atua desde 2014", source_url: "https://marca.example.com/sobre" }],
  top_chunks: [],
};

function assetFor(assetType: AssetType): CampaignAssetRow {
  const payload = generateMockContent({
    assetType,
    brand,
    objective: "Aumentar a retenção do conteúdo orgânico",
    productInput: "acompanhamento preventivo",
    selectedArm: { angle_type: "vace_pattern_interrupt", framework: "hook_body_payoff" },
    explorationArms: [
      { angle_type: "contrarian_frame", framework: "pas" },
      { angle_type: "outcome_anchored", framework: "aida" },
    ],
    serpInsights: null,
  });

  return {
    id: "22222222-2222-2222-2222-222222222222",
    tenant_id: "33333333-3333-3333-3333-333333333333",
    brand_id: brand.brand_id,
    thread_id: "44444444-4444-4444-4444-444444444444",
    asset_type: assetType,
    status: "approved",
    title: `Ativo ${assetType}`,
    content_payload: payload as CampaignAssetRow["content_payload"],
    visual_urls: [],
    json_ld: null,
    credits_charged: 1,
    has_ai_imagery: assetType === "single_creative" || assetType === "hybrid_carousel",
    created_at: new Date("2026-01-01T12:00:00Z").toISOString(),
  };
}

const ASSET_TYPES: AssetType[] = [
  "short_script_kit",
  "typo_carousel",
  "hybrid_carousel",
  "single_creative",
  "geo_article",
  "lp_copy",
];

describe("Pacote de exportação", () => {
  it.each(ASSET_TYPES)("gera Markdown não vazio para %s", (assetType) => {
    const asset = assetFor(assetType);
    const file = buildExportFile({ asset, brandName: brand.brand_name, websiteUrl: brand.website_url, format: "md" });
    const text = file.buffer.toString("utf8");

    expect(file.mimeType).toContain("text/markdown");
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain("#");
    // Aviso de revisão humana sempre presente.
    expect(text.toLowerCase()).toContain("revisão humana");
  });

  it("escapa HTML perigoso na exportação para HTML", () => {
    const asset = assetFor("geo_article");
    if (asset.content_payload.kind !== "geo_article") throw new Error("payload inesperado");
    asset.content_payload.title = '<script>alert("x")</script> Título';
    const file = buildExportFile({ asset, brandName: brand.brand_name, websiteUrl: brand.website_url, format: "html" });
    const html = file.buffer.toString("utf8");

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(html).toContain("lang=\"pt-BR\"");
  });

  it("entrega payload JSON completo no formato json", () => {
    const asset = assetFor("typo_carousel");
    const file = buildExportFile({ asset, brandName: brand.brand_name, format: "json" });
    const parsed = JSON.parse(file.buffer.toString("utf8")) as {
      schema: string;
      asset: { id: string };
    };

    expect(parsed.schema).toBe("brandpulse.asset.v1");
    expect(parsed.asset.id).toBe(asset.id);
  });

  it("monta ZIP com markdown, payload, imagens e LEIA-ME", () => {
    const asset = assetFor("typo_carousel");
    const file = buildExportFile({
      asset,
      brandName: brand.brand_name,
      format: "zip",
      visuals: [{ fileName: "slide-1.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }],
    });

    expect(file.mimeType).toBe("application/zip");
    const contents = file.buffer.toString("latin1");
    expect(contents).toContain("conteudo.md");
    expect(contents).toContain("payload.json");
    expect(contents).toContain("imagens/slide-1.png");
    expect(contents).toContain("LEIA-ME.txt");
  });

  it("inclui aviso de imagem sintética quando há IA", () => {
    const asset = assetFor("single_creative");
    const markdown = buildContentMarkdown(asset.content_payload, {
      title: asset.title,
      brandName: brand.brand_name,
      credits: 2,
      transparency: true,
      models: ["google:gemini-3-flash-preview"],
    });

    expect(markdown.toLowerCase()).toContain("imagem sintética");
    expect(markdown).toContain("Modelos utilizados");
    expect(markdown).toContain("Créditos consumidos: 2");
  });

  it("markdownToBasicHtml converte títulos, listas e parágrafos", () => {
    const html = markdownToBasicHtml("## Título\n\n- item 1\n- item 2\n\nParágrafo final");
    expect(html).toContain("<h2>Título</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item 1</li>");
    expect(html).toContain("<p>Parágrafo final</p>");
  });
});
