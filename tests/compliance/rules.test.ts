import { describe, expect, it } from "vitest";

import {
  requiresTransparencyLabel,
  runDeterministicComplianceCheck,
  type DeterministicComplianceResult,
} from "@/lib/compliance/rules";
import { describeComplianceRule, suggestComplianceRewrite } from "@/lib/compliance/rewrite";
import type { ToneOfVoice } from "@/types/domain";

const CLEAN_TONE: ToneOfVoice = {};

function check(text: string, tone: ToneOfVoice = CLEAN_TONE): DeterministicComplianceResult {
  return runDeterministicComplianceCheck({ text, assetType: "geo_article", tone });
}

function expectBlocker(text: string, rule: string): void {
  const result = check(text);
  expect(result.approved).toBe(false);
  expect(
    result.violations.some(
      (violation) => violation.rule === rule && violation.severity === "blocker",
    ),
  ).toBe(true);
}

describe("bloqueadores CONAR/publicidade", () => {
  it("promessa absoluta de cura", () => {
    expectBlocker("Esse suplemento é a cura para a diabetes.", "medical_absolute_promise");
  });

  it("promessa de eliminar a doença", () => {
    expectBlocker("O tratamento elimina a doença em 30 dias.", "medical_absolute_promise");
  });

  it("garantia de emagrecimento com quilos", () => {
    expectBlocker("Tratamento garantido para emagrecer 10 kg.", "medical_absolute_promise");
  });

  it("lucro garantido / sem risco", () => {
    expectBlocker("Investimento com lucro garantido e sem risco.", "financial_guarantee");
  });

  it("ganhe dinheiro fácil", () => {
    expectBlocker("Ganhe dinheiro fácil trabalhando de casa.", "easy_money");
  });

  it("renda garantida", () => {
    expectBlocker("Tenha renda garantida todos os meses.", "easy_money");
  });

  it("antes e depois médico", () => {
    expectBlocker("Veja o antes e depois médico da paciente.", "medical_before_after");
  });

  it("aprovação ANVISA sem fonte", () => {
    expectBlocker("Produto aprovado pela ANVISA.", "anvisa_unverified");
  });

  it("urgência fabricada sem contexto", () => {
    expectBlocker("Últimas vagas para a turma!", "fabricated_urgency");
  });

  it("superlativo absoluto sem prova", () => {
    expectBlocker("Somos o melhor do mundo em conteúdo.", "absolute_superlative");
  });

  it("testemunho com resultado atípico como típico", () => {
    expectBlocker("Cliente perdeu 20 kg em 2 semanas.", "atypical_testimonial");
  });

  it("clonagem de voz e avatar falante", () => {
    expectBlocker("Usamos clonagem de voz e avatar falante.", "forbidden_synthetic_media");
  });

  it("agrega múltiplos bloqueadores e reprova o ativo", () => {
    const result = check(
      "Ganhe dinheiro fácil com lucro garantido. Produto aprovado pela ANVISA, o melhor do mundo.",
    );

    expect(result.approved).toBe(false);
    const rules = result.violations.map((violation) => violation.rule);
    expect(rules).toContain("easy_money");
    expect(rules).toContain("financial_guarantee");
    expect(rules).toContain("anvisa_unverified");
    expect(rules).toContain("absolute_superlative");
    expect(result.violations.every((violation) => violation.excerpt.length > 0)).toBe(true);
  });
});

describe("avisos (não bloqueiam)", () => {
  it("saúde sem disclaimer", () => {
    const result = check("Este tratamento clínico melhora a saúde da pele.");
    expect(result.approved).toBe(true);
    expect(
      result.violations.some(
        (violation) =>
          violation.rule === "health_disclaimer_missing" && violation.severity === "warning",
      ),
    ).toBe(true);
  });

  it("finanças sem disclaimer", () => {
    const result = check("Invista no fundo X e acompanhe a rentabilidade.");
    expect(result.approved).toBe(true);
    expect(
      result.violations.some(
        (violation) =>
          violation.rule === "finance_disclaimer_missing" && violation.severity === "warning",
      ),
    ).toBe(true);
  });

  it("grátis sem condição", () => {
    const result = check("Grátis para novos clientes.");
    expect(result.approved).toBe(true);
    expect(
      result.violations.some((violation) => violation.rule === "free_without_condition"),
    ).toBe(true);
  });

  it("promessa de prazo", () => {
    const result = check("Resultados em 7 dias.");
    expect(result.approved).toBe(true);
    expect(result.violations.some((violation) => violation.rule === "deadline_promise")).toBe(true);
  });

  it("disclaimer de saúde evita o aviso", () => {
    const result = check(
      "Conteúdo educativo sobre saúde. Consulte um médico antes de iniciar qualquer tratamento.",
    );
    expect(result.violations.some((violation) => violation.rule === "health_disclaimer_missing")).toBe(
      false,
    );
  });
});

describe("texto limpo e tom de voz", () => {
  it("aprova texto sem violações", () => {
    const result = check(
      "A BrandPulse publicou um guia sobre conteúdo orgânico e boas práticas de SEO. O material está disponível no site da marca.",
    );

    expect(result.approved).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("sinaliza termo evitado pelo tom de voz", () => {
    const result = check("Buscamos sinergia total entre as equipes.", {
      avoid: ["sinergia"],
    });

    expect(result.approved).toBe(true);
    expect(result.violations).toEqual([
      expect.objectContaining({ rule: "tone_avoid_term", severity: "warning" }),
    ]);
  });

  it("preserva acentos no excerto", () => {
    const result = check("Esse produto é a cura definitiva.");
    const violation = result.violations.find(
      (item) => item.rule === "medical_absolute_promise",
    );
    expect(violation?.excerpt.toLowerCase()).toContain("cura");
  });
});

describe("requiresTransparencyLabel", () => {
  it("exige rótulo em criativo único e carrossel híbrido com imagem sintética", () => {
    expect(requiresTransparencyLabel({ hasAiImagery: true, assetType: "single_creative" })).toBe(
      true,
    );
    expect(requiresTransparencyLabel({ hasAiImagery: true, assetType: "hybrid_carousel" })).toBe(
      true,
    );
  });

  it("não exige sem imagem sintética ou em formatos não fotorrealistas", () => {
    expect(requiresTransparencyLabel({ hasAiImagery: false, assetType: "single_creative" })).toBe(
      false,
    );
    expect(requiresTransparencyLabel({ hasAiImagery: true, assetType: "typo_carousel" })).toBe(
      false,
    );
    expect(requiresTransparencyLabel({ hasAiImagery: true, assetType: "geo_article" })).toBe(false);
  });
});

describe("suggestComplianceRewrite & describeComplianceRule", () => {
  it("sempre produz sugestão distinta do trecho original para regras determinísticas e do LLM em PT-BR", () => {
    const cases: [string, string][] = [
      ["24h", "unverified_number"],
      ["3x mais clientes", "afirmação numérica sem fonte declarada"],
      ["R$ 150 de economia", "afirmação numérica sem fonte declarada"],
      ["Resultados em 7 dias.", "deadline_promise"],
      ["Somos o melhor do mundo em marketing.", "superlativo absoluto sem prova"],
      ["Atendimento garantido sem risco.", "promessa absoluta de resultado"],
      ["tratamento clínico", "health_disclaimer_missing"],
      ["Grátis", "free_without_condition"],
      ["Solução exclusiva para você", "superlativo absoluto"],
    ];

    for (const [excerpt, rule] of cases) {
      const suggested = suggestComplianceRewrite(excerpt, rule);
      expect(suggested.length).toBeGreaterThan(0);
      expect(suggested.trim().toLowerCase()).not.toBe(excerpt.trim().toLowerCase());
      expect(describeComplianceRule(rule).length).toBeGreaterThan(10);
    }
  });
});
