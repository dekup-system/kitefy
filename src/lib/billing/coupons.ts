import { randomInt } from "node:crypto";
import type { DiscountCouponRow } from "@/types/domain";

/**
 * Regras puras de cupom de desconto (sem banco, testáveis).
 *
 * O cupom é percentual e vale para a assinatura recorrente inteira: o valor
 * descontado é enviado ao Mercado Pago na criação do plano, e o valor REAL
 * autorizado é gravado em `mp_subscriptions.amount_cents`.
 */

export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,31}$/;

/** Normaliza para maiúsculas e valida o formato. Inválido → `null`. */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return COUPON_CODE_PATTERN.test(code) ? code : null;
}

/** Preço com desconto, com piso de R$ 1,00 (o MP não aceita valor zero). */
export function computeDiscountedPriceCents(priceCents: number, percentOff: number): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    throw new Error("Preço inválido para aplicar cupom.");
  }
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90) {
    throw new Error("Percentual de desconto inválido.");
  }

  const discounted = Math.round((priceCents * (100 - percentOff)) / 100);
  return Math.max(100, discounted);
}

export type CouponIssue = "inactive" | "expired" | "exhausted";

export type CouponUsability = { ok: true } | { ok: false; issue: CouponIssue };

export function checkCouponUsability(
  coupon: Pick<DiscountCouponRow, "active" | "valid_until" | "times_redeemed" | "max_redemptions">,
  now = new Date(),
): CouponUsability {
  if (!coupon.active) return { ok: false, issue: "inactive" };

  if (coupon.valid_until) {
    const expiresAt = new Date(coupon.valid_until);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime()) {
      return { ok: false, issue: "expired" };
    }
  }

  if (coupon.times_redeemed >= coupon.max_redemptions) {
    return { ok: false, issue: "exhausted" };
  }

  return { ok: true };
}

export function describeCouponIssue(issue: CouponIssue): string {
  switch (issue) {
    case "inactive":
      return "Este cupom está desativado.";
    case "expired":
      return "Este cupom expirou.";
    case "exhausted":
      return "Este cupom atingiu o limite de usos.";
  }
}

/** Rótulo amigável para o desconto (ex.: "20% off"). */
export function couponLabel(percentOff: number): string {
  return `${percentOff}% off`;
}

/** Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para ditar o cupom por telefone. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Gera um código no formato `KITE-XXXXXX` (compatível com a constraint do banco). */
export function generateCouponCode(prefix = "KITE"): string {
  const safePrefix = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "KITE";
  let suffix = "";

  for (let index = 0; index < 6; index += 1) {
    suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }

  return `${safePrefix}-${suffix}`;
}
