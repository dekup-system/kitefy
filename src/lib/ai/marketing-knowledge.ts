import type { AngleType, AssetType, BrandContext, Framework, VisualTokens } from "@/types/domain";

/**
 * Biblioteca de Referências Publicitárias & Motor de Cruzamento Pré-Geração.
 *
 * Reúne os 6 pilares solicitados — com fontes verificadas — e cruza todos eles
 * dinamicamente com o contexto real da marca (paleta de cores, ICP, tom de voz),
 * o tipo de ativo, o objetivo e o ângulo antes de gerar qualquer material
 * publicitário.
 */

export type KnowledgePillarId =
  | "marketing_digital"
  | "psicologia_cores"
  | "comunicacao_publicidade"
  | "design_diagramacao"
  | "publico_consumo"
  | "linguagem_persuasao";

export interface KnowledgeReference {
  id: KnowledgePillarId;
  title: string;
  corePrinciples: string[];
  applicationRules: string[];
  sources: { name: string; focus: string }[];
}

export const MARKETING_LIBRARY_VERSION = "advertising-library-v1";

export const MARKETING_REFERENCE_LIBRARY: Record<KnowledgePillarId, KnowledgeReference> = {
  marketing_digital: {
    id: "marketing_digital",
    title: "Marketing Digital, Disponibilidade Mental e E-E-A-T / GEO",
    corePrinciples: [
      "Disponibilidade Mental e Distinctive Brand Assets (Ehrenberg-Bass / Byron Sharp & Jenni Romaniuk): marcas crescem sendo fáceis de lembrar e reconhecer no momento de compra, reforçando ativos distintivos (paleta, assinatura visual, vocabulário próprio) com consistência.",
      "E-E-A-T e GEO (Google Search Central): conteúdo de alto desempenho demonstra Experiência real, Especialidade, Autoridade e Confiabilidade, respondendo perguntas objetivas logo na primeira frase para ser citável por buscas tradicionais e motores generativos (AI Overviews, ChatGPT, Perplexity).",
      "Retenção progressiva em funil: cada peça precisa cumprir seu papel exato na jornada — atrair atenção qualificada no topo, educar com critério no meio e reduzir fricção para conversão no fundo.",
    ],
    applicationRules: [
      "Abertura dos primeiros 3 segundos (ou 125 caracteres da legenda) deve entregar sinal claro de relevância para o ICP, sem rodeios institucionais.",
      "Em artigos e LPs, responder a dúvida principal diretamente na abertura de cada seção com fatos concretos e critérios verificáveis.",
      "Reforçar sempre o posicionamento e o ativo distintivo da marca sem parecer genérico de banco de templates.",
    ],
    sources: [
      { name: "Ehrenberg-Bass Institute (Byron Sharp & Jenni Romaniuk)", focus: "How Brands Grow & Building Distinctive Brand Assets" },
      { name: "Google Search Central", focus: "Creating Helpful, Reliable, People-First Content (E-E-A-T)" },
    ],
  },

  psicologia_cores: {
    id: "psicologia_cores",
    title: "Psicologia das Cores, Contraste Funcional e Fluência Visual",
    corePrinciples: [
      "Fluência de Processamento (Processing Fluency): peças com alto contraste figura-fundo e paleta coerente reduzem esforço cognitivo, elevando a percepção subconsciente de confiança e qualidade.",
      "Contraste funcional (WCAG AA >= 4.5:1): legibilidade supera ornamentação; cor de destaque (accent) deve sinalizar apenas o ponto focal (CTA, dado-chave ou quebra de padrão), nunca competir com o texto.",
      "Regra cromática 60-30-10 e leitura semântica de categoria: 60% superfície dominante de respiro, 30% cor estrutural da marca (primária) e 10% acento estratégico; cores frias reforçam confiança/precisão, cores quentes ativam urgência/energia, neutras/escuras elevam percepção editorial e sofisticação.",
    ],
    applicationRules: [
      "Alinhar a temperatura emocional do texto com a paleta real da marca (ex.: paleta fria/corporativa pede autoridade serena; paleta quente/vibrante sustenta energia direta).",
      "Em direções de arte e notas de design, especificar contraste figura-fundo alto e uso contido da cor de acento exclusivamente no foco principal ou CTA.",
    ],
    sources: [
      { name: "Ehrenberg-Bass Institute", focus: "Color as a Distinctive Brand Asset & Category Cues" },
      { name: "W3C WCAG 2.1", focus: "Contrast Ratio & Visual Readability Standards" },
    ],
  },

  comunicacao_publicidade: {
    id: "comunicacao_publicidade",
    title: "Comunicação Social aplicada à Publicidade e Níveis de Consciência",
    corePrinciples: [
      "5 Níveis de Consciência de Mercado (Eugene Schwartz — Breakthrough Advertising): a publicidade não cria desejo do zero, ela canaliza um desejo existente ajustando a abordagem ao estágio exato do público (Inconsciente, Consciente do Problema, Consciente da Solução, Consciente do Produto, Totalmente Consciente).",
      "Sofisticação de Mercado (Schwartz): em mercados saturados de promessas repetidas, gritar uma promessa maior falha; a persuasão exige nomear um mecanismo único, um critério claro ou uma experiência reconhecível.",
      "Enquadramento narrativo (Framing): a forma como a situação é moldurada (custo do erro, ganho prático, mito vs. verdade) define se o leitor presta atenção ou ignora.",
    ],
    applicationRules: [
      "Nunca vender produto de cara para público Inconsciente ou Consciente do Problema — comece pelo sintoma, tensão cotidiana ou quebra de crença.",
      "Evitar jargão publicitário saturado e apresentar o mecanismo concreto que diferencia a oferta.",
    ],
    sources: [
      { name: "Eugene M. Schwartz (Breakthrough Advertising)", focus: "5 Levels of Market Awareness & Market Sophistication" },
    ],
  },

  design_diagramacao: {
    id: "design_diagramacao",
    title: "Design Profissional, Diagramação Editorial, Hierarquia Visual e Gestalt",
    corePrinciples: [
      "Padrões de Leitura Digital (Nielsen Norman Group): usuários escaneiam em padrão F (blocos de texto), padrão Layer-Cake (títulos e subtítulos destacados) e padrão Z (anúncios e criativos únicos). Colocar as palavras de maior carga semântica no início (front-loading).",
      "Princípios da Gestalt (Proximidade, Semelhança, Continuidade, Fechamento e Figura-Fundo): elementos relacionados devem ficar agrupados visualmente; hierarquia tipográfica consistente sinaliza importância; figura-fundo nítida garante leitura em menos de 2 segundos.",
      "Espaço Negativo Ativo (Whitespace) e Grid Editorial: respiro generoso não é vazio desperdiçado — ele isola a mensagem principal, reduz fadiga cognitiva e transmite acabamento profissional.",
    ],
    applicationRules: [
      "Regra de 1 ideia por bloco/slide: títulos curtos (até 8 palavras) com front-loading e corpo conciso que nunca repete o título.",
      "Em carrosséis e criativos, garantir progressão visual contínua (Gestalt Continuidade) e respiro suficiente para leitura confortável em tela de celular.",
    ],
    sources: [
      { name: "Nielsen Norman Group (NN/g)", focus: "Visual Hierarchy, F-Pattern, Layer-Cake Scanning & Front-Loading" },
      { name: "Teoria da Gestalt & Estilo Tipográfico Internacional", focus: "Proximity, Similarity, Continuity, Figure-Ground & Editorial Grids" },
    ],
  },

  publico_consumo: {
    id: "publico_consumo",
    title: "Estudo de Público-Alvo, Comportamento de Consumo e Jobs-to-be-Done",
    corePrinciples: [
      "Jobs-to-be-Done (JTBD): clientes não compram apenas características — eles 'contratam' um produto/serviço para realizar um progresso funcional (resolver uma tarefa), emocional (sentir alívio/segurança) e social (como são percebidos).",
      "Calibragem B2B vs. B2C: decisões B2B pesam risco operacional, previsibilidade, clareza de processo, autoridade técnica e retorno mensurável; decisões B2C pesam benefício imediato, identificação, praticidade e prova social acessível.",
      "Voz do Cliente (VoC): usar o vocabulário real com que o ICP descreve suas dores e objeções gera identificação instantânea e reduz ceticismo.",
    ],
    applicationRules: [
      "Nomear explicitamente o contexto de uso, a objeção silenciosa e o ganho prático que importam para o ICP informado.",
      "Nunca falar para 'todo mundo': quanto mais específica a cena do cliente ideal, maior a taxa de retenção e resposta.",
    ],
    sources: [
      { name: "Jobs-to-be-Done (Clayton Christensen / Bob Moesta)", focus: "Functional, Emotional & Social Buying Progress" },
      { name: "CXL Institute", focus: "Voice of Customer (VoC) & B2B/B2C Buyer Psychology" },
    ],
  },

  linguagem_persuasao: {
    id: "linguagem_persuasao",
    title: "Linguagem Persuasiva, Psicologia da Influência e Copywriting de Conversão",
    corePrinciples: [
      "7 Princípios da Persuasão (Robert Cialdini): Reciprocidade (entregar valor útil antes de pedir), Compromisso/Coerência (micro-acordos lógicos), Prova Social (evidência real de pares), Autoridade (critério técnico verificável), Afinidade (empatia e linguagem humana), Escassez (somente real — agenda/estoque verídicos, nunca fabricada) e Unidade (pertencimento compartilhado).",
      "Conversion Copywriting (CXL): clareza vence criatividade obscura; especificidade concreta vence adjetivos genéricos; mostrar consequência prática vence prometer milagre.",
      "Ritmo oral e legibilidade em PT-BR: frases curtas alternadas com médias, voz ativa, verbos precisos e zero clichês de IA.",
    ],
    applicationRules: [
      "Aplicar no máximo 2 gatilhos de Cialdini por peça de forma ética e natural, sempre respeitando CONAR/LGPD (proibido inventar escassez, números ou depoimentos).",
      "Substituir qualquer adjetivo vago ('inovador', 'incrível', 'completo') por evidência concreta ou passo acionável.",
    ],
    sources: [
      { name: "Robert B. Cialdini (Influence / Pre-Suasion)", focus: "7 Principles of Ethical Persuasion" },
      { name: "CXL Institute", focus: "Conversion Copywriting & Clarity-First Messaging" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Analisadores determinísticos para cruzamento pré-geração
// ---------------------------------------------------------------------------

export type ColorMood =
  | "fria_confianca"
  | "quente_energia"
  | "organica_equilibrio"
  | "sofisticada_criativa"
  | "neutra_editorial";

export interface ColorAnalysis {
  mood: ColorMood;
  primaryHex: string;
  accentHex: string;
  theme: "light" | "dark";
  semanticDirective: string;
  layoutDirective: string;
}

function parseHexToRgb(hex: string | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const cleaned = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;

  return { h, s, l };
}

export function analyzeBrandColorPalette(tokens?: VisualTokens): ColorAnalysis {
  const primaryHex = tokens?.primary ?? "#181331";
  const accentHex = tokens?.accent ?? "#2563EB";
  const theme = tokens?.theme === "dark" ? "dark" : "light";

  const rgb = parseHexToRgb(primaryHex) ?? parseHexToRgb(accentHex);
  if (!rgb) {
    return {
      mood: "neutra_editorial",
      primaryHex,
      accentHex,
      theme,
      semanticDirective:
        "Paleta neutra/editorial: transmita clareza, sofisticação e foco absoluto na utilidade da mensagem.",
      layoutDirective:
        "Regra 60-30-10 com fundo limpo, alto contraste tipográfico (>= 4.5:1) e acento contido apenas no CTA ou destaque principal.",
    };
  }

  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  if (s < 0.14 || l < 0.12 || l > 0.9) {
    return {
      mood: "neutra_editorial",
      primaryHex,
      accentHex,
      theme,
      semanticDirective:
        `Paleta de base neutra/escura (${primaryHex}) com acento (${accentHex}): comunica sobriedade, critério técnico e posicionamento editorial premium.`,
      layoutDirective:
        "Explore espaço negativo generoso, contraste tipográfico forte e reserve a cor de acento exclusivamente para números-chave, barra de progresso e CTA.",
    };
  }

  if ((h >= 0 && h < 50) || h >= 335) {
    return {
      mood: "quente_energia",
      primaryHex,
      accentHex,
      theme,
      semanticDirective:
        `Paleta quente (${primaryHex}): ativa atenção imediata, vitalidade e senso de movimento — combine com verbos diretos e benefícios tangíveis sem soar apelativo.`,
      layoutDirective:
        "Equilibre o peso da cor quente com 60% de superfície neutra limpa para evitar fadiga visual e manter leitura instantânea.",
    };
  }

  if (h >= 50 && h < 165) {
    return {
      mood: "organica_equilibrio",
      primaryHex,
      accentHex,
      theme,
      semanticDirective:
        `Paleta orgânica/verde (${primaryHex}): evoca equilíbrio, progresso sustentável, saúde ou crescimento — sustente com tom transparente, didático e confiável.`,
      layoutDirective:
        "Use alinhamento limpo e respiro editorial que reforçam calma e clareza; destaque métricas ou passos práticos com contraste nítido.",
    };
  }

  if (h >= 165 && h < 255) {
    return {
      mood: "fria_confianca",
      primaryHex,
      accentHex,
      theme,
      semanticDirective:
        `Paleta fria/azul (${primaryHex}): comunica segurança, método, confiança e precisão profissional — sustente com argumentos estruturados e zero exagero.`,
      layoutDirective:
        "Aplique hierarquia tipográfica nítida (Layer-Cake / Grid) e alto contraste figura-fundo para reforçar fluência de processamento.",
    };
  }

  return {
    mood: "sofisticada_criativa",
    primaryHex,
    accentHex,
    theme,
    semanticDirective:
      `Paleta criativa/violeta (${primaryHex}): comunica originalidade, visão contemporânea e diferenciação — combine com ângulos perspicazes e vocabulário autoral.`,
    layoutDirective:
      "Mantenha composição editorial limpa com contraste elevado e um único ponto focal por quadro para não competir com a personalidade cromática.",
  };
}

export type AudienceSegment = "b2b" | "b2c" | "hibrido";
export type SchwartzStage =
  | "inconsciente"
  | "consciente_do_problema"
  | "consciente_da_solucao"
  | "consciente_do_produto";

export interface AudienceAndAwarenessAnalysis {
  segment: AudienceSegment;
  awarenessStage: SchwartzStage;
  consumerDirective: string;
  awarenessDirective: string;
  persuasionTriggers: string[];
}

const B2B_PATTERN =
  /\b(b2b|empresas?|empres[aá]ri|gestor|diretor|ceo|cfo|cto|ag[eê]ncia|consultoria|escrit[oó]rio|cl[ií]nicas?|franquia|saas|ind[uú]stria|comercial|vendas b2b|rh|ti|equipe|time|neg[oó]cio|faturamento|margem|operação|operacao|pme|pmes|aut[oô]nomo|prestador)\b/i;
const B2C_PATTERN =
  /\b(b2c|consumidor|fam[ií]lia|m[aã]es?|pais|jovens|mulheres|homens|pacientes?|alunos?|moradores?|clientes finais|casa|pele|cabelo|fitness|sa[uú]de|beleza|moda|gastronomia|pet|viagem|im[oó]vel|bem-estar)\b/i;

export function classifyAudienceAndAwareness(input: {
  icpDescription?: string | null;
  objective: string;
  assetType: AssetType;
  angleType: AngleType;
}): AudienceAndAwarenessAnalysis {
  const icpText = `${input.icpDescription ?? ""} ${input.objective}`.toLowerCase();
  const hasB2B = B2B_PATTERN.test(icpText);
  const hasB2C = B2C_PATTERN.test(icpText);

  const segment: AudienceSegment = hasB2B && !hasB2C ? "b2b" : hasB2C && !hasB2B ? "b2c" : "hibrido";

  // Estágio de consciência de Eugene Schwartz derivado do formato + ângulo + objetivo
  let awarenessStage: SchwartzStage;
  if (input.assetType === "lp_copy" || /\b(compr|fech|or[çc]amento|agend|contrat|convers[aã]o|venda direta)\b/i.test(input.objective)) {
    awarenessStage = "consciente_do_produto";
  } else if (input.assetType === "geo_article" || input.angleType === "outcome_anchored") {
    awarenessStage = "consciente_da_solucao";
  } else if (input.angleType === "vace_pattern_interrupt") {
    awarenessStage = "inconsciente";
  } else {
    awarenessStage = "consciente_do_problema";
  }

  const consumerDirective =
    segment === "b2b"
      ? "Perfil B2B: priorize clareza operacional, redução de risco/desperdício, previsibilidade de processo e critérios objetivos de decisão (JTBD funcional + autoridade técnica)."
      : segment === "b2c"
        ? "Perfil B2C: priorize identificação imediata no cotidiano, alívio concreto de uma dor/desejo, simplicidade de uso e linguagem próxima (JTBD emocional + social)."
        : "Perfil híbrido: equilibre utilidade prática verificável (como funciona e qual problema resolve) com linguagem humana, próxima e livre de jargão corporativo vazio.";

  const awarenessDirectives: Record<SchwartzStage, string> = {
    inconsciente:
      "Schwartz Nível 1 (Inconsciente): NÃO comece vendendo produto. Abra com quebra de padrão, sintoma cotidiano reconhecível ou contraste surpreendente para despertar atenção.",
    consciente_do_problema:
      "Schwartz Nível 2 (Consciente do Problema): nomeie a dor exata com o vocabulário do ICP, mostre o custo oculto de ignorá-la e apresente o caminho prático de correção.",
    consciente_da_solucao:
      "Schwartz Nível 3 (Consciente da Solução): compare critérios de decisão, explique o mecanismo concreto que faz esta abordagem funcionar melhor e construa autoridade.",
    consciente_do_produto:
      "Schwartz Nível 4 (Consciente do Produto): derrube objeções reais, torne os entregáveis tangíveis, use apenas provas verificáveis do contexto e feche com CTA sem fricção.",
  };

  const persuasionTriggers =
    segment === "b2b"
      ? [
          "Autoridade (Cialdini): demonstre método, critério técnico e domínio do nicho sem arrogância.",
          "Reciprocidade (Cialdini): entregue um insight ou checklist aplicável hoje antes do CTA.",
        ]
      : [
          "Afinidade & Unidade (Cialdini): fale na primeira pessoa/conversa direta mostrando que entende a rotina real do público.",
          "Reciprocidade & Compromisso (Cialdini): entregue clareza imediata e conduza a um próximo passo simples e de baixo atrito.",
        ];

  return {
    segment,
    awarenessStage,
    consumerDirective,
    awarenessDirective: awarenessDirectives[awarenessStage],
    persuasionTriggers,
  };
}

function designDirectiveForAsset(assetType: AssetType): string {
  switch (assetType) {
    case "typo_carousel":
    case "hybrid_carousel":
      return "Diagramação NN/g + Gestalt (Carrossel): padrão Layer-Cake + Continuidade entre slides; capa com tensão em até 8 palavras (front-loading), 1 ideia central por slide, espaço negativo ativo e zero repetição entre título e corpo.";
    case "single_creative":
      return "Diagramação NN/g + Gestalt (Criativo Único): padrão Z com leitura em menos de 2s; contraste Figura-Fundo elevado, 1 headline forte + 1 subheadline de apoio + 1 CTA isolado por proximidade visual.";
    case "short_script_kit":
      return "Comunicação Audiovisual (Vídeo Curto): gancho falado + texto de tela curto nos 3 primeiros segundos (quebra visual/verbal), ritmo de cortes claros e 1 ideia acionável por beat.";
    case "geo_article":
      return "Diagramação Editorial + GEO (Artigo): padrão F e Layer-Cake; subtítulos descritivos com front-loading, resposta direta (direct_fact) na 1ª frase de cada seção e blocos escaneáveis de alta densidade útil.";
    case "lp_copy":
      return "Arquitetura de Conversão (Landing Page): hierarquia visual progressiva (Hero claro -> Dor real -> Mecanismo/Entregáveis -> Prova verificável -> FAQ de objeções -> CTA único sem ruído).";
  }
}

export interface AdvertisingCrossReferenceInput {
  assetType: AssetType;
  angleType: AngleType;
  framework: Framework;
  objective: string;
  productInput: string;
  brand?: Pick<BrandContext, "brand_name" | "icp_description" | "tone_of_voice" | "visual_tokens">;
}

export interface AdvertisingCrossReference {
  version: string;
  colorAnalysis: ColorAnalysis;
  audienceAnalysis: AudienceAndAwarenessAnalysis;
  designDirective: string;
  marketingDigitalDirective: string;
  persuasionDirective: string;
}

/**
 * Cruza os 6 pilares (Marketing Digital, Cores, Comunicação/Publicidade,
 * Design/Diagramação, Público/Consumo e Linguagem/Persuasão) para o ativo atual.
 */
export function crossReferenceAdvertisingContext(
  input: AdvertisingCrossReferenceInput,
): AdvertisingCrossReference {
  const colorAnalysis = analyzeBrandColorPalette(input.brand?.visual_tokens);
  const audienceAnalysis = classifyAudienceAndAwareness({
    icpDescription: input.brand?.icp_description,
    objective: input.objective,
    assetType: input.assetType,
    angleType: input.angleType,
  });

  const designDirective = designDirectiveForAsset(input.assetType);
  const marketingDigitalDirective =
    input.assetType === "geo_article"
      ? "Marketing Digital & GEO: estruture cada seção com resposta direta citável (E-E-A-T), vocabulário de entidade consistente e utilidade real sem preenchimento vazio."
      : "Marketing Digital & DBA (Ehrenberg-Bass): retenha atenção qualificada nos 3s iniciais / 125 caracteres e reforce os sinais distintivos da marca com conexão clara ao produto no fechamento.";

  const persuasionDirective = [
    ...audienceAnalysis.persuasionTriggers,
    "CXL Clareza > Esperteza: use especificidade concreta, voz ativa em PT-BR e zero escassez/urgência fabricada (conformidade CONAR).",
  ].join(" ");

  return {
    version: MARKETING_LIBRARY_VERSION,
    colorAnalysis,
    audienceAnalysis,
    designDirective,
    marketingDigitalDirective,
    persuasionDirective,
  };
}

/**
 * Serializa a matriz cruzada dos 6 pilares em bloco denso para injeção direta
 * antes da geração do material publicitário.
 */
export function buildAdvertisingSynthesisBlock(input: AdvertisingCrossReferenceInput): string {
  const matrix = crossReferenceAdvertisingContext(input);

  return [
    `## MATRIZ CRUZADA DE REFERÊNCIAS PUBLICITÁRIAS (${matrix.version}) — aplique todos os 6 pilares antes de redigir`,
    `1. Marketing Digital & Posicionamento: ${matrix.marketingDigitalDirective}`,
    `2. Psicologia das Cores & Identidade Visual: ${matrix.colorAnalysis.semanticDirective} ${matrix.colorAnalysis.layoutDirective}`,
    `3. Comunicação Social & Publicidade (${matrix.audienceAnalysis.awarenessStage}): ${matrix.audienceAnalysis.awarenessDirective}`,
    `4. Design & Diagramação Profissional: ${matrix.designDirective}`,
    `5. Público-Alvo & Consumo (${matrix.audienceAnalysis.segment.toUpperCase()}): ${matrix.audienceAnalysis.consumerDirective}`,
    `6. Linguagem & Persuasão Ética: ${matrix.persuasionDirective}`,
  ].join("\n");
}
