import type { QueryResultRow } from "pg";
import { query, withTransaction } from "@/lib/db/pg";
import { PLANS } from "@/lib/pricing";
import type { PlanTier } from "@/types/domain";

/**
 * Concessão de créditos do plano.
 *
 * Toda mutação de saldo passa por `public.consume_credits()` (SECURITY DEFINER),
 * que serializa a linha do tenant com `FOR UPDATE`, registra no `credit_ledger`
 * e impede saldo negativo por constraint no banco.
 *
 * O acesso ao Postgres é abstraído em `CreditStore` para permitir testar a
 * idempotência contra o harness PGlite (que não expõe um `pg.Pool` TCP) sem
 * duplicar a regra de negócio. Em produção o valor padrão é sempre `pgCreditStore`.
 */

/** Executor de SQL parametrizado. */
export type CreditQuery = <T extends QueryResultRow>(
  sql: string,
  params?: readonly unknown[],
) => Promise<T[]>;

export interface CreditStore {
  query: CreditQuery;
  /** Executa o callback em uma transação; rollback automático em erro. */
  transaction: <T>(fn: (run: CreditQuery) => Promise<T>) => Promise<T>;
}

/** Executor real (pool `pg` de `SUPABASE_DB_URL`). */
export const pgCreditStore: CreditStore = {
  query: <T extends QueryResultRow>(sql: string, params: readonly unknown[] = []) =>
    query<T>(sql, [...params]),
  transaction: <T>(fn: (run: CreditQuery) => Promise<T>) =>
    withTransaction(async (client) => {
      const run: CreditQuery = <R extends QueryResultRow>(
        sql: string,
        params: readonly unknown[] = [],
      ) => client.query<R>(sql, [...params]).then((result) => result.rows);

      return fn(run);
    }),
};

/** Motivo registrado no ledger quando um pagamento avulso é aprovado. */
export const PAYMENT_CREDIT_REASON = "payment_approved";
/** Motivo registrado no ledger quando uma recarga avulsa de créditos é aprovada. */
export const TOPUP_CREDIT_REASON = "credit_topup_approved";

function assertNonEmpty(value: string, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new Error(`Campo obrigatório ausente: ${field}.`);
  }
  return normalized;
}

/**
 * Credita os créditos mensais do plano (renovação manual/assinatura) e devolve
 * o novo saldo do tenant.
 *
 * `referenceId` deve ser único por concessão (ex.: id do pagamento ou da fatura)
 * para permitir auditoria e reconciliação no `credit_ledger`.
 */
export async function grantPlanCredits(
  tenantId: string,
  planTier: PlanTier,
  reason: string,
  referenceId: string,
  store: CreditStore = pgCreditStore,
): Promise<number> {
  const normalizedTenantId = assertNonEmpty(tenantId, "tenantId");
  const normalizedReason = assertNonEmpty(reason, "reason");
  const normalizedReferenceId = assertNonEmpty(referenceId, "referenceId");
  const credits = PLANS[planTier].monthlyCredits;

  const rows = await store.query<{ balance: number }>(
    "select public.consume_credits($1, $2, $3, $4) as balance",
    [normalizedTenantId, credits, normalizedReason, normalizedReferenceId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Falha ao conceder créditos: consume_credits não retornou saldo.");
  }

  return Number(row.balance);
}

export interface PaymentCreditResult {
  /** `false` quando o pagamento já havia sido creditado antes. */
  credited: boolean;
  /** Saldo atual do tenant (após crédito, ou inalterado se já creditado). */
  balance: number;
}

/**
 * Aplica o crédito de um pagamento aprovado de forma IDEMPOTENTE.
 *
 * Estratégia (tudo dentro de uma transação):
 *  1. `FOR UPDATE` na linha do tenant → serializa pagamentos do mesmo tenant;
 *  2. advisory lock por `paymentId` → serializa até tenants diferentes (defesa
 *     contra reentrega do webhook em paralelo);
 *  3. se já existe `credit_ledger.reference_id = paymentId`, não credita de novo;
 *  4. caso contrário chama `consume_credits(delta = créditos do plano)`.
 *
 * A checagem no ledger é a fonte de verdade em produção; o advisory lock evita
 * que duas requisições concorrentes passem pela checagem ao mesmo tempo.
 */
export async function applyPaymentCredit(
  tenantId: string,
  paymentId: string,
  planTier: PlanTier,
  store: CreditStore = pgCreditStore,
): Promise<PaymentCreditResult> {
  const normalizedTenantId = assertNonEmpty(tenantId, "tenantId");
  const normalizedPaymentId = assertNonEmpty(paymentId, "paymentId");
  const credits = PLANS[planTier].monthlyCredits;

  return store.transaction(async (run) => {
    // 1. Serializa por tenant (mesmo lock usado por consume_credits).
    const tenantRows = await run<{ credit_balance: number }>(
      "select credit_balance from public.tenants where id = $1 for update",
      [normalizedTenantId],
    );

    if (tenantRows.length === 0) {
      throw new Error(`Tenant ${normalizedTenantId} não encontrado: crédito não aplicado.`);
    }

    // 2. Serializa por pagamento (cobre eventual inconsistência de tenant).
    await run("select pg_advisory_xact_lock(hashtext($1))", [`mp_payment:${normalizedPaymentId}`]);

    // 3. Já creditado? Devolve saldo atual sem tocar no ledger.
    const existing = await run<{ id: string }>(
      "select id from public.credit_ledger where reference_id = $1 limit 1",
      [normalizedPaymentId],
    );

    if (existing.length > 0) {
      const current = await run<{ credit_balance: number }>(
        "select credit_balance from public.tenants where id = $1",
        [normalizedTenantId],
      );

      return {
        credited: false,
        balance: Number(current[0]?.credit_balance ?? tenantRows[0]?.credit_balance ?? 0),
      };
    }

    // 4. Crédito atômico com registro no ledger usando o id do pagamento.
    const granted = await run<{ balance: number }>(
      "select public.consume_credits($1, $2, $3, $4) as balance",
      [normalizedTenantId, credits, PAYMENT_CREDIT_REASON, normalizedPaymentId],
    );

    const balance = granted[0]?.balance;
    if (balance === undefined) {
      throw new Error("Falha ao creditar pagamento: consume_credits não retornou saldo.");
    }

    return { credited: true, balance: Number(balance) };
  });
}

/**
 * Aplica créditos de pacote avulso (recarga +50 ou +100) de forma IDEMPOTENTE
 * após confirmação de pagamento aprovado pelo Mercado Pago.
 */
export async function applyTopUpCredit(
  tenantId: string,
  paymentId: string,
  credits: number,
  store: CreditStore = pgCreditStore,
): Promise<PaymentCreditResult> {
  const normalizedTenantId = assertNonEmpty(tenantId, "tenantId");
  const normalizedPaymentId = assertNonEmpty(paymentId, "paymentId");
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error("Quantidade de créditos do pacote avulso inválida.");
  }

  return store.transaction(async (run) => {
    const tenantRows = await run<{ credit_balance: number }>(
      "select credit_balance from public.tenants where id = $1 for update",
      [normalizedTenantId],
    );

    if (tenantRows.length === 0) {
      throw new Error(`Tenant ${normalizedTenantId} não encontrado: recarga não aplicada.`);
    }

    await run("select pg_advisory_xact_lock(hashtext($1))", [`mp_payment:${normalizedPaymentId}`]);

    const existing = await run<{ id: string }>(
      "select id from public.credit_ledger where reference_id = $1 limit 1",
      [normalizedPaymentId],
    );

    if (existing.length > 0) {
      const current = await run<{ credit_balance: number }>(
        "select credit_balance from public.tenants where id = $1",
        [normalizedTenantId],
      );
      return {
        credited: false,
        balance: Number(current[0]?.credit_balance ?? tenantRows[0]?.credit_balance ?? 0),
      };
    }

    const granted = await run<{ balance: number }>(
      "select public.consume_credits($1, $2, $3, $4) as balance",
      [normalizedTenantId, credits, TOPUP_CREDIT_REASON, normalizedPaymentId],
    );

    const balance = granted[0]?.balance;
    if (balance === undefined) {
      throw new Error("Falha ao creditar pacote avulso: consume_credits não retornou saldo.");
    }

    return { credited: true, balance: Number(balance) };
  });
}
