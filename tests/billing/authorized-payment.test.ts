import { describe, expect, it } from "vitest";
import {
  chargePeriod,
  isSettledRecurringCharge,
  mapAuthorizedPayment,
} from "@/lib/billing/authorized-payment";

/**
 * A cobrança recorrente é o único ponto em que crédito é concedido sem
 * aprovação humana. Por isso o mapeamento e o critério de "pago" são testados
 * isoladamente: erro aqui credita sem dinheiro ter entrado.
 */

const RAW = {
  id: 987654321,
  type: "recurring",
  status: "processed",
  preapproval_id: "c14068dfeca944e58026bd9c16b8d3ec",
  transaction_amount: 49.9,
  debit_date: "2026-12-22T20:00:58.000-04:00",
  payment: { id: 123456, status: "approved", status_detail: "accredited" },
};

describe("mapAuthorizedPayment", () => {
  it("extrai id, assinatura, valor e data", () => {
    const snapshot = mapAuthorizedPayment(RAW);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.id).toBe("987654321");
    expect(snapshot?.preapprovalId).toBe("c14068dfeca944e58026bd9c16b8d3ec");
    expect(snapshot?.amountCents).toBe(4990);
    expect(snapshot?.paymentStatus).toBe("approved");
    expect(snapshot?.debitDate).toBe("2026-12-22T20:00:58.000-04:00");
  });

  it("devolve null sem id", () => {
    expect(mapAuthorizedPayment({ status: "processed" })).toBeNull();
    expect(mapAuthorizedPayment(null)).toBeNull();
    expect(mapAuthorizedPayment("texto")).toBeNull();
  });

  it("tolera campos ausentes", () => {
    const snapshot = mapAuthorizedPayment({ id: 1 });
    expect(snapshot?.preapprovalId).toBeNull();
    expect(snapshot?.amountCents).toBeNull();
    expect(snapshot?.paymentStatus).toBeNull();
  });
});

describe("isSettledRecurringCharge", () => {
  it("aceita pagamento aprovado", () => {
    const snapshot = mapAuthorizedPayment(RAW);
    expect(snapshot && isSettledRecurringCharge(snapshot)).toBe(true);
  });

  it("aceita status aprovado no topo quando não há pagamento", () => {
    const snapshot = mapAuthorizedPayment({ id: 2, status: "approved" });
    expect(snapshot && isSettledRecurringCharge(snapshot)).toBe(true);
  });

  it("recusa cobrança pendente, recusada ou sem status", () => {
    for (const status of ["pending", "rejected", "cancelled", undefined]) {
      const snapshot = mapAuthorizedPayment({ id: 3, status, payment: { status } });
      expect(snapshot && isSettledRecurringCharge(snapshot), String(status)).toBe(false);
    }
  });
});

describe("chargePeriod", () => {
  it("usa o mês da data de débito", () => {
    const snapshot = mapAuthorizedPayment(RAW);
    expect(snapshot && chargePeriod(snapshot)).toBe("2026-12");
  });

  it("cai para o mês atual sem data válida", () => {
    const snapshot = mapAuthorizedPayment({ id: 4, debit_date: "data-invalida" });
    expect(snapshot && chargePeriod(snapshot, new Date("2026-11-22T12:00:00Z"))).toBe("2026-11");
  });
});
