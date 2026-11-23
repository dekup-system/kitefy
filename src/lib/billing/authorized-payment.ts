/**
 * Cobrança recorrente (`subscription_authorized_payment`).
 *
 * O webhook só traz o id. Como a regra de ouro é nunca creditar por notificação,
 * o worker confirma a cobrança na API do Mercado Pago e só então concede os
 * créditos — uma vez por cobrança (referência determinística).
 */

const MP_API = "https://api.mercadopago.com";
const TIMEOUT_MS = 12_000;

export interface AuthorizedPaymentSnapshot {
  id: string;
  preapprovalId: string | null;
  status: string | null;
  paymentStatus: string | null;
  amountCents: number | null;
  debitDate: string | null;
}

/** Formato cru do `/authorized_payments/:id` (campos que usamos). */
interface RawAuthorizedPayment {
  id?: string | number;
  status?: string | null;
  preapproval_id?: string | null;
  transaction_amount?: number | null;
  debit_date?: string | null;
  payment?: { id?: string | number; status?: string | null } | null;
}

function toId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function mapAuthorizedPayment(raw: unknown): AuthorizedPaymentSnapshot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as RawAuthorizedPayment;

  const id = toId(data.id);
  if (!id) return null;

  const amount = typeof data.transaction_amount === "number" ? data.transaction_amount : null;

  return {
    id,
    preapprovalId: toId(data.preapproval_id),
    status: typeof data.status === "string" ? data.status : null,
    paymentStatus:
      data.payment && typeof data.payment.status === "string" ? data.payment.status : null,
    amountCents: amount === null ? null : Math.round(amount * 100),
    debitDate: typeof data.debit_date === "string" ? data.debit_date : null,
  };
}

/**
 * A cobrança só é creditada quando o pagamento vinculado está aprovado.
 * `status` pendente/recusado não move crédito (mas também não é erro).
 */
export function isSettledRecurringCharge(snapshot: AuthorizedPaymentSnapshot): boolean {
  return snapshot.paymentStatus === "approved" || snapshot.status === "approved";
}

/** Competência (AAAA-MM) da cobrança; cai para o mês atual se não houver data. */
export function chargePeriod(snapshot: AuthorizedPaymentSnapshot, now = new Date()): string {
  const reference = snapshot.debitDate ? new Date(snapshot.debitDate) : now;
  if (Number.isNaN(reference.getTime())) return now.toISOString().slice(0, 7);
  return reference.toISOString().slice(0, 7);
}

export async function fetchAuthorizedPayment(
  id: string,
  accessToken: string,
): Promise<AuthorizedPaymentSnapshot> {
  const response = await fetch(`${MP_API}/authorized_payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago respondeu HTTP ${response.status} ao confirmar a cobrança.`);
  }

  const snapshot = mapAuthorizedPayment(await response.json().catch(() => null));
  if (!snapshot) {
    throw new Error("Cobrança recorrente em formato inesperado na resposta do Mercado Pago.");
  }
  return snapshot;
}
