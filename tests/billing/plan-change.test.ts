import { describe, expect, it } from "vitest";
import {
  isActiveSubscription,
  planRank,
  resolvePlanChange,
} from "@/lib/billing/plan-change";

/**
 * Regra de renovação/upgrade do painel: nada de cobrança dupla.
 * Estes testes cobrem a matriz de decisão que a server action usa antes de
 * tocar no Mercado Pago.
 */
describe("resolvePlanChange", () => {
  it("não faz nada quando o plano atual já está ativo", () => {
    const decision = resolvePlanChange({
      currentTier: "pro",
      targetTier: "pro",
      subscriptionStatus: "active",
    });

    expect(decision.kind).toBe("current");
    expect(decision.requiresCancellation).toBe(false);
    expect(decision.label).toBe("Plano atual");
  });

  it("renova o mesmo plano quando a assinatura não está ativa", () => {
    const decision = resolvePlanChange({
      currentTier: "essential",
      targetTier: "essential",
      subscriptionStatus: "cancelled",
    });

    expect(decision.kind).toBe("renew");
    expect(decision.requiresCancellation).toBe(false);
    expect(decision.label).toContain("Renovar");
  });

  it("upgrade com assinatura ativa exige cancelar a anterior", () => {
    const decision = resolvePlanChange({
      currentTier: "essential",
      targetTier: "agency",
      subscriptionStatus: "active",
    });

    expect(decision.kind).toBe("upgrade");
    expect(decision.requiresCancellation).toBe(true);
    expect(decision.label).toContain("Agência Escala");
  });

  it("downgrade com assinatura ativa também exige cancelamento", () => {
    const decision = resolvePlanChange({
      currentTier: "agency",
      targetTier: "pro",
      subscriptionStatus: "active",
    });

    expect(decision.kind).toBe("downgrade");
    expect(decision.requiresCancellation).toBe(true);
  });

  it("assinar outro plano sem assinatura ativa não cancela nada", () => {
    const decision = resolvePlanChange({
      currentTier: "essential",
      targetTier: "pro",
      subscriptionStatus: null,
    });

    expect(decision.kind).toBe("subscribe");
    expect(decision.requiresCancellation).toBe(false);
  });

  it.each(["pending", "paused", "cancelled", "unknown", null, undefined] as const)(
    "status %s não é tratado como assinatura ativa",
    (status) => {
      expect(isActiveSubscription(status)).toBe(false);
      const decision = resolvePlanChange({
        currentTier: "essential",
        targetTier: "pro",
        subscriptionStatus: status,
      });
      expect(decision.requiresCancellation).toBe(false);
    },
  );

  it("ordena os planos do menor para o maior", () => {
    expect(planRank("essential")).toBeLessThan(planRank("pro"));
    expect(planRank("pro")).toBeLessThan(planRank("agency"));
  });

  it("mantém o plano alvo na decisão (o servidor confia no tier validado)", () => {
    const decision = resolvePlanChange({
      currentTier: "pro",
      targetTier: "agency",
      subscriptionStatus: "active",
    });
    expect(decision.targetTier).toBe("agency");
  });
});
