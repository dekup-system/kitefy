import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { QueryResultRow } from "pg";
import { TestDatabase, createUserWithTenant } from "../db/harness";
import {
  applyPaymentCredit,
  grantPlanCredits,
  type CreditQuery,
  type CreditStore,
} from "@/lib/billing/credit-grants";
import {
  clearIdempotencyCache,
  IDEMPOTENCY_TTL_MS,
  newIdempotencyKey,
  withIdempotency,
} from "@/lib/billing/idempotency";
import { PLANS } from "@/lib/pricing";

/**
 * Idempotência do crédito de pagamento + memoização de curta duração.
 *
 * O crédito é exercitado contra o Postgres real do harness (PGlite + migrations),
 * para provar que a checagem em `credit_ledger.reference_id` realmente deduplica
 * e que o saldo não muda na segunda chamada.
 */

/**
 * Adapta o harness (PGlite, sem socket TCP) à interface `CreditStore` usada em
 * produção. A regra de negócio é a MESMA: nada é reimplementado aqui.
 */
function createTestStore(db: TestDatabase): CreditStore {
  const standaloneQuery: CreditQuery = async <T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ) => {
    const rows = await db.asService<Record<string, unknown>>(sql, [...params]);
    return rows as unknown as T[];
  };

  return {
    query: standaloneQuery,
    transaction: <T>(fn: (run: CreditQuery) => Promise<T>) =>
      db.db.transaction(async (tx) => {
        // As rotas/worker rodam como service_role; reproduzimos o mesmo privilégio.
        await tx.exec("set local role service_role;");

        const run: CreditQuery = async <R extends QueryResultRow>(
          sql: string,
          params: readonly unknown[] = [],
        ) => {
          const result = await tx.query<Record<string, unknown>>(sql, [...params]);
          return result.rows as unknown as R[];
        };

        return fn(run);
      }),
  };
}

describe("applyPaymentCredit (idempotência no banco)", () => {
  let db: TestDatabase;
  let tenantId: string;
  let store: CreditStore;

  async function balanceOf(): Promise<number> {
    const rows = await db.asSuperuser<{ credit_balance: number }>(
      "select credit_balance from public.tenants where id = $1",
      [tenantId],
    );
    return Number(rows[0]?.credit_balance ?? 0);
  }

  beforeAll(async () => {
    db = await TestDatabase.create();
    const user = await createUserWithTenant(db, "billing-idempotency@brandpulse.test", "Idem Co");
    tenantId = user.tenantId;
    store = createTestStore(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("credita uma única vez e ignora a segunda chamada com o mesmo paymentId", async () => {
    const paymentId = "mp-payment-0001";
    const initialBalance = await balanceOf();

    const first = await applyPaymentCredit(tenantId, paymentId, "pro", store);
    expect(first.credited).toBe(true);
    expect(first.balance).toBe(initialBalance + PLANS.pro.monthlyCredits);

    const second = await applyPaymentCredit(tenantId, paymentId, "pro", store);
    expect(second.credited).toBe(false);
    expect(second.balance).toBe(initialBalance + PLANS.pro.monthlyCredits);

    // O ledger precisa ter exatamente 1 lançamento para o pagamento.
    const ledger = await db.asSuperuser<{ delta: number; reason: string; reference_id: string }>(
      "select delta, reason, reference_id from public.credit_ledger where reference_id = $1",
      [paymentId],
    );

    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0]?.delta)).toBe(PLANS.pro.monthlyCredits);
    expect(ledger[0]?.reason).toBe("payment_approved");
    expect(ledger[0]?.reference_id).toBe(paymentId);

    expect(await balanceOf()).toBe(initialBalance + PLANS.pro.monthlyCredits);
  });

  it("não credita de novo nem quando o plano informado muda no retry", async () => {
    const paymentId = "mp-payment-0002";
    const initialBalance = await balanceOf();

    const first = await applyPaymentCredit(tenantId, paymentId, "essential", store);
    expect(first.credited).toBe(true);

    const retry = await applyPaymentCredit(tenantId, paymentId, "agency", store);
    expect(retry.credited).toBe(false);
    expect(retry.balance).toBe(initialBalance + PLANS.essential.monthlyCredits);
    expect(await balanceOf()).toBe(initialBalance + PLANS.essential.monthlyCredits);
  });

  it("credita pagamentos diferentes do mesmo tenant", async () => {
    const initialBalance = await balanceOf();

    const a = await applyPaymentCredit(tenantId, "mp-payment-0003", "essential", store);
    const b = await applyPaymentCredit(tenantId, "mp-payment-0004", "essential", store);

    expect(a.credited).toBe(true);
    expect(b.credited).toBe(true);
    expect(b.balance).toBe(initialBalance + PLANS.essential.monthlyCredits * 2);
    expect(await balanceOf()).toBe(initialBalance + PLANS.essential.monthlyCredits * 2);
  });

  it("grantPlanCredits credita os créditos mensais e registra o motivo", async () => {
    const initialBalance = await balanceOf();
    const referenceId = "renewal-2026-03";

    const balance = await grantPlanCredits(
      tenantId,
      "agency",
      "subscription_renewal",
      referenceId,
      store,
    );

    expect(balance).toBe(initialBalance + PLANS.agency.monthlyCredits);

    const ledger = await db.asSuperuser<{ delta: number; reason: string }>(
      "select delta, reason from public.credit_ledger where reference_id = $1",
      [referenceId],
    );
    expect(Number(ledger[0]?.delta)).toBe(PLANS.agency.monthlyCredits);
    expect(ledger[0]?.reason).toBe("subscription_renewal");
  });

  it("lança quando o tenant não existe (nada é creditado)", async () => {
    const missingTenant = "00000000-0000-4000-8000-000000000000";

    await expect(
      applyPaymentCredit(missingTenant, "mp-payment-9999", "pro", store),
    ).rejects.toThrow(/não encontrado/);
  });
});

describe("withIdempotency (memoização em memória)", () => {
  it("executa uma única vez para a mesma chave", async () => {
    clearIdempotencyCache();
    const fn = vi.fn(async () => ({ paymentId: "mp-1" }));

    const first = await withIdempotency("checkout:tenant:token", fn);
    const second = await withIdempotency("checkout:tenant:token", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("chaves diferentes executam de novo", async () => {
    clearIdempotencyCache();
    const fn = vi.fn(async () => "ok");

    await withIdempotency("chave-a", fn);
    await withIdempotency("chave-b", fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("não memoiza falha: retry legítimo pode tentar de novo", async () => {
    clearIdempotencyCache();
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("falha transitória");
      return "ok";
    });

    await expect(withIdempotency("retry-1", fn)).rejects.toThrow("falha transitória");
    await expect(withIdempotency("retry-1", fn)).resolves.toBe("ok");

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("deduplica chamadas concorrentes da mesma chave", async () => {
    clearIdempotencyCache();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      await Promise.resolve();
      return calls;
    };

    const [a, b] = await Promise.all([withIdempotency("concorrente", fn), withIdempotency("concorrente", fn)]);

    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("expira a entrada depois de 10 minutos", async () => {
    clearIdempotencyCache();
    const nowSpy = vi.spyOn(Date, "now");
    const start = 1_700_000_000_000;
    nowSpy.mockReturnValue(start);

    try {
      const fn = vi.fn(async () => "valor");

      await withIdempotency("ttl", fn);
      await withIdempotency("ttl", fn);
      expect(fn).toHaveBeenCalledTimes(1);

      // 1ms além do TTL: a entrada é descartada e a função roda de novo.
      nowSpy.mockReturnValue(start + IDEMPOTENCY_TTL_MS + 1);
      await withIdempotency("ttl", fn);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
      clearIdempotencyCache();
    }
  });

  it("rejeita chave vazia", async () => {
    await expect(withIdempotency("   ", async () => "x")).rejects.toThrow(/Chave de idempotência vazia/);
  });
});

describe("newIdempotencyKey", () => {
  it("gera UUID v4 único", () => {
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const keys = new Set(Array.from({ length: 20 }, () => newIdempotencyKey()));

    expect(keys.size).toBe(20);
    for (const key of keys) {
      expect(key).toMatch(uuidV4);
    }
  });
});
