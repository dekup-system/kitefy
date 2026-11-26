import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { CREDIT_TOPUP_PACKS } from "@/lib/pricing";
import { getSessionContext } from "@/lib/supabase/server";
import { newIdempotencyKey } from "@/lib/billing/idempotency";
import {
  createTopUpPixPayment,
  httpStatusForMpError,
  MercadoPagoError,
} from "@/lib/billing/mercadopago";

/**
 * POST /api/billing/topup
 *
 * Gera cobrança Pix avulsa para pacote extra de créditos (+50 por R$ 30 ou +100 por R$ 50).
 * Os créditos NUNCA são liberados aqui: entram automaticamente somente após
 * confirmação de pagamento aprovado via webhook do Mercado Pago.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.billing.topup");

const bodySchema = z.object({
  packId: z.enum(["extra_50", "extra_100"]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json(
        { error: "Sessão expirada. Entre novamente para comprar créditos extras." },
        { status: 401 },
      );
    }

    if (session.role !== "owner") {
      return NextResponse.json(
        { error: "Apenas o proprietário da conta pode comprar pacotes extras de créditos." },
        { status: 403 },
      );
    }

    const payerEmail = session.user.email;
    if (!payerEmail) {
      return NextResponse.json(
        { error: "Sua conta não possui e-mail verificado para emitir o Pix." },
        { status: 400 },
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Pacote de créditos inválido." }, { status: 422 });
    }

    const pack = CREDIT_TOPUP_PACKS[parsed.data.packId];

    const payment = await createTopUpPixPayment({
      tenantId: session.tenantId,
      packId: pack.id,
      description: `Kitefy — ${pack.name}`,
      payerEmail,
      amountCents: pack.priceCents,
      idempotencyKey: newIdempotencyKey(),
    });

    log.info("Pix de pacote extra de créditos gerado", {
      tenantId: session.tenantId,
      packId: pack.id,
      credits: pack.credits,
      paymentId: payment.paymentId,
    });

    return NextResponse.json({
      packId: pack.id,
      credits: pack.credits,
      priceCents: pack.priceCents,
      status: payment.status,
      paymentId: payment.paymentId,
      qrCode: payment.qrCode,
      qrCodeBase64: payment.qrCodeBase64,
      ticketUrl: payment.ticketUrl,
      expiresAt: payment.expiresAt,
    });
  } catch (error) {
    if (error instanceof MercadoPagoError) {
      log.warn("Falha do Mercado Pago ao gerar Pix de créditos extras", {
        code: error.code,
        status: error.status,
      });
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: httpStatusForMpError(error) },
      );
    }

    log.error("Erro inesperado ao gerar Pix de créditos extras", error);
    return NextResponse.json(
      { error: "Não foi possível gerar o Pix agora. Tente novamente em instantes." },
      { status: 500 },
    );
  }
}
