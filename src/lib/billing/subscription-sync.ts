import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import type { PaymentMethod, PlanTier } from "@/types/domain";

/**
 * Sincronização de assinaturas (PreApproval) do Mercado Pago com `mp_subscriptions`.
 *
 * Também concentra a regra de janela de cobrança: contas PF são bloqueadas à noite
 * (20h–06h), então toda data de cobrança é normalizada para 08:00–18:00 em
 * America/Sao_Paulo. Usamos apenas `Intl.DateTimeFormat` (sem biblioteca nova).
 */

const log = createLogger("billing.subscription-sync");

// ---------------------------------------------------------------------------
// Janela diurna de cobrança (America/Sao_Paulo)
// ---------------------------------------------------------------------------

const BILLING_TIME_ZONE = "America/Sao_Paulo";
const WINDOW_START_HOUR = 8;
const WINDOW_END_HOUR = 18;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

let wallClockFormatter: Intl.DateTimeFormat | null = null;

function getWallClockFormatter(): Intl.DateTimeFormat {
  if (!wallClockFormatter) {
    wallClockFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: BILLING_TIME_ZONE,
      // `hourCycle: h23` garante 00–23 (sem o "24" que `hour12: false` pode emitir).
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return wallClockFormatter;
}

function requirePart(values: Record<string, number>, key: string): number {
  const value = values[key];
  if (value === undefined) {
    throw new Error(`Não foi possível ler "${key}" do fuso ${BILLING_TIME_ZONE}.`);
  }
  return value;
}

/** Componentes de data/hora do instante no fuso de cobrança. */
function readWallClock(instant: Date): WallClock {
  const values: Record<string, number> = {};

  for (const part of getWallClockFormatter().formatToParts(instant)) {
    if (part.type === "literal") continue;
    const parsed = Number(part.value);
    if (Number.isFinite(parsed)) values[part.type] = parsed;
  }

  return {
    year: requirePart(values, "year"),
    month: requirePart(values, "month"),
    day: requirePart(values, "day"),
    hour: requirePart(values, "hour"),
    minute: requirePart(values, "minute"),
    second: requirePart(values, "second"),
  };
}

/**
 * Deslocamento (em ms) do fuso de cobrança no instante informado:
 * `wall clock local - UTC`. Ex.: America/Sao_Paulo hoje → -3h.
 */
function zoneOffsetMs(instant: Date): number {
  const wall = readWallClock(instant);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const truncatedInstant = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - truncatedInstant;
}

/**
 * Converte "hora de parede" do fuso de cobrança em instante UTC.
 * Duas passadas: a primeira estima, a segunda corrige caso o offset mude
 * (histórico de horário de verão).
 */
function instantFromWallClock(year: number, month: number, day: number, hour: number): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const firstPass = utcGuess - zoneOffsetMs(new Date(utcGuess));
  const corrected = utcGuess - zoneOffsetMs(new Date(firstPass));
  return new Date(corrected);
}

/** Soma dias no calendário (sem depender de fuso para o cálculo). */
function addCalendarDays(wall: WallClock, days: number): WallClock {
  const shifted = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: wall.hour,
    minute: wall.minute,
    second: wall.second,
  };
}

/**
 * Próxima ocorrência dentro da janela diurna 08:00–18:00 (America/Sao_Paulo).
 *
 * - dentro da janela → devolve o próprio instante (sem deslocar cobrança válida);
 * - madrugada (antes das 08:00) → 08:00 do MESMO dia;
 * - noite (a partir das 18:00) → 08:00 do dia seguinte, pulando 20h–06h.
 */
export function nextDaytimeBillingWindow(from: Date): Date {
  if (Number.isNaN(from.getTime())) {
    throw new Error("Data inválida para cálculo da janela de cobrança.");
  }

  const wall = readWallClock(from);

  if (wall.hour >= WINDOW_START_HOUR && wall.hour < WINDOW_END_HOUR) {
    return new Date(from.getTime());
  }

  const targetDay = wall.hour >= WINDOW_END_HOUR ? addCalendarDays(wall, 1) : wall;

  return instantFromWallClock(targetDay.year, targetDay.month, targetDay.day, WINDOW_START_HOUR);
}

// ---------------------------------------------------------------------------
// Mapeamento de status e plano
// ---------------------------------------------------------------------------

/** Status interno de assinatura (coluna `mp_subscriptions.status`). */
export type InternalSubscriptionStatus = "active" | "pending" | "paused" | "cancelled" | "unknown";

const MP_STATUS_MAP: Record<string, InternalSubscriptionStatus> = {
  authorized: "active",
  pending: "pending",
  paused: "paused",
  cancelled: "cancelled",
  canceled: "cancelled",
  // Assinatura encerrada pelo MP (fim do ciclo / recusa definitiva).
  finished: "cancelled",
};

/** Converte o status do Mercado Pago no status interno. Desconhecido → `unknown`. */
export function mapMpStatus(mpStatus: string | null | undefined): InternalSubscriptionStatus {
  if (typeof mpStatus !== "string") return "unknown";
  return MP_STATUS_MAP[mpStatus.trim().toLowerCase()] ?? "unknown";
}

/** Subconjunto do PreApproval do Mercado Pago que realmente consumimos. */
export interface MpPreapprovalSnapshot {
  id?: string | null;
  status?: string | null;
  external_reference?: string | null;
  payer_email?: string | null;
  reason?: string | null;
  payment_method_id?: string | null;
  next_payment_date?: string | null;
  auto_recurring?: {
    transaction_amount?: number | null;
    currency_id?: string | null;
    frequency?: number | null;
    frequency_type?: string | null;
  } | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlanTier(value: string): value is PlanTier {
  return (PLAN_ORDER as string[]).includes(value);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * `external_reference` das assinaturas é o `tenantId`; aceitamos também o formato
 * composto `tenantId:planTier` (usado quando o checkout precisa desambiguar plano).
 */
export function parseTenantFromExternalReference(
  externalReference: string | null | undefined,
): { tenantId: string; planHint: PlanTier | null } | null {
  if (typeof externalReference !== "string") return null;

  const trimmed = externalReference.trim();
  if (trimmed.length === 0) return null;

  const [tenantPart, planPart] = trimmed.split(":");
  const tenantId = (tenantPart ?? "").trim();
  if (!UUID_PATTERN.test(tenantId)) return null;

  const planCandidate = (planPart ?? "").trim();
  const planHint: PlanTier | null = isPlanTier(planCandidate) ? planCandidate : null;

  return { tenantId, planHint };
}

/**
 * Descobre o plano da assinatura, em ordem de confiança:
 *  1. `external_reference` composto (`tenantId:planTier`);
 *  2. valor recorrente idêntico ao preço de um plano (fonte única: `PLANS`);
 *  3. nome do plano no campo `reason` (ex.: "Kitefy - Pacote Crescimento Pro").
 */
export function derivePlanTier(
  preapproval: MpPreapprovalSnapshot,
  planHint?: PlanTier | null,
): PlanTier {
  if (planHint) return planHint;

  const amount = preapproval.auto_recurring?.transaction_amount;
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
    const amountCents = Math.round(amount * 100);
    const byPrice = PLAN_ORDER.find((tier) => PLANS[tier].priceCents === amountCents);
    if (byPrice) return byPrice;
  }

  const reason = typeof preapproval.reason === "string" ? normalizeText(preapproval.reason) : "";
  if (reason.length > 0) {
    const byName = PLAN_ORDER.find((tier) => reason.includes(normalizeText(PLANS[tier].name)));
    if (byName) return byName;
  }

  throw new Error(
    "Não foi possível identificar o plano da assinatura: envie external_reference no formato tenantId:planTier ou um valor recorrente igual ao preço de um plano.",
  );
}

/** Define o meio de pagamento da assinatura a partir do PreApproval. */
export function derivePaymentMethod(
  preapproval: MpPreapprovalSnapshot,
  explicit?: PaymentMethod,
): PaymentMethod {
  if (explicit) return explicit;

  const methodId = typeof preapproval.payment_method_id === "string"
    ? preapproval.payment_method_id.trim().toLowerCase()
    : "";

  return methodId === "pix" ? "pix_automatico" : "card_preapproval";
}

export interface SubscriptionRow {
  tenant_id: string;
  mp_preapproval_id: string;
  payment_method: PaymentMethod;
  plan_tier: PlanTier;
  status: InternalSubscriptionStatus;
  next_billing_date: string | null;
}

export interface SubscriptionSyncOptions {
  /** Meio de pagamento conhecido no momento da criação (evita inferência). */
  paymentMethod?: PaymentMethod;
  /** Plano conhecido no momento da criação. */
  planTier?: PlanTier;
}

/**
 * Monta a linha de `mp_subscriptions` a partir do PreApproval (função pura,
 * usada tanto pelo sync quanto pelos testes).
 */
export function buildSubscriptionRow(
  preapproval: MpPreapprovalSnapshot,
  options: SubscriptionSyncOptions = {},
): SubscriptionRow {
  const preapprovalId = typeof preapproval.id === "string" ? preapproval.id.trim() : "";
  if (preapprovalId.length === 0) {
    throw new Error("PreApproval sem id: não é possível sincronizar a assinatura.");
  }

  const tenant = parseTenantFromExternalReference(preapproval.external_reference);
  if (!tenant) {
    throw new Error(
      "PreApproval sem external_reference válido (esperado o tenantId em UUID): assinatura não pode ser vinculada a um tenant.",
    );
  }

  const planTier = derivePlanTier(preapproval, options.planTier ?? tenant.planHint);

  return {
    tenant_id: tenant.tenantId,
    mp_preapproval_id: preapprovalId,
    payment_method: derivePaymentMethod(preapproval, options.paymentMethod),
    plan_tier: planTier,
    status: mapMpStatus(preapproval.status),
    next_billing_date: toNextBillingDate(preapproval.next_payment_date),
  };
}

/**
 * Normaliza `next_payment_date` para a janela diurna. Datas inválidas viram
 * `null` (o worker/ UI mostram "a definir" em vez de uma data errada).
 */
export function toNextBillingDate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return nextDaytimeBillingWindow(parsed).toISOString();
}

export interface SyncedSubscription {
  tenantId: string;
  preapprovalId: string;
  planTier: PlanTier;
  status: InternalSubscriptionStatus;
  paymentMethod: PaymentMethod;
  nextBillingDate: string | null;
}

/**
 * Faz upsert da assinatura em `mp_subscriptions` (service role, fora do RLS).
 * A constraint `mp_subscriptions_preapproval_unique` garante 1 linha por
 * `mp_preapproval_id`; o upsert é idempotente para reentregas do webhook.
 */
export async function syncSubscriptionFromPreapproval(
  preapproval: MpPreapprovalSnapshot,
  options: SubscriptionSyncOptions = {},
): Promise<SyncedSubscription> {
  const row = buildSubscriptionRow(preapproval, options);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("mp_subscriptions")
    .upsert(row, { onConflict: "mp_preapproval_id" });

  if (error) {
    log.error("Falha ao sincronizar assinatura do Mercado Pago", {
      preapprovalId: row.mp_preapproval_id,
      tenantId: row.tenant_id,
      code: error.code,
      message: error.message,
    });
    throw new Error(
      "Não foi possível sincronizar a assinatura do Mercado Pago agora. O evento ficará pendente para nova tentativa.",
    );
  }

  log.info("Assinatura sincronizada", {
    preapprovalId: row.mp_preapproval_id,
    tenantId: row.tenant_id,
    status: row.status,
    planTier: row.plan_tier,
  });

  return {
    tenantId: row.tenant_id,
    preapprovalId: row.mp_preapproval_id,
    planTier: row.plan_tier,
    status: row.status,
    paymentMethod: row.payment_method,
    nextBillingDate: row.next_billing_date,
  };
}
