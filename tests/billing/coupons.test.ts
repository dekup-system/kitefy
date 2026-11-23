import { describe, expect, it } from "vitest";
import {
  COUPON_CODE_PATTERN,
  checkCouponUsability,
  computeDiscountedPriceCents,
  couponLabel,
  describeCouponIssue,
  generateCouponCode,
  normalizeCouponCode,
} from "@/lib/billing/coupons";

const BASE_COUPON = {
  active: true,
  valid_until: null,
  times_redeemed: 0,
  max_redemptions: 5,
} as const;

describe("normalizeCouponCode", () => {
  it("normaliza espaços e caixa", () => {
    expect(normalizeCouponCode("  kite-abc123 ")).toBe("KITE-ABC123");
    expect(normalizeCouponCode("ABCD")).toBe("ABCD");
  });

  it("rejeita códigos curtos, com espaço interno ou símbolos", () => {
    expect(normalizeCouponCode("AB")).toBeNull();
    expect(normalizeCouponCode("KITE ABC")).toBeNull();
    expect(normalizeCouponCode("KITE_123")).toBeNull();
    expect(normalizeCouponCode(null)).toBeNull();
  });
});

describe("computeDiscountedPriceCents", () => {
  it("aplica percentual arredondando para centavos", () => {
    expect(computeDiscountedPriceCents(4990, 20)).toBe(3992);
    expect(computeDiscountedPriceCents(11990, 50)).toBe(5995);
  });

  it("respeita o piso de R$ 1,00", () => {
    expect(computeDiscountedPriceCents(100, 90)).toBe(100);
    expect(computeDiscountedPriceCents(4990, 90)).toBe(499);
  });

  it("recusa preço e percentual inválidos", () => {
    expect(() => computeDiscountedPriceCents(0, 10)).toThrow(/Preço inválido/);
    expect(() => computeDiscountedPriceCents(4990, 0)).toThrow(/Percentual/);
    expect(() => computeDiscountedPriceCents(4990, 91)).toThrow(/Percentual/);
  });
});

describe("checkCouponUsability", () => {
  it("aceita cupom ativo dentro do limite", () => {
    expect(checkCouponUsability(BASE_COUPON)).toEqual({ ok: true });
  });

  it("recusa inativo, expirado e esgotado", () => {
    expect(checkCouponUsability({ ...BASE_COUPON, active: false })).toEqual({
      ok: false,
      issue: "inactive",
    });
    expect(
      checkCouponUsability(
        { ...BASE_COUPON, valid_until: "2026-01-01T00:00:00.000Z" },
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toEqual({ ok: false, issue: "expired" });
    expect(
      checkCouponUsability({ ...BASE_COUPON, times_redeemed: 5, max_redemptions: 5 }),
    ).toEqual({ ok: false, issue: "exhausted" });
  });

  it("aceita quando a validade ainda não chegou", () => {
    expect(
      checkCouponUsability(
        { ...BASE_COUPON, valid_until: "2026-02-01T00:00:00.000Z" },
        new Date("2026-01-31T23:59:59.000Z"),
      ),
    ).toEqual({ ok: true });
  });

  it("tem mensagem para cada motivo", () => {
    expect(describeCouponIssue("inactive")).toMatch(/desativado/);
    expect(describeCouponIssue("expired")).toMatch(/expirou/);
    expect(describeCouponIssue("exhausted")).toMatch(/limite/);
  });
});

describe("generateCouponCode", () => {
  it("gera código no formato aceito pelo banco", () => {
    const code = generateCouponCode();
    expect(code).toMatch(COUPON_CODE_PATTERN);
    expect(code.startsWith("KITE-")).toBe(true);
    expect(code).toHaveLength(11);
  });

  it("não repete na prática", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateCouponCode()));
    expect(codes.size).toBe(20);
  });
});

describe("couponLabel", () => {
  it("formata o desconto", () => {
    expect(couponLabel(20)).toBe("20% off");
  });
});
