import type { AssetType, BrandContext, ComplianceReport, ContentPayload } from "@/types/domain";
import { flattenPayloadText, reviewWithGuardrailModel } from "@/lib/ai/generate";
import { requiresTransparencyLabel, runDeterministicComplianceCheck } from "@/lib/compliance/rules";
import { createLogger } from "@/lib/logger";

/**
 * Guardrail de conformidade: determinístico primeiro (barreira dura),
 * LLM leve depois (camada de sensibilidade).
 *
 * O nó nunca "conserta" o conteúdo: ele reporta. Quem decide repetir é o grafo.
 */

const log = createLogger("agent.compliance");

export interface ComplianceEvaluationInput {
  payload: ContentPayload;
  assetType: AssetType;
  tone: BrandContext["tone_of_voice"];
  hasAiImagery: boolean;
}

export async function evaluateCompliance(
  input: ComplianceEvaluationInput,
): Promise<{ report: ComplianceReport; usage: Awaited<ReturnType<typeof reviewWithGuardrailModel>>["usage"] }> {
  const text = flattenPayloadText(input.payload);

  const deterministic = runDeterministicComplianceCheck({
    text,
    assetType: input.assetType,
    tone: input.tone,
  });

  const llm = await reviewWithGuardrailModel({ text, assetType: input.assetType });

  // O filtro determinístico (rules.ts) é a barreira dura contra ilegalidades
  // literais (cura falsa, lucro garantido, ANVISA, clonagem de voz).
  // A camada LLM atua como consultoria de sensibilidade (Recomendação CONAR com
  // reescrita pronta em 1 clique), evitando falsos positivos que abortariam o carrossel.
  const isHardPolicyLlm = (rule: string, excerpt: string) =>
    /avatar|clonagem\s+de\s+voz|lip[\s-]?sync|\btts\b/i.test(`${rule} ${excerpt}`);

  const violations: ComplianceReport["violations"] = [
    ...deterministic.violations.map((violation) => ({
      rule: violation.rule,
      excerpt: violation.excerpt,
      severity: violation.severity,
    })),
    ...llm.violations.map((violation) => ({
      rule: violation.rule,
      excerpt: violation.excerpt,
      severity: isHardPolicyLlm(violation.rule, violation.excerpt)
        ? ("blocker" as const)
        : ("warning" as const),
      ...(violation.suggestion ? { suggestion: violation.suggestion } : {}),
    })),
  ];

  // Deduplica por regra+trecho (determinístico e LLM costumam concordar).
  const unique = new Map<string, (typeof violations)[number]>();
  for (const violation of violations) {
    unique.set(`${violation.rule}::${violation.excerpt.slice(0, 60)}`, violation);
  }

  const merged = [...unique.values()];
  const blockers = merged.filter((violation) => violation.severity === "blocker");
  const approved = blockers.length === 0;

  const report: ComplianceReport = {
    approved,
    violations: merged,
    checked_at: new Date().toISOString(),
    reviewer: llm.violations.length > 0 ? "llm" : "deterministic",
    requires_transparency_label: requiresTransparencyLabel({
      hasAiImagery: input.hasAiImagery,
      assetType: input.assetType,
    }),
  };

  if (!approved) {
    log.warn("Conteúdo reprovado no guardrail", {
      assetType: input.assetType,
      blockers: blockers.length,
      rules: blockers.slice(0, 5).map((violation) => violation.rule),
    });
  }

  return { report, usage: llm.usage };
}

/** Mensagem objetiva para a retentativa do gerador. */
export function buildRetryFeedback(report: ComplianceReport): string[] {
  return report.violations
    .filter((violation) => violation.severity === "blocker")
    .slice(0, 6)
    .map((violation) => `${violation.rule}: "${violation.excerpt.slice(0, 120)}"`);
}
