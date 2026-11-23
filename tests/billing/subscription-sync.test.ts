import { describe, expect, it } from "vitest";
import {
  buildSubscriptionRow,
  derivePlanTier,
  mapMpStatus,
  nextDaytimeBillingWindow,
  parseTenantFromExternalReference,
  toNextBillingDate,
  type MpPreapprovalSnapshot,
} from "@/lib/billing/subscription-sync";
import { PLANS } from "@/lib/pricing";

/**
 * Regras puras da sincronização de assinatura: janela diurna de cobrança e
 * mapeamento de status/plano do Mercado Pago para o modelo interno.
 */

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

/** Formata um instante no fuso de cobrança (para asserções legíveis). */
function formatInSaoPaulo(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hourCycle: "h23",
    ...options,
  }).format(date);
}

describe("nextDaytimeBillingWindow", () => {
  it("move 22h BRT para o dia seguinte às 08h BRT", () => {
    const night = new Date("2026-03-10T22:00:00-03:00");
    const next = nextDaytimeBillingWindow(night);

    expect(next.toISOString()).toBe("2026-03-11T11:00:00.000Z");
    expect(formatInSaoPaulo(next, { day: "2-digit", month: "2-digit", year: "numeric" })).toBe(
      "2026-03-11",
    );
    expect(formatInSaoPaulo(next, { hour: "2-digit", minute: "2-digit" })).toBe("08:00");
  });

  it("move 20h30 BRT para o dia seguinte às 08h BRT (janela noturna 20h–06h)", () => {
    const next = nextDaytimeBillingWindow(new Date("2026-03-10T20:30:00-03:00"));

    expect(next.toISOString()).toBe("2026-03-11T11:00:00.000Z");
  });

  it("move 18h00 BRT para o dia seguinte às 08h BRT (fim da janela é exclusivo)", () => {
    const next = nextDaytimeBillingWindow(new Date("2026-03-10T18:00:00-03:00"));

    expect(next.toISOString()).toBe("2026-03-11T11:00:00.000Z");
  });

  it("mantém 10h BRT no mesmo instante (já está na janela)", () => {
    const inside = new Date("2026-03-10T10:00:00-03:00");

    expect(nextDaytimeBillingWindow(inside).toISOString()).toBe(inside.toISOString());
  });

  it("mantém 08h00 BRT exatamente no início da janela", () => {
    const start = new Date("2026-03-10T08:00:00-03:00");

    expect(nextDaytimeBillingWindow(start).toISOString()).toBe(start.toISOString());
  });

  it("move a madrugada (07h30 BRT) para as 08h do MESMO dia", () => {
    const next = nextDaytimeBillingWindow(new Date("2026-03-10T07:30:00-03:00"));

    expect(next.toISOString()).toBe("2026-03-10T11:00:00.000Z");
    expect(formatInSaoPaulo(next, { hour: "2-digit", minute: "2-digit" })).toBe("08:00");
  });

  it("atravessa a virada de mês corretamente", () => {
    const next = nextDaytimeBillingWindow(new Date("2026-03-31T23:10:00-03:00"));

    expect(next.toISOString()).toBe("2026-04-01T11:00:00.000Z");
  });

  it("rejeita data inválida", () => {
    expect(() => nextDaytimeBillingWindow(new Date(Number.NaN))).toThrow(/Data inválida/);
  });
});

describe("mapMpStatus", () => {
  it("mapeia os status conhecidos do Mercado Pago", () => {
    expect(mapMpStatus("authorized")).toBe("active");
    expect(mapMpStatus("pending")).toBe("pending");
    expect(mapMpStatus("paused")).toBe("paused");
    expect(mapMpStatus("cancelled")).toBe("cancelled");
    expect(mapMpStatus("canceled")).toBe("cancelled");
    expect(mapMpStatus("finished")).toBe("cancelled");
  });

  it("normaliza caixa e espaços", () => {
    expect(mapMpStatus("  AUTHORIZED ")).toBe("active");
  });

  it("status desconhecido ou ausente vira unknown", () => {
    expect(mapMpStatus("weird_status")).toBe("unknown");
    expect(mapMpStatus("")).toBe("unknown");
    expect(mapMpStatus(null)).toBe("unknown");
    expect(mapMpStatus(undefined)).toBe("unknown");
  });
});

describe("parseTenantFromExternalReference", () => {
  it("extrai o tenantId do formato simples", () => {
    expect(parseTenantFromExternalReference(TENANT_ID)).toEqual({
      tenantId: TENANT_ID,
      planHint: null,
      couponCode: null,
    });
  });

  it("extrai tenantId + plano do formato composto", () => {
    expect(parseTenantFromExternalReference(`${TENANT_ID}:agency`)).toEqual({
      tenantId: TENANT_ID,
      planHint: "agency",
      couponCode: null,
    });
  });

  it("extrai o cupom do external_reference (normalizado em maiúsculas)", () => {
    expect(parseTenantFromExternalReference(`${TENANT_ID}:pro:kite-abc123`)).toEqual({
      tenantId: TENANT_ID,
      planHint: "pro",
      couponCode: "KITE-ABC123",
    });
  });

  it("rejeita referência sem UUID de tenant", () => {
    expect(parseTenantFromExternalReference("tenant-errado")).toBeNull();
    expect(parseTenantFromExternalReference("")).toBeNull();
    expect(parseTenantFromExternalReference(null)).toBeNull();
  });
});

describe("derivePlanTier", () => {
  it("usa o hint do external_reference quando presente", () => {
    const preapproval: MpPreapprovalSnapshot = {
      id: "pre-1",
      external_reference: `${TENANT_ID}:agency`,
      auto_recurring: { transaction_amount: PLANS.essential.priceCents / 100 },
    };

    expect(derivePlanTier(preapproval, "agency")).toBe("agency");
  });

  it("casa o valor recorrente com o preço do plano", () => {
    expect(
      derivePlanTier({
        auto_recurring: { transaction_amount: PLANS.pro.priceCents / 100 },
      }),
    ).toBe("pro");
  });

  it("cai para o nome do plano no reason quando o valor não bate", () => {
    expect(
      derivePlanTier({
        auto_recurring: { transaction_amount: 1 },
        reason: "BrandPulse Organic & GEO Studio - Plano Agência Escala",
      }),
    ).toBe("agency");
  });

  it("lança quando não há informação suficiente", () => {
    expect(() => derivePlanTier({ auto_recurring: { transaction_amount: 3.33 } })).toThrow(
      /Não foi possível identificar o plano/,
    );
  });
});

describe("buildSubscriptionRow", () => {
  it("monta a linha de cartão com status mapeado e data na janela diurna", () => {
    const row = buildSubscriptionRow({
      id: "pre-card-1",
      status: "authorized",
      external_reference: TENANT_ID,
      reason: "BrandPulse Organic & GEO Studio - Plano Crescimento Pro",
      auto_recurring: { transaction_amount: PLANS.pro.priceCents / 100, currency_id: "BRL" },
      next_payment_date: "2026-03-10T22:00:00-03:00",
      payment_method_id: null,
    });

    expect(row).toEqual({
      tenant_id: TENANT_ID,
      mp_preapproval_id: "pre-card-1",
      payment_method: "card_preapproval",
      plan_tier: "pro",
      status: "active",
      next_billing_date: "2026-03-11T11:00:00.000Z",
      amount_cents: PLANS.pro.priceCents,
    });
  });

  it("detecta Pix Automático pelo payment_method_id e mantém status pending", () => {
    const row = buildSubscriptionRow({
      id: "pre-pix-1",
      status: "pending",
      external_reference: TENANT_ID,
      auto_recurring: { transaction_amount: PLANS.essential.priceCents / 100 },
      payment_method_id: "pix",
      next_payment_date: null,
    });

    expect(row.payment_method).toBe("pix_automatico");
    expect(row.status).toBe("pending");
    expect(row.plan_tier).toBe("essential");
    expect(row.next_billing_date).toBeNull();
  });

  it("respeita o plano informado explicitamente (evita inferência por valor)", () => {
    const row = buildSubscriptionRow(
      {
        id: "pre-3",
        status: "authorized",
        external_reference: TENANT_ID,
        auto_recurring: { transaction_amount: 0.01 },
      },
      { planTier: "agency", paymentMethod: "card_preapproval" },
    );

    expect(row.plan_tier).toBe("agency");
    expect(row.amount_cents).toBe(1);
  });

  it("mantém amount_cents nulo quando o MP não informa o valor", () => {
    const row = buildSubscriptionRow({
      id: "pre-sem-valor",
      status: "pending",
      external_reference: `${TENANT_ID}:essential`,
    });

    expect(row.amount_cents).toBeNull();
  });

  it("lança quando o PreApproval não tem id", () => {
    expect(() => buildSubscriptionRow({ external_reference: TENANT_ID })).toThrow(/sem id/);
  });

  it("lança quando o external_reference não identifica um tenant", () => {
    expect(() =>
      buildSubscriptionRow({
        id: "pre-x",
        external_reference: "sem-tenant",
        auto_recurring: { transaction_amount: PLANS.pro.priceCents / 100 },
      }),
    ).toThrow(/external_reference/);
  });
});

describe("toNextBillingDate", () => {
  it("normaliza para a próxima janela diurna em UTC", () => {
    expect(toNextBillingDate("2026-03-10T23:30:00-03:00")).toBe("2026-03-11T11:00:00.000Z");
  });

  it("devolve null para data ausente ou inválida", () => {
    expect(toNextBillingDate(null)).toBeNull();
    expect(toNextBillingDate("")).toBeNull();
    expect(toNextBillingDate("amanhã")).toBeNull();
  });
});
