import { describe, expect, it } from "vitest";
import {
  MARKETING_LIBRARY_VERSION,
  MARKETING_REFERENCE_LIBRARY,
  analyzeBrandColorPalette,
  buildAdvertisingSynthesisBlock,
  buildToneVectorDirective,
  classifyAudienceAndAwareness,
  crossReferenceAdvertisingContext,
  selectVisualTheme,
  type KnowledgePillarId,
} from "@/lib/ai/marketing-knowledge";
import { buildCleanCopyText } from "@/lib/export/pack";
import { fetchIbgeDemographics } from "@/lib/audience/ibge-demographics";
import { generateBrandAudienceStudy } from "@/lib/audience/persona-generator";
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
    expect(synthesis).toContain("MATRIZ CIENTÍFICA CRUZADA DE REFERÊNCIAS PUBLICITÁRIAS");
    expect(synthesis).toContain("1. Marketing Digital");
    expect(synthesis).toContain("2. Psicologia das Cores");
    expect(synthesis).toContain("3. Comunicação Social");
    expect(synthesis).toContain("4. Design & Diagramação Profissional");
    expect(synthesis).toContain("5. Público-Alvo");
    expect(synthesis).toContain("6. Linguagem");

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
    expect(userPrompt).toContain("MATRIZ CIENTÍFICA CRUZADA DE REFERÊNCIAS PUBLICITÁRIAS");
    expect(userPrompt).toContain("#1D4ED8");
  });

  it("aplica ELM, STEPPS, Critério Brasil (ABEP), vetor NN/g ToV e rotação de estilos visuais", () => {
    const vector = buildToneVectorDirective({
      formality: 3,
      humor: 2,
      irreverence: 7,
      enthusiasm: 5,
      uvp: "Diagnóstico tributário em 48h",
      contrarian_thesis: "Pagar imposto sem planejamento é erro de gestão",
      objections: ["Acho caro trocar de contador"],
      abep_class: "B1",
      jtbd_functional: "Reduzir carga tributária com segurança jurídica",
    });

    expect(vector).toContain("Formalidade 3/10");
    expect(vector).toContain("Diagnóstico tributário em 48h");
    expect(vector).toContain("Pagar imposto sem planejamento");

    const themeFixed = selectVisualTheme({ preference: "magazine_split" });
    expect(themeFixed).toBe("magazine_split");

    // Seleção científica determinística (sem aleatoriedade) baseada no estudo da marca
    expect(selectVisualTheme({ preference: "auto", abepClass: "A" })).toBe("swiss_minimal");
    expect(selectVisualTheme({ preference: "auto", colorMood: "quente_energia" })).toBe("dark_impact");
    expect(selectVisualTheme({ preference: "auto", segment: "b2c" })).toBe("magazine_split");
    expect(selectVisualTheme({ preference: "auto", segment: "b2b", colorMood: "fria_confianca" })).toBe("editorial_classic");
  });

  it("buildCleanCopyText gera texto pronto para copiar sem símbolos de Markdown/IA", () => {
    const clean = buildCleanCopyText(
      {
        kind: "typo_carousel",
        slides: [
          { index: 0, layout: "cover", title: "Capa direta", body: "Subtítulo claro do nicho." },
          { index: 1, layout: "cta", title: "Próximo passo", body: "Chame no WhatsApp para avaliar." },
        ],
        caption: {
          seo: "Legenda limpa pronta para o Instagram.",
          hashtags: ["#marketing", "#gestao"],
        },
        design_notes: ["Contraste alto"],
      },
      "Carrossel de Teste",
    );

    expect(clean).toContain("Slide 1 — Capa direta");
    expect(clean).toContain("Legenda limpa pronta para o Instagram.");
    expect(clean).not.toContain("##");
    expect(clean).not.toContain("**");
    expect(clean).not.toContain("---");
  });

  it("gera estudo de público com dados IBGE, análise de consumo, personas JTBD/VoC e injeta no orquestrador", async () => {
    const ibge = await fetchIbgeDemographics("PR");
    expect(ibge.uf).toBe("PR");
    expect(ibge.population).toBeGreaterThan(10_000_000);
    expect(ibge.perCapitaIncomeBrl).toBeGreaterThan(2000);

    const study = await generateBrandAudienceStudy({
      brandName: "Atlas Contabilidade Digital",
      region: "PR",
      icpDescription: "Empresários de PMEs de serviços",
      abepClass: "B1",
      entityFacts: [{ claim: "Planejamento tributário legal para PMEs" }],
    });
    expect(study.personas.length).toBe(3);
    expect(study.personas[0]?.vocPhrases.length).toBeGreaterThanOrEqual(2);
    expect(study.consumptionAnalysis.buyingTriggers.length).toBeGreaterThanOrEqual(2);

    const vector = buildToneVectorDirective({ audience_study: study });
    expect(vector).toContain("Demografia IBGE");
    expect(vector).toContain("Personas reais da marca (3)");
    expect(vector).toContain("P1 (");
    expect(vector).toContain("P2 (");
    expect(vector).toContain("P3 (");
    expect(vector).toContain("VoC:");

    const sudeste = await fetchIbgeDemographics("Sudeste");
    expect(sudeste.uf).toBe("SE-REG");
    expect(sudeste.population).toBeGreaterThan(80_000_000);
  });

  it("injeta memória de desempenho real (Bombou vs Fraco) e cânone de autores clássicos nos prompts", () => {
    const brandBlock = buildBrandContextBlock({
      ...SAMPLE_B2B_BRAND,
      performance_memory: {
        winners: ["3 erros tributários que drenam o caixa (typo_carousel)"],
        weak: ["Dicas genéricas de contabilidade (single_creative)"],
      },
    });
    expect(brandBlock).toContain("Memória de desempenho real desta marca");
    expect(brandBlock).toContain("PADRÕES QUE BOMBARAM");
    expect(brandBlock).toContain("PADRÕES QUE FORAM FRACOS");

    const userPrompt = buildUserPrompt({
      assetType: "geo_article",
      objective: "Atrair empresas do Sudeste",
      productInput: "Planejamento Tributário",
      selectedArm: { angle_type: "contrarian_frame", framework: "pas" },
      explorationArms: [{ angle_type: "outcome_anchored", framework: "bab" }],
      serpInsights: null,
      brand: SAMPLE_B2B_BRAND,
    });
    expect(userPrompt).toContain("David Ogilvy");
    expect(userPrompt).toContain("Claude Hopkins");
    expect(userPrompt).toContain("Philip Kotler");
  });

  it("injeta diretriz científica de Brand Storytelling para Carrossel 6 IA (10 cr) e Roteiro 3 Vídeos 10s (2 cr)", async () => {
    const { totalRunCreditCost } = await import("@/lib/pricing");
    expect(totalRunCreditCost("hybrid_carousel", false, "6_slides_storytelling_6_ai")).toBe(10);
    expect(totalRunCreditCost("short_script_kit", false, "ai_video_3x10s_storytelling")).toBe(2);

    const storyCarouselPrompt = buildUserPrompt({
      assetType: "hybrid_carousel",
      objective: "Contar história de transformação de um empresário",
      productInput: "Consultoria Atlas",
      selectedArm: { angle_type: "vace_pattern_interrupt", framework: "bab" },
      explorationArms: [{ angle_type: "outcome_anchored", framework: "pas" }],
      serpInsights: null,
      brand: SAMPLE_B2B_BRAND,
      carouselPreset: "6_slides_storytelling_6_ai",
    });
    expect(storyCarouselPrompt).toContain("BRAND STORYTELLING");
    expect(storyCarouselPrompt).toContain("Donald Miller");
    expect(storyCarouselPrompt).toContain("EXATAMENTE 6 SLIDES");

    const storyVideoPrompt = buildUserPrompt({
      assetType: "short_script_kit",
      objective: "História curta em 3 vídeos de 10 segundos",
      productInput: "Consultoria Atlas",
      selectedArm: { angle_type: "contrarian_frame", framework: "pas" },
      explorationArms: [{ angle_type: "outcome_anchored", framework: "bab" }],
      serpInsights: null,
      brand: SAMPLE_B2B_BRAND,
      carouselPreset: "ai_video_3x10s_storytelling",
    });
    expect(storyVideoPrompt).toContain("3 VÍDEOS POR IA DE 10 SEGUNDOS");
    expect(storyVideoPrompt).toContain("PROMPT CINEMATOGRÁFICO PRONTO");
  });
});
