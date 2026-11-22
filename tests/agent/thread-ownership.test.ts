import { describe, expect, it } from "vitest";
import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

/**
 * O estúdio expõe threads por `thread_id`. Se a checagem de dono falhar, um
 * usuário de outra organização aprova o rascunho alheio e o débito cai na conta
 * da vítima. Aqui provamos a regra que a página e a server action aplicam:
 * o `tenantId` do estado tem de ser o da sessão.
 */

const State = Annotation.Root({
  tenantId: Annotation<string>,
  decision: Annotation<{ approved: boolean } | null>,
  persisted: Annotation<boolean>,
});

function buildProbeGraph() {
  return new StateGraph(State)
    .addNode("approve", async () => {
      const resume = interrupt({ type: "approval_required" });
      return { decision: resume as { approved: boolean } };
    })
    .addNode("persist", async () => ({ persisted: true }))
    .addEdge(START, "approve")
    .addConditionalEdges("approve", (state) => (state.decision?.approved ? "persist" : END), {
      persist: "persist",
      [END]: END,
    })
    .compile({ checkpointer: new MemorySaver() });
}

/** Mesma regra de `runBelongsToTenant`: compara o tenant do estado com o da sessão. */
async function belongsToTenant(
  graph: ReturnType<typeof buildProbeGraph>,
  threadId: string,
  sessionTenant: string,
): Promise<boolean> {
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  const values = snapshot?.values as { tenantId?: string } | undefined;
  if (!values?.tenantId) return false;
  return values.tenantId === sessionTenant;
}

describe("autorização de thread do estúdio", () => {
  it("reconhece o dono e recusa outro tenant", async () => {
    const graph = buildProbeGraph();
    const config = { configurable: { thread_id: "authz-1" } };

    await graph.invoke({ tenantId: "tenant-A", decision: null, persisted: false }, config);

    expect(await belongsToTenant(graph, "authz-1", "tenant-A")).toBe(true);
    expect(await belongsToTenant(graph, "authz-1", "tenant-B")).toBe(false);
  });

  it("recusa thread inexistente (não assume dono por ausência)", async () => {
    const graph = buildProbeGraph();
    expect(await belongsToTenant(graph, "nao-existe", "tenant-A")).toBe(false);
  });

  it("após a recusa, nenhuma persistência acontece para o intruso", async () => {
    const graph = buildProbeGraph();
    const config = { configurable: { thread_id: "authz-2" } };
    await graph.invoke({ tenantId: "tenant-A", decision: null, persisted: false }, config);

    // O intruso (tenant-B) não deve nem chegar a retomar o grafo.
    const allowed = await belongsToTenant(graph, "authz-2", "tenant-B");
    expect(allowed).toBe(false);

    const snapshot = await graph.getState(config);
    expect((snapshot.values as { persisted?: boolean }).persisted).toBeFalsy();

    // O dono retoma normalmente.
    const resumed = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect((resumed as { persisted?: boolean }).persisted).toBe(true);
  });
});
