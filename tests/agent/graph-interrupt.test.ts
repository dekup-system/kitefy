import { describe, expect, it } from "vitest";
import { Command, END, START, StateGraph, interrupt, Annotation } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";

/**
 * Valida a semântica de interrupt()/Command({resume}) usada no nó de aprovação
 * humana, sem depender de banco nem de LLM.
 */

const ProbeState = Annotation.Root({
  step: Annotation<string>,
  decision: Annotation<{ approved: boolean; note?: string } | null>,
});

describe("Semântica de interrupt/resume do LangGraph", () => {
  it("pausa no nó, expõe o payload e retoma com o valor do Command", async () => {
    const graph = new StateGraph(ProbeState)
      .addNode("prepare", async () => ({ step: "ready" }))
      .addNode("approve", async () => {
        const resume = interrupt({ type: "approval_required", title: "Ativo" });
        return { decision: resume as { approved: boolean; note?: string } };
      })
      .addNode("finish", async (state) => ({ step: state.decision?.approved ? "done" : "rejected" }))
      .addEdge(START, "prepare")
      .addEdge("prepare", "approve")
      .addConditionalEdges("approve", (state) => (state.decision?.approved ? "finish" : END), {
        finish: "finish",
        [END]: END,
      })
      .compile({ checkpointer: new MemorySaver() });

    const config = { configurable: { thread_id: "probe-1" } };

    // Primeira execução: deve parar no interrupt.
    const first = await graph.invoke({ step: "init", decision: null }, config);
    expect(first.step).toBe("ready");

    const snapshot = await graph.getState(config);
    const interruptValue = snapshot.tasks?.flatMap((task) => task.interrupts ?? [])[0]?.value as
      | { type: string; title: string }
      | undefined;
    expect(interruptValue?.type).toBe("approval_required");
    expect(interruptValue?.title).toBe("Ativo");
    expect(snapshot.next).toContain("approve");

    // Retomada com aprovação.
    const resumed = await graph.invoke(new Command({ resume: { approved: true, note: "ok" } }), config);
    expect(resumed.step).toBe("done");
    expect(resumed.decision?.note).toBe("ok");
  });

  it("retomada com rejeição encerra sem seguir o caminho de persistência", async () => {
    const graph = new StateGraph(ProbeState)
      .addNode("approve", async () => {
        const resume = interrupt({ type: "approval_required" });
        return { decision: resume as { approved: boolean } };
      })
      .addNode("persist", async () => ({ step: "persisted" }))
      .addEdge(START, "approve")
      .addConditionalEdges("approve", (state) => (state.decision?.approved ? "persist" : END), {
        persist: "persist",
        [END]: END,
      })
      .compile({ checkpointer: new MemorySaver() });

    const config = { configurable: { thread_id: "probe-2" } };
    await graph.invoke({ step: "init", decision: null }, config);
    const resumed = await graph.invoke(new Command({ resume: { approved: false } }), config);

    expect(resumed.step).not.toBe("persisted");
    expect(resumed.decision?.approved).toBe(false);
  });
});
