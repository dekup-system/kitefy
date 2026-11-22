import { describe, expect, it } from "vitest";
import { runDeterministicComplianceCheck } from "@/lib/compliance/rules";

/**
 * Precisão de negação no guardrail.
 *
 * Regressão do e2e real: o aviso de transparência do próprio produto
 * ("não usamos clonagem de voz nem avatar falante") era bloqueado pela regra
 * forbidden_synthetic_media, inviabilizando todo short_script_kit em marca de
 * saúde. Disclaimer precisa passar; oferta real precisa bloquear.
 */
const tone = { descriptors: ["direto"] };

function check(text: string) {
  return runDeterministicComplianceCheck({ text, assetType: "short_script_kit", tone });
}

function rules(text: string): string[] {
  return check(text).violations.map((violation) => violation.rule);
}

describe("forbidden_synthetic_media — contexto negado", () => {
  it("não bloqueia o aviso de que não há clonagem de voz", () => {
    const result = check(
      "Grave com áudio próprio: o produto não usa TTS nem clonagem de voz. Não há clonagem de voz em nenhuma etapa.",
    );
    expect(result.approved).toBe(true);
    expect(rules("O produto não usa TTS nem clonagem de voz.")).not.toContain("forbidden_synthetic_media");
  });

  it("não bloqueia 'sem avatar falante' como restrição", () => {
    expect(rules("Sem avatar falante e sem lip-sync: a gravação é humana.")).not.toContain(
      "forbidden_synthetic_media",
    );
  });

  it("bloqueia oferta real de clonagem de voz", () => {
    expect(rules("Clonamos a voz do seu especialista em 24 horas.")).toContain(
      "forbidden_synthetic_media",
    );
  });

  it("bloqueia oferta de avatar falante", () => {
    expect(rules("Geramos avatar falante com sincronia labial para o seu perfil.")).toContain(
      "forbidden_synthetic_media",
    );
  });

  it("pega a segunda ocorrência quando a primeira está negada", () => {
    const result = check(
      "Não clonamos voz de ninguém. Mas geramos avatar falante para o seu perfil.",
    );
    expect(result.approved).toBe(false);
    expect(result.violations.some((violation) => violation.rule === "forbidden_synthetic_media")).toBe(
      true,
    );
  });
});

describe("promessas absolutas — disclaimer legítimo", () => {
  it("não bloqueia 'não prometemos resultado garantido'", () => {
    expect(rules("Não prometemos resultado garantido: o método depende de execução.")).not.toContain(
      "medical_absolute_promise",
    );
  });

  it("bloqueia a promessa quando afirmada", () => {
    expect(rules("Resultado garantido em 30 dias para todos os pacientes.")).toContain(
      "medical_absolute_promise",
    );
  });
});
