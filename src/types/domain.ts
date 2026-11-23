/**
 * Tipos de domínio compartilhados (DB + contrato de agente + UI).
 * Mantidos à mão de forma intencional: são o contrato estável entre camadas e
 * falham no typecheck se o schema do banco divergir.
 *
 * Para regenerar a partir do banco real:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.generated.ts
 */

export type PlanTier = "essential" | "pro" | "agency";
export type TenantRole = "owner" | "editor" | "viewer";

export type AssetType =
  | "short_script_kit"
  | "typo_carousel"
  | "hybrid_carousel"
  | "single_creative"
  | "geo_article"
  | "lp_copy";

export type AssetStatus = "draft" | "awaiting_approval" | "approved" | "exported";

export type AngleType =
  | "vace_pattern_interrupt"
  | "contrarian_frame"
  | "outcome_anchored"
  | "negative_constraint";

export type Framework = "hook_body_payoff" | "aida" | "pas" | "bab";

export type SourceType = "brand_doc" | "winning_post" | "serp_insight";
export type TelemetrySourceMode = "manual" | "csv" | "ga4_webhook";
export type PaymentMethod = "card_preapproval" | "pix_automatico";

// ---------------------------------------------------------------------------
// Linhas do banco (snake_case, espelho fiel do SQL)
// ---------------------------------------------------------------------------

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan_tier: PlanTier;
  credit_balance: number;
  created_at: string;
}

export interface TenantMemberRow {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
}

export interface BrandProfileRow {
  id: string;
  tenant_id: string;
  brand_name: string;
  website_url: string | null;
  icp_description: string | null;
  tone_of_voice: ToneOfVoice;
  visual_tokens: VisualTokens;
  entity_facts: EntityFact[];
  /** Token do Search Console usado no Pacote Google (nunca é segredo). */
  google_verification_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunkRow {
  id: string;
  tenant_id: string;
  brand_id: string;
  source_type: SourceType;
  content: string;
  metadata: Record<string, unknown>;
  embedding: string | null;
  performance_score: number | null;
  created_at: string;
}

export interface CampaignAssetRow {
  id: string;
  tenant_id: string;
  brand_id: string;
  thread_id: string;
  asset_type: AssetType;
  status: AssetStatus;
  title: string;
  content_payload: ContentPayload;
  visual_urls: string[];
  json_ld: JsonLdBundle | null;
  credits_charged: number;
  has_ai_imagery: boolean;
  created_at: string;
}

export interface HookVariantRow {
  id: string;
  tenant_id: string;
  asset_id: string;
  angle_type: AngleType;
  framework: Framework;
  hook_text: string;
  is_selected: boolean;
  created_at: string;
}

export interface PerformanceTelemetryRow {
  id: string;
  tenant_id: string;
  brand_id: string;
  asset_id: string | null;
  channel_label: string;
  impressions: number;
  views_3s: number;
  hook_rate: number;
  retention_50_pct: number | null;
  saves_or_clicks: number;
  ai_citations_count: number;
  source_mode: TelemetrySourceMode;
  recorded_at: string;
}

export interface BanditArmStatRow {
  id: string;
  tenant_id: string;
  brand_id: string;
  arm_key: string;
  alpha: number;
  beta: number;
  pulls: number;
  updated_at: string;
}

export interface CreditLedgerRow {
  id: string;
  tenant_id: string;
  delta: number;
  reason: string;
  reference_id: string | null;
  created_at: string;
}

export interface MpSubscriptionRow {
  id: string;
  tenant_id: string;
  mp_preapproval_id: string;
  payment_method: PaymentMethod;
  plan_tier: PlanTier;
  status: string;
  next_billing_date: string | null;
  updated_at: string;
}

export interface MpWebhookEventRow {
  id: string;
  mp_event_id: string;
  topic: string | null;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// JSONB tipado
// ---------------------------------------------------------------------------

export interface ToneOfVoice {
  archetype?: string;
  descriptors?: string[];
  avoid?: string[];
  reading_level?: string;
  /** Exemplos de frases aprovadas pela marca. */
  exemplars?: string[];
}

/** Cores em hex e/ou OKLCH (o renderizador aceita ambos). */
export interface VisualTokens {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  font_heading?: string;
  font_body?: string;
  font_mono?: string;
  logo_path?: string;
  /** Raio de borda em px usado nos cards. */
  radius?: number;
  /** "light" | "dark" — define contraste base do template. */
  theme?: "light" | "dark";
}

export interface EntityFact {
  claim: string;
  source_url?: string;
  verified_at?: string;
}

export interface JsonLdBundle {
  article?: Record<string, unknown>;
  faq?: Record<string, unknown>;
  product?: Record<string, unknown>;
}

export interface SerpInsights {
  provider: "serper" | "gemini_grounding" | "mock";
  query: string;
  fetched_at: string;
  people_also_ask: { question: string; answer?: string }[];
  competitor_gaps: { url: string; title: string; missing_topics: string[] }[];
  recent_facts: { claim: string; source_url: string; published_at?: string }[];
}

// ---------------------------------------------------------------------------
// Payloads de conteúdo por tipo de ativo
// ---------------------------------------------------------------------------

export interface ShortScriptKitPayload {
  kind: "short_script_kit";
  hooks: HookCandidate[];
  body: {
    framework: Framework;
    beats: { label: string; direction: string; seconds: number }[];
    script: string;
    estimated_seconds: number;
  };
  payoff: string;
  caption: { seo: string; extended: string; hashtags: string[] };
  scene_guide: { scene: number; visual: string; on_screen_text: string }[];
  /** Roteiro para gravação humana. Nunca há avatar/TTS. */
  recording_notes: string[];
}

export interface CarouselSlide {
  index: number;
  title: string;
  body: string;
  /** Instrução de composição visual para o renderizador. */
  layout: "cover" | "point" | "data" | "quote" | "cta";
  /** Caminho/URL de imagem IA opcional (hybrid_carousel). */
  image_url?: string;
  has_ai_imagery?: boolean;
}

export interface CarouselPayload {
  kind: "typo_carousel" | "hybrid_carousel";
  slides: CarouselSlide[];
  caption: { seo: string; hashtags: string[] };
  design_notes: string[];
}

export interface SingleCreativePayload {
  kind: "single_creative";
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
  caption: { seo: string; hashtags: string[] };
  image_prompt: string;
  has_ai_imagery: boolean;
}

export interface GeoArticlePayload {
  kind: "geo_article";
  title: string;
  slug: string;
  meta_description: string;
  sections: ArticleSection[];
  faq: { question: string; answer: string }[];
  key_takeaways: string[];
  internal_links: { anchor: string; url: string }[];
  word_count: number;
}

export interface ArticleSection {
  heading: string;
  /** Fato direto, contexto e dados verificáveis (estrutura GEO). */
  blocks: { type: "direct_fact" | "context" | "verifiable_data"; text: string }[];
}

export interface LandingPageCopyPayload {
  kind: "lp_copy";
  hero: { eyebrow: string; headline: string; subheadline: string; cta: string };
  problem: { title: string; bullets: string[] };
  solution: { title: string; bullets: string[] };
  proof: { title: string; items: { claim: string; source?: string }[] };
  faq: { question: string; answer: string }[];
  final_cta: { headline: string; cta: string };
}

export interface HookCandidate {
  angle_type: AngleType;
  framework: Framework;
  hook_text: string;
  rationale: string;
}

export type ContentPayload =
  | ShortScriptKitPayload
  | CarouselPayload
  | SingleCreativePayload
  | GeoArticlePayload
  | LandingPageCopyPayload;

// ---------------------------------------------------------------------------
// Estado do grafo (visão da UI, sem prompts/pesos internos)
// ---------------------------------------------------------------------------

export interface ComplianceReport {
  approved: boolean;
  violations: { rule: string; excerpt: string; severity: "blocker" | "warning" }[];
  checked_at: string;
  reviewer: "deterministic" | "llm";
  requires_transparency_label: boolean;
}

export interface BrandContext {
  brand_id: string;
  brand_name: string;
  tone_of_voice: ToneOfVoice;
  visual_tokens: VisualTokens;
  entity_facts: EntityFact[];
  top_chunks: { content: string; source_type: SourceType; similarity: number }[];
  icp_description: string | null;
  website_url: string | null;
}

export interface TokenUsageEntry {
  node: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number;
}
