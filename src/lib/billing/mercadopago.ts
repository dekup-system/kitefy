import { randomUUID } from "node:crypto";
import { MercadoPagoConfig, Payment, PreApproval } from "mercadopago";
import { getServerEnv } from "@/lib/env";
import { PLANS } from "@/lib/pricing";
import type { PaymentMethod, PlanTier } from "@/types/domain";

/**
 * Cliente de billing do Mercado Pago (Brasil).
 *
 * Este módulo é a ÚNICA fronteira com o SDK oficial (v3.6.2). Regras:
 *  - nunca logar `accessToken`, payload de cartão ou `x-signature`;
 *  - todo erro do SDK vira `MercadoPagoError` com mensagem acionável em português;
 *  - valores SEMPRE em BRL a partir de centavos (a UI/DB trabalham em centavos);
 *  - nenhuma decisão de crédito acontece aqui: quem credita é `credit-grants.ts`,
 *    depois de o worker confirmar o status real na API.
 */

/** Códigos de erro estáveis (usados pelas rotas para escolher o status HTTP). */
export type MercadoPagoErrorCode =
  | "mp_not_configured"
  | "mp_invalid_input"
  | "mp_auth_failed"
  | "mp_forbidden"
  | "mp_not_found"
  | "mp_validation"
  | "mp_conflict"
  | "mp_rate_limited"
  | "mp_unavailable"
  | "mp_network"
  | "mp_unknown";

interface MercadoPagoErrorOptions {
  code: MercadoPagoErrorCode;
  message: string;
  status?: number | null;
  context?: string;
  cause?: unknown;
}

/**
 * Erro de billing do Mercado Pago.
 *
 * `message` é segura para ir ao cliente (nunca contém o access token); `cause`
 * carrega apenas o detalhe saneado do SDK para o log estruturado.
 */
export class MercadoPagoError extends Error {
  readonly code: MercadoPagoErrorCode;
  /** Status HTTP devolvido pelo Mercado Pago (ou `null` em falha de rede). */
  readonly status: number | null;
  /** Operação que falhou (ex.: `createCardOrderPayment`). */
  readonly context: string;
  override readonly cause: unknown;
  /** `true` quando repetir a mesma chamada tem chance real de sucesso. */
  readonly retryable: boolean;

  constructor(options: MercadoPagoErrorOptions) {
    super(options.message);
    this.name = "MercadoPagoError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.context = options.context ?? "mercadopago";
    this.cause = options.cause;
    this.retryable =
      options.code === "mp_network" ||
      options.code === "mp_unavailable" ||
      options.code === "mp_rate_limited" ||
      options.code === "mp_conflict";
  }
}

const MP_ERROR_MESSAGES: Record<MercadoPagoErrorCode, string> = {
  mp_not_configured:
    "Pagamentos com Mercado Pago não estão configurados neste ambiente: defina MP_ACCESS_TOKEN no servidor.",
  mp_invalid_input: "Dados inválidos para a operação de cobrança.",
  mp_auth_failed:
    "Falha de autenticação no Mercado Pago: o MP_ACCESS_TOKEN é inválido, expirou ou pertence a outra aplicação.",
  mp_forbidden:
    "A aplicação não tem permissão para esta operação no Mercado Pago: confira as credenciais e os escopos habilitados.",
  mp_not_found:
    "Recurso não encontrado no Mercado Pago: confira o identificador informado.",
  mp_validation:
    "O Mercado Pago recusou os dados enviados: revise os dados do cartão, CPF e e-mail e tente novamente.",
  mp_conflict:
    "Conflito de idempotência no Mercado Pago: reenvie a mesma operação com a MESMA chave de idempotência.",
  mp_rate_limited:
    "Limite de requisições do Mercado Pago atingido: aguarde alguns instantes e tente novamente.",
  mp_unavailable:
    "Mercado Pago indisponível no momento: tente novamente em instantes.",
  mp_network:
    "Não foi possível falar com o Mercado Pago (timeout ou falha de rede): tente novamente.",
  mp_unknown:
    "Falha inesperada ao falar com o Mercado Pago: tente novamente e, se persistir, abra um chamado.",
};

const TOKEN_PATTERN = /(APP_USR-|APP-|TEST-)[A-Za-z0-9._~-]+/g;
const SECRET_QUERY_PATTERN = /(access_token|authorization|client_secret)\s*[=:]\s*\S+/gi;

/** Remove qualquer resquício de credencial antes de expor/logar um detalhe. */
function sanitizeDetail(raw: unknown): string {
  if (typeof raw !== "string") return "";

  return raw
    .replace(TOKEN_PATTERN, "[redacted]")
    .replace(SECRET_QUERY_PATTERN, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function readHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && Number.isFinite(status)) return status;

  return null;
}

function readErrorDetail(error: unknown): string {
  if (typeof error !== "object" || error === null) return sanitizeDetail(String(error));

  const candidate = error as { error?: unknown; message?: unknown };
  // O SDK preenche `.error` com a mensagem devolvida pela API quando existe.
  const apiMessage = sanitizeDetail(candidate.error);
  if (apiMessage.length > 0) return apiMessage;

  return sanitizeDetail(candidate.message);
}

function codeFromStatus(status: number | null): MercadoPagoErrorCode {
  if (status === null) return "mp_network";
  if (status === 0) return "mp_network";
  if (status === 401) return "mp_auth_failed";
  if (status === 403) return "mp_forbidden";
  if (status === 404) return "mp_not_found";
  if (status === 409 || status === 423) return "mp_conflict";
  if (status === 429) return "mp_rate_limited";
  if (status === 400 || status === 422) return "mp_validation";
  if (status === 408 || status === 504 || status >= 500) return "mp_unavailable";
  return "mp_unknown";
}

/** Traduz qualquer falha do SDK em `MercadoPagoError` (idempotente). */
export function toMercadoPagoError(error: unknown, context: string): MercadoPagoError {
  if (error instanceof MercadoPagoError) return error;

  const status = readHttpStatus(error);
  const code = codeFromStatus(status);
  const detail = readErrorDetail(error);
  const base = MP_ERROR_MESSAGES[code];

  return new MercadoPagoError({
    code,
    status,
    context,
    message: detail.length > 0 ? `${base} Detalhe: ${detail}` : base,
    cause: { context, sdkStatus: status, sdkDetail: detail },
  });
}

/** Status HTTP sugerido para uma falha de billing (usado pelas rotas). */
export function httpStatusForMpError(error: MercadoPagoError): number {
  switch (error.code) {
    case "mp_not_configured":
    case "mp_unavailable":
      return 503;
    case "mp_auth_failed":
    case "mp_forbidden":
    case "mp_unknown":
      return 502;
    case "mp_invalid_input":
    case "mp_validation":
      return 400;
    case "mp_not_found":
      return 404;
    case "mp_conflict":
      return 409;
    case "mp_rate_limited":
      return 429;
    case "mp_network":
      return 504;
  }
}

// ---------------------------------------------------------------------------
// Configuração / cliente memoizado
// ---------------------------------------------------------------------------

let cachedClient: MercadoPagoConfig | null = null;

/** `true` quando há credencial de servidor do Mercado Pago configurada. */
export function isMpConfigured(): boolean {
  try {
    return Boolean(getServerEnv().MP_ACCESS_TOKEN);
  } catch {
    // Ambiente inválido não deve derrubar a rota: tratamos como não configurado.
    return false;
  }
}

/**
 * Instância memoizada do SDK. O timeout de 15s evita request pendurado no
 * webhook/checkout; o token nunca é exposto nem logado.
 */
export function getMpClient(): MercadoPagoConfig {
  if (cachedClient) return cachedClient;

  const env = getServerEnv();
  if (!env.MP_ACCESS_TOKEN) {
    throw new MercadoPagoError({
      code: "mp_not_configured",
      context: "getMpClient",
      message: MP_ERROR_MESSAGES.mp_not_configured,
    });
  }

  cachedClient = new MercadoPagoConfig({
    accessToken: env.MP_ACCESS_TOKEN,
    options: { timeout: 15_000 },
  });

  return cachedClient;
}

/** Somente para testes: limpa o cliente memoizado. */
export function resetMpClient(): void {
  cachedClient = null;
}

function notificationUrl(): string {
  const env = getServerEnv();
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}/api/webhooks/mercadopago`;
}

function planDescription(planTier: PlanTier): string {
  return `BrandPulse Organic & GEO Studio - Plano ${PLANS[planTier].name}`;
}

/** Centavos → número decimal em BRL (ex.: 4990 → 49.9). */
export function centsToAmount(amountCents: number): number {
  return Number((amountCents / 100).toFixed(2));
}

function assertNonEmpty(value: string, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new MercadoPagoError({
      code: "mp_invalid_input",
      context: "validation",
      message: `Campo obrigatório ausente na cobrança: ${field}.`,
    });
  }
  return normalized;
}

function assertAmountCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new MercadoPagoError({
      code: "mp_invalid_input",
      context: "validation",
      message: "Valor da cobrança inválido: informe o total em centavos (inteiro positivo).",
    });
  }
  return amountCents;
}

function assertPayerEmail(email: string): string {
  const normalized = assertNonEmpty(email, "payerEmail");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new MercadoPagoError({
      code: "mp_invalid_input",
      context: "validation",
      message: "E-mail do pagador inválido: use um endereço completo (ex.: nome@empresa.com.br).",
    });
  }
  return normalized;
}

function assertHttpUrl(value: string, field: string): string {
  const normalized = assertNonEmpty(value, field);
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocolo");
  } catch {
    throw new MercadoPagoError({
      code: "mp_invalid_input",
      context: "validation",
      message: `${field} inválida: informe uma URL http(s) completa.`,
    });
  }
  return normalized;
}

function assertIdempotencyKey(key: string): string {
  const normalized = assertNonEmpty(key, "idempotencyKey");
  if (normalized.length > 64) {
    throw new MercadoPagoError({
      code: "mp_invalid_input",
      context: "validation",
      message: "Chave de idempotência muito longa: use até 64 caracteres.",
    });
  }
  return normalized;
}

/**
 * `external_reference` dos pagamentos avulsos: `tenantId:planTier:uuid`.
 * O UUID torna a referência única por tentativa, o que permite reconciliar
 * pagamentos duplicados sem depender do id do Mercado Pago.
 */
export function buildExternalReference(tenantId: string, planTier: PlanTier): string {
  return `${tenantId.trim()}:${planTier}:${randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Tipos de retorno (mínimos: nada de PII nem payload bruto do MP)
// ---------------------------------------------------------------------------

export interface CardOrderPaymentInput {
  tenantId: string;
  planTier: PlanTier;
  payerEmail: string;
  cardTokenId: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface CardPaymentResult {
  paymentId: string;
  status: string;
  statusDetail: string | null;
  externalReference: string;
  amountCents: number;
  paymentMethodId: string | null;
}

export interface PixPaymentInput {
  tenantId: string;
  planTier: PlanTier;
  payerEmail: string;
  amountCents: number;
  idempotencyKey: string;
  /** Validade do QR code em minutos (padrão 30). */
  expiresInMinutes?: number;
}

export interface PixPaymentResult extends CardPaymentResult {
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  /** Expiração do Pix em ISO 8601 (UTC). */
  expiresAt: string | null;
}

export interface PreapprovalInput {
  tenantId: string;
  planTier: PlanTier;
  payerEmail: string;
  backUrl: string;
  /** Opcional: reaproveita a chave em retries manuais. */
  idempotencyKey?: string;
}

export interface CardPreapprovalInput extends PreapprovalInput {
  cardTokenId: string;
}

export interface PreapprovalResult {
  preapprovalId: string;
  status: string | null;
  /** URL de autorização (o pagador precisa aprovar o débito recorrente). */
  initPoint: string | null;
  externalReference: string | null;
  nextPaymentDate: string | null;
  paymentMethod: PaymentMethod;
}

export interface MpPaymentSnapshot {
  paymentId: string;
  status: string;
  statusDetail: string | null;
  externalReference: string | null;
  amountCents: number | null;
  paymentMethodId: string | null;
}

export interface PreapprovalSnapshot {
  preapprovalId: string;
  status: string | null;
  externalReference: string | null;
  nextPaymentDate: string | null;
  paymentMethodId: string | null;
  amountCents: number | null;
}

/**
 * Formato mínimo que lemos de um pagamento do MP. Tipagem estrutural para não
 * vazar o `PaymentResponse` completo (que carrega PII do pagador) para a aplicação.
 */
interface PaymentLike {
  id?: number | string | null;
  status?: string | null;
  status_detail?: string | null;
  external_reference?: string | null;
  transaction_amount?: number | null;
  payment_method_id?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string | null;
      qr_code_base64?: string | null;
      ticket_url?: string | null;
    } | null;
  } | null;
}

interface PreapprovalLike {
  id?: string | null;
  status?: string | null;
  external_reference?: string | null;
  init_point?: string | null;
  next_payment_date?: string | null;
  payment_method_id?: string | null;
  auto_recurring?: {
    transaction_amount?: number | null;
    currency_id?: string | null;
    frequency?: number | null;
    frequency_type?: string | null;
  } | null;
}

function toAmountCents(amount: number | null | undefined): number | null {
  return typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function toPaymentResult(
  payment: PaymentLike,
  fallbackExternalReference: string,
  fallbackAmountCents: number,
): CardPaymentResult {
  if (payment.id === undefined || payment.id === null || String(payment.id).length === 0) {
    throw new MercadoPagoError({
      code: "mp_unknown",
      context: "payment_result",
      message: "O Mercado Pago respondeu sem identificador de pagamento: tente novamente.",
    });
  }

  return {
    paymentId: String(payment.id),
    status: payment.status ?? "unknown",
    statusDetail: payment.status_detail ?? null,
    externalReference: payment.external_reference ?? fallbackExternalReference,
    amountCents: toAmountCents(payment.transaction_amount) ?? fallbackAmountCents,
    paymentMethodId: payment.payment_method_id ?? null,
  };
}

function toPreapprovalResult(
  preapproval: PreapprovalLike,
  paymentMethod: PaymentMethod,
): PreapprovalResult {
  if (typeof preapproval.id !== "string" || preapproval.id.trim().length === 0) {
    throw new MercadoPagoError({
      code: "mp_unknown",
      context: "preapproval_result",
      message: "O Mercado Pago respondeu sem identificador de assinatura: tente novamente.",
    });
  }

  return {
    preapprovalId: preapproval.id,
    status: preapproval.status ?? null,
    initPoint: preapproval.init_point ?? null,
    externalReference: preapproval.external_reference ?? null,
    nextPaymentDate: preapproval.next_payment_date ?? null,
    paymentMethod,
  };
}

// ---------------------------------------------------------------------------
// Pagamentos avulsos
// ---------------------------------------------------------------------------

/**
 * Cria pagamento avulso de cartão (Payment Brick já tokenizou o cartão no browser).
 *
 * O `cardTokenId` é de uso único e nunca é persistido; a `idempotencyKey` evita
 * cobrança dupla em retry do mesmo request.
 */
export async function createCardOrderPayment(
  input: CardOrderPaymentInput,
): Promise<CardPaymentResult> {
  const tenantId = assertNonEmpty(input.tenantId, "tenantId");
  const payerEmail = assertPayerEmail(input.payerEmail);
  const cardTokenId = assertNonEmpty(input.cardTokenId, "cardTokenId");
  const amountCents = assertAmountCents(input.amountCents);
  const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
  const externalReference = buildExternalReference(tenantId, input.planTier);

  const body = {
    transaction_amount: centsToAmount(amountCents),
    description: planDescription(input.planTier),
    external_reference: externalReference,
    notification_url: notificationUrl(),
    statement_descriptor: "BRANDPULSE",
    installments: 1,
    token: cardTokenId,
    payer: { email: payerEmail },
    metadata: {
      tenant_id: tenantId,
      plan_tier: input.planTier,
      source: "brandpulse_checkout",
    },
  };

  try {
    const response = await new Payment(getMpClient()).create({
      body,
      requestOptions: { idempotencyKey },
    });

    return toPaymentResult(response, externalReference, amountCents);
  } catch (error) {
    throw toMercadoPagoError(error, "createCardOrderPayment");
  }
}

/**
 * Cria cobrança Pix avulsa e devolve o QR code (`qr_code` + `qr_code_base64`).
 * A expiração padrão é de 30 minutos — janela suficiente para o pagador escanear.
 */
export async function createPixPayment(input: PixPaymentInput): Promise<PixPaymentResult> {
  const tenantId = assertNonEmpty(input.tenantId, "tenantId");
  const payerEmail = assertPayerEmail(input.payerEmail);
  const amountCents = assertAmountCents(input.amountCents);
  const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
  const expiresInMinutes = input.expiresInMinutes ?? 30;

  if (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0 || expiresInMinutes > 24 * 60) {
    throw new MercadoPagoError({
      code: "mp_invalid_input",
      context: "validation",
      message: "Validade do Pix inválida: informe entre 1 e 1440 minutos.",
    });
  }

  const externalReference = buildExternalReference(tenantId, input.planTier);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000).toISOString();

  const body = {
    transaction_amount: centsToAmount(amountCents),
    description: planDescription(input.planTier),
    external_reference: externalReference,
    notification_url: notificationUrl(),
    payment_method_id: "pix",
    date_of_expiration: expiresAt,
    payer: { email: payerEmail },
    metadata: {
      tenant_id: tenantId,
      plan_tier: input.planTier,
      source: "brandpulse_pix",
    },
  };

  try {
    const response = await new Payment(getMpClient()).create({
      body,
      requestOptions: { idempotencyKey },
    });

    const base = toPaymentResult(response, externalReference, amountCents);
    const transactionData = response.point_of_interaction?.transaction_data;

    return {
      ...base,
      qrCode: transactionData?.qr_code ?? null,
      qrCodeBase64: transactionData?.qr_code_base64 ?? null,
      ticketUrl: transactionData?.ticket_url ?? null,
      expiresAt: response.date_of_expiration ?? expiresAt,
    };
  } catch (error) {
    throw toMercadoPagoError(error, "createPixPayment");
  }
}

// ---------------------------------------------------------------------------
// Assinaturas (PreApproval)
// ---------------------------------------------------------------------------

function buildPreapprovalBody(input: PreapprovalInput) {
  const payerEmail = assertPayerEmail(input.payerEmail);
  const backUrl = assertHttpUrl(input.backUrl, "backUrl");
  const amountCents = PLANS[input.planTier].priceCents;

  return {
    reason: planDescription(input.planTier),
    // Assinaturas usam APENAS o tenantId: o plano é derivado do valor recorrente.
    external_reference: input.tenantId.trim(),
    payer_email: payerEmail,
    back_url: backUrl,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: centsToAmount(amountCents),
      currency_id: "BRL",
    },
  };
}

function requestOptionsFor(idempotencyKey: string | undefined) {
  return idempotencyKey === undefined ? undefined : { idempotencyKey: assertIdempotencyKey(idempotencyKey) };
}

/**
 * Assinatura recorrente de cartão (débito mensal automático).
 *
 * Enviamos `status: "authorized"` porque o cartão já foi tokenizado no Brick: a
 * assinatura nasce ativa e a primeira cobrança acontece na autorização. O
 * `init_point` também é devolvido (o MP pode exigir reautenticação em 3DS).
 */
export async function createCardPreapproval(
  input: CardPreapprovalInput,
): Promise<PreapprovalResult> {
  assertNonEmpty(input.tenantId, "tenantId");
  const cardTokenId = assertNonEmpty(input.cardTokenId, "cardTokenId");
  const body = {
    ...buildPreapprovalBody(input),
    card_token_id: cardTokenId,
    status: "authorized",
  };

  try {
    const response = await new PreApproval(getMpClient()).create({
      body,
      requestOptions: requestOptionsFor(input.idempotencyKey),
    });

    return toPreapprovalResult(response, "card_preapproval");
  } catch (error) {
    throw toMercadoPagoError(error, "createCardPreapproval");
  }
}

/**
 * Mandato de Pix Automático (débito recorrente autorizado no app do banco).
 *
 * Não há cartão: o pagador autoriza o mandato no `init_point` do Mercado Pago,
 * por isso a assinatura nasce `pending` (não forçamos `authorized`).
 *
 * O SDK tipa o corpo de PreApproval sem `payment_method_id`; o campo é aceito e
 * encaminhado pela API (o SDK serializa o objeto como recebido), então ele entra
 * por uma variável intermediária — sem `any` e sem `as`.
 */
export async function createPixAutomaticoMandate(
  input: PreapprovalInput,
): Promise<PreapprovalResult> {
  assertNonEmpty(input.tenantId, "tenantId");

  const bodyWithMethod = {
    ...buildPreapprovalBody(input),
    payment_method_id: "pix",
  };

  try {
    const response = await new PreApproval(getMpClient()).create({
      body: bodyWithMethod,
      requestOptions: requestOptionsFor(input.idempotencyKey),
    });

    return toPreapprovalResult(response, "pix_automatico");
  } catch (error) {
    throw toMercadoPagoError(error, "createPixAutomaticoMandate");
  }
}

// ---------------------------------------------------------------------------
// Consulta e cancelamento
// ---------------------------------------------------------------------------

/** Busca o status REAL do pagamento na API (fonte de verdade do worker). */
export async function getPaymentById(paymentId: string): Promise<MpPaymentSnapshot> {
  const id = assertNonEmpty(paymentId, "paymentId");

  try {
    const response = await new Payment(getMpClient()).get({ id });

    return {
      paymentId: response.id === undefined ? id : String(response.id),
      status: response.status ?? "unknown",
      statusDetail: response.status_detail ?? null,
      externalReference: response.external_reference ?? null,
      amountCents: toAmountCents(response.transaction_amount),
      paymentMethodId: response.payment_method_id ?? null,
    };
  } catch (error) {
    throw toMercadoPagoError(error, "getPaymentById");
  }
}

export async function getPreApprovalById(preapprovalId: string): Promise<PreapprovalSnapshot> {
  const id = assertNonEmpty(preapprovalId, "preapprovalId");

  try {
    const response = await new PreApproval(getMpClient()).get({ id });
    const methodId = response.payment_method_id ?? null;

    return {
      preapprovalId: response.id ?? id,
      status: response.status ?? null,
      externalReference: response.external_reference ?? null,
      nextPaymentDate: response.next_payment_date ?? null,
      paymentMethodId: methodId,
      amountCents: toAmountCents(response.auto_recurring?.transaction_amount),
    };
  } catch (error) {
    throw toMercadoPagoError(error, "getPreApprovalById");
  }
}

/**
 * Cancela a assinatura. O SDK v3 não expõe método dedicado de cancelamento:
 * a operação oficial é `PUT /preapproval/:id` com `status: "cancelled"`.
 */
export async function cancelPreApproval(
  preapprovalId: string,
): Promise<{ preapprovalId: string; status: string | null }> {
  const id = assertNonEmpty(preapprovalId, "preapprovalId");

  try {
    const response = await new PreApproval(getMpClient()).update({
      id,
      body: { status: "cancelled" },
    });

    return { preapprovalId: response.id ?? id, status: response.status ?? null };
  } catch (error) {
    throw toMercadoPagoError(error, "cancelPreApproval");
  }
}
