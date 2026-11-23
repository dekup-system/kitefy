import { Command } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { getStudioGraph } from "@/lib/agent/graph";
import type {
  ApprovalDecision,
  OrganicStudioInput,
  OrganicStudioStateType,
  StudioViewModel,
} from "@/lib/agent/state";
import { sumUsage } from "@/lib/ai/usage";
import { createLogger } from "@/lib/logger";
import type { ContentPayload } from "@/types/domain";

/**
 * Execução do grafo: iniciar, retomar após aprovação e ler o estado.
 *
 * O runner é a única porta de entrada usada pelas rotas/Server Actions —
 * mantém a serialização do estado (checkpoint) e o formato do view model
 * consistentes entre streaming, polling e exportação.
 */

const log = createLogger("agent.runner");

export type StudioRunStatus = "awaiting_approval" | "approved" | "rejected" | "failed" | "running";

export interface StudioRunResult {
  threadId: string;
  status: StudioRunStatus;
  view: StudioViewModel;
  interrupt: ApprovalInterruptPayload | null;
}

export interface ApprovalInterruptPayload {
  type: "approval_required";
  threadId: string;
  assetType: OrganicStudioStateType["assetType"];
  title: string;
  hooks: StudioViewModel["hooks"];
  creditsCost: number;
  requires_transparency_label: boolean;
}

function configFor(threadId: string): RunnableConfig {
  return {
    configurable: { thread_id: threadId },
    recursionLimit: 40,
  };
}

export async function startStudioRun(input: OrganicStudioInput): Promise<StudioRunResult> {
  const graph = getStudioGraph();

  log.info("Iniciando run do estúdio", {
    threadId: input.threadId,
    assetType: input.assetType,
    research: input.researchEnabled,
  });

  const result = await graph.invoke(
    {
      tenantId: input.tenantId,
      brandId: input.brandId,
      threadId: input.threadId,
      requestedBy: input.requestedBy ?? null,
      objective: input.objective,
      assetType: input.assetType,
      productInput: input.productInput,
      researchEnabled: input.researchEnabled,
      visualFormat: input.visualFormat ?? "4:5",
      brandContext: null,
      serpInsights: null,
      selectedArm: null,
      explorationArms: [],
      draftPayload: null,
      tokenUsageLog: [],
      complianceReport: null,
      complianceAttempts: 0,
      renderedVisualPaths: [],
      approvalStatus: "pending" as const,
      approvalDecision: null,
      assetId: null,
      creditsCharged: 0,
      error: null,
    },
    configFor(input.threadId),
  );

  // `invoke` devolve apenas os valores do estado; as interrupções pendentes estão
  // no snapshot do checkpointer. Sem esta leitura, o status voltaria "running"
  // mesmo com o grafo parado em `interrupt()`.
  const snapshot = await graph.getState(configFor(input.threadId));

  return buildRunResult(input.threadId, result as unknown as OrganicStudioStateType, snapshot);
}

export async function resumeStudioRun(input: {
  threadId: string;
  decision: ApprovalDecision;
}): Promise<StudioRunResult> {
  const graph = getStudioGraph();
  const config = configFor(input.threadId);

  // Em serverless, `MemorySaver` (sem SUPABASE_DB_URL) não compartilha estado
  // entre invocações. Sem este check, a aprovação falharia de forma opaca.
  const snapshot = await graph.getState(config);
  const hasState = snapshot?.values && Object.keys(snapshot.values as object).length > 0;

  if (!hasState) {
    throw new Error(
      "Sessão de aprovação não encontrada neste servidor. Configure SUPABASE_DB_URL " +
        "(connection string do Postgres) para persistir o estado do agente entre requisições " +
        "e rode `npm run db:langgraph-setup` uma vez.",
    );
  }

  const result = await graph.invoke(new Command({ resume: input.decision }), config);

  log.info("Run retomado", { threadId: input.threadId, approved: input.decision.approved });

  return buildRunResult(input.threadId, result as unknown as OrganicStudioStateType);
}

/** Lê o estado atual sem executar nada. */
export async function readStudioRun(threadId: string): Promise<StudioRunResult | null> {
  const graph = getStudioGraph();
  const snapshot = await graph.getState(configFor(threadId));

  if (!snapshot?.values || Object.keys(snapshot.values as object).length === 0) {
    return null;
  }

  return buildRunResult(threadId, snapshot.values as unknown as OrganicStudioStateType, snapshot);
}

interface InterruptCarrier {
  tasks?: { interrupts?: { value?: unknown }[] }[];
  next?: string[];
}

function detectInterrupt(snapshot: InterruptCarrier | null | undefined): ApprovalInterruptPayload | null {
  if (!snapshot?.tasks) return null;
  for (const task of snapshot.tasks) {
    for (const intr of task.interrupts ?? []) {
      const value = intr.value as Partial<ApprovalInterruptPayload> | undefined;
      if (value && value.type === "approval_required") {
        return value as ApprovalInterruptPayload;
      }
    }
  }
  return null;
}

function buildRunResult(
  threadId: string,
  state: OrganicStudioStateType,
  snapshot?: InterruptCarrier | null,
): StudioRunResult {
  const interruptPayload = detectInterrupt(snapshot ?? null);
  const usage = sumUsage(state.tokenUsageLog ?? []);

  let status: StudioRunStatus = "running";
  if (interruptPayload) status = "awaiting_approval";
  else if (state.approvalStatus === "approved" && state.assetId) status = "approved";
  else if (state.approvalStatus === "rejected") status = "rejected";
  else if (state.error) status = "failed";

  const payload = state.draftPayload as ContentPayload | null;
  const hooks = extractHooks(payload, state);

  const view: StudioViewModel = {
    threadId,
    assetType: state.assetType,
    objective: state.objective,
    status,
    draft: payload,
    hooks,
    compliance: state.complianceReport ?? null,
    visualPaths: state.renderedVisualPaths ?? [],
    assetId: state.assetId ?? null,
    error: state.error ?? null,
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: usage.cost_usd,
    },
  };

  return { threadId, status, view, interrupt: interruptPayload };
}

function extractHooks(
  payload: ContentPayload | null,
  state: OrganicStudioStateType,
): StudioViewModel["hooks"] {
  if (!payload) return [];

  if (payload.kind === "short_script_kit") {
    return payload.hooks.map((hook, index) => ({
      index,
      hook_text: hook.hook_text,
      angle_type: hook.angle_type,
      framework: hook.framework,
    }));
  }

  const angle = state.selectedArm?.angle_type ?? "vace_pattern_interrupt";
  const framework = state.selectedArm?.framework ?? "hook_body_payoff";
  const text =
    payload.kind === "geo_article"
      ? payload.title
      : payload.kind === "lp_copy"
        ? payload.hero.headline
        : payload.kind === "single_creative"
          ? payload.headline
          : (payload.slides[0]?.title ?? "Conteúdo");

  return [{ index: 0, hook_text: text, angle_type: angle, framework }];
}

/** Remove o histórico do agente (LGPD). */
export async function purgeStudioThread(threadId: string): Promise<void> {
  const { deleteThread } = await import("@/lib/agent/checkpointer");
  await deleteThread(threadId);
}

/**
 * Autorização: o thread pertence mesmo ao tenant da sessão?
 *
 * Sem esta checagem, qualquer usuário autenticado que conhecesse um thread_id
 * de outra organização poderia aprovar o rascunho alheio — e o débito cairia
 * na conta da vítima.
 */
export async function runBelongsToTenant(threadId: string, tenantId: string): Promise<boolean> {
  const graph = getStudioGraph();
  const snapshot = await graph.getState(configFor(threadId));
  const values = snapshot?.values as { tenantId?: string } | undefined;
  return Boolean(values?.tenantId) && values?.tenantId === tenantId;
}
