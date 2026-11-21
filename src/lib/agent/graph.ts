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
    .addNode("loadBrandContext", brandContextNode)
    .addNode("researchSerp", researchSeoGeoNode)
    .addNode("selectArms", banditSelectorNode)
    .addNode("generateContent", contentGeneratorNode)
    .addNode("checkCompliance", complianceGuardrailNode)
    .addNode("renderVisuals", visualRenderNode)
    .addNode("awaitApproval", humanApprovalNode)
    .addNode("persistAsset", finalizeAssetNode)
    .addNode("failRun", failedNode)
    .addEdge(START, "loadBrandContext")
    .addConditionalEdges("loadBrandContext", shouldResearch, {
      research: "researchSerp",
      bandit: "selectArms",
    })
    .addEdge("researchSerp", "selectArms")
    .addEdge("selectArms", "generateContent")
    .addEdge("generateContent", "checkCompliance")
    .addConditionalEdges("checkCompliance", routeAfterCompliance, {
      renderVisuals: "renderVisuals",
      generateContent: "generateContent",
      failRun: "failRun",
    })
    .addEdge("renderVisuals", "awaitApproval")
    .addConditionalEdges("awaitApproval", routeAfterApproval, {
      persistAsset: "persistAsset",
      [END]: END,
    })
    .addEdge("persistAsset", END)
    .addEdge("failRun", END);

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
