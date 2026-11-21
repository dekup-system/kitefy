import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { PLANS } from "@/lib/pricing";
import { getSessionContext } from "@/lib/supabase/server";
import { newIdempotencyKey, withIdempotency } from "@/lib/billing/idempotency";
import {
  createCardOrderPayment,
  httpStatusForMpError,
  MercadoPagoError,
} from "@/lib/billing/mercadopago";

/**
 * POST /api/billing/checkout
 *
 * Cobrança avulsa no cartão. O Payment Brick já tokenizou o cartão no browser,
 * então recebemos apenas `cardTokenId` + `planTier` (nunca dados de cartão).
 *
 * Segurança:
 *  - exige sessão Supabase e papel `owner` no tenant;
 *  - o valor é sempre `PLANS[planTier].priceCents` (o cliente não escolhe preço);
 *  - o e-mail do pagador vem da sessão (não do corpo);
 *  - nenhuma credencial ou dado de cartão é devolvido na resposta.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.billing.checkout");

const checkoutSchema = z.object({
  planTier: z.enum(["essential", "pro", "agency"]),
  cardTokenId: z.string().trim().min(8).max(256),
});

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "corpo"}: ${issue.message}`);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json(
        { error: "Sessão ausente ou expirada. Entre novamente para concluir o pagamento." },
        { status: 401 },
      );
    }

    if (session.role !== "owner") {
      return NextResponse.json(
        { error: "Apenas o proprietário da conta pode contratar um plano." },
        { status: 403 },
      );
    }

    const payerEmail = session.user.email;
    if (!payerEmail) {
      return NextResponse.json(
        { error: "A conta não possui e-mail verificado: atualize o cadastro antes de pagar." },
        { status: 400 },
      );
    }

    const parsed = checkoutSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados do pagamento inválidos.", issues: issuesOf(parsed.error) },
        { status: 400 },
      );
    }

    const { planTier, cardTokenId } = parsed.data;
    const plan = PLANS[planTier];

    // O token do Brick é de uso único: a chave inclui o token para que um retry
    // do MESMO request reutilize o resultado em vez de cobrar de novo.
    const payment = await withIdempotency(`checkout:${session.tenantId}:${cardTokenId}`, () =>
      createCardOrderPayment({
        tenantId: session.tenantId,
        planTier,
        payerEmail,
        cardTokenId,
        amountCents: plan.priceCents,
        idempotencyKey: newIdempotencyKey(),
      }),
    );

    log.info("Pagamento de cartão criado", {
      tenantId: session.tenantId,
      paymentId: payment.paymentId,
      status: payment.status,
      planTier,
    });

    return NextResponse.json({ status: payment.status, paymentId: payment.paymentId });
  } catch (error) {
    if (error instanceof MercadoPagoError) {
      log.warn("Falha do Mercado Pago no checkout", {
        code: error.code,
        status: error.status,
        retryable: error.retryable,
        context: error.context,
      });

      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: httpStatusForMpError(error) },
      );
    }

    log.error("Erro inesperado no checkout", error);
    return NextResponse.json(
      { error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." },
      { status: 500 },
    );
  }
}
