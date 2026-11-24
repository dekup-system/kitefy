/**
 * Assinatura via Checkout Pro do Mercado Pago.
 *
 * Criamos um **plano** por contratação com `external_reference` = tenant. Assim
 * o cliente paga numa página do MP usando a conta que quiser (ou cria uma na
 * hora) e o webhook ainda consegue vincular a assinatura à conta certa.
 *
 * Diferente do checkout transparente, aqui não enviamos `payer_email`: era isso
 * que obrigava o pagador a ter uma conta MP com o mesmo e-mail do site.
 */

import { PLANS } from "@/lib/pricing";
import { normalizeCouponCode } from "@/lib/billing/coupons";
import type { PlanTier } from "@/types/domain";

const MP_API = "https://api.mercadopago.com";
const TIMEOUT_MS = 12_000;

export interface PlanCheckoutResult {
  initPoint: string;
  planId: string;
}

export interface PlanCheckoutInput {
  tenantId: string;
  tier: PlanTier;
  appUrl: string;
  /** Valor final em centavos (já com desconto). Default: preço do plano. */
  amountCents?: number;
  /** Cupom aplicado, embutido no external_reference para confirmação no webhook. */
  couponCode?: string | null;
}

export async function createPlanCheckout(input: PlanCheckoutInput): Promise<PlanCheckoutResult> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Mercado Pago não configurado: MP_ACCESS_TOKEN ausente.");
  }

  const plan = PLANS[input.tier];
  const amountCents = input.amountCents ?? plan.priceCents;

  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 10_000_000) {
    throw new Error("Valor do plano inválido para cobrança.");
  }

  const couponCode = normalizeCouponCode(input.couponCode ?? null);
  if (input.couponCode && !couponCode) {
    throw new Error("Cupom inválido para o checkout.");
  }

  const amount = amountCents / 100;
  const externalReference = couponCode
    ? `${input.tenantId}:${input.tier}:${couponCode}`
    : `${input.tenantId}:${input.tier}`;

  const response = await fetch(`${MP_API}/preapproval_plan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: couponCode ? `${plan.name} (cupom ${couponCode})` : plan.name,
      external_reference: externalReference,
      back_url: `${input.appUrl}/settings/billing?mp=retorno`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: amount,
        currency_id: "BRL",
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as {
    id?: string;
    init_point?: string;
    message?: string;
  } | null;

  if (!response.ok || !body?.init_point) {
    throw new Error(
      `Mercado Pago recusou a criação do plano (HTTP ${response.status})${body?.message ? `: ${body.message}` : ""}.`,
    );
  }

  return {
    initPoint: body.init_point,
    planId: body.id ?? "",
  };
}
