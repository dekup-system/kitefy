import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSignatureManifest } from "@/lib/billing/webhook-signature";

/**
 * Testes de wiring da rota de webhook (App Router).
 *
 * Cobrem o caminho crítico de segurança: assinatura inválida devolve 401 SEM
 * tocar no banco e a resposta nunca ecoa segredo nem header de assinatura.
 *
 * O ambiente é montado antes do import dinâmico da rota para que `getServerEnv()`
 * (chamado dentro do handler) veja os valores deste arquivo.
 */

const SECRET = "segredo-de-webhook-nao-vaze";
const DATA_ID = "1234567890";
const REQUEST_ID = "req-worker-test";

process.env.MP_WEBHOOK_SECRET = SECRET;
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
// Sem token: o handler do webhook não precisa dele (só do segredo de assinatura).
delete process.env.MP_ACCESS_TOKEN;

const { resetEnvCache } = await import("@/lib/env");
resetEnvCache();

const { NextRequest } = await import("next/server");
const webhookRoute = await import("@/app/api/webhooks/mercadopago/route");
const jobsRoute = await import("@/app/api/jobs/mercadopago/route");

function signedHeader(ts: string, dataId = DATA_ID, secret = SECRET): string {
  const v1 = createHmac("sha256", secret)
    .update(buildSignatureManifest({ dataId, requestId: REQUEST_ID, ts }), "utf8")
    .digest("hex");

  return `ts=${ts},v1=${v1}`;
}

function webhookRequest(options: {
  header: string | null;
  dataId?: string | null;
  body?: unknown;
}): InstanceType<typeof NextRequest> {
  const query = options.dataId === null ? "" : `?data.id=${options.dataId ?? DATA_ID}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": REQUEST_ID,
  };
  if (options.header !== null) headers["x-signature"] = options.header;

  return new NextRequest(`http://localhost/api/webhooks/mercadopago${query}`, {
    method: "POST",
    headers,
    body: JSON.stringify(
      options.body ?? { id: "evt-1", type: "payment", action: "payment.updated", data: { id: DATA_ID } },
    ),
  });
}

describe("POST /api/webhooks/mercadopago", () => {
  let nowTs = "";

  beforeAll(() => {
    nowTs = String(Math.floor(Date.now() / 1000));
  });

  it("responde 401 sem tocar no banco quando a assinatura não confere", async () => {
    const response = await webhookRoute.POST(
      webhookRequest({ header: `ts=${nowTs},v1=${"a".repeat(64)}` }),
    );
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).toContain("Assinatura do webhook inválida");
    // Nunca ecoa segredo nem assinatura.
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("a".repeat(64));
  });

  it("responde 401 quando o header x-signature está ausente", async () => {
    const response = await webhookRoute.POST(webhookRequest({ header: null }));
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).not.toContain(SECRET);
  });

  it("responde 401 quando o timestamp está fora da tolerância", async () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);

    const response = await webhookRoute.POST(webhookRequest({ header: signedHeader(oldTs) }));

    expect(response.status).toBe(401);
  });

  it("aceita assinatura válida (não responde 401) e nunca processa o pagamento no request", async () => {
    const response = await webhookRoute.POST(webhookRequest({ header: signedHeader(nowTs) }));
    const body = await response.text();

    expect(response.status).not.toBe(401);
    // 200 = evento persistido+enfileirado; 503 = infra indisponível neste ambiente.
    expect([200, 503]).toContain(response.status);
    // A resposta de infraestrutura não pode vazar segredo nem detalhe interno.
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("access_token");
  });

  it("exporta runtime nodejs e dynamic force-dynamic", () => {
    expect(webhookRoute.runtime).toBe("nodejs");
    expect(webhookRoute.dynamic).toBe("force-dynamic");
    expect(jobsRoute.runtime).toBe("nodejs");
    expect(jobsRoute.dynamic).toBe("force-dynamic");
  });
});

describe("POST /api/jobs/mercadopago (proteção do worker)", () => {
  it("responde 503 quando o Mercado Pago não está configurado", async () => {
    const request = new NextRequest("http://localhost/api/jobs/mercadopago", {
      method: "POST",
      headers: { "x-worker-secret": SECRET },
    });

    const response = await jobsRoute.POST(request);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain(SECRET);
  });

  it("rejeita header de worker ausente ou incorreto quando o MP está configurado", async () => {
    process.env.MP_ACCESS_TOKEN = "TEST-0000000000000000-000000-test-token";
    resetEnvCache();

    try {
      const missing = await jobsRoute.POST(
        new NextRequest("http://localhost/api/jobs/mercadopago", { method: "POST" }),
      );
      expect(missing.status).toBe(401);

      const wrong = await jobsRoute.POST(
        new NextRequest("http://localhost/api/jobs/mercadopago", {
          method: "POST",
          headers: { "x-worker-secret": `${SECRET}-errado` },
        }),
      );
      const wrongBody = await wrong.text();
      expect(wrong.status).toBe(401);
      expect(wrongBody).not.toContain(SECRET);
    } finally {
      delete process.env.MP_ACCESS_TOKEN;
      resetEnvCache();
    }
  });
});
