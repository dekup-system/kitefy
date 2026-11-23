import { query } from "@/lib/db/pg";
import { createLogger } from "@/lib/logger";
import type { PlanTier } from "@/types/domain";

/**
 * Extrato de receita confirmada.
 *
 * Cada cobrança aprovada no Mercado Pago vira uma linha idempotente
 * (`source + external_id` UNIQUE). O valor vem SEMPRE da API do MP (nunca do
 * payload do webhook), então reflete descontos de cupom e promoções.
 */

const log = createLogger("billing.revenue");

export interface RevenueEventInput {
  source: "subscription" | "payment";
  externalId: string;
  tenantId: string | null;
  planTier: PlanTier | null;
  amountCents: number;
  currency?: string;
  /** Data ISO da cobrança; default: agora. */
  occurredAt?: string | null;
}

function safeOccurredAt(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function recordRevenueEvent(input: RevenueEventInput): Promise<boolean> {
  if (!input.externalId.trim()) {
    log.warn("Receita sem identificador externo: ignorada", { source: input.source });
    return false;
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    log.warn("Receita com valor inválido: ignorada", {
      source: input.source,
      externalId: input.externalId,
      amountCents: input.amountCents,
    });
    return false;
  }

  try {
    const rows = await query<{ id: string }>(
      `insert into public.billing_revenue_events
         (source, external_id, tenant_id, plan_tier, amount_cents, currency, occurred_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (source, external_id) do nothing
       returning id`,
      [
        input.source,
        input.externalId,
        input.tenantId,
        input.planTier,
        input.amountCents,
        (input.currency ?? "BRL").toUpperCase(),
        safeOccurredAt(input.occurredAt),
      ],
    );

    const inserted = rows.length > 0;
    log.info("Receita registrada", {
      source: input.source,
      externalId: input.externalId,
      amountCents: input.amountCents,
      duplicate: !inserted,
    });
    return inserted;
  } catch (error) {
    // Falha de extrato não pode impedir crédito/assinatura: o evento de webhook
    // continua no banco e pode ser reprocessado (a unique evita duplicar).
    log.warn("Falha ao registrar receita", {
      source: input.source,
      externalId: input.externalId,
      message: error instanceof Error ? error.message : "erro",
    });
    return false;
  }
}
