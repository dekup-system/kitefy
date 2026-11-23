import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import type { PlanTier } from "@/types/domain";

/**
 * Regra de troca de plano do painel do usuário (função pura).
 *
 * Motivo de existir: um upgrade não pode virar cobrança dupla. Quando já existe
 * assinatura ativa, o fluxo cria o checkout do novo plano e **cancela** o antigo
 * antes de mandar o cliente para o Mercado Pago. A decisão de quando cancelar
 * fica aqui, testada sem rede nem banco.
 *
 * O status é recebido como string porque vem direto do banco; `active` é o único
 * estado que representa cobrança recorrente em vigor.
 */

/**
 * Status vem direto do banco (`mp_subscriptions.status` é texto livre), por isso
 * o tipo é `string`: só o literal `"active"` representa cobrança em vigor.
 */
export type SubscriptionStatusLike = string | null | undefined;

export type PlanChangeKind = "current" | "renew" | "upgrade" | "downgrade" | "subscribe";

export interface PlanChangeDecision {
  kind: PlanChangeKind;
  /** `true` quando a assinatura antiga precisa ser cancelada no Mercado Pago. */
  requiresCancellation: boolean;
  targetTier: PlanTier;
  label: string;
  description: string;
}

export function isActiveSubscription(status: SubscriptionStatusLike): boolean {
  return status === "active";
}

/** Posição do plano na escada de preços (essencial < pro < agência). */
export function planRank(tier: PlanTier): number {
  return PLAN_ORDER.indexOf(tier);
}

/**
 * Decide o que fazer ao clicar em um plano no painel do usuário.
 *
 * - plano atual + assinatura ativa  → nada a fazer;
 * - plano atual + assinatura inativa → renovar (novo checkout do mesmo plano);
 * - outro plano + assinatura ativa  → upgrade/downgrade com cancelamento;
 * - outro plano + assinatura inativa → assinar direto.
 */
export function resolvePlanChange(input: {
  currentTier: PlanTier;
  targetTier: PlanTier;
  subscriptionStatus: SubscriptionStatusLike;
}): PlanChangeDecision {
  const { currentTier, targetTier, subscriptionStatus } = input;
  const active = isActiveSubscription(subscriptionStatus);
  const targetPlan = PLANS[targetTier];

  if (targetTier === currentTier && active) {
    return {
      kind: "current",
      requiresCancellation: false,
      targetTier,
      label: "Plano atual",
      description: "Sua assinatura está ativa e renova automaticamente na data da próxima cobrança.",
    };
  }

  if (targetTier === currentTier) {
    return {
      kind: "renew",
      requiresCancellation: false,
      targetTier,
      label: `Renovar ${targetPlan.name}`,
      description:
        "Sua assinatura não está ativa. Renove para voltar a receber os créditos do mês na aprovação.",
    };
  }

  if (!active) {
    return {
      kind: "subscribe",
      requiresCancellation: false,
      targetTier,
      label: `Assinar ${targetPlan.name}`,
      description:
        "Você autoriza o pagamento no Mercado Pago (com a conta que preferir) e os créditos entram na aprovação.",
    };
  }

  const direction: PlanChangeKind =
    planRank(targetTier) > planRank(currentTier) ? "upgrade" : "downgrade";

  return {
    kind: direction,
    requiresCancellation: true,
    targetTier,
    label: `Mudar para ${targetPlan.name}`,
    description:
      "A assinatura atual será encerrada no Mercado Pago e você autoriza o novo plano em seguida. Nenhuma cobrança é feita duas vezes.",
  };
}
