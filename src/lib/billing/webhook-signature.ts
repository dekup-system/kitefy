import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificação da assinatura dos webhooks do Mercado Pago.
 *
 * Regras de segurança (não-negociáveis):
 *  - comparação SEMPRE em tempo constante (`crypto.timingSafeEqual`);
 *  - buffers de tamanhos diferentes nunca chegam ao `timingSafeEqual` (ele lança);
 *  - este módulo NÃO loga nada: nem o secret, nem o header `x-signature`, nem o
 *    hash recebido. Quem chama pode logar apenas o `reason` + `x-request-id`.
 *
 * Formato do header (Mercado Pago): `ts=<segundos>,v1=<hmac-sha256-hex>`,
 * possivelmente em outra ordem e com espaços.
 */

export interface ParsedSignature {
  /** Timestamp em segundos (epoch), como enviado pelo Mercado Pago. */
  ts: string;
  /** HMAC-SHA256 em hex. */
  v1: string;
}

export type MpSignatureFailureReason = "missing" | "malformed" | "expired" | "mismatch";

export type MpSignatureManifest = "official_semicolon" | "official" | "legacy_compact";

export interface MpSignatureVerification {
  valid: boolean;
  reason?: MpSignatureFailureReason;
  /**
   * Formato de manifesto que validou. Serve para calibrar contra um evento real
   * do Sandbox; depois de confirmado, os demais formatos devem ser removidos
   * (aceitar vários amplia a superfície de verificação).
   */
  manifest?: MpSignatureManifest;
}

export interface SignatureManifestInput {
  /** Valor de `data.id` (query string) da notificação. */
  dataId: string;
  /** Valor do header `x-request-id`. */
  requestId: string;
  /** Valor de `ts` extraído do header `x-signature`. */
  ts: string;
}

export interface VerifyMpSignatureInput {
  signatureHeader: string | null | undefined;
  requestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string;
  /** Relógio injetável para testes; padrão `Date.now()`. */
  nowMs?: number;
  /** Janela aceita em segundos (padrão 300 = 5 min). */
  toleranceSeconds?: number;
}

/** Tolerância padrão: 5 minutos. Reduz replay sem exigir sincronismo perfeito. */
export const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Faz o parse de `ts=...,v1=...` aceitando qualquer ordem, espaços e campos
 * desconhecidos (ex.: `v2=` de uma futura versão do Mercado Pago).
 *
 * Retorna `null` quando o header está ausente/inutilizável — inclusive quando
 * falta `ts` ou `v1` — para que o chamador trate como `malformed`.
 */
export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (typeof header !== "string") return null;

  const raw = header.trim();
  if (raw.length === 0) return null;

  const fields = new Map<string, string>();

  for (const segment of raw.split(",")) {
    const separator = segment.indexOf("=");
    // `<= 0` descarta segmentos sem chave (`=x`) ou sem separador.
    if (separator <= 0) continue;

    const key = segment.slice(0, separator).trim().toLowerCase();
    const value = segment.slice(separator + 1).trim();
    if (key.length === 0 || value.length === 0) continue;

    // Primeira ocorrência vence: evita que um campo duplicado sobrescreva o ts.
    if (!fields.has(key)) fields.set(key, value);
  }

  const ts = fields.get("ts");
  const v1 = fields.get("v1");
  if (ts === undefined || v1 === undefined) return null;

  return { ts, v1 };
}

/**
 * Manifesto assinado pelo Mercado Pago no formato compacto `dataId:requestId:ts`.
 *
 * Decisão de normalização: a documentação do Mercado Pago determina que, quando
 * `data.id` contém letras, o valor deve ser convertido para MINÚSCULAS antes de
 * entrar no manifesto. Normalizamos aqui (ponto único) para que webhook e testes
 * produzam exatamente a mesma string — inclusive quando o MP enviar maiúsculas.
 *
 * Observação: a doc também descreve o template verboso
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. O contrato deste projeto é o
 * formato compacto acima; trocá-lo exige atualizar as fixtures de teste e o
 * simulador de webhook em conjunto, nunca apenas um dos lados.
 */
export function buildSignatureManifest({ dataId, requestId, ts }: SignatureManifestInput): string {
  return `${dataId.trim().toLowerCase()}:${requestId.trim()}:${ts.trim()}`;
}

/**
 * Manifesto oficial do Mercado Pago Webhooks v1:
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
/**
 * Manifesto oficial do Mercado Pago.
 *
 * O SDK oficial alerta para NÃO normalizar `data.id`: ids de pedido chegam
 * alfanuméricos com maiúsculas (ex.: ORD01JQ4S...) e qualquer lower/trim extra
 * muda a string assinada. O `;` final aparece em parte da documentação — por
 * isso testamos as duas variantes até capturar um evento real do Sandbox.
 */
export function buildOfficialMpManifest(
  { dataId, requestId, ts }: SignatureManifestInput,
  trailingSemicolon = true,
): string {
  const suffix = trailingSemicolon ? ";" : "";
  return `id:${dataId.trim()};request-id:${requestId.trim()};ts:${ts.trim()}${suffix}`;
}

/**
 * Compara dois hex em tempo constante.
 *
 * `timingSafeEqual` lança quando os buffers têm tamanhos diferentes, então o
 * tamanho é checado antes: assinatura truncada/estendida retorna `false` sem
 * exceção e sem vazar o comprimento esperado por timing.
 */
function constantTimeEqualHex(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "utf8");
  const provided = Buffer.from(providedHex.toLowerCase(), "utf8");

  if (expected.length !== provided.length) return false;

  return timingSafeEqual(expected, provided);
}

/**
 * Verifica a autenticidade de uma notificação do Mercado Pago.
 *
 * Ordem de checagem: presença → parse → timestamp dentro da tolerância → HMAC.
 * Nunca lança para input malicioso; devolve `{ valid: false, reason }`.
 */
export function verifyMpSignature(input: VerifyMpSignatureInput): MpSignatureVerification {
  const { signatureHeader, requestId, dataId, secret } = input;
  const nowMs = input.nowMs ?? Date.now();
  const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS;

  if (typeof signatureHeader !== "string" || signatureHeader.trim().length === 0) {
    return { valid: false, reason: "missing" };
  }
  if (typeof requestId !== "string" || requestId.trim().length === 0) {
    return { valid: false, reason: "missing" };
  }
  if (typeof dataId !== "string" || dataId.trim().length === 0) {
    return { valid: false, reason: "missing" };
  }

  // Secret ausente é erro de configuração: sem ele nenhuma assinatura é válida.
  // Reportado como `malformed` para não sugerir ao chamador que o header veio errado.
  if (typeof secret !== "string" || secret.length === 0) {
    return { valid: false, reason: "malformed" };
  }

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { valid: false, reason: "malformed" };

  const tsSeconds = Number(parsed.ts);
  if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) {
    return { valid: false, reason: "malformed" };
  }

  // Tolerância simétrica: cobre clock skew entre MP e nosso servidor e rejeita
  // replay antigo. Fora da janela o hash nem é calculado.
  const driftMs = Math.abs(nowMs - tsSeconds * 1000);
  if (driftMs > toleranceSeconds * 1000) {
    return { valid: false, reason: "expired" };
  }

  const sign = (manifest: string): string =>
    createHmac("sha256", secret).update(manifest, "utf8").digest("hex");

  const candidates: { manifest: MpSignatureManifest; value: string }[] = [
    {
      manifest: "official_semicolon",
      value: sign(buildOfficialMpManifest({ dataId, requestId, ts: parsed.ts }, true)),
    },
    {
      manifest: "official",
      value: sign(buildOfficialMpManifest({ dataId, requestId, ts: parsed.ts }, false)),
    },
    {
      manifest: "legacy_compact",
      value: sign(buildSignatureManifest({ dataId, requestId, ts: parsed.ts })),
    },
  ];

  const matched = candidates.find((candidate) => constantTimeEqualHex(candidate.value, parsed.v1));
  if (!matched) {
    return { valid: false, reason: "mismatch" };
  }

  return { valid: true, manifest: matched.manifest };
}

/**
 * Comparação em tempo constante para segredos opacos de tamanho arbitrário
 * (ex.: `x-worker-secret`). Diferente da assinatura, aqui não há hex: comparamos
 * os bytes UTF-8 crus, com checagem prévia de tamanho.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}
