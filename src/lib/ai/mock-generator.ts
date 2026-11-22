import type {
  AngleType,
  AssetType,
  BrandContext,
  Framework,
  SerpInsights,
  ToneOfVoice,
} from "@/types/domain";
import {
  type ContentGenerationOutput,
  type CarouselOutput,
  type GeoArticleOutput,
  type LandingPageCopyOutput,
  type ShortScriptKitOutput,
  type SingleCreativeOutput,
  countWords,
} from "@/lib/ai/content-schemas";
import { slugify } from "@/lib/utils";

/**
 * Gerador determinístico para `LLM_PROVIDER_MODE=mock`.
 *
 * Por que existe: o produto precisa rodar ponta a ponta (onboarding, estúdio,
 * exportação, telemetria, billing) sem chave de LLM — em dev, CI e demo.
 * O texto é composto de bancos de frases em PT-BR com PRNG semeado, então a
 * mesma entrada produz sempre o mesmo ativo (testável e previsível).
 *
 * NUNCA é usado quando LLM_PROVIDER_MODE=live.
 */

export interface MockGenerationInput {
  assetType: AssetType;
  brand: BrandContext;
  objective: string;
  productInput: string;
  selectedArm: { angle_type: AngleType; framework: Framework };
  explorationArms: { angle_type: AngleType; framework: Framework }[];
  serpInsights?: SerpInsights | null;
}

// --- PRNG --------------------------------------------------------------------
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error("Banco de frases vazio.");
  const index = Math.floor(rng() * items.length) % items.length;
  return items[index] as T;
}

function pickMany<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const index = Math.floor(rng() * pool.length) % pool.length;
    const [item] = pool.splice(index, 1);
    if (item !== undefined) out.push(item);
  }
  return out;
}

const PAD_SENTENCES = [
  "Sem enrolação.",
  "Com dado real.",
  "Nesta semana.",
  "Para sua marca.",
  "Sem promessa vazia.",
  "Sem atalho mágico.",
] as const;

/** Garante 8–15 palavras quebrando o texto em frases completas. */
function fitHook(text: string): string {
  const sentences = text
    .trim()
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  let value = "";
  for (const sentence of sentences) {
    const candidate = value.length === 0 ? sentence : `${value} ${sentence}`;
    if (countWords(candidate) <= 15) {
      value = candidate;
      if (countWords(value) >= 8) break;
    } else if (value.length === 0) {
      value = clampWords(sentence, 15);
      break;
    } else {
      break;
    }
  }

  let guard = 0;
  while (countWords(value) < 8 && guard < 6) {
    value = `${value} ${PAD_SENTENCES[guard % PAD_SENTENCES.length]}`.trim();
    guard += 1;
  }

  return clampWords(value, 15);
}

/** Corta em fronteira de frase/palavra para respeitar o máximo. */
function clampWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/g);
  if (words.length <= max) return text.trim();
  return words.slice(0, max).join(" ").replace(/[,;:]$/, "");
}

// --- Bancos de gancho (V.A.C.E.: visual, áudio, contexto, emoção) ------------
const HOOKS: Record<AngleType, readonly string[]> = {
  vace_pattern_interrupt: [
    "Ninguém te contou que o alcance orgânico depende de uma decisão boba. Revise isso hoje. Toda marca séria revisa.",
    "Pare de postar todo dia e comece a postar o que retém atenção. São coisas diferentes. Uma custa energia, a outra constrói autoridade.",
    "Existe um motivo banal para seus vídeos morrerem no segundo três. E não é o algoritmo. É a falta de uma promessa clara.",
    "A primeira frase do seu conteúdo decide se alguém fica ou sai. A maioria começa pelo contexto errado. Você pode inverter isso hoje.",
    "Seu concorrente não é melhor, apenas começa melhor. O gancho dele interrompe o scroll em dois segundos. O seu explica antes de prometer.",
  ],
  contrarian_frame: [
    "Todo mundo diz para aumentar a frequência de posts. Eu digo o contrário: publique menos e prove mais. Frequência sem padrão destrói a marca.",
    "Postar todo dia não é estratégia, é ansiedade com calendário. Marca pequena precisa de repetição com padrão. Não de volume aleatório.",
    "O algoritmo não distribui conteúdo bom, distribui conteúdo claro. Clareza é uma decisão editorial, não um talento. E dá para sistematizar.",
    "Marketing orgânico não é sobre viralizar, é sobre ser citado. Citação é o novo alcance, principalmente dentro das respostas de IA. Isso muda o jogo.",
  ],
  outcome_anchored: [
    "Em quatro semanas, o time de conteúdo de uma marca B2B dobrou a taxa de retenção no terceiro segundo. Sem aumentar o orçamento de mídia. Ajustando só o primeiro frame.",
    "Uma marca de serviços passou a ser citada em três respostas de IA em duas semanas. O que mudou foi a estrutura do artigo. Dados verificáveis no início.",
    "Antes de mudar o formato, a marca tinha duas mil impressões por post e nenhum comentário. Depois do ajuste de gancho, a conversa começou. O padrão importa.",
    "O primeiro ativo de um cliente novo saiu em menos de dois minutos. Não porque a IA é rápida, mas porque o briefing deixou de ser um formulário. O contexto carrega o trabalho.",
  ],
  negative_constraint: [
    "Se você não consegue explicar a promessa do post em uma frase, o público também não. Reescreva antes de gravar. Sempre.",
    "Não use promessa de resultado garantido para vender serviço de saúde ou dinheiro. Além de não converter, cria passivo jurídico real. Evite.",
    "Sem um exemplo concreto, o seu conteúdo é só opinião com fonte bonita. Prova vence adjetivo em qualquer plataforma. Sempre venceu.",
    "Não copie o gancho do concorrente sem entender por que ele funcionou. A cópia herda a forma e perde o motivo. Só a forma não retém.",
  ],
};

const RATIONALES: Record<AngleType, readonly string[]> = {
  vace_pattern_interrupt: [
    "Interrompe o padrão visual do feed com uma afirmação curta e contraintuitiva.",
    "Cria dissonância entre o que o público espera e o que recebe, forçando a pausa.",
    "Usa a primeira frase como quebra de padrão, alinhada ao V.A.C.E.",
  ],
  contrarian_frame: [
    "Contraria o consenso do nicho de forma defensável, atraindo atenção qualificada.",
    "Apresenta o senso comum e o inverte com uma justificativa concreta.",
    "Posiciona a marca como voz dissonante e confiável, não apenas barulhenta.",
  ],
  outcome_anchored: [
    "Ancoragem em resultado observável e prazo, com mecanismo explícito.",
    "Promete um outcome mensurável sem prometer garantia absoluta.",
    "Converte atenção em interesse ao mostrar um antes/depois verificável.",
  ],
  negative_constraint: [
    "Usa restrição negativa (o que não fazer) para gerar autoridade e remover ruído.",
    "Avisa sobre erro custoso, capturando quem já tentou e falhou.",
    "Delimita o que está fora do escopo, aumentando a confiança da promessa.",
  ],
};

const BEATS: Record<Framework, readonly { label: string; direction: string; seconds: number }[]> = {
  hook_body_payoff: [
    { label: "Gancho", direction: "Primeira frase dita de frente para a câmera, sem introdução.", seconds: 4 },
    { label: "Contexto", direction: "Explique por que o problema existe no dia a dia do público.", seconds: 12 },
    { label: "Prova", direction: "Mostre um dado ou exemplo concreto na tela.", seconds: 15 },
    { label: "Payoff", direction: "Entregue a solução em uma frase e chame para o próximo passo.", seconds: 12 },
  ],
  aida: [
    { label: "Atenção", direction: "Abra com a afirmação mais desconfortável do roteiro.", seconds: 5 },
    { label: "Interesse", direction: "Conte o mecanismo por trás do problema em duas frases.", seconds: 14 },
    { label: "Desejo", direction: "Mostre como é a rotina depois da solução.", seconds: 14 },
    { label: "Ação", direction: "Peça uma ação única, específica e de baixo esforço.", seconds: 8 },
  ],
  pas: [
    { label: "Problema", direction: "Nomeie o problema com as palavras que o público usa.", seconds: 8 },
    { label: "Agitação", direction: "Mostre o custo de continuar assim (tempo, dinheiro, energia).", seconds: 14 },
    { label: "Solução", direction: "Apresente a solução e o primeiro passo concreto.", seconds: 16 },
    { label: "Fecho", direction: "Reforce a consequência de não agir hoje.", seconds: 7 },
  ],
  bab: [
    { label: "Antes", direction: "Descreva o estado atual com um detalhe específico.", seconds: 10 },
    { label: "Depois", direction: "Descreva o estado desejado com um resultado observável.", seconds: 12 },
    { label: "Ponte", direction: "Mostre o mecanismo que liga os dois estados.", seconds: 18 },
    { label: "Convite", direction: "Convide para o passo seguinte sem pressão artificial.", seconds: 8 },
  ],
};

const ARTICLE_SENTENCES = {
  direct_fact: [
    "O primeiro parágrafo de um conteúdo orgânico raramente é lido até o fim, por isso a informação mais útil precisa aparecer nas duas primeiras linhas.",
    "Quando a marca organiza a resposta em fato direto, contexto e dado verificável, o leitor entende a proposta sem precisar de interpretação.",
    "A maior parte dos textos de marca falha por adiar a resposta: começa pela história da empresa e só entrega o essencial no final.",
    "Estruturar a informação em blocos curtos reduz a carga cognitiva e aumenta a chance de o leitor salvar o conteúdo para consultar depois.",
    "Um fato direto bem escrito funciona como resumo executivo e permite que motores de busca e assistentes de IA citem o trecho corretamente.",
    "A clareza do primeiro bloco define se o restante do artigo será lido; por isso ele deve responder à pergunta central sem rodeios.",
  ],
  context: [
    "O contexto importa porque nenhuma decisão de conteúdo acontece no vácuo: ela responde a uma rotina, a um orçamento e a um histórico de tentativas anteriores.",
    "Marcas que publicam sem contexto tendem a repetir formatos porque não têm registro do que funcionou e do que apenas consumiu energia do time.",
    "Ao explicar o cenário em que o problema aparece, o texto cria identificação e prepara o leitor para aceitar a solução proposta.",
    "A camada de contexto é onde a voz da marca aparece: escolhas de vocabulário, exemplos do setor e limites do que a empresa realmente resolve.",
    "Sem essa camada, o conteúdo vira uma lista de dicas genéricas que qualquer concorrente poderia assinar sem mudar uma vírgula.",
    "O contexto também protege a marca de promessas amplas demais, já que delimita com precisão quem é o público e qual é o escopo.",
  ],
  verifiable_data: [
    "Dados verificáveis precisam de fonte, data e método; sem esses três elementos, o número é apenas decoração no meio do texto.",
    "Um estudo interno com amostra pequena pode ser útil, desde que o texto deixe claro o tamanho da amostra e o período observado.",
    "Quando a marca publica a fonte ao lado do número, ela ganha duas coisas: confiança do leitor e probabilidade maior de citação em respostas de IA.",
    "Métricas de retenção nos primeiros segundos são mais informativas do que contagem de visualizações, porque medem interesse real e não distribuição.",
    "Comparar o desempenho de um ativo com a mediana da própria marca é mais honesto do que comparar com benchmarks de mercados diferentes.",
    "Registrar a origem de cada número permite revisar a conclusão depois, quando o cenário muda e a decisão precisa ser atualizada.",
  ],
} as const;

const ARTICLE_HEADINGS = [
  "O que realmente define resultado no orgânico",
  "Como estruturar a resposta antes de escrever",
  "O papel dos dados verificáveis na citação por IA",
  "Erros que custam alcance sem aparecer no relatório",
  "Um processo simples para manter consistência",
] as const;

const FAQ_QUESTIONS = [
  "Como saber se o gancho está funcionando?",
  "Qual a diferença entre conteúdo orgânico e conteúdo pago?",
  "Com que frequência preciso atualizar o conteúdo?",
  "Como medir citação em respostas de IA?",
] as const;

function buildArticleParagraphs(
  rng: () => number,
  brand: BrandContext,
  objective: string,
  productInput: string,
  blockType: "direct_fact" | "context" | "verifiable_data",
): string {
  // 6 sentenças garantem o mínimo de 100 palavras por bloco exigido pelo schema.
  const sentences = pickMany(rng, ARTICLE_SENTENCES[blockType], 6);
  const subject = brand.brand_name;
  const intro =
    blockType === "direct_fact"
      ? `Para ${subject}, ${objective.toLowerCase()}`
      : blockType === "context"
        ? `No cenário de ${subject}, ${productInput.toLowerCase()}`
        : `Os números observados por ${subject}`;

  return `${intro} exigem um critério explícito. ${sentences.join(" ")}`.replace(/\s+/g, " ");
}

export function generateMockContent(input: MockGenerationInput): ContentGenerationOutput {
  const { brand, assetType, objective, productInput, selectedArm, explorationArms } = input;
  const tone = brand.tone_of_voice;
  const seed = hashString(
    [brand.brand_id, assetType, objective, productInput, selectedArm.angle_type, selectedArm.framework].join("|"),
  );
  const rng = mulberry32(seed);

  const hooks = buildHooks(rng, { selectedArm, explorationArms });

  switch (assetType) {
    case "short_script_kit":
      return buildShortScriptKit({ rng, brand, tone, objective, productInput, selectedArm, hooks });
    case "typo_carousel":
    case "hybrid_carousel":
      return buildCarousel({ rng, brand, objective, productInput, selectedArm, assetType, hooks });
    case "single_creative":
      return buildSingleCreative({ rng, brand, objective, productInput, hooks });
    case "geo_article":
      return buildGeoArticle({ rng, brand, objective, productInput, serpInsights: input.serpInsights ?? null });
    case "lp_copy":
      return buildLandingPage({ rng, brand, objective, productInput, hooks });
  }
}

function buildHooks(
  rng: () => number,
  arms: { selectedArm: { angle_type: AngleType; framework: Framework }; explorationArms: { angle_type: AngleType; framework: Framework }[] },
): { angle_type: AngleType; framework: Framework; hook_text: string; rationale: string }[] {
  const used: AngleType[] = [arms.selectedArm.angle_type];
  const result = [
    {
      angle_type: arms.selectedArm.angle_type,
      framework: arms.selectedArm.framework,
      hook_text: fitHook(pick(rng, HOOKS[arms.selectedArm.angle_type])),
      rationale: pick(rng, RATIONALES[arms.selectedArm.angle_type]),
    },
  ];

  for (const arm of arms.explorationArms.slice(0, 2)) {
    if (used.includes(arm.angle_type)) continue;
    used.push(arm.angle_type);
    result.push({
      angle_type: arm.angle_type,
      framework: arm.framework,
      hook_text: fitHook(pick(rng, HOOKS[arm.angle_type])),
      rationale: pick(rng, RATIONALES[arm.angle_type]),
    });
  }

  // Garante exatamente 3 ganchos, mesmo com braços repetidos.
  const fallbackAngles: AngleType[] = ["vace_pattern_interrupt", "contrarian_frame", "outcome_anchored", "negative_constraint"];
  for (const angle of fallbackAngles) {
    if (result.length >= 3) break;
    if (used.includes(angle)) continue;
    used.push(angle);
    result.push({
      angle_type: angle,
      framework: arms.selectedArm.framework,
      hook_text: fitHook(pick(rng, HOOKS[angle])),
      rationale: pick(rng, RATIONALES[angle]),
    });
  }

  return result.slice(0, 3);
}

function buildCaption(
  rng: () => number,
  brand: BrandContext,
  objective: string,
  productInput: string,
): { seo: string; extended: string; hashtags: string[] } {
  const descriptors = brand.tone_of_voice.descriptors ?? ["direto", "prático"];
  const seo = [
    `${objective} sem atalho mágico: o que ${brand.brand_name} aprendeu testando ${productInput}.`,
    `Neste conteúdo, mostramos o passo a passo que usamos na ${brand.brand_name} para transformar ${productInput} em resultado observável, com o tom ${descriptors.join(" e ")} que a marca já usa em todos os canais.`,
    `O texto está organizado em três partes: o fato direto, o contexto e os dados verificáveis. Assim você entende a proposta nas primeiras linhas e pode checar cada afirmação na fonte citada.`,
    `Se fizer sentido para o seu momento, salve para consultar depois e comente qual parte você vai aplicar primeiro.`,
  ].join("\n\n");

  const extended = [
    seo,
    "",
    `Por que publicamos: ${objective}.`,
    "",
    `O que você encontra aqui:`,
    "1. O que realmente muda o resultado no orgânico.",
    "2. Como estruturar a resposta antes de gravar ou escrever.",
    "3. Como medir o que importa sem depender de vaidade.",
    "",
    `Contexto: este material foi produzido a partir do briefing da marca, do histórico de conteúdo e da pesquisa de perguntas do público. Nenhuma promessa de resultado absoluto é feita.`,
    "",
    `Sobre ${brand.brand_name}: ${brand.icp_description ?? "atendemos marcas que precisam de consistência editorial e previsibilidade de aprendizado"}.`,
  ].join("\n");

  const hashtags = Array.from(
    new Set([
      "#marketingorganico",
      "#conteudoestrategico",
      "#seo",
      "#geo",
      "#branding",
      `#${slugify(brand.brand_name).replace(/-/g, "") || "marca"}`,
      "#copywriting",
      "#socialmedia",
    ]),
  ).slice(0, 8);

  return {
    seo: seo.slice(0, 2190),
    extended: extended.slice(0, 3990),
    hashtags,
  };
}

function buildShortScriptKit(args: {
  rng: () => number;
  brand: BrandContext;
  tone: ToneOfVoice;
  objective: string;
  productInput: string;
  selectedArm: { angle_type: AngleType; framework: Framework };
  hooks: { angle_type: AngleType; framework: Framework; hook_text: string; rationale: string }[];
}): ShortScriptKitOutput {
  const { rng, brand, objective, productInput, selectedArm, hooks } = args;
  const beats = BEATS[selectedArm.framework];
  const scriptSentences = [
    `A maioria das marcas trata ${productInput} como tarefa de calendário.`,
    `O resultado aparece quando existe critério: uma promessa clara, uma prova e um próximo passo.`,
    `Na ${brand.brand_name}, o processo começa pela pergunta que o público já faz.`,
    `Depois, organizamos a resposta em fato direto, contexto e dado verificável.`,
    `Só então o conteúdo é gravado, sem avatar e sem narração sintética.`,
    `O efeito prático é retenção maior no começo e mais gente chegando ao final.`,
    `Teste uma mudança por vez e registre o número antes e depois.`,
    `Se você quer ${objective.toLowerCase()}, comece pelo gancho e não pelo resto.`,
  ];

  const script = pickMany(rng, scriptSentences, 6).join(" ");
  const caption = buildCaption(rng, brand, objective, productInput);

  return {
    kind: "short_script_kit",
    hooks,
    body: {
      framework: selectedArm.framework,
      beats: beats.map((beat) => ({ ...beat })),
      script: clampWords(script, 150),
      estimated_seconds: beats.reduce((total, beat) => total + beat.seconds, 0),
    },
    payoff: `O payoff é simples: ${objective.toLowerCase()} deixa de depender de inspiração e passa a depender de processo e de um número que você acompanha toda semana.`,
    caption,
    scene_guide: [
      { scene: 1, visual: "Plano médio, câmera na altura dos olhos, fundo neutro da marca.", on_screen_text: hooks[0]?.hook_text.slice(0, 60) ?? "Gancho" },
      { scene: 2, visual: "Corte seco para tela com o dado principal em destaque.", on_screen_text: "O dado que muda a decisão" },
      { scene: 3, visual: "B-roll curto mostrando o processo real, sem encenação.", on_screen_text: "Processo, não sorte" },
      { scene: 4, visual: "Volta para o apresentador com a chamada final na tela.", on_screen_text: "Salve para aplicar hoje" },
    ],
    recording_notes: [
      "Grave com áudio próprio: o produto não usa TTS nem clonagem de voz.",
      "Sem avatar digital. A gravação é humana, com a sua voz e o seu enquadramento.",
      "Diga a primeira frase antes de qualquer introdução: os três primeiros segundos decidem a retenção.",
      "Se errar, regrave apenas o trecho: o roteiro está dividido em blocos curtos.",
    ],
  };
}

function buildCarousel(args: {
  rng: () => number;
  brand: BrandContext;
  objective: string;
  productInput: string;
  selectedArm: { angle_type: AngleType; framework: Framework };
  assetType: AssetType;
  hooks: { angle_type: AngleType; framework: Framework; hook_text: string; rationale: string }[];
}): CarouselOutput {
  const { rng, brand, objective, productInput, assetType } = args;
  const isHybrid = assetType === "hybrid_carousel";
  const slideCount = 8;

  const bodies = [
    `O problema raramente é volume. É falta de critério para decidir o que publicar.`,
    `Sem promessa clara, o público não entende o motivo de parar o scroll.`,
    `O gancho precisa caber em uma frase e sobreviver sem contexto.`,
    `Prova concreta vence adjetivo. Sempre foi assim, em qualquer canal.`,
    `Estrutura em fato direto, contexto e dado verificável facilita a citação.`,
    `Medir retenção nos três segundos é mais útil que contar visualizações.`,
    `Ajuste uma variável por vez. Sem isso você não aprende, só acumula posts.`,
    `Compare o número anterior com o atual. É o que transforma tentativa em método.`,
  ];

  const slides: CarouselOutput["slides"] = Array.from({ length: slideCount }, (_, index) => {
    const isFirst = index === 0;
    const isLast = index === slideCount - 1;
    const layout: CarouselOutput["slides"][number]["layout"] = isFirst
      ? "cover"
      : isLast
        ? "cta"
        : index === 4
          ? "data"
          : index === 5
            ? "quote"
            : "point";

    return {
      index,
      title: isFirst
        ? clampWords(`${brand.brand_name}: ${objective}`, 8)
        : isLast
          ? "Salve e aplique hoje"
          : clampWords(pick(rng, [
              "Critério antes de volume",
              "Gancho é promessa",
              "Prova vence adjetivo",
              "Estrutura que é citável",
              "Meça o segundo três",
              "Uma variável por vez",
              `O método de ${brand.brand_name}`,
            ]), 8),
      body: bodyForSlide(bodies[index] ?? `Aplicar ${productInput} com critério muda o resultado observável.`),
      layout,
      has_ai_imagery: isHybrid && index % 3 === 1,
    };
  });

  return {
    kind: isHybrid ? "hybrid_carousel" : "typo_carousel",
    slides,
    caption: {
      seo: buildCaption(rng, brand, objective, productInput).seo,
      hashtags: buildCaption(rng, brand, objective, productInput).hashtags,
    },
    design_notes: [
      "Tipografia Geist Sans com título em 92px e corpo em 40px no formato 4:5.",
      `Cor de destaque aplicada apenas no slide de dado, mantendo contraste AA com o fundo.`,
      isHybrid
        ? "Slides 2, 5 e 8 recebem ilustração gerada; o overlay tipográfico é aplicado sobre a imagem sem remover metadados C2PA."
        : "Carrossel 100% tipográfico via Satori — custo zero de geração de imagem.",
      "Rodapé fixo com logo, nome da marca e paginação.",
    ],
  };
}

function bodyForSlide(text: string): string {
  const words = text.trim().split(/\s+/g);
  return words.length <= 35 ? text : words.slice(0, 35).join(" ");
}

function buildSingleCreative(args: {
  rng: () => number;
  brand: BrandContext;
  objective: string;
  productInput: string;
  hooks: { hook_text: string }[];
}): SingleCreativeOutput {
  const { rng, brand, objective, productInput, hooks } = args;
  const caption = buildCaption(rng, brand, objective, productInput);

  return {
    kind: "single_creative",
    headline: clampWords(hooks[0]?.hook_text ?? objective, 10),
    subheadline: clampWords(`${productInput} com critério, prova e um próximo passo claro`, 20),
    body: clampWords(
      `${brand.brand_name} organiza o conteúdo em fato direto, contexto e dado verificável. O resultado é previsibilidade: você sabe o que testar, o que medir e o que manter. Sem promessa absoluta, sem atalho mágico, sem depender de inspiração.`,
      60,
    ),
    cta: "Salve e aplique hoje",
    caption: { seo: caption.seo, hashtags: caption.hashtags },
    image_prompt: `Ilustração editorial limpa para ${brand.brand_name} sobre ${productInput}, composição minimalista, fundo neutro, tipografia nítida, sem rostos reconhecíveis, sem elementos de marca de terceiros.`,
    has_ai_imagery: true,
  };
}

function buildGeoArticle(args: {
  rng: () => number;
  brand: BrandContext;
  objective: string;
  productInput: string;
  serpInsights: SerpInsights | null;
}): GeoArticleOutput {
  const { rng, brand, objective, productInput, serpInsights } = args;
  const sectionCount = 4;
  const headings = pickMany(rng, ARTICLE_HEADINGS, sectionCount);
  const paa = serpInsights?.people_also_ask?.map((item) => item.question) ?? [];

  const sections = headings.map((heading, index) => {
    const blocks: { type: "direct_fact" | "context" | "verifiable_data"; text: string }[] = [
      { type: "direct_fact", text: buildArticleParagraphs(rng, brand, objective, productInput, "direct_fact") },
      { type: "context", text: buildArticleParagraphs(rng, brand, objective, productInput, "context") },
      { type: "verifiable_data", text: buildArticleParagraphs(rng, brand, objective, productInput, "verifiable_data") },
    ];
    if (index === 0 && paa.length > 0) {
      blocks.push({
        type: "context",
        // Precisa respeitar o mínimo de 100 palavras por bloco.
        text: `Perguntas que aparecem na busca por este tema: ${paa.slice(0, 3).join("; ")}. Responder cada uma em um bloco próprio aumenta a chance de citação em respostas de IA. ${buildArticleParagraphs(rng, brand, objective, productInput, "context")}`,
      });
    }
    return { heading, blocks };
  });

  const faqQuestions = [
    ...(paa.slice(0, 3) as string[]),
    ...FAQ_QUESTIONS,
  ].slice(0, 4);

  const faq = faqQuestions.map((question) => ({
    question,
    answer: clampWords(
      `A resposta curta é: depende do critério adotado. ${brand.brand_name} usa um processo em três passos — definir a promessa, reunir a prova e medir uma variável por vez — porque isso reduz o custo de errar e permite comparar resultados entre ativos. ${productInput} entra como objeto de teste, não como promessa. O número que importa é a retenção nos primeiros segundos combinada com a taxa de citação.`,
      90,
    ),
  }));

  const keyTakeaways = [
    `Critério editorial vale mais que frequência: ${objective.toLowerCase()}.`,
    "Fato direto no início aumenta retenção e facilidade de citação.",
    "Dado sem fonte, data e método é decoração, não evidência.",
    "Meça uma variável por vez para aprender de forma cumulativa.",
  ];

  const body = [
    `${objective} em ${productInput}`,
    ...sections.flatMap((section) => [section.heading, ...section.blocks.map((block) => block.text)]),
    ...faq.flatMap((item) => [item.question, item.answer]),
    ...keyTakeaways,
  ].join(" ");

  const title = `${objective} em ${productInput}: o guia com dados verificáveis`;
  const website = brand.website_url ?? "https://example.com";

  return {
    kind: "geo_article",
    title: title.slice(0, 100),
    slug: slugify(`${objective} ${productInput}`).slice(0, 80) || "guia-organico",
    meta_description: `${objective} com ${productInput}: fato direto, contexto e dados verificáveis para ${brand.brand_name}.`.slice(0, 160),
    sections,
    faq,
    key_takeaways: keyTakeaways,
    internal_links: [
      { anchor: `Método de ${brand.brand_name}`, url: `${website}/metodo` },
      { anchor: "Estudos de caso", url: `${website}/cases` },
    ],
    word_count: countWords(body),
  };
}

function buildLandingPage(args: {
  rng: () => number;
  brand: BrandContext;
  objective: string;
  productInput: string;
  hooks: { hook_text: string }[];
}): LandingPageCopyOutput {
  const { brand, objective, productInput, hooks } = args;

  return {
    kind: "lp_copy",
    hero: {
      eyebrow: brand.brand_name,
      headline: clampWords(hooks[0]?.hook_text ?? objective, 12),
      subheadline: clampWords(
        `${productInput} com processo claro, prova verificável e um próximo passo sem atrito para o time de marketing.`,
        30,
      ),
      cta: "Começar agora",
    },
    problem: {
      title: "O problema não é falta de ideia",
      bullets: [
        "Calendário cheio e resultado invisível: publica-se muito e aprende-se pouco.",
        "Cada post parece de uma marca diferente, porque não existe padrão de voz.",
        "O time não sabe qual variável mudou o desempenho e repete o erro.",
        "Conteúdo bom não é citado por falta de estrutura verificável.",
      ],
    },
    solution: {
      title: "Um método com três decisões",
      bullets: [
        "Definir a promessa em uma frase antes de gravar qualquer coisa.",
        "Reunir prova real: dado, fonte, data e método explícitos.",
        "Medir uma variável por vez e registrar o número antes e depois.",
        "Exportar em um clique para o canal que o cliente já usa, sem OAuth social.",
      ],
    },
    proof: {
      title: "O que observamos na prática",
      items: [
        {
          claim: "Retenção nos três primeiros segundos é o indicador mais informativo em vídeo curto orgânico.",
          source: "Análise interna de telemetria agregada por marca",
        },
        {
          claim: "Artigos com fato direto no início são citados com mais frequência em respostas de IA.",
          source: "Monitoramento de citações por ativo",
        },
        {
          claim: "Times que registram telemetria semanal aprendem mais rápido que times que só publicam.",
          source: "Comparação entre marcas com e sem registro",
        },
      ],
    },
    faq: [
      {
        question: "Preciso conectar minhas redes sociais?",
        answer:
          "Não. O produto não usa OAuth social nem publica em seu nome. Todo conteúdo é entregue para exportação em um clique, em PNG, Markdown, HTML ou JSON-LD.",
      },
      {
        question: "Usa avatar falante ou clonagem de voz?",
        answer:
          "Não. Não há TTS, lip-sync ou avatar digital. Os roteiros são feitos para gravação humana, com a sua voz.",
      },
      {
        question: "Como funcionam os créditos?",
        answer: `Cada ativo consome créditos conforme o tipo: roteiro e carrossel tipográfico custam 1; criativo único custa 2; artigo GEO custa 5. O débito acontece apenas após a entrega validada, com estorno automático em falha técnica.`,
      },
    ],
    final_cta: {
      headline: clampWords(`Pronto para ${objective.toLowerCase()} com processo?`, 12),
      cta: "Criar meu primeiro ativo",
    },
  };
}

/** Utilizado pelo onboarding: extrai um perfil inicial de uma URL/descrição. */
export function inferBrandSeed(input: string): {
  brand_name: string;
  website_url: string | null;
  icp_description: string;
  niche: string;
} {
  const trimmed = input.trim();
  const isUrl = /^https?:\/\//i.test(trimmed) || /^[\w-]+\.[a-z]{2,}(\/|$)/i.test(trimmed);

  if (isUrl) {
    const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const host = safeHostname(url);
    const brandName = host
      .replace(/^www\./, "")
      .split(".")[0]
      ?.replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    return {
      brand_name: brandName ?? "Minha marca",
      website_url: url,
      icp_description: `Público identificado a partir de ${host}. Revisar em Configurações da marca.`,
      niche: "geral",
    };
  }

  const firstSentence = trimmed.split(/[.!?]/)[0]?.trim() ?? trimmed;
  return {
    brand_name: firstSentence.slice(0, 60) || "Minha marca",
    website_url: null,
    icp_description: trimmed.slice(0, 400),
    niche: "geral",
  };
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0]?.toLowerCase() ?? "example.com";
  }
}

/** Seed determinística exposta para testes. */
export function mockSeedFor(input: Pick<MockGenerationInput, "brand" | "assetType" | "objective" | "productInput">): number {
  return hashString([input.brand.brand_id, input.assetType, input.objective, input.productInput].join("|"));
}

export const __testing = { fitHook, clampWords, hashString, mulberry32, pick, pickMany };
