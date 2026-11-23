import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { checkCouponUsability, describeCouponIssue, normalizeCouponCode } from "./coupons";
import type { DiscountCouponRow } from "@/types/domain";

/**
 * Acesso a cupons com service_role (a tabela não tem policy para `authenticated`).
 * O código nunca é validado no cliente: qualquer desconto passa por aqui e pelo
 * valor enviado ao Mercado Pago no servidor.
 */

const log = createLogger("billing.coupon-store");

const COUPON_COLUMNS =
  "id, code, percent_off, max_redemptions, times_redeemed, valid_until, active, note, created_by, created_at";

export type CouponLookup =
  | { ok: true; coupon: DiscountCouponRow }
  | { ok: false; error: string };

/** Busca e valida um cupom para uso imediato no checkout. */
export async function findUsableCoupon(rawCode: string): Promise<CouponLookup> {
  const code = normalizeCouponCode(rawCode);
  if (!code) {
    return { ok: false, error: "Cupom inválido. Use letras, números e hífen." };
  }

  try {
    const admin = createSupabaseAdminClient();
    const query = await admin
      .from("discount_coupons")
      .select(COUPON_COLUMNS)
      .eq("code", code)
      .maybeSingle<DiscountCouponRow>();

    if (query.error) {
      log.warn("Falha ao consultar cupom", { code, message: query.error.message });
      return { ok: false, error: "Não foi possível validar o cupom agora. Tente novamente." };
    }
    if (!query.data) {
      return { ok: false, error: "Cupom não encontrado." };
    }

    const usability = checkCouponUsability(query.data);
    if (!usability.ok) {
      return { ok: false, error: describeCouponIssue(usability.issue) };
    }

    return { ok: true, coupon: query.data };
  } catch (error) {
    log.warn("Cupom indisponível", {
      message: error instanceof Error ? error.message : "erro",
    });
    return { ok: false, error: "Não foi possível validar o cupom agora." };
  }
}

/**
 * Confirma o resgate quando a assinatura fica ativa.
 *
 * Idempotente por `preapproval_id` e transacional no Postgres (lock + contador).
 * Falha de cupom não pode invalidar a assinatura já autorizada no MP: apenas
 * logamos e seguimos.
 */
export async function confirmCouponRedemption(input: {
  code: string;
  tenantId: string;
  preapprovalId: string;
  amountCents: number | null;
}): Promise<void> {
  const code = normalizeCouponCode(input.code);
  if (!code) return;

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc("confirm_coupon_redemption", {
      p_code: code,
      p_tenant_id: input.tenantId,
      p_preapproval_id: input.preapprovalId,
      p_amount_cents: input.amountCents,
    });

    if (error) {
      log.warn("Falha ao confirmar resgate de cupom", {
        code,
        tenantId: input.tenantId,
        preapprovalId: input.preapprovalId,
        message: error.message,
      });
      return;
    }

    log.info("Cupom confirmado", {
      code,
      tenantId: input.tenantId,
      preapprovalId: input.preapprovalId,
    });
  } catch (error) {
    log.warn("Resgate de cupom indisponível", {
      code,
      message: error instanceof Error ? error.message : "erro",
    });
  }
}
