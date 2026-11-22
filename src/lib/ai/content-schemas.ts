import { z } from "zod";

/**
 * Contratos de saída do LLM — validação estrita com zod.
 *
 * Estas regras são a "lei" do gerador: se o modelo devolver algo fora delas,
 * o nó `contentGeneratorNode` falha e tenta novamente (máx. 2 retentativas).
 * As mesmas regras alimentam o mock determinístico, garantindo paridade.
 */

export const ANGLE_TYPES = [
  "vace_pattern_interrupt",
  "contrarian_frame",
  "outcome_anchored",
  "negative_constraint",
] as const;

export const FRAMEWORKS = ["hook_body_payoff", "aida", "pas", "bab"] as const;

export const SLIDE_LAYOUTS = ["cover", "point", "data", "quote", "cta"] as const;

export function countWords(text: string): number {
  return text.trim().split(/\s+/g).filter(Boolean).length;
}

const wordRange = (min: number, max: number, label: string) =>
  z
    .string()
    .describe(`${label}: entre ${min} e ${max} palavras`)
    .superRefine((value, ctx) => {
      const words = countWords(value);
      if (words < min || words > max) {
        // A contagem real vai na mensagem: é ela que orienta a retentativa do
        // modelo ("recebido: 17") e o relatório de erro para o usuário.
        ctx.addIssue({
          code: "custom",
          message: `${label} deve ter entre ${min} e ${max} palavras (recebido: ${words}).`,
        });
      }
    });

export const angleTypeSchema = z.enum(ANGLE_TYPES);
export const frameworkSchema = z.enum(FRAMEWORKS);
export const slideLayoutSchema = z.enum(SLIDE_LAYOUTS);

// --- Ganchos -----------------------------------------------------------------
export const hookCandidateSchema = z.object({
  angle_type: angleTypeSchema,
  framework: frameworkSchema,
  hook_text: wordRange(8, 15, "Gancho"),
  rationale: z.string().min(12).max(280),
});
export type HookCandidateOutput = z.infer<typeof hookCandidateSchema>;

// --- Legenda -----------------------------------------------------------------
export const captionSchema = z.object({
  seo: z
    .string()
    .describe("Legenda SEO: 80 a 2.200 caracteres")
    .min(80)
    .max(2200, "Legenda SEO deve caber em 2.200 caracteres (Reels/API)."),
  extended: z
    .string()
    .describe("Legenda estendida: 80 a 4.000 caracteres")
    .min(80)
    .max(4000, "Legenda estendida deve caber em 4.000 caracteres (TikTok)."),
  hashtags: z.array(z.string().min(2).max(40)).min(3).max(12),
});

// --- Short script kit --------------------------------------------------------
export const shortScriptKitSchema = z.object({
  kind: z.literal("short_script_kit"),
  hooks: z.array(hookCandidateSchema).length(3, "Exatamente 3 variantes de gancho (A/B split)."),
  body: z.object({
    framework: frameworkSchema,
    beats: z
      .array(
        z.object({
          label: z.string().min(2).max(60),
          direction: z.string().min(10).max(260),
          seconds: z.number().min(2).max(30),
        }),
      )
      .min(3)
      .max(6),
    script: wordRange(75, 170, "Corpo do roteiro (30–60s)"),
    estimated_seconds: z.number().min(25).max(65),
  }),
  payoff: z.string().min(20).max(400),
  caption: captionSchema,
  scene_guide: z
    .array(
      z.object({
        scene: z.number().int().min(0),
        visual: z.string().min(10).max(220),
        on_screen_text: z.string().min(1).max(90),
      }),
    )
    .min(3)
    .max(8),
  recording_notes: z.array(z.string().min(10).max(220)).min(2).max(6),
});
export type ShortScriptKitOutput = z.infer<typeof shortScriptKitSchema>;

// --- Carrossel ---------------------------------------------------------------
export const carouselSlideSchema = z.object({
  index: z.number().int().min(0),
  title: wordRange(1, 8, "Título do slide"),
  body: wordRange(3, 35, "Corpo do slide"),
  layout: slideLayoutSchema,
  image_url: z.string().url().optional(),
  has_ai_imagery: z.boolean().optional(),
});

export const carouselSchema = z.object({
  kind: z.enum(["typo_carousel", "hybrid_carousel"]),
  slides: z
    .array(carouselSlideSchema)
    .min(7, "Carrossel precisa de no mínimo 7 slides.")
    .max(10, "Carrossel precisa de no máximo 10 slides."),
  caption: z.object({
    seo: z.string().min(80).max(2200),
    hashtags: z.array(z.string().min(2).max(40)).min(3).max(12),
  }),
  design_notes: z.array(z.string().min(8).max(200)).min(1).max(6),
});
export type CarouselOutput = z.infer<typeof carouselSchema>;

// --- Criativo único ----------------------------------------------------------
export const singleCreativeSchema = z.object({
  kind: z.literal("single_creative"),
  headline: wordRange(2, 12, "Headline"),
  subheadline: wordRange(3, 25, "Subheadline"),
  body: wordRange(10, 120, "Corpo do criativo"),
  cta: z.string().min(3).max(60),
  caption: z.object({
    seo: z.string().min(80).max(2200),
    hashtags: z.array(z.string().min(2).max(40)).min(3).max(12),
  }),
  image_prompt: z.string().min(30).max(600),
  has_ai_imagery: z.boolean(),
});
export type SingleCreativeOutput = z.infer<typeof singleCreativeSchema>;

// --- Artigo GEO --------------------------------------------------------------
export const articleBlockSchema = z.object({
  type: z.enum(["direct_fact", "context", "verifiable_data"]),
  text: z
    .string()
    .describe("Bloco de 100 a 200 palavras, com afirmação completa")
    .min(60)
    .max(1800)
    .superRefine((value, ctx) => {
      const words = countWords(value);
      if (words < 100) {
        ctx.addIssue({
          code: "custom",
          message: `Bloco curto: ${words} palavras (mínimo 100). Desenvolva o argumento com dado verificável.`,
        });
      }
    }),
});

export const articleSectionSchema = z.object({
  heading: z.string().min(8).max(120),
  blocks: z.array(articleBlockSchema).min(2).max(6),
});

export const geoArticleSchema = z
  .object({
    kind: z.literal("geo_article"),
    title: z.string().min(15).max(110),
    slug: z
      .string()
      .min(3)
      .max(90)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug deve ser kebab-case ASCII."),
    meta_description: z.string().min(70).max(165),
    sections: z
      .array(articleSectionSchema)
      .min(3, "Artigo GEO precisa de no mínimo 3 seções autônomas.")
      .max(8),
    faq: z
      .array(
        z.object({ question: z.string().min(10).max(180), answer: z.string().min(40).max(700) }),
      )
      .min(3)
      .max(8),
    key_takeaways: z.array(z.string().min(20).max(220)).min(3).max(7),
    internal_links: z
      .array(z.object({ anchor: z.string().min(3).max(80), url: z.string().url() }))
      .max(6),
    // O modelo não sabe contar palavras de forma confiável (declarou 1520 para
    // um texto de 1241). Aceitamos qualquer valor e sempre sobrescrevemos com o
    // total calculado em `normalizeGeoWordCount`. `.default(0)` mantém o campo
    // obrigatório no tipo de saída — o modelo pode omiti-lo.
    word_count: z.number().int().min(0).default(0),
  });
export type GeoArticleOutput = z.infer<typeof geoArticleSchema>;

/** Faixa exigida pela spec para artigo GEO. */
export const GEO_WORD_RANGE = { min: 1450, max: 2550 } as const;

/** Conta as palavras do artigo (título + seções + FAQ + takeaways). */
export function countArticleWords(article: {
  title: string;
  sections: { heading: string; blocks: { text: string }[] }[];
  faq: { question: string; answer: string }[];
  key_takeaways: string[];
}): number {
  const body = [
    article.title,
    ...article.sections.flatMap((section) => [section.heading, ...section.blocks.map((b) => b.text)]),
    ...article.faq.flatMap((item) => [item.question, item.answer]),
    ...article.key_takeaways,
  ].join(" ");

  return countWords(body);
}

/**
 * Recalcula `word_count` e valida a faixa da spec.
 *
 * A mensagem de erro traz a contagem real, que é o que orienta a retentativa
 * ("o texto tem 1241 palavras, o mínimo é 1450").
 */
export function normalizeGeoWordCount(article: {
  title: string;
  sections: { heading: string; blocks: { text: string }[] }[];
  faq: { question: string; answer: string }[];
  key_takeaways: string[];
  word_count?: number;
}): number {
  const actual = countArticleWords(article);

  if (actual < GEO_WORD_RANGE.min || actual > GEO_WORD_RANGE.max) {
    throw new Error(
      `O artigo tem ${actual} palavras; a faixa exigida é ${GEO_WORD_RANGE.min} a ${GEO_WORD_RANGE.max}. ` +
        (actual < GEO_WORD_RANGE.min
          ? `Expanda as seções com mais dados verificáveis (faltam ${GEO_WORD_RANGE.min - actual}).`
          : `Reduza o texto (excedeu ${actual - GEO_WORD_RANGE.max}).`),
    );
  }

  return actual;
}

// --- Landing page copy -------------------------------------------------------
export const landingPageCopySchema = z.object({
  kind: z.literal("lp_copy"),
  hero: z.object({
    eyebrow: z.string().min(3).max(60),
    headline: wordRange(3, 14, "Headline do hero"),
    subheadline: wordRange(6, 35, "Subheadline do hero"),
    cta: z.string().min(3).max(60),
  }),
  problem: z.object({ title: z.string().min(6).max(80), bullets: z.array(z.string().min(10).max(180)).min(2).max(5) }),
  solution: z.object({ title: z.string().min(6).max(80), bullets: z.array(z.string().min(10).max(180)).min(2).max(5) }),
  proof: z.object({
    title: z.string().min(6).max(80),
    items: z.array(z.object({ claim: z.string().min(10).max(200), source: z.string().max(200).optional() })).min(2).max(5),
  }),
  faq: z.array(z.object({ question: z.string().min(8).max(180), answer: z.string().min(30).max(600) })).min(2).max(6),
  final_cta: z.object({ headline: z.string().min(8).max(120), cta: z.string().min(3).max(60) }),
});
export type LandingPageCopyOutput = z.infer<typeof landingPageCopySchema>;

// --- União discriminada ------------------------------------------------------
export const contentPayloadSchema = z.discriminatedUnion("kind", [
  shortScriptKitSchema,
  carouselSchema,
  singleCreativeSchema,
  geoArticleSchema,
  landingPageCopySchema,
]);

export type ContentGenerationOutput = z.infer<typeof contentPayloadSchema>;

/** Mapa tipo de ativo -> schema (usado pelo gerador). */
export const SCHEMA_BY_ASSET: Record<string, z.ZodTypeAny> = {
  short_script_kit: shortScriptKitSchema,
  typo_carousel: carouselSchema,
  hybrid_carousel: carouselSchema,
  single_creative: singleCreativeSchema,
  geo_article: geoArticleSchema,
  lp_copy: landingPageCopySchema,
};

/** Valida e lança erro agregado legível (usado no nó de geração). */
export function parseContentPayload(assetType: string, value: unknown): ContentGenerationOutput {
  const schema = SCHEMA_BY_ASSET[assetType];
  if (!schema) {
    throw new Error(`Tipo de ativo sem schema de conteúdo: ${assetType}`);
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join(" | ");
    throw new Error(`Payload inválido para ${assetType}: ${issues}`);
  }

  return parsed.data as ContentGenerationOutput;
}
