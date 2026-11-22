/**
 * Diagnóstico do Mercado Pago (sem cobrança).
 *
 * Uso:
 *   npm run mp:check            # valida token e lista a conta
 *   npm run mp:check -- --create # cria uma assinatura PENDENTE e mostra o init_point
 *   npm run mp:check -- --create --cancel  # cria e cancela em seguida (não cobra)
 *
 * Nada aqui autoriza pagamento: a assinatura nasce `pending` e só passa a
 * cobrar quando o comprador autoriza o link. O modo (teste/produção) é definido
 * pelo prefixo do token: TEST- ou APP_USR-.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const MP_API = "https://api.mercadopago.com";
const PREAPPROVAL_REASON = "Kitefy — teste de integração (não cobrar)";

function token(): string {
  const value = (process.env.MP_ACCESS_TOKEN ?? "").trim();
  if (!value) {
    throw new Error(
      "MP_ACCESS_TOKEN vazio. Copie o Access Token em developers > sua aplicação > Credenciais (de teste).",
    );
  }
  return value;
}

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // mantém texto cru
  }
  return { status: response.status, body };
}

function modeOf(value: string): string {
  if (value.startsWith("TEST-")) return "TESTE (sandbox)";
  if (value.startsWith("APP_USR-")) return "PRODUÇÃO";
  return "desconhecido";
}

async function main(): Promise<void> {
  const accessToken = token();
  console.log(`token .......: ${accessToken.slice(0, 10)}… (${accessToken.length} chars, ${modeOf(accessToken)})`);
  console.log(`segredo .....: ${process.env.MP_WEBHOOK_SECRET ? "configurado" : "AUSENTE (webhook não valida)"}`);

  const me = await call("/users/me");
  if (me.status !== 200) {
    console.error(`\nToken recusado (HTTP ${me.status}).`);
    console.error(JSON.stringify(me.body).slice(0, 300));
    process.exitCode = 1;
    return;
  }

  const account = me.body as { id?: number; nickname?: string; email?: string; site_id?: string };
  console.log(`conta .......: ${account.nickname ?? "-"} · id ${account.id ?? "-"} · ${account.site_id ?? "-"}`);

  const wantsCreate = process.argv.includes("--create");
  if (!wantsCreate) {
    console.log("\nToken válido. Use --create para gerar uma assinatura pendente.");
    return;
  }

  const backUrl = (process.env.APP_URL ?? "https://kitefy.vercel.app").replace(/\/$/, "");
  const created = await call("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: PREAPPROVAL_REASON,
      external_reference: `check-${Date.now()}`,
      back_url: `${backUrl}/settings/billing?mp=retorno`,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 49.9,
        currency_id: "BRL",
      },
    }),
  });

  if (created.status >= 300) {
    console.error(`\nFalha ao criar assinatura (HTTP ${created.status}).`);
    console.error(JSON.stringify(created.body).slice(0, 400));
    process.exitCode = 1;
    return;
  }

  const preapproval = created.body as { id?: string; init_point?: string; status?: string };
  console.log(`\nassinatura ..: ${preapproval.id ?? "-"} · status ${preapproval.status ?? "-"}`);
  console.log(`link ........: ${preapproval.init_point ?? "(sem init_point)"}`);

  if (process.argv.includes("--cancel") && preapproval.id) {
    const cancelled = await call(`/preapproval/${preapproval.id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    });
    console.log(`cancelamento : HTTP ${cancelled.status} (${(cancelled.body as { status?: string }).status ?? "-"})`);
  }
}

main().catch((error: unknown) => {
  console.error("Falha:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
