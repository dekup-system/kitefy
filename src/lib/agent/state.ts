import { Annotation } from "@langchain/langgraph";
import type {
  AngleType,
  AssetType,
  BrandContext,
  ComplianceReport,
  ContentPayload,
  Framework,
  SerpInsights,
  TokenUsageEntry,
  VisualThemeId,
} from "@/types/domain";
import type { AdvertisingCrossReference } from "@/lib/ai/marketing-knowledge";
import type { HybridCarouselPreset } from "@/lib/pricing";

/**
 * Estado do grafo OrganicStudio.
 *
 * Regra de projeto: o estado carrega apenas o que é necessário para retomar um
 * thread do LangGraph de forma determinística. Prompts, pesos do bandit e
 * metadados de roteamento NÃO vão para a UI — a UI lê um recorte seguro.
 */

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ArmSelection {
  angle_type: AngleType;
  framework: Framework;
  arm_key: string;
}

export interface ApprovalDecision {
  approved: boolean;
  /** Índice do gancho escolhido pelo humano (0..2). */
  selected_hook_index?: number;
  /** Título opcional editado pelo humano antes de exportar. */
  title?: string;
  /** Comentário do aprovador (não vai para o conteúdo). */
  note?: string;
}

export interface OrganicStudioInput {
  tenantId: string;
  brandId: string;
  threadId: string;
  objective: string;
  assetType: AssetType;
  productInput: string;
  researchEnabled: boolean;
  /** Formato dos slides (4:5 feed, 9:16 story). */
  visualFormat: "4:5" | "9:16";
  /** Estilo visual escolhido na criação ("auto" usa o estudo científico da marca). */
  visualStyle?: "auto" | VisualThemeId;
  /** Preset do Carrossel Ilustrado (5 slides · 2 IA ou 7 slides · 3 IA). */
  carouselPreset?: HybridCarouselPreset;
  /** Usuário que iniciou; usado apenas para auditoria/LGPD. */
  requestedBy?: string;
}

export const OrganicStudioState = Annotation.Root({
  // --- Identidade do job -----------------------------------------------------
  tenantId: Annotation<string>,
  brandId: Annotation<string>,
  threadId: Annotation<string>,
  requestedBy: Annotation<string | null>,

  // --- Briefing --------------------------------------------------------------
  objective: Annotation<string>,
  assetType: Annotation<AssetType>,
  productInput: Annotation<string>,
  researchEnabled: Annotation<boolean>,
  visualFormat: Annotation<"4:5" | "9:16">,
  visualStyle: Annotation<"auto" | VisualThemeId | null>,
  carouselPreset: Annotation<HybridCarouselPreset | null>,

  // --- Contexto --------------------------------------------------------------
  brandContext: Annotation<BrandContext | null>,
  serpInsights: Annotation<SerpInsights | null>,

  // --- Bandit ----------------------------------------------------------------
  selectedArm: Annotation<ArmSelection | null>,
  explorationArms: Annotation<ArmSelection[]>,

  // --- Orquestrador Estratégico (cruzamento científico pré-geração) -----------
  strategyBrief: Annotation<AdvertisingCrossReference | null>,

  // --- Geração ---------------------------------------------------------------
  draftPayload: Annotation<ContentPayload | null>,
  tokenUsageLog: Annotation<TokenUsageEntry[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => [],
  }),

  // --- Conformidade ----------------------------------------------------------
  complianceReport: Annotation<ComplianceReport | null>,
  complianceAttempts: Annotation<number>,

  // --- Visual ----------------------------------------------------------------
  renderedVisualPaths: Annotation<string[]>({
    reducer: (left, right) => [...new Set([...(left ?? []), ...(right ?? [])])],
    default: () => [],
  }),

  // --- Aprovação humana ------------------------------------------------------
  approvalStatus: Annotation<ApprovalStatus>,
  approvalDecision: Annotation<ApprovalDecision | null>,

  // --- Persistência ----------------------------------------------------------
  assetId: Annotation<string | null>,
  creditsCharged: Annotation<number>,
  error: Annotation<string | null>,
});

export type OrganicStudioStateType = typeof OrganicStudioState.State;
export type OrganicStudioUpdate = typeof OrganicStudioState.Update;

/** Recorte seguro do estado exposto à UI (progressive disclosure). */
export interface StudioViewModel {
  threadId: string;
  assetType: AssetType;
  objective: string;
  status: "running" | "awaiting_approval" | "approved" | "rejected" | "failed";
  draft: ContentPayload | null;
  hooks: { index: number; hook_text: string; angle_type: AngleType; framework: Framework }[];
  compliance: ComplianceReport | null;
  visualPaths: string[];
  assetId: string | null;
  error: string | null;
  usage: { input_tokens: number; output_tokens: number; cost_usd: number };
}
