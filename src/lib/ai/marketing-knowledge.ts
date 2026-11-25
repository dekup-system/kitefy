import type {
  AbepClass,
  AngleType,
  AssetType,
  BrandContext,
  Framework,
  ToneOfVoice,
  VisualThemeId,
  VisualTokens,
} from "@/types/domain";

/**
 * Biblioteca Científica de Referências Publicitárias & Motor de Cruzamento v2.
 *
 * Reúne os 6 pilares disciplinares com lastro científico verificável:
 *  - Prisma de Kapferer & Personalidade de Aaker (Identidade de Marca)
 *  - ELM (Petty & Cacioppo) + Sistema 1/2 (Kahneman) + 5 Níveis (Eugene Schwartz)
 *  - STEPPS (Jonah Berger) + Usos e Gratificações (Propagação Orgânica)
 *  - NN/g (F/Z/Layer-Cake + 4 Dimensões de Tom de Voz) + Gestalt (Design/Diagramação)
 *  - Jobs-to-be-Done + Critério Brasil (ABEP) + VoC (Público & Consumo Brasileiro)
 *  - 7 Princípios de Cialdini + CXL Conversion Copywriting + Engenharia de Ganchos
 *
 * Executado pelo Agente Orquestrador Estratégico (`strategyOrchestratorNode`)
 * antes da chamada de LLM — custo extra de API = US$ 0,00.
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

export const MARKETING_LIBRARY_VERSION = "advertising-library-v2";

export const MARKETING_REFERENCE_LIBRARY: Record<KnowledgePillarId, KnowledgeReference> = {
  marketing_digital: {
    id: "marketing_digital",
    title: "Marketing Digital, Disponibilidade Mental, STEPPS e E-E-A-T / GEO",
    corePrinciples: [
      "Disponibilidade Mental e Distinctive Brand Assets (Ehrenberg-Bass / Byron Sharp & Jenni Romaniuk): marcas crescem sendo fáceis de lembrar e reconhecer no momento de compra, reforçando ativos distintivos (paleta, assinatura visual, vocabulário próprio).",
      "Propagação Orgânica STEPPS (Jonah Berger — Contagious): peças compartilháveis ativam Moeda Social, Gatilhos de rotina, Emoção de Alta Excitação (admiração, indignação construtiva, surpresa), Valor Prático salvável ou Histórias com a marca embutida.",
      "E-E-A-T e GEO (Google Search Central): conteúdo citável por buscas e IAs (AI Overviews, ChatGPT, Perplexity) responde dúvidas objetivas logo na 1ª frase com fatos verificáveis.",
    ],
    applicationRules: [
      "Abertura dos primeiros 3 segundos (ou 125 caracteres da legenda) deve ativar o Sistema 1 e entregar sinal claro de relevância para o ICP.",
      "Incluir ao menos 1 vetor STEPPS explícito (Valor Prático salvável, Moeda Social ou Gatilho cotidiano) alinhado à métrica-alvo do formato.",
      "Em artigos e LPs, responder a dúvida principal na 1ª frase de cada seção com critérios verificáveis.",
    ],
    sources: [
      { name: "Ehrenberg-Bass Institute (Byron Sharp & Jenni Romaniuk)", focus: "How Brands Grow & Distinctive Brand Assets" },
      { name: "Jonah Berger (Contagious)", focus: "STEPPS Organic Propagation Framework" },
      { name: "Google Search Central", focus: "People-First Content & E-E-A-T / GEO" },
    ],
  },

  psicologia_cores: {
    id: "psicologia_cores",
    title: "Psicologia das Cores, Semiótica Visual e Fluência de Processamento",
    corePrinciples: [
      "Fluência de Processamento (Processing Fluency) e Semiótica (Peirce/Barthes): alto contraste figura-fundo e códigos visuais coerentes com o posicionamento elevam a percepção subconsciente de confiança e valor.",
      "Contraste funcional (WCAG AA >= 4.5:1) e Regra 60-30-10: 60% superfície dominante de respiro, 30% cor estrutural da marca e 10% acento exclusivo para foco, dado-chave ou CTA.",
      "Coerência cromática e direção de arte: cores frias reforçam método e confiança; quentes ativam energia e urgência controlada; neutras/escuras elevam sofisticação editorial.",
    ],
    applicationRules: [
      "Alinhar a temperatura emocional do texto com a paleta real da marca e seus códigos semióticos.",
      "Em prompts de imagem e notas de design, proibir estética genérica de IA (neon artificial, rostos plásticos) e manter contraste figura-fundo nítido.",
    ],
    sources: [
      { name: "Ehrenberg-Bass Institute", focus: "Color as a Distinctive Brand Asset & Category Cues" },
      { name: "Semiótica Aplicada (Peirce / Barthes) & W3C WCAG 2.1", focus: "Visual Codes & Contrast Readability" },
    ],
  },

  comunicacao_publicidade: {
    id: "comunicacao_publicidade",
    title: "Comunicação Social, Prisma de Kapferer, ELM e Níveis de Consciência",
    corePrinciples: [
      "5 Níveis de Consciência e Sofisticação de Mercado (Eugene Schwartz — Breakthrough Advertising): canalizar o desejo existente respeitando o estágio exato do leitor; em mercados saturados, destacar o Mecanismo Único em vez de promessas infladas.",
      "Modelo de Probabilidade de Elaboração — ELM (Petty & Cacioppo): usar Rota Central (lógica, método, evidência) para alta consciência/ticket alto e Rota Periférica (contraste, emoção, identificação rápida) para topo de funil.",
      "Prisma de Identidade de Marca (Jean-Noël Kapferer): manter coerência entre Cultura, Personalidade, Relação com o cliente e Autoimagem projetada.",
    ],
    applicationRules: [
      "Nunca vender produto de cara para público Inconsciente ou Consciente do Problema — comece pelo sintoma, tensão real ou tese contrária.",
      "Conectar o desenvolvimento ao Mecanismo Único (UVP) e à Tese Contrária da marca quando cadastrados.",
    ],
    sources: [
      { name: "Eugene M. Schwartz (Breakthrough Advertising)", focus: "5 Levels of Market Awareness & Sophistication" },
      { name: "Petty & Cacioppo (ELM) + Jean-Noël Kapferer", focus: "Elaboration Likelihood Model & Brand Identity Prism" },
    ],
  },

  design_diagramacao: {
    id: "design_diagramacao",
    title: "Design Profissional, Diagramação Editorial, Hierarquia Visual e Gestalt",
    corePrinciples: [
      "Padrões de Leitura Digital (Nielsen Norman Group): padrão F (artigos), Layer-Cake (carrosséis/seções) e padrão Z (anúncios/criativos únicos) com front-loading das palavras fortes.",
      "Princípios da Gestalt (Proximidade, Semelhança, Continuidade, Fechamento e Figura-Fundo): agrupamento claro e leitura em menos de 2 segundos.",
      "Espaço Negativo Ativo (Whitespace) e Grid Editorial: respiro generoso isola a mensagem principal e evita aparência amadora.",
    ],
    applicationRules: [
      "Regra de 1 ideia central por slide/bloco: títulos de até 8 palavras com front-loading e corpo conciso sem repetir o título.",
      "Garantir variedade visual entre campanhas alternando composições editoriais sem perder os ativos distintivos da marca.",
    ],
    sources: [
      { name: "Nielsen Norman Group (NN/g)", focus: "Visual Hierarchy, F-Pattern, Layer-Cake & Front-Loading" },
      { name: "Teoria da Gestalt & Estilo Tipográfico Internacional", focus: "Proximity, Continuity, Figure-Ground & Grids" },
    ],
  },

  publico_consumo: {
    id: "publico_consumo",
    title: "Público-Alvo, Jobs-to-be-Done, Critério Brasil (ABEP) e Voz do Cliente",
    corePrinciples: [
      "Jobs-to-be-Done (Clayton Christensen / Bob Moesta): conectar a oferta ao progresso Funcional (tarefa), Emocional (alívio/segurança) e Social (percepção pelos pares).",
      "Critério Brasil (ABEP — Classes A, B1, B2, C1, C2, D-E): calibrar argumentos de valor, percepção de preço e vocabulário econômico à realidade brasileira.",
      "Voz do Cliente (VoC) & Usos e Gratificações: usar a linguagem exata com que o cliente descreve suas dores e responder à gratificação buscada (utilidade prática, identidade ou pertencimento).",
    ],
    applicationRules: [
      "Nomear explicitamente o contexto de uso, a objeção silenciosa e o ganho concreto do ICP informado.",
      "Adaptar o argumento de valor ao poder de compra (ABEP) e ao ciclo de decisão (B2B racional vs. B2C emocional).",
    ],
    sources: [
      { name: "Jobs-to-be-Done (Christensen / Moesta) & ABEP", focus: "Functional/Emotional Jobs & Critério Brasil" },
      { name: "CXL Institute & Katz/Blumler", focus: "Voice of Customer & Uses and Gratifications" },
    ],
  },

  linguagem_persuasao: {
    id: "linguagem_persuasao",
    title: "Linguagem Persuasiva, Sistema 1/2 (Kahneman), Cialdini e Engenharia de Ganchos",
    corePrinciples: [
      "Sistema 1 vs. Sistema 2 (Daniel Kahneman): o gancho aciona o Sistema 1 (rápido, aversão à perda, contraste, Efeito Zeigarnik); o corpo entrega razão clara para o Sistema 2 justificar a ação.",
      "7 Princípios de Cialdini + 4 Dimensões de Tom de Voz (NN/g): persuasão ética sem escassez fabricada, calibrada por sliders objetivos (Formalidade, Humor, Irreverência, Entusiasmo).",
      "Tríade de Gancho Sincronizada (vídeos curtos): alinhar Gancho Visual (cena nos 2s) + Gancho Textual na Tela (5–7 palavras) + Gancho Falado (1ª frase).",
    ],
    applicationRules: [
      "Aplicar no máximo 2 gatilhos éticos de Cialdini por peça, sempre em conformidade com CONAR/LGPD.",
      "Eliminar 100% de clichês de IA ('no mundo atual', 'alavanque', 'desvende', 'mergulhe fundo') e usar voz ativa natural em PT-BR.",
    ],
    sources: [
      { name: "Daniel Kahneman (Thinking, Fast and Slow) & Robert Cialdini", focus: "System 1/2, Loss Aversion & 7 Principles" },
      { name: "Nielsen Norman Group (NN/g) & CXL Institute", focus: "4 Dimensions of Tone of Voice & Conversion Copywriting" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tabela Critério Brasil (ABEP) — Calibragem Econômica Brasileira
// ---------------------------------------------------------------------------

export const ABEP_PROFILES: Record<AbepClass, { label: string; valueFraming: string }> = {
  A: {
    label: "Classe A (Alta Renda)",
    valueFraming:
      "Priorize exclusividade, economia de tempo, critério técnico superior, curadoria e atendimento personalizado; nunca apele para desconto barato.",
  },
  B1: {
    label: "Classe B1 (Média-Alta)",
    valueFraming:
      "Equilibre sofisticação prática, previsibilidade de entrega, segurança na decisão e retorno claro do investimento.",
  },
  B2: {
    label: "Classe B2 (Média Consolidada)",
    valueFraming:
      "Enfatize custo-benefício inteligente, durabilidade, transparência de processo e redução de erros que custam caro.",
  },
  C1: {
    label: "Classe C1 (Média Emergente)",
    valueFraming:
      "Priorize clareza direta, resultado prático no dia a dia, facilidade de acesso, condições transparentes e zero elitismo.",
  },
  C2: {
    label: "Classe C2 (Popular Consolidada)",
    valueFraming:
      "Foque em utilidade imediata, economia real no orçamento, linguagem super acessível e confiança próxima.",
  },
  DE: {
    label: "Classes D-E (Base Econômica)",
    valueFraming:
      "Comunicação direta, acolhedora, sem termos estrangeiros, focada em solução essencial acessível e passo a passo simples.",
  },
  misto: {
    label: "Público Amplo / Misto",
    valueFraming:
      "Linguagem clara e acessível que demonstra valor concreto antes de falar de preço, sem jargões técnicos desnecessários.",
  },
};

// ---------------------------------------------------------------------------
// Analisadores determinísticos (Cor, Público/Schwartz/ELM, STEPPS, ToV NN/g)
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
export type ElmRoute = "rota_central" | "rota_periferica";

export interface AudienceAndAwarenessAnalysis {
  segment: AudienceSegment;
  awarenessStage: SchwartzStage;
  elmRoute: ElmRoute;
  abepClass: AbepClass;
  consumerDirective: string;
  awarenessDirective: string;
  elmDirective: string;
  persuasionTriggers: string[];
}

const B2B_PATTERN =
  /\b(b2b|empresas?|empres[aá]ri|gestor|diretor|ceo|cfo|cto|ag[eê]ncia|consultoria|escrit[oó]rio|cl[ií]nicas?|franquia|saas|ind[uú]stria|comercial|vendas b2b|rh|ti|equipe|time|neg[oó]cio|faturamento|margem|opera[çc][aã]o|pme|pmes|aut[oô]nomo|prestador)\b/i;
const B2C_PATTERN =
  /\b(b2c|consumidor|fam[ií]lia|m[aã]es?|pais|jovens|mulheres|homens|pacientes?|alunos?|moradores?|clientes finais|casa|pele|cabelo|fitness|sa[uú]de|beleza|moda|gastronomia|pet|viagem|im[oó]vel|bem-estar)\b/i;

export function classifyAudienceAndAwareness(input: {
  icpDescription?: string | null;
  objective: string;
  assetType: AssetType;
  angleType: AngleType;
  abepClass?: AbepClass;
}): AudienceAndAwarenessAnalysis {
  const icpText = `${input.icpDescription ?? ""} ${input.objective}`.toLowerCase();
  const hasB2B = B2B_PATTERN.test(icpText);
  const hasB2C = B2C_PATTERN.test(icpText);

  const segment: AudienceSegment = hasB2B && !hasB2C ? "b2b" : hasB2C && !hasB2B ? "b2c" : "hibrido";
  const abepClass: AbepClass = input.abepClass ?? "misto";

  let awarenessStage: SchwartzStage;
  if (
    input.assetType === "lp_copy" ||
    /\b(compr|fech|or[çc]amento|agend|contrat|convers[aã]o|venda direta)\b/i.test(input.objective)
  ) {
    awarenessStage = "consciente_do_produto";
  } else if (input.assetType === "geo_article" || input.angleType === "outcome_anchored") {
    awarenessStage = "consciente_da_solucao";
  } else if (input.angleType === "vace_pattern_interrupt") {
    awarenessStage = "inconsciente";
  } else {
    awarenessStage = "consciente_do_problema";
  }

  // ELM (Petty & Cacioppo): Rota Central para alta consciência / B2B / artigo / LP; Periférica para descoberta
  const elmRoute: ElmRoute =
    awarenessStage === "consciente_da_solucao" ||
    awarenessStage === "consciente_do_produto" ||
    input.assetType === "geo_article" ||
    input.assetType === "lp_copy" ||
    segment === "b2b"
      ? "rota_central"
      : "rota_periferica";

  const elmDirective =
    elmRoute === "rota_central"
      ? "ELM Rota Central (Petty & Cacioppo): conduza pela lógica, critérios objetivos de comparação, mecanismo concreto e evidências verificáveis (Sistema 1 no gancho -> Sistema 2 no argumento)."
      : "ELM Rota Periférica (Petty & Cacioppo): priorize impacto imediato no Sistema 1, cena cotidiana altamente reconhecível, fluência visual e identificação emocional rápida.";

  const abepNote = ABEP_PROFILES[abepClass];
  const consumerDirective =
    (segment === "b2b"
      ? "Perfil B2B: priorize clareza operacional, redução de risco/desperdício, previsibilidade e critérios objetivos (JTBD funcional + autoridade técnica)."
      : segment === "b2c"
        ? "Perfil B2C: priorize identificação imediata no cotidiano, alívio concreto de dor/desejo e simplicidade de uso (JTBD emocional + social)."
        : "Perfil híbrido: equilibre utilidade prática verificável com linguagem humana livre de jargão corporativo vazio.") +
    ` Critério Brasil (${abepNote.label}): ${abepNote.valueFraming}`;

  const awarenessDirectives: Record<SchwartzStage, string> = {
    inconsciente:
      "Schwartz Nível 1 (Inconsciente): NÃO comece vendendo produto. Abra com quebra de padrão, sintoma cotidiano ou contraste surpreendente.",
    consciente_do_problema:
      "Schwartz Nível 2 (Consciente do Problema): nomeie a dor exata com o vocabulário real do ICP, mostre o custo oculto e apresente o caminho prático.",
    consciente_da_solucao:
      "Schwartz Nível 3 (Consciente da Solução): compare critérios de decisão e explique o Mecanismo Único que faz esta abordagem funcionar melhor.",
    consciente_do_produto:
      "Schwartz Nível 4 (Consciente do Produto): derrube objeções reais, torne os entregáveis tangíveis, use apenas provas verificáveis e feche com CTA sem fricção.",
  };

  const persuasionTriggers =
    segment === "b2b"
      ? [
          "Autoridade (Cialdini): demonstre método e critério técnico sem arrogância.",
          "Reciprocidade (Cialdini): entregue um insight ou checklist aplicável hoje antes do CTA.",
        ]
      : [
          "Afinidade & Unidade (Cialdini): converse de forma próxima mostrando domínio da rotina real do público.",
          "Reciprocidade & Compromisso (Cialdini): entregue clareza imediata e proponha um próximo passo de baixo atrito.",
        ];

  return {
    segment,
    awarenessStage,
    elmRoute,
    abepClass,
    consumerDirective,
    awarenessDirective: awarenessDirectives[awarenessStage],
    elmDirective,
    persuasionTriggers,
  };
}

function cognitiveHookDirective(angleType: AngleType, assetType: AssetType): string {
  const byAngle: Record<AngleType, string> = {
    vace_pattern_interrupt:
      "Mecanismo de Gancho: Efeito Zeigarnik (Open Loop) + Quebra de Padrão — abra uma lacuna de curiosidade específica que o leitor sente urgência em fechar.",
    contrarian_frame:
      "Mecanismo de Gancho: Tese Contrária — confronte um conselho popular do nicho com evidência prática clara.",
    outcome_anchored:
      "Mecanismo de Gancho: Prova/Resultado Concreto + Especificidade Hiper-Direcionada — filtre o ICP ideal logo na primeira frase mostrando o ganho tangível.",
    negative_constraint:
      "Mecanismo de Gancho: Aversão à Perda (Kahneman) — perdas doem 2× mais que ganhos equivalentes; aponte o erro silencioso que faz o público perder tempo ou dinheiro.",
  };

  const triad =
    assetType === "short_script_kit"
      ? " Tríade de Gancho Sincronizada obrigatória nos 2s iniciais: (1) Gancho Visual na direção de cena, (2) Gancho Textual na Tela (5–7 palavras) e (3) Gancho Falado."
      : "";

  return `${byAngle[angleType]}${triad}`;
}

function steppsDirective(assetType: AssetType, recentAssetCount = 0): string {
  const rotation = recentAssetCount % 3;
  if (assetType === "typo_carousel" || assetType === "hybrid_carousel") {
    return rotation === 0
      ? "STEPPS (Jonah Berger): Valor Prático (checklist salvável) + Moeda Social (insight que faz quem compartilha parecer bem-informado)."
      : rotation === 1
        ? "STEPPS (Jonah Berger): Emoção de Alta Excitação (indignação construtiva com mito do setor) + Valor Prático acionável."
        : "STEPPS (Jonah Berger): Histórias (cena real do cotidiano do cliente com a marca integrada) + Gatilhos de rotina.";
  }
  if (assetType === "short_script_kit") {
    return "STEPPS (Jonah Berger): Gatilhos cotidianos + Emoção de Alta Excitação (surpresa/admiração) para maximizar retenção 3s e compartilhamentos.";
  }
  if (assetType === "geo_article") {
    return "STEPPS + GEO: Valor Prático de referência (guia citável) + Moeda Social (critérios claros que profissionais citam e enviam a colegas).";
  }
  return "STEPPS (Jonah Berger): Valor Prático imediato + Clareza de decisão para gerar cliques e mensagens qualificadas.";
}

export function buildToneVectorDirective(tone?: ToneOfVoice): string {
  if (!tone) return "";
  const parts: string[] = [];

  if (typeof tone.formality === "number") {
    parts.push(`Formalidade ${tone.formality}/10 (${tone.formality <= 4 ? "formal/técnico" : tone.formality >= 7 ? "casual/conversacional" : "equilibrado"})`);
  }
  if (typeof tone.humor === "number") {
    parts.push(`Humor ${tone.humor}/10 (${tone.humor <= 3 ? "sério/objetivo" : tone.humor >= 7 ? "leve e bem-humorado" : "pontual"})`);
  }
  if (typeof tone.irreverence === "number") {
    parts.push(`Irreverência ${tone.irreverence}/10 (${tone.irreverence <= 3 ? "diplomático/respeitoso" : tone.irreverence >= 7 ? "provocador/firme" : "assertivo"})`);
  }
  if (typeof tone.enthusiasm === "number") {
    parts.push(`Entusiasmo ${tone.enthusiasm}/10 (${tone.enthusiasm <= 3 ? "sóbrio/pragmático" : tone.enthusiasm >= 7 ? "vibrante/energético" : "confiante"})`);
  }

  const dna: string[] = [];
  if (tone.uvp?.trim()) dna.push(`Proposta Única de Valor / Mecanismo Único: ${tone.uvp.trim()}`);
  if (tone.contrarian_thesis?.trim()) dna.push(`Tese Contrária / Inimigo Comum: ${tone.contrarian_thesis.trim()}`);
  if (tone.objections && tone.objections.length > 0) {
    dna.push(`Objeções reais a derrubar: ${tone.objections.slice(0, 4).join("; ")}`);
  }
  if (tone.jtbd_functional?.trim() || tone.jtbd_emotional?.trim()) {
    dna.push(
      `Jobs-to-be-Done: ${[
        tone.jtbd_functional?.trim() ? `Funcional: ${tone.jtbd_functional.trim()}` : "",
        tone.jtbd_emotional?.trim() ? `Emocional: ${tone.jtbd_emotional.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" | ")}`,
    );
  }
  if (tone.audience_study) {
    const study = tone.audience_study;
    const primaryPersona = study.personas[0];
    dna.push(
      `Demografia IBGE (${study.ibge.regionLabel}): renda per capita R$ ${study.ibge.perCapitaIncomeBrl}/mês, classes ${study.ibge.dominantAbepClasses.join("/")}; consumo: ${study.consumptionAnalysis.priceSensitivity}`,
    );
    if (primaryPersona) {
      dna.push(
        `Persona ativa (${primaryPersona.name}, ${primaryPersona.ageRange}, ABEP ${primaryPersona.abepClass}): dor/fricção "${primaryPersona.triedAndFailed}"; gatilho "${primaryPersona.buyingTrigger}"; VoC literal: ${primaryPersona.vocPhrases.slice(0, 2).map((p) => `"${p}"`).join(" / ")}`,
      );
    }
  }

  return [
    parts.length > 0 ? `Vetor de Tom de Voz (NN/g): ${parts.join(" · ")}.` : "",
    dna.length > 0 ? dna.join(" | ") : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const VISUAL_THEMES: readonly VisualThemeId[] = [
  "editorial_classic",
  "magazine_split",
  "dark_impact",
  "swiss_minimal",
];

/**
 * Seleciona o estilo visual de forma determinística e variada, evitando que
 * carrosséis consecutivos da mesma marca saiam sempre com o mesmo molde.
 */
export function selectVisualTheme(input: {
  preference?: "auto" | VisualThemeId;
  seed?: string;
  recentCount?: number;
}): VisualThemeId {
  if (input.preference && input.preference !== "auto" && VISUAL_THEMES.includes(input.preference)) {
    return input.preference;
  }
  const seedStr = `${input.seed ?? ""}-${input.recentCount ?? 0}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i += 1) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  return VISUAL_THEMES[hash % VISUAL_THEMES.length] ?? "editorial_classic";
}

function designDirectiveForAsset(assetType: AssetType, visualTheme: VisualThemeId): string {
  const themeLabel: Record<VisualThemeId, string> = {
    editorial_classic: "Editorial Clássico (capa escura + cards elevados)",
    magazine_split: "Magazine Split (faixa lateral de impacto + numeração editorial gigante)",
    dark_impact: "Dark Impacto (alto contraste escuro + acento luminoso)",
    swiss_minimal: "Minimalista Suíço (grid preciso + linhas editoriais + respiro amplo)",
  };

  switch (assetType) {
    case "typo_carousel":
    case "hybrid_carousel":
      return `Diagramação NN/g + Gestalt (Carrossel · Estilo ${themeLabel[visualTheme]}): padrão Layer-Cake + Continuidade entre slides; capa com tensão em até 8 palavras (front-loading), 1 ideia central por slide, espaço negativo ativo e zero repetição entre título e corpo.`;
    case "single_creative":
      return `Diagramação NN/g + Gestalt (Criativo Único · Estilo ${themeLabel[visualTheme]}): padrão Z com leitura em menos de 2s; contraste Figura-Fundo elevado, 1 headline forte + 1 subheadline de apoio + 1 CTA isolado por proximidade visual.`;
    case "short_script_kit":
      return "Comunicação Audiovisual (Vídeo Curto): Tríade de Gancho Sincronizada nos 2s iniciais (cena + texto curto na tela + fala), ritmo oral natural em PT-BR e 1 ideia acionável por beat.";
    case "geo_article":
      return "Diagramação Editorial + GEO (Artigo): padrão F e Layer-Cake; subtítulos descritivos com front-loading, resposta direta (direct_fact) na 1ª frase de cada seção e blocos escaneáveis de alta densidade útil.";
    case "lp_copy":
      return "Arquitetura de Conversão (Landing Page): hierarquia visual progressiva (Hero com UVP -> Dor real -> Mecanismo Único -> Prova verificável -> FAQ de objeções -> CTA único sem ruído).";
  }
}

export interface AdvertisingCrossReferenceInput {
  assetType: AssetType;
  angleType: AngleType;
  framework: Framework;
  objective: string;
  productInput: string;
  brand?: Pick<BrandContext, "brand_name" | "icp_description" | "tone_of_voice" | "visual_tokens">;
  recentAssetCount?: number;
  seed?: string;
}

export interface AdvertisingCrossReference {
  version: string;
  visualTheme: VisualThemeId;
  colorAnalysis: ColorAnalysis;
  audienceAnalysis: AudienceAndAwarenessAnalysis;
  designDirective: string;
  marketingDigitalDirective: string;
  persuasionDirective: string;
  brandDnaDirective: string;
}

/**
 * Motor de Cruzamento Científico (Orquestração Pré-Geração):
 * Peça = Pilar × Persona(JTBD/ABEP) × DNA da Marca(Kapferer) × ToV(NN/g) × Gancho Cognitivo + Formato
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
    abepClass: input.brand?.tone_of_voice?.abep_class,
  });

  const visualTheme = selectVisualTheme({
    preference: input.brand?.tone_of_voice?.visual_style_preference,
    seed: input.seed ?? `${input.objective}:${input.productInput}`,
    recentCount: input.recentAssetCount,
  });

  const designDirective = designDirectiveForAsset(input.assetType, visualTheme);
  const stepps = steppsDirective(input.assetType, input.recentAssetCount);
  const marketingDigitalDirective =
    input.assetType === "geo_article"
      ? `Marketing Digital & GEO: estruture cada seção com resposta direta citável (E-E-A-T), vocabulário de entidade consistente e utilidade real. ${stepps}`
      : `Marketing Digital & DBA (Ehrenberg-Bass): retenha atenção qualificada nos 3s iniciais / 125 caracteres e reforce os ativos distintivos da marca. ${stepps}`;

  const hookDirective = cognitiveHookDirective(input.angleType, input.assetType);
  const persuasionDirective = [
    hookDirective,
    ...audienceAnalysis.persuasionTriggers,
    "CXL Clareza > Esperteza: use especificidade concreta, voz ativa em PT-BR e zero escassez/urgência fabricada (conformidade CONAR).",
  ].join(" ");

  const brandDnaDirective = buildToneVectorDirective(input.brand?.tone_of_voice);

  return {
    version: MARKETING_LIBRARY_VERSION,
    visualTheme,
    colorAnalysis,
    audienceAnalysis,
    designDirective,
    marketingDigitalDirective,
    persuasionDirective,
    brandDnaDirective,
  };
}

/**
 * Serializa a matriz científica cruzada dos 6 pilares + Brand DNA em bloco denso
 * para injeção direta pelo Agente Orquestrador antes da geração do material.
 */
export function buildAdvertisingSynthesisBlock(input: AdvertisingCrossReferenceInput): string {
  const matrix = crossReferenceAdvertisingContext(input);

  return [
    `## MATRIZ CIENTÍFICA CRUZADA DE REFERÊNCIAS PUBLICITÁRIAS (${matrix.version}) — aplique todos os vetores antes de redigir`,
    `1. Marketing Digital, DBA & STEPPS: ${matrix.marketingDigitalDirective}`,
    `2. Psicologia das Cores & Semiótica Visual: ${matrix.colorAnalysis.semanticDirective} ${matrix.colorAnalysis.layoutDirective}`,
    `3. Comunicação Social, Schwartz (${matrix.audienceAnalysis.awarenessStage}) & ELM (${matrix.audienceAnalysis.elmRoute}): ${matrix.audienceAnalysis.awarenessDirective} ${matrix.audienceAnalysis.elmDirective}`,
    `4. Design & Diagramação Profissional (Tema ${matrix.visualTheme}): ${matrix.designDirective}`,
    `5. Público-Alvo, JTBD & Critério Brasil (${matrix.audienceAnalysis.segment.toUpperCase()}): ${matrix.audienceAnalysis.consumerDirective}`,
    `6. Linguagem, Sistema 1/2, Cialdini & Ganchos: ${matrix.persuasionDirective}`,
    matrix.brandDnaDirective ? `7. DNA Estratégico & Vetor de Tom de Voz (Kapferer / NN/g): ${matrix.brandDnaDirective}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
