import { describe, expect, it } from "vitest";
import { runDeterministicComplianceCheck } from "@/lib/compliance/rules";

/**
 * Precisão do guardrail em contexto de saúde.
 *
 * Regressão encontrada no e2e real: "Registre o número antes e depois" (métrica
 * de conteúdo) era bloqueado só porque a marca é uma clínica. Bloqueador falso
 * positivo custa retentativa de LLM e frustra o usuário — a regra precisa de
 * contexto de RESULTADO colado à expressão.
 */
const tone = { descriptors: ["direto"] };

function check(text: string) {
  return runDeterministicComplianceCheck({ text, assetType: "typo_carousel", tone });
}

describe("medical_before_after — precisão", () => {
  it("não bloqueia métrica de conteúdo em marca de saúde", () => {
    const result = check(
      "Clínica Aurora: compare o número antes e depois para ver se o gancho retém mais atenção.",
    );
    expect(result.violations.filter((v) => v.rule === "medical_before_after")).toHaveLength(0);
  });

  it("não bloqueia 'antes e depois' isolado em texto não médico", () => {
    const result = check("Rode o teste antes e depois da troca de título para comparar.");
    expect(result.violations.filter((v) => v.rule === "medical_before_after")).toHaveLength(0);
  });

  it("bloqueia foto de resultado antes e depois em contexto médico", () => {
    const result = check("Veja as fotos do antes e depois da paciente após o tratamento de pele.");
    expect(result.violations.some((v) => v.rule === "medical_before_after" && v.severity === "blocker")).toBe(true);
  });

  it("bloqueia resultado antes e depois colado a termo clínico", () => {
    const result = check("Confira o resultado antes e depois do procedimento no corpo da paciente.");
    expect(result.violations.some((v) => v.rule === "medical_before_after")).toBe(true);
  });

  it("exige contexto médico para aplicar a regra", () => {
    const result = check("Resultado antes e depois da campanha de mídia paga no trimestre.");
    expect(result.violations.filter((v) => v.rule === "medical_before_after")).toHaveLength(0);
  });
});
