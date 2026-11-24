import { describe, expect, it } from "vitest";
import {
  MARKETING_LIBRARY_VERSION,
  MARKETING_REFERENCE_LIBRARY,
  analyzeBrandColorPalette,
  buildAdvertisingSynthesisBlock,
  classifyAudienceAndAwareness,
  crossReferenceAdvertisingContext,
  type KnowledgePillarId,
} from "@/lib/ai/marketing-knowledge";
import { buildBrandContextBlock, buildUserPrompt } from "@/lib/ai/prompts";
import type { BrandContext } from "@/types/domain";

const ALL_PILLARS: KnowledgePillarId[] = [
  "marketing_digital",
  "psicologia_cores",
  "comunicacao_publicidade",
  "design_diagramacao",
  "publico_consumo",
  "linguagem_persuasao",
];

const SAMPLE_B2B_BRAND: BrandContext = {
  brand_id: "brand-b2b",
  brand_name: "Atlas Contabilidade Digital",
  website_url: "https://atlas.example.com.br",
  icp_description: "Empresários e gestores financeiros de PMEs de serviços que querem reduzir impostos legalmente.",
  tone_of_voice: {
    archetype: "consultivo",
    descriptors: ["técnico", "claro", "objetivo"],
    avoid: ["jargão impenetrável"],
  },
  visual_tokens: {
    primary: "#1D4ED8",
    accent: "#0EA5E9",
    theme: "light",
  },
  entity_facts: [
    { claim: "Atendimento 100% digital para PMEs no Simples Nacional e Lucro Presumido." },
  ],
  top_chunks: [],
};

describe("marketing-knowledge library", () => {
  it("contém os 6 pilares disciplinares completos com fontes verificadas", () => {
    for (const pillar of ALL_PILLARS) {
      const entry = MARKETING_REFERENCE_LIBRARY[pillar];
      expect(entry).toBeDefined();
      expect(entry.title.length).toBeGreaterThan(10);
      expect(entry.corePrinciples.length).toBeGreaterThanOrEqual(2);
      expect(entry.applicationRules.length).toBeGreaterThanOrEqual(2);
      expect(entry.sources.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("classifica corretamente a psicologia das cores a partir do hex da marca", () => {
    expect(analyzeBrandColorPalette({ primary: "#1D4ED8", accent: "#38BDF8" }).mood).toBe("fria_confianca");
    expect(analyzeBrandColorPalette({ primary: "#EA580C", accent: "#F59E0B" }).mood).toBe("quente_energia");
    expect(analyzeBrandColorPalette({ primary: "#15803D", accent: "#22C55E" }).mood).toBe("organica_equilibrio");
    expect(analyzeBrandColorPalette({ primary: "#7C3AED", accent: "#C084FC" }).mood).toBe("sofisticada_criativa");
    expect(analyzeBrandColorPalette({ primary: "#111827", accent: "#2563EB" }).mood).toBe("neutra_editorial");
  });

  it("calibra público B2B vs B2C e estágio de consciência de Schwartz", () => {
    const b2b = classifyAudienceAndAwareness({
      icpDescription: "Gestores de clínicas e empresários B2B",
      objective: "Gerar pedidos de diagnóstico comercial",
      assetType: "typo_carousel",
      angleType: "negative_constraint",
    });
    expect(b2b.segment).toBe("b2b");
    expect(b2b.awarenessStage).toBe("consciente_do_problema");
    expect(b2b.consumerDirective).toContain("B2B");

    const b2c = classifyAudienceAndAwareness({
      icpDescription: "Mulheres de 25 a 45 anos buscando rotina prática de cuidados com a pele",
      objective: "Atrair atenção no topo de funil",
      assetType: "short_script_kit",
      angleType: "vace_pattern_interrupt",
    });
    expect(b2c.segment).toBe("b2c");
    expect(b2c.awarenessStage).toBe("inconsciente");
    expect(b2c.consumerDirective).toContain("B2C");

    const lp = classifyAudienceAndAwareness({
      icpDescription: "Empreendedores digitais",
      objective: "Conversão direta em assinatura mensal",
      assetType: "lp_copy",
      angleType: "outcome_anchored",
    });
    expect(lp.awarenessStage).toBe("consciente_do_produto");
  });

  it("cruza todos os 6 pilares e injeta a matriz nos prompts de geração", () => {
    const matrix = crossReferenceAdvertisingContext({
      assetType: "typo_carousel",
      angleType: "contrarian_frame",
      framework: "pas",
      objective: "Educar sobre planejamento tributário",
      productInput: "Diagnóstico Tributário Atlas",
      brand: SAMPLE_B2B_BRAND,
    });

    expect(matrix.version).toBe(MARKETING_LIBRARY_VERSION);
    expect(matrix.colorAnalysis.mood).toBe("fria_confianca");
    expect(matrix.audienceAnalysis.segment).toBe("b2b");
    expect(matrix.designDirective).toContain("Layer-Cake");

    const synthesis = buildAdvertisingSynthesisBlock({
      assetType: "typo_carousel",
      angleType: "contrarian_frame",
      framework: "pas",
      objective: "Educar sobre planejamento tributário",
      productInput: "Diagnóstico Tributário Atlas",
      brand: SAMPLE_B2B_BRAND,
    });
    expect(synthesis).toContain("MATRIZ CRUZADA DE REFERÊNCIAS PUBLICITÁRIAS");
    expect(synthesis).toContain("1. Marketing Digital");
    expect(synthesis).toContain("2. Psicologia das Cores");
    expect(synthesis).toContain("3. Comunicação Social & Publicidade");
    expect(synthesis).toContain("4. Design & Diagramação Profissional");
    expect(synthesis).toContain("5. Público-Alvo & Consumo");
    expect(synthesis).toContain("6. Linguagem & Persuasão Ética");

    const brandBlock = buildBrandContextBlock(SAMPLE_B2B_BRAND);
    expect(brandBlock).toContain("Identidade cromática (fria_confianca)");

    const userPrompt = buildUserPrompt({
      assetType: "typo_carousel",
      objective: "Educar sobre planejamento tributário",
      productInput: "Diagnóstico Tributário Atlas",
      selectedArm: { angle_type: "contrarian_frame", framework: "pas" },
      explorationArms: [{ angle_type: "outcome_anchored", framework: "bab" }],
      serpInsights: null,
      brand: SAMPLE_B2B_BRAND,
    });
    expect(userPrompt).toContain("MATRIZ CRUZADA DE REFERÊNCIAS PUBLICITÁRIAS");
    expect(userPrompt).toContain("#1D4ED8");
  });
});
