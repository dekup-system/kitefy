import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { PLANS } from "@/lib/pricing";
import { getSessionContext } from "@/lib/supabase/server";
import { newIdempotencyKey, withIdempotency } from "@/lib/billing/idempotency";
import {
  createPixPayment,
  httpStatusForMpError,
  MercadoPagoError,
} from "@/lib/billing/mercadopago";

/**
 * POST /api/billing/pix
 *
 * Cria uma cobrança Pix avulsa do plano e devolve o QR code para o pagador.
 * O crédito NÃO é aplicado aqui: só depois de o worker confirmar o pagamento
 * aprovado na API do Mercado Pago (`/api/jobs/mercadopago`).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.billing.pix");

const pixSchema = z.object({
  planTier: z.enum(["essential", "pro", "agency"]),
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
        { error: "Sessão ausente ou expirada. Entre novamente para gerar o Pix." },
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

    const parsed = pixSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados do Pix inválidos.", issues: issuesOf(parsed.error) },
        { status: 400 },
      );
    }

    const { planTier } = parsed.data;
    const plan = PLANS[planTier];

    const payment = await withIdempotency(
      `pix:${session.tenantId}:${planTier}`,
      () =>
        createPixPayment({
          tenantId: session.tenantId,
          planTier,
          payerEmail,
          amountCents: plan.priceCents,
          idempotencyKey: newIdempotencyKey(),
        }),
    );

    log.info("Cobrança Pix criada", {
      tenantId: session.tenantId,
      paymentId: payment.paymentId,
      status: payment.status,
      planTier,
    });

    return NextResponse.json({
      status: payment.status,
      paymentId: payment.paymentId,
      qrCode: payment.qrCode,
      qrCodeBase64: payment.qrCodeBase64,
      ticketUrl: payment.ticketUrl,
      expiresAt: payment.expiresAt,
    });
  } catch (error) {
    if (error instanceof MercadoPagoError) {
      log.warn("Falha do Mercado Pago ao criar Pix", {
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

    log.error("Erro inesperado ao criar Pix", error);
    return NextResponse.json(
      { error: "Não foi possível gerar o Pix agora. Tente novamente em instantes." },
      { status: 500 },
    );
  }
}
