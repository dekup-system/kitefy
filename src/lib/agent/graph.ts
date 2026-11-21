import { END, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { OrganicStudioState } from "@/lib/agent/state";
import {
  banditSelectorNode,
  brandContextNode,
  complianceGuardrailNode,
  contentGeneratorNode,
  failedNode,
  finalizeAssetNode,
  humanApprovalNode,
  researchSeoGeoNode,
  routeAfterApproval,
  routeAfterCompliance,
  shouldResearch,
  visualRenderNode,
} from "@/lib/agent/nodes";
import { getCheckpointer } from "@/lib/agent/checkpointer";

/**
 * Pipeline OrganicStudio.
 *
 * Fluxo:
 *   START -> brandContext -> [researchSeoGeo] -> banditSelector -> contentGenerator
 *         -> complianceGuardrail -+-> (reprovado, <2 tentativas) contentGenerator
 *                                 +-> (reprovado, 2 tentativas) failed -> END
 *                                 +-> (aprovado) visualRender -> humanApproval
 *         -> humanApproval -+-> finalizeAsset (aprova, grava, debita) -> END
 *                           +-> END (rejeita, sem débito)
 *
 * `interrupt()` em humanApproval pausa o thread; o retorno do grafo vem com
 * status de interrupção e o estado persistido no checkpointer.
 */
export function buildStudioGraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(OrganicStudioState)
    .addNode("brandContext", brandContextNode)
    .addNode("researchSeoGeo", researchSeoGeoNode)
    .addNode("banditSelector", banditSelectorNode)
    .addNode("contentGenerator", contentGeneratorNode)
    .addNode("complianceGuardrail", complianceGuardrailNode)
    .addNode("visualRender", visualRenderNode)
    .addNode("humanApproval", humanApprovalNode)
    .addNode("finalizeAsset", finalizeAssetNode)
    .addNode("failed", failedNode)
    .addEdge(START, "brandContext")
    .addConditionalEdges("brandContext", shouldResearch, {
      research: "researchSeoGeo",
      bandit: "banditSelector",
    })
    .addEdge("researchSeoGeo", "banditSelector")
    .addEdge("banditSelector", "contentGenerator")
    .addEdge("contentGenerator", "complianceGuardrail")
    .addConditionalEdges("complianceGuardrail", routeAfterCompliance, {
      visualRender: "visualRender",
      contentGenerator: "contentGenerator",
      failed: "failed",
    })
    .addEdge("visualRender", "humanApproval")
    .addConditionalEdges("humanApproval", routeAfterApproval, {
      finalizeAsset: "finalizeAsset",
      [END]: END,
    })
    .addEdge("finalizeAsset", END)
    .addEdge("failed", END);

  return workflow.compile({
    checkpointer: checkpointer ?? getCheckpointer(),
  });
}

export type StudioGraph = ReturnType<typeof buildStudioGraph>;

let compiled: StudioGraph | null = null;

/** Grafo compilado com o checkpointer do ambiente (memoizado por processo). */
export function getStudioGraph(): StudioGraph {
  if (!compiled) {
    compiled = buildStudioGraph();
  }
  return compiled;
}

/** Somente para testes/hot-reload. */
export function resetStudioGraph(): void {
  compiled = null;
}
