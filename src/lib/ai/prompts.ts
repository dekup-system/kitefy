import type { AssetType, BrandContext, Framework, SerpInsights, AngleType } from "@/types/domain";
import {
  analyzeBrandColorPalette,
  buildAdvertisingSynthesisBlock,
  buildToneVectorDirective,
} from "@/lib/ai/marketing-knowledge";

/**
 * Prompts do estúdio — Motor Editorial v2.
 *
 * O contexto de marca é montado como bloco estável e denso (compatível com
 * Prompt Caching) e combinado com direção editorial explícita por formato:
 * especificidade do nicho, arco narrativo entre slides, linguagem natural em
 * PT-BR e tradução clara de ângulos/frameworks em instruções acionáveis.
 */

export const BRAND_CONTEXT_VERSION = "brand-context-v2";

const ANGLE_GUIDANCE: Record<AngleType, string> = {
  vace_pattern_interrupt:
    "Quebra de padrão imediata: comece contradizendo uma crença comum do nicho ou mostrando uma cena inesperada do dia a dia do cliente.",
  contrarian_frame:
    "Mito vs. Verdade: exponha o conselho popular que faz o público perder tempo/dinheiro e apresente a abordagem correta com clareza.",
  outcome_anchored:
    "Foco em resultado prático: abra mostrando o ganho concreto ou a rotina resolvida e explique o passo a passo objetivo para chegar lá.",
  negative_constraint:
    "Erro comum a evitar: aponte um erro específico e recorrente do público, mostre o custo oculto desse erro e entregue a correção imediata.",
};

const FRAMEWORK_GUIDANCE: Record<Framework, string> = {
  pas: "Problema concreto -> Agitação do custo real no dia a dia -> Solução prática ligada à oferta.",
  aida: "Atenção forte -> Interesse com exemplo real -> Desejo pelo benefício -> Ação direta.",
  bab: "Antes (cenário travado) -> Depois (cenário resolvido) -> Ponte (o método/oferta que liga os dois).",
  hook_body_payoff: "Gancho provocativo nos 3s -> Desenvolvimento prático passo a passo -> Fechamento com ganho claro e CTA.",
};

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

  const colorProfile = analyzeBrandColorPalette(brand.visual_tokens);
  const dnaVector = buildToneVectorDirective(tone);

  return [
    `# CONTEXTO DE MARCA — ${BRAND_CONTEXT_VERSION}`,
    `Marca: ${brand.brand_name}`,
    brand.website_url ? `Site: ${brand.website_url}` : "Site: não informado",
    brand.icp_description ? `Público-alvo (ICP): ${brand.icp_description}` : "Público-alvo (ICP): não informado",
    `Identidade cromática (${colorProfile.mood}): primária ${colorProfile.primaryHex}, acento ${colorProfile.accentHex}, tema ${colorProfile.theme}. ${colorProfile.semanticDirective}`,
    `Tom de voz: ${tone.archetype ?? "consultivo e direto"}; descritores: ${(tone.descriptors ?? []).join(", ") || "claro, prático, confiável"}; evitar: ${(tone.avoid ?? []).join(", ") || "clichês e termos genéricos"}.`,
    dnaVector ? `DNA Estratégico & Vetor ToV: ${dnaVector}` : "",
    tone.reading_level ? `Nível de leitura: ${tone.reading_level}` : "",
    (tone.exemplars ?? []).length > 0
      ? `Frases aprovadas da marca (espelhe este ritmo e vocabulário):\n${(tone.exemplars ?? []).map((ex) => `- ${ex}`).join("\n")}`
      : "",
    "",
    "## Fatos verificáveis (use SOMENTE estes para números/provas; nunca invente dados)",
    facts || "Nenhum fato numérico cadastrado — use exemplos qualitativos concretos do nicho, sem inventar estatísticas.",
    "",
    "## Conhecimento interno (trechos vencedores e documentos da marca)",
    chunks || "Nenhum trecho indexado ainda — ancore-se fortemente no ICP, no objetivo e no produto/serviço informado.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSystemPrompt(assetType: AssetType): string {
  const common = [
    "Você é o diretor criativo e copywriter sênior da marca descrita no contexto.",
    "Escreva em português do Brasil natural, direto e específico para o nicho do cliente.",
    "Responda SEMPRE com um único objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.",
    "",
    "PROIBIÇÕES ABSOLUTAS (violar invalida a entrega):",
    "- Nenhuma promessa absoluta de resultado médico, financeiro ou estético (ex.: 'cura', 'garantido', 'sem risco', '100% comprovado').",
    "- Nenhuma menção a avatar digital, clonagem ou síntese de voz, lip-sync ou vídeo falado por IA.",
    "- Não invente dados, prêmios, certificações, números de clientes ou fontes.",
    "- Não use superlativo absoluto sem prova ('o melhor do mundo', 'número 1 do mercado').",
    "- Não inclua instruções para o usuário conectar redes sociais ou publicar automaticamente.",
    "",
    "PADRÃO EDITORIAL OBRIGATÓRIO (ANTI-GENÉRICO):",
    "- PROIBIDO usar clichês vazios como: 'no mundo atual', 'nos dias de hoje', 'é muito importante', 'potencialize seus resultados', 'solução completa', 'alavanque seu negócio', 'transforme sua jornada', 'descubra o segredo'.",
    "- Ancore TODA peça na realidade concreta do ICP e do produto/serviço informado: cite situações reais, objeções reais e ações práticas que o leitor reconhece imediatamente.",
    "- Prefira verbos de ação e cenas concretas a adjetivos vagos.",
    "- Todo gancho tem 8 a 15 palavras e funciona sozinho nos 3 primeiros segundos.",
    "  CONTE AS PALAVRAS antes de responder: 7 ou 16 palavras invalidam o ativo e forçam nova tentativa.",
    "  Exemplo válido (11 palavras): \"Pare de postar por postar e meça o que retém atenção\".",
    "- Toda afirmação numérica deve vir dos fatos verificáveis do contexto ou ser omitida.",
  ];

  const perType: Record<AssetType, string[]> = {
    short_script_kit: [
      "",
      "FORMATO: kit de roteiro curto (30 a 60s) para gravação HUMANA de frente para a câmera.",
      "- Escreva como alguém fala de verdade no Brasil (frases curtas, ritmo oral natural, zero tom de texto institucional).",
      "- 3 variantes de gancho genuinamente distintas entre si; use exatamente os ângulos recebidos.",
      "- Corpo estruturado em beats claros com direção de cena (enquadramento, gesto ou texto curto na tela).",
      "- Legenda SEO: primeiros 125 caracteres fortes (antes do 'ver mais'), resumo prático + CTA claro + 4 a 6 hashtags específicas do nicho (até 2.200 caracteres; versão estendida até 4.000).",
    ],
    typo_carousel: [
      "",
      "FORMATO: carrossel editorial 100% tipográfico (7 a 10 slides) com arco narrativo contínuo.",
      "- ARCO OBRIGATÓRIO: Slide 1 (cover) gera tensão/curiosidade específica do nicho; Slide 2 (point/data) mostra o problema real; Slides 3 a N-2 (point/data/quote) entregam 1 passo ou prova concreta por slide conectada ao anterior; Último slide (cta) fecha com ação direta ligada ao produto/oferta.",
      "- Título de cada slide: no máximo 8 palavras, forte e escaneável (sem reticências preguiçosas).",
      "- Corpo de cada slide: 15 a 35 palavras objetivas — cada frase deve acrescentar informação nova, nunca repetir o título.",
      "- Layouts permitidos: cover (slide 1), point, data, quote, cta (último slide). Varie os layouts no miolo para criar ritmo.",
      "- Legenda SEO: complemente os slides com contexto adicional, primeiros 125 caracteres fortes e 4 a 6 hashtags do nicho.",
      "- Nenhuma imagem gerada; nada de image_url.",
    ],
    hybrid_carousel: [
      "",
      "FORMATO: carrossel ilustrado editorial com imagens geradas por IA + diagramação variada por slide.",
      "- Siga o arco narrativo contínuo: Capa de impacto (cover) -> Problema/tensão real -> Provas/passos práticos -> Fechamento acionável (cta).",
      "- Título de slide com no máximo 8 palavras; corpo com 15 a 35 palavras que complementam o título sem repetição.",
      "- Respeite rigorosamente a quantidade de slides e de ilustrações IA (has_ai_imagery=true) especificada no briefing do usuário.",
    ],
    single_creative: [
      "",
      "FORMATO: criativo único de alto impacto (1080x1350 ou 1080x1920) com headline, subheadline, corpo curto e CTA.",
      "- Headline: até 8 palavras diretas que comunicam o benefício ou dor central de forma imediata.",
      "- Subheadline: 1 frase concreta (até 14 palavras) explicando para quem é ou qual problema resolve.",
      "- Corpo: 15 a 35 palavras práticas ligando a ideia ao produto/serviço destacado.",
      "- CTA: até 6 palavras com verbo de ação claro (ex.: 'Peça sua avaliação no WhatsApp').",
      "- Inclua image_prompt descrevendo cena/ilustração editorial limpa sem texto na imagem e sem rostos reconhecíveis.",
      "- has_ai_imagery=true porque há ilustração sintética.",
    ],
    geo_article: [
      "",
      "FORMATO: artigo SEO/GEO de autoridade (1.500 a 2.500 palavras, em PT-BR).",
      "ESTRUTURA DE REFERÊNCIA (conte as palavras): 4 seções temáticas, cada uma com 3 blocos substanciais de 120 a 200 palavras.",
      "Isso soma ~1.700 palavras no corpo. Menos de 1.450 palavras invalida o artigo e força nova tentativa.",
      "Cada bloco precisa de 100 palavras no mínimo — desenvolva com exemplos reais, critérios de decisão e passos práticos, nunca enchendo linguiça.",
      "- Cada seção tem blocos tipados: direct_fact, context, verifiable_data.",
      "- O primeiro bloco (direct_fact) de cada seção responde diretamente à pergunta do subtítulo logo na 1ª frase (formato citável por Google AI Overviews, ChatGPT e Perplexity).",
      "- Inclua FAQ com perguntas reais do público e key_takeaways objetivos.",
      "- slug em kebab-case ASCII; meta_description persuasiva com até 165 caracteres.",
      "- word_count deve refletir o texto real.",
    ],
    lp_copy: [
      "",
      "FORMATO: pack completo de copy de landing page (hero, problema, solução, prova, FAQ, CTA final).",
      "- Hero específico para o ICP e oferta: promessa clara + mecanismo prático + CTA direto.",
      "- Seção de problema usando a linguagem real do cliente; seção de solução mostrando entregáveis concretos.",
      "- Prova deve citar fonte verificável ou deixar claro que é observação interna.",
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
  brand?: Pick<BrandContext, "brand_name" | "icp_description" | "tone_of_voice" | "visual_tokens">;
  previousErrors?: string[];
  carouselPreset?: "5_slides_2_ai" | "7_slides_3_ai";
}

export function buildUserPrompt(input: GenerationPromptInput): string {
  const serp = input.serpInsights
    ? [
        "",
        "## Pesquisa de busca real (SERP) — responda essas dúvidas reais sem copiar concorrentes",
        `Consulta: ${input.serpInsights.query}`,
        "Perguntas reais do público (People Also Ask):",
        ...input.serpInsights.people_also_ask.slice(0, 8).map((item) => `- ${item.question}`),
        input.serpInsights.competitor_gaps.length > 0
          ? `Lacunas de concorrentes para explorar: ${input.serpInsights.competitor_gaps
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

  const mainAngleHelp = ANGLE_GUIDANCE[input.selectedArm.angle_type] ?? "";
  const mainFrameworkHelp = FRAMEWORK_GUIDANCE[input.selectedArm.framework] ?? "";
  const advertisingMatrix = buildAdvertisingSynthesisBlock({
    assetType: input.assetType,
    angleType: input.selectedArm.angle_type,
    framework: input.selectedArm.framework,
    objective: input.objective,
    productInput: input.productInput,
    brand: input.brand,
  });

  const hybridDirective =
    input.assetType === "hybrid_carousel"
      ? input.carouselPreset === "7_slides_3_ai"
        ? "Configuração obrigatória do Carrossel Ilustrado: gere EXATAMENTE 7 slides no array `slides`, marcando `has_ai_imagery: true` em EXATAMENTE 3 slides (capa slide 0 + 2 slides intermediários, ex.: slides 2 e 4)."
        : "Configuração obrigatória do Carrossel Ilustrado: gere EXATAMENTE 5 slides no array `slides`, marcando `has_ai_imagery: true` em EXATAMENTE 2 slides (capa slide 0 + 1 slide intermediário, ex.: slide 2)."
      : "";

  return [
    `Objetivo editorial: ${input.objective}`,
    `Produto/serviço a destacar no fechamento: ${input.productInput}`,
    hybridDirective,
    `Ângulo principal (${input.selectedArm.angle_type}): ${mainAngleHelp}`,
    `Estrutura narrativa (${input.selectedArm.framework}): ${mainFrameworkHelp}`,
    `Ângulos de exploração para variantes A/B: ${input.explorationArms
      .map((arm) => `${arm.angle_type} (${ANGLE_GUIDANCE[arm.angle_type] ?? arm.framework})`)
      .join(" | ")}`,
    "",
    advertisingMatrix,
    serp,
    errors,
    "",
    "Gere o JSON completo seguindo estritamente o schema do formato solicitado. Cruza e respeita todos os 6 pilares da matriz acima, evita frases genéricas e garante coerência total com a marca e com o produto informado.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Prompt leve do guardrail LLM (roda no modelo econômico). */
export function buildGuardrailPrompt(input: { text: string; assetType: AssetType }): string {
  return [
    `Tipo de ativo: ${input.assetType}`,
    "",
    "Revise o conteúdo abaixo procurando violações publicitárias objetivas segundo o CONAR:",
    "1) promessa absoluta de resultado (médico, financeiro, estético);",
    "2) afirmação numérica ou percentual sem fonte declarada;",
    "3) superlativo absoluto sem prova ('o melhor', 'líder absoluto', 'único');",
    "4) urgência ou escassez fabricada ('só hoje', 'últimas vagas' sem data/condição real);",
    "5) oferta de avatar/TTS/clonagem de voz.",
    "",
    "Classificação de severidade: use `warning` (recomendação) para melhorias de clareza, suavização de promessas comerciais ou falta de fonte; reserve `blocker` estritamente para oferta de avatar/clonagem de voz/TTS.",
    "",
    "Para cada violação encontrada, você DEVE gerar também o campo `suggestion`: uma REESCRITA COMPLETA, natural e persuasiva em português brasileiro que substitua `excerpt` diretamente no texto, eliminando a violação conforme o CONAR (ex.: trocando número sem fonte por expressão qualitativa segura, removendo promessas absolutas ou adicionando a ressalva exigida).",
    "IMPORTANTE: `suggestion` NUNCA pode ser igual a `excerpt` e NÃO deve ser uma instrução genérica (não escreva 'Remova o número' — escreva a frase já reescrita pronta para uso).",
    "",
    "Responda em JSON: {\"violations\":[{\"rule\":\"...\",\"excerpt\":\"...\",\"severity\":\"blocker|warning\",\"suggestion\":\"frase reescrita pronta para substituir excerpt\"}]}",
    "Se não houver violação, retorne {\"violations\":[]}.",
    "",
    "Conteúdo:",
    input.text.slice(0, 6000),
  ].join("\n");
}
