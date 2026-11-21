import type { AssetType, BrandContext, Framework, SerpInsights, AngleType } from "@/types/domain";

/**
 * Prompts do estúdio.
 *
 * O contexto de marca é montado como bloco estável e denso, para ser cacheado
 * (Prompt Caching na Anthropic) e reaproveitado entre gerações da mesma marca.
 * Regras proibitivas são repetidas no sistema E no usuário: modelos de fronteira
 * ainda erram quando a restrição aparece uma única vez no meio do prompt.
 */

export const BRAND_CONTEXT_VERSION = "brand-context-v1";

export function buildBrandContextBlock(brand: BrandContext): string {
  const tone = brand.tone_of_voice;
  const facts = brand.entity_facts
    .map((fact, index) => {
      const source = fact.source_url ? ` (fonte: ${fact.source_url})` : "";
      return `${index + 1}. ${fact.claim}${source}`;
    })
    .join("\n");

  const chunks = brand.top_chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] (${chunk.source_type}, similaridade ${chunk.similarity.toFixed(2)})\n${chunk.content}`,
    )
    .join("\n\n");

  return [
    `# CONTEXTO DE MARCA — ${BRAND_CONTEXT_VERSION}`,
    `Marca: ${brand.brand_name}`,
    brand.website_url ? `Site: ${brand.website_url}` : "Site: não informado",
    brand.icp_description ? `Público (ICP): ${brand.icp_description}` : "Público (ICP): não informado",
    `Tom de voz: ${tone.archetype ?? "não definido"}; descritores: ${(tone.descriptors ?? []).join(", ") || "não definidos"}; evitar: ${(tone.avoid ?? []).join(", ") || "nada específico"}.`,
    tone.reading_level ? `Nível de leitura: ${tone.reading_level}` : "",
    (tone.exemplars ?? []).length > 0
      ? `Frases aprovadas da marca:\n${(tone.exemplars ?? []).map((ex) => `- ${ex}`).join("\n")}`
      : "",
    "",
    "## Fatos verificáveis (use SOMENTE estes; não invente números nem fontes)",
    facts || "Nenhum fato cadastrado — evite afirmações quantitativas específicas.",
    "",
    "## Conhecimento interno (trechos vencedores e documentos da marca)",
    chunks || "Nenhum trecho indexado ainda.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSystemPrompt(assetType: AssetType): string {
  const common = [
    "Você é o redator sênior do estúdio de conteúdo da marca descrita no contexto.",
    "Escreva em português do Brasil, com clareza, frases curtas e zero jargão vazio.",
    "Responda SEMPRE com um único objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.",
    "",
    "PROIBIÇÕES ABSOLUTAS (violar invalida a entrega):",
    "- Nenhuma promessa absoluta de resultado médico, financeiro ou de emagrecimento (ex.: 'cura', 'garantido', 'sem risco').",
    "- Nenhuma menção a avatar digital, clonagem ou síntese de voz, lip-sync ou vídeo falado.",
    "- Não invente dados, prêmios, certificações, números de clientes ou fontes.",
    "- Não use superlativo absoluto sem prova ('o melhor do mundo', 'número 1 do mercado').",
    "- Não inclua instruções para o usuário conectar redes sociais ou publicar automaticamente.",
    "",
    "REGRAS DE QUALIDADE:",
    "- Todo gancho tem 8 a 15 palavras e funciona sem contexto, nos 3 primeiros segundos.",
    "- Toda afirmação numérica deve vir do contexto de marca ou ser omitida.",
    "- Prefira exemplos concretos a adjetivos.",
  ];

  const perType: Record<AssetType, string[]> = {
    short_script_kit: [
      "",
      "FORMATO: kit de roteiro curto para gravação HUMANA (sem avatar).",
      "- 3 variantes de gancho com ângulos distintos; use exatamente os ângulos recebidos.",
      "- Corpo de 30 a 60 segundos, framework recebido, com beats de direção cênica.",
      "- Legenda SEO até 2.200 caracteres e versão estendida até 4.000.",
      "- Guia visual de cena com texto na tela, curto.",
    ],
    typo_carousel: [
      "",
      "FORMATO: carrossel 100% tipográfico (7 a 10 slides).",
      "- Título de slide com no máximo 8 palavras; corpo com no máximo 35 palavras.",
      "- Layouts permitidos: cover, point, data, quote, cta.",
      "- Nenhuma imagem gerada; nada de image_url.",
    ],
    hybrid_carousel: [
      "",
      "FORMATO: carrossel híbrido (7 a 10 slides), tipografia + até 2 imagens geradas.",
      "- Título de slide com no máximo 8 palavras; corpo com no máximo 35 palavras.",
      "- Marque has_ai_imagery=true somente nos slides que terão imagem sintética.",
    ],
    single_creative: [
      "",
      "FORMATO: criativo único (1080x1350) com headline, subheadline, corpo curto e CTA.",
      "- Inclua image_prompt descrevendo ilustração editorial sem rostos reconhecíveis.",
      "- has_ai_imagery=true porque há ilustração sintética.",
    ],
    geo_article: [
      "",
      "FORMATO: artigo SEO/GEO de 1.500 a 2.500 palavras, em PT-BR.",
      "- Cada seção tem blocos tipados: direct_fact, context, verifiable_data.",
      "- O primeiro bloco de cada seção é o fato direto, respondível em uma frase.",
      "- Inclua FAQ com perguntas reais do público e key_takeaways.",
      "- slug em kebab-case ASCII; meta_description com até 165 caracteres.",
      "- word_count deve refletir o texto real.",
    ],
    lp_copy: [
      "",
      "FORMATO: pack completo de copy de landing page (hero, problema, solução, prova, FAQ, CTA final).",
      "- Prova deve citar fonte ou deixar claro que é observação interna.",
    ],
  };

  return [...common, ...perType[assetType]].join("\n");
}

export interface GenerationPromptInput {
  assetType: AssetType;
  objective: string;
  productInput: string;
  selectedArm: { angle_type: AngleType; framework: Framework };
  explorationArms: { angle_type: AngleType; framework: Framework }[];
  serpInsights: SerpInsights | null;
  previousErrors?: string[];
}

export function buildUserPrompt(input: GenerationPromptInput): string {
  const serp = input.serpInsights
    ? [
        "",
        "## Pesquisa de busca (SERP) — use como matéria-prima, não copie",
        `Consulta: ${input.serpInsights.query}`,
        "Perguntas do público (People Also Ask):",
        ...input.serpInsights.people_also_ask.slice(0, 8).map((item) => `- ${item.question}`),
        input.serpInsights.competitor_gaps.length > 0
          ? `Lacunas de concorrentes: ${input.serpInsights.competitor_gaps
              .slice(0, 5)
              .map((gap) => `${gap.title} (${gap.url})`)
              .join("; ")}`
          : "",
        input.serpInsights.recent_facts.length > 0
          ? `Fatos recentes com fonte: ${input.serpInsights.recent_facts
              .slice(0, 5)
              .map((fact) => `${fact.claim} — ${fact.source_url}`)
              .join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const errors =
    input.previousErrors && input.previousErrors.length > 0
      ? [
          "",
          "## Correções obrigatórias da tentativa anterior",
          ...input.previousErrors.map((error) => `- ${error}`),
        ].join("\n")
      : "";

  return [
    `Objetivo do ativo: ${input.objective}`,
    `Produto/oferta a destacar: ${input.productInput}`,
    `Ângulo principal (braço vencedor do Thompson Sampling): ${input.selectedArm.angle_type}`,
    `Framework principal: ${input.selectedArm.framework}`,
    `Ângulos de exploração (para as variantes A/B): ${input.explorationArms
      .map((arm) => `${arm.angle_type}/${arm.framework}`)
      .join(", ")}`,
    serp,
    errors,
    "",
    "Gere o JSON completo seguindo o schema do formato solicitado. Não inclua campos extras.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Prompt leve do guardrail LLM (roda no modelo econômico). */
export function buildGuardrailPrompt(input: { text: string; assetType: AssetType }): string {
  return [
    `Tipo de ativo: ${input.assetType}`,
    "",
    "Revise o conteúdo abaixo procurando apenas violações publicitárias objetivas:",
    "1) promessa absoluta de resultado (médico, financeiro, estético);",
    "2) afirmação numérica sem fonte declarada;",
    "3) superlativo absoluto sem prova;",
    "4) urgência ou escassez fabricada;",
    "5) oferta de avatar/TTS/clonagem de voz.",
    "",
    "Responda em JSON: {\"violations\":[{\"rule\":\"...\",\"excerpt\":\"...\",\"severity\":\"blocker|warning\"}]}",
    "Se não houver violação, retorne {\"violations\":[]}.",
    "",
    "Conteúdo:",
    input.text.slice(0, 6000),
  ].join("\n");
}
