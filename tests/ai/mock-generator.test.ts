import { describe, expect, it } from "vitest";
import { generateMockContent, inferBrandSeed, type MockGenerationInput } from "@/lib/ai/mock-generator";
import { parseContentPayload, countWords } from "@/lib/ai/content-schemas";
import type { AssetType, BrandContext } from "@/types/domain";

const brand: BrandContext = {
  brand_id: "11111111-1111-1111-1111-111111111111",
  brand_name: "Clínica Vitalis",
  website_url: "https://vitalis.example.com",
  icp_description: "Adultos de 30 a 50 anos que buscam acompanhamento preventivo",
  tone_of_voice: {
    archetype: "especialista acessível",
    descriptors: ["direto", "cuidadoso"],
    avoid: ["promessa milagrosa"],
    reading_level: "ensino médio",
    exemplars: ["Explicamos o porquê antes do como."],
  },
  visual_tokens: { primary: "#1f1f23", background: "#fdfdfd" },
  entity_facts: [
    { claim: "Atende em São Paulo desde 2014", source_url: "https://vitalis.example.com/sobre" },
  ],
  top_chunks: [
    { content: "Retenção nos três segundos é o indicador mais informativo.", source_type: "winning_post", similarity: 0.91 },
  ],
};

function inputFor(assetType: AssetType): MockGenerationInput {
  return {
    assetType,
    brand,
    objective: "Aumentar a retenção de conteúdo orgânico",
    productInput: "acompanhamento preventivo",
    selectedArm: { angle_type: "vace_pattern_interrupt", framework: "hook_body_payoff" },
    explorationArms: [
      { angle_type: "contrarian_frame", framework: "pas" },
      { angle_type: "outcome_anchored", framework: "aida" },
    ],
    serpInsights: {
      provider: "mock",
      query: "acompanhamento preventivo",
      fetched_at: new Date("2026-01-05T10:00:00Z").toISOString(),
      people_also_ask: [
        { question: "Com que frequência devo fazer check-up?" },
        { question: "Acompanhamento preventivo funciona?" },
        { question: "Qual o custo de um plano preventivo?" },
      ],
      competitor_gaps: [],
      recent_facts: [],
    },
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

describe("Gerador mock determinístico", () => {
  it.each(ASSET_TYPES)("gera payload válido para %s", (assetType) => {
    const payload = generateMockContent(inputFor(assetType));
    const parsed = parseContentPayload(assetType, payload);
    expect(parsed).toBeTruthy();
  });

  it("é determinístico para a mesma entrada", () => {
    const a = generateMockContent(inputFor("short_script_kit"));
    const b = generateMockContent(inputFor("short_script_kit"));
    expect(a).toEqual(b);
  });

  it("entrega 3 ganchos de 8 a 15 palavras com ângulos distintos", () => {
    const payload = generateMockContent(inputFor("short_script_kit"));
    if (payload.kind !== "short_script_kit") throw new Error("tipo inesperado");
    expect(payload.hooks).toHaveLength(3);
    for (const hook of payload.hooks) {
      const words = countWords(hook.hook_text);
      expect(words).toBeGreaterThanOrEqual(8);
      expect(words).toBeLessThanOrEqual(15);
    }
    expect(new Set(payload.hooks.map((h) => h.angle_type)).size).toBe(3);
  });

  it("corpo do roteiro fica entre 30 e 60 segundos", () => {
    const payload = generateMockContent(inputFor("short_script_kit"));
    if (payload.kind !== "short_script_kit") throw new Error("tipo inesperado");
    expect(payload.body.estimated_seconds).toBeGreaterThanOrEqual(30);
    expect(payload.body.estimated_seconds).toBeLessThanOrEqual(60);
    expect(payload.recording_notes.length).toBeGreaterThan(0);
    // O roteiro é para gravação humana: precisa avisar explicitamente que não há
    // avatar/TTS e não pode oferecer nenhum recurso sintético.
    const notes = payload.recording_notes.join(" ").toLowerCase();
    expect(notes).toMatch(/sem avatar|não usa tts|gravação é humana/);
    expect(JSON.stringify(payload).toLowerCase()).not.toMatch(/avatar falante|voz clonada|lip-?sync/);
  });

  it("carrossel tem 7 a 10 slides com título <= 8 e corpo <= 35 palavras", () => {
    const payload = generateMockContent(inputFor("typo_carousel"));
    if (payload.kind !== "typo_carousel") throw new Error("tipo inesperado");
    expect(payload.slides.length).toBeGreaterThanOrEqual(7);
    expect(payload.slides.length).toBeLessThanOrEqual(10);
    for (const slide of payload.slides) {
      expect(countWords(slide.title)).toBeLessThanOrEqual(8);
      expect(countWords(slide.body)).toBeLessThanOrEqual(35);
    }
  });

  it("artigo GEO tem 1.500+ palavras, 3+ seções e bloco verificável em cada uma", () => {
    const payload = generateMockContent(inputFor("geo_article"));
    if (payload.kind !== "geo_article") throw new Error("tipo inesperado");
    expect(payload.word_count).toBeGreaterThanOrEqual(1450);
    expect(payload.sections.length).toBeGreaterThanOrEqual(3);
    expect(payload.faq.length).toBeGreaterThanOrEqual(3);
    for (const section of payload.sections) {
      expect(section.blocks.some((b) => b.type === "direct_fact")).toBe(true);
      expect(section.blocks.some((b) => b.type === "verifiable_data")).toBe(true);
    }
  });

  it("legenda SEO respeita 2.200 e estendida 4.000 caracteres", () => {
    const payload = generateMockContent(inputFor("short_script_kit"));
    if (payload.kind !== "short_script_kit") throw new Error("tipo inesperado");
    expect(payload.caption.seo.length).toBeLessThanOrEqual(2200);
    expect(payload.caption.extended.length).toBeLessThanOrEqual(4000);
    expect(payload.caption.hashtags.length).toBeGreaterThanOrEqual(3);
  });

  it("inferBrandSeed extrai marca de URL e de descrição", () => {
    const fromUrl = inferBrandSeed("https://www.clinica-vitalis.com.br/sobre");
    expect(fromUrl.brand_name).toBe("Clinica Vitalis");
    expect(fromUrl.website_url).toContain("clinica-vitalis.com.br");

    const fromText = inferBrandSeed("Somos uma consultoria de dados para varejo. Atuamos no Brasil.");
    expect(fromText.website_url).toBeNull();
    expect(fromText.icp_description).toContain("consultoria de dados");
  });
});
