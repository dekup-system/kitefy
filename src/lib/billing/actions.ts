"use server";

import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import { createPlanCheckout } from "@/lib/billing/plan-checkout";
import { createLogger } from "@/lib/logger";
import type { PlanTier } from "@/types/domain";

const log = createLogger("billing.actions");

const TIERS: PlanTier[] = ["essential", "pro", "agency"];

/**
 * Botão "Assinar": cria o plano no Mercado Pago e manda o cliente para o
 * checkout hospedado — onde ele escolhe (ou cria) a conta que quiser.
 */
export async function subscribeToPlanAction(formData: FormData): Promise<void> {
  const session = await requireSessionContext();
  const tierRaw = String(formData.get("tier") ?? "");
  const tier = TIERS.find((item) => item === tierRaw);

  if (!tier) {
    redirect("/settings/billing?mp=erro");
  }

  try {
    const checkout = await createPlanCheckout({
      tenantId: session.tenantId,
      tier,
      appUrl: getPublicEnv().appUrl,
    });
    redirect(checkout.initPoint);
  } catch (error) {
    // `redirect` lança internamente: só tratamos falha real da criação.
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    log.warn("Falha ao iniciar assinatura", {
      tier,
      message: error instanceof Error ? error.message : "erro",
    });
    redirect("/settings/billing?mp=erro");
  }
}
