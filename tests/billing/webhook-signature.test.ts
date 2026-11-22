import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildOfficialMpManifest,
  buildSignatureManifest,
  constantTimeEquals,
  parseSignatureHeader,
  verifyMpSignature,
} from "@/lib/billing/webhook-signature";

/**
 * Testes da assinatura de webhook do Mercado Pago.
 *
 * O HMAC esperado é calculado AQUI, de forma independente do módulo testado
 * (mesmo `createHmac` que o MP usa), para não mascarar um manifesto errado.
 */

const SECRET = "segredo-de-teste-do-mp";
const NOW_MS = 1_780_000_000_000; // instante fixo: testes determinísticos
const NOW_TS = String(Math.floor(NOW_MS / 1000));
const DATA_ID = "1234567890";
const REQUEST_ID = "req-abc-123";

function hmac(manifest: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(manifest, "utf8").digest("hex");
}

function signatureHeader(options?: {
  dataId?: string;
  requestId?: string;
  ts?: string;
  secret?: string;
  v1?: string;
  order?: "ts-first" | "v1-first";
}): string {
  const dataId = options?.dataId ?? DATA_ID;
  const requestId = options?.requestId ?? REQUEST_ID;
  const ts = options?.ts ?? NOW_TS;
  const v1 =
    options?.v1 ??
    hmac(buildSignatureManifest({ dataId, requestId, ts }), options?.secret ?? SECRET);

  return options?.order === "v1-first" ? `v1=${v1},ts=${ts}` : `ts=${ts},v1=${v1}`;
}

describe("buildSignatureManifest", () => {
  it("monta dataId:requestId:ts", () => {
    expect(buildSignatureManifest({ dataId: "42", requestId: "abc", ts: "1700000000" })).toBe(
      "42:abc:1700000000",
    );
  });

  it("normaliza dataId para minúsculas (exigência do MP quando há letras)", () => {
    expect(buildSignatureManifest({ dataId: "ABC123XY", requestId: "req", ts: "99" })).toBe(
      "abc123xy:req:99",
    );
  });

  it("remove espaços acidentais das pontas", () => {
    expect(
      buildSignatureManifest({ dataId: " 42 ", requestId: " abc ", ts: " 1700000000 " }),
    ).toBe("42:abc:1700000000");
  });
});

describe("parseSignatureHeader", () => {
  it("parseia ts=...,v1=...", () => {
    expect(parseSignatureHeader("ts=1700000000,v1=deadbeef")).toEqual({
      ts: "1700000000",
      v1: "deadbeef",
    });
  });

  it("aceita a ordem invertida", () => {
    expect(parseSignatureHeader("v1=deadbeef,ts=1700000000")).toEqual({
      ts: "1700000000",
      v1: "deadbeef",
    });
  });

  it("tolera espaços ao redor de campos e valores", () => {
    expect(parseSignatureHeader(" ts = 1700000000 , v1 = deadbeef ")).toEqual({
      ts: "1700000000",
      v1: "deadbeef",
    });
  });

  it("ignora campos desconhecidos (compatibilidade com v2)", () => {
    expect(parseSignatureHeader("ts=1,v2=xyz,v1=abc")).toEqual({ ts: "1", v1: "abc" });
  });

  it("retorna null quando falta ts ou v1", () => {
    expect(parseSignatureHeader("ts=1")).toBeNull();
    expect(parseSignatureHeader("v1=abc")).toBeNull();
    expect(parseSignatureHeader("ts=,v1=abc")).toBeNull();
  });

  it("retorna null para header vazio, nulo ou lixo", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
    expect(parseSignatureHeader("   ")).toBeNull();
    expect(parseSignatureHeader("sem-separador")).toBeNull();
    expect(parseSignatureHeader(",,")).toBeNull();
  });
});

describe("verifyMpSignature", () => {
  it("aceita assinatura válida", () => {
    const result = verifyMpSignature({
      signatureHeader: signatureHeader(),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result.valid).toBe(true);
    expect(result.manifest).toBe("legacy_compact");
  });

  it("aceita assinatura válida com campos na ordem invertida e espaços", () => {
    const header = signatureHeader({ order: "v1-first" }).replace(",", " , ");

    const result = verifyMpSignature({
      signatureHeader: header,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result.valid).toBe(true);
  });

  it("aceita dataId em maiúsculas normalizando o manifesto", () => {
    const header = signatureHeader({ dataId: "AB12CD" });

    const result = verifyMpSignature({
      signatureHeader: header,
      requestId: REQUEST_ID,
      dataId: "AB12CD",
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result.valid).toBe(true);
  });

  it("rejeita assinatura calculada com outro segredo", () => {
    const result = verifyMpSignature({
      signatureHeader: signatureHeader({ secret: "segredo-errado" }),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejeita quando o dataId não é o assinado", () => {
    const result = verifyMpSignature({
      signatureHeader: signatureHeader(),
      requestId: REQUEST_ID,
      dataId: "9999999999",
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejeita quando o requestId não é o assinado", () => {
    const result = verifyMpSignature({
      signatureHeader: signatureHeader(),
      requestId: "outro-request",
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejeita header malformado", () => {
    for (const header of ["lixo", "ts=abc", "ts=1", "v1=deadbeef", "ts=1700000000,v1="]) {
      const result = verifyMpSignature({
        signatureHeader: header,
        requestId: REQUEST_ID,
        dataId: DATA_ID,
        secret: SECRET,
        nowMs: NOW_MS,
      });

      expect(result).toEqual({ valid: false, reason: "malformed" });
    }
  });

  it("rejeita timestamp não numérico", () => {
    const result = verifyMpSignature({
      signatureHeader: `ts=abc,v1=${hmac("abc:req:abc")}`,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ valid: false, reason: "malformed" });
  });

  it("rejeita assinatura expirada fora da tolerância", () => {
    const oldTs = String(Math.floor(NOW_MS / 1000) - 301);

    const result = verifyMpSignature({
      signatureHeader: signatureHeader({ ts: oldTs }),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("rejeita timestamp no futuro além da tolerância (clock skew)", () => {
    const futureTs = String(Math.floor(NOW_MS / 1000) + 301);

    const result = verifyMpSignature({
      signatureHeader: signatureHeader({ ts: futureTs }),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("aceita timestamp no limite exato da tolerância", () => {
    const edgeTs = String(Math.floor(NOW_MS / 1000) - 300);

    const result = verifyMpSignature({
      signatureHeader: signatureHeader({ ts: edgeTs }),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result.valid).toBe(true);
  });

  it("respeita tolerância customizada", () => {
    const ts = String(Math.floor(NOW_MS / 1000) - 120);

    const strict = verifyMpSignature({
      signatureHeader: signatureHeader({ ts }),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
      toleranceSeconds: 60,
    });
    expect(strict).toEqual({ valid: false, reason: "expired" });

    const relaxed = verifyMpSignature({
      signatureHeader: signatureHeader({ ts }),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
      toleranceSeconds: 300,
    });
    expect(relaxed.valid).toBe(true);
  });

  it("rejeita ausência de header, requestId ou dataId", () => {
    const missingHeader = verifyMpSignature({
      signatureHeader: null,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(missingHeader).toEqual({ valid: false, reason: "missing" });

    const emptyHeader = verifyMpSignature({
      signatureHeader: "   ",
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(emptyHeader).toEqual({ valid: false, reason: "missing" });

    const missingRequestId = verifyMpSignature({
      signatureHeader: signatureHeader(),
      requestId: null,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(missingRequestId).toEqual({ valid: false, reason: "missing" });

    const missingDataId = verifyMpSignature({
      signatureHeader: signatureHeader(),
      requestId: REQUEST_ID,
      dataId: null,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(missingDataId).toEqual({ valid: false, reason: "missing" });
  });

  it("não lança quando o tamanho da assinatura difere (timingSafeEqual exige buffers iguais)", () => {
    const full = hmac(buildSignatureManifest({ dataId: DATA_ID, requestId: REQUEST_ID, ts: NOW_TS }));

    for (const tampered of [full.slice(0, 32), full.slice(0, 63), `${full}00`, ""]) {
      const run = () =>
        verifyMpSignature({
          signatureHeader: `ts=${NOW_TS},v1=${tampered}`,
          requestId: REQUEST_ID,
          dataId: DATA_ID,
          secret: SECRET,
          nowMs: NOW_MS,
        });

      expect(run).not.toThrow();
      // v1 vazio é malformado; demais tamanhos caem em mismatch.
      expect(run().valid).toBe(false);
    }
  });

  it("não lança com hash não-hex de tamanho igual", () => {
    const run = () =>
      verifyMpSignature({
        signatureHeader: `ts=${NOW_TS},v1=${"z".repeat(64)}`,
        requestId: REQUEST_ID,
        dataId: DATA_ID,
        secret: SECRET,
        nowMs: NOW_MS,
      });

    expect(run).not.toThrow();
    expect(run()).toEqual({ valid: false, reason: "mismatch" });
  });

  it("trata secret vazio como configuração inválida (nunca valida)", () => {
    const result = verifyMpSignature({
      signatureHeader: signatureHeader(),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: "",
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ valid: false, reason: "malformed" });
  });

  it("aceita o formato oficial do Mercado Pago (id:...;request-id:...;ts:...;)", () => {
    const officialManifest = buildOfficialMpManifest({
      dataId: DATA_ID,
      requestId: REQUEST_ID,
      ts: NOW_TS,
    });
    expect(officialManifest).toBe(`id:${DATA_ID};request-id:${REQUEST_ID};ts:${NOW_TS};`);
    // Sem normalização do id: id alfanumérico maiúsculo precisa continuar igual.

    const v1 = hmac(officialManifest, SECRET);
    const result = verifyMpSignature({
      signatureHeader: `ts=${NOW_TS},v1=${v1}`,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result.valid).toBe(true);
    expect(result.manifest).toBe("official_semicolon");
  });

  it("aceita o manifesto oficial sem o ponto e vírgula final", () => {
    const manifest = buildOfficialMpManifest(
      { dataId: DATA_ID, requestId: REQUEST_ID, ts: NOW_TS },
      false,
    );
    const v1 = hmac(manifest, SECRET);

    const result = verifyMpSignature({
      signatureHeader: `ts=${NOW_TS},v1=${v1}`,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result.valid).toBe(true);
    expect(result.manifest).toBe("official");
  });

  it("não normaliza id alfanumérico em maiúsculas no manifesto oficial", () => {
    // O SDK do Mercado Pago alerta: lower/trim extra mudam a string assinada.
    const orderId = "ORD01JQ4S7K9X2M";
    const manifest = buildOfficialMpManifest({
      dataId: orderId,
      requestId: REQUEST_ID,
      ts: NOW_TS,
    });

    expect(manifest).toContain(`id:${orderId};`);
    expect(manifest).not.toContain(`id:${orderId.toLowerCase()};`);

    const v1 = hmac(manifest, SECRET);
    const result = verifyMpSignature({
      signatureHeader: `ts=${NOW_TS},v1=${v1}`,
      requestId: REQUEST_ID,
      dataId: orderId,
      secret: SECRET,
      nowMs: NOW_MS,
    });

    expect(result.valid).toBe(true);
    expect(result.manifest).toBe("official_semicolon");
  });
});

describe("constantTimeEquals", () => {
  it("compara segredos de tamanhos diferentes sem lançar", () => {
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("", "")).toBe(true);
  });
});
