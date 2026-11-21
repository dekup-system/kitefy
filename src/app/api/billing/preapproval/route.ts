import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { getSessionContext } from "@/lib/supabase/server";
import {
  createCardPreapproval,
  createPixAutomaticoMandate,
  httpStatusForMpError,
  MercadoPagoError,
} from "@/lib/billing/mercadopago";

/**
 * POST /api/billing/preapproval
 *
 * Cria a assinatura recorrente mensal:
 *  - `card_preapproval`: débito no cartão tokenizado (nasce autorizada);
 *  - `pix_automatico`: mandato de Pix Automático (o pagador autoriza no app do
 *    banco via `initPoint`, por isso nasce `pending`).
 *
 * O `backUrl` é montado no servidor a partir de NEXT_PUBLIC_APP_URL: o cliente
 * não escolhe para onde o Mercado Pago redireciona após a autorização.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.billing.preapproval");

const preapprovalSchema = z
  .object({
    method: z.enum(["card_preapproval", "pix_automatico"]),
    planTier: z.enum(["essential", "pro", "agency"]),
    cardTokenId: z.string().trim().min(8).max(256).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === "card_preapproval" && !value.cardTokenId) {
      ctx.addIssue({
        code: "custom",
        path: ["cardTokenId"],
        message: "cartão recorrente exige o token gerado pelo Payment Brick",
      });
    }
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
        { error: "Sessão ausente ou expirada. Entre novamente para assinar um plano." },
        { status: 401 },
      );
    }

    if (session.role !== "owner") {
      return NextResponse.json(
        { error: "Apenas o proprietário da conta pode assinar um plano." },
        { status: 403 },
      );
    }

    const payerEmail = session.user.email;
    if (!payerEmail) {
      return NextResponse.json(
        { error: "A conta não possui e-mail verificado: atualize o cadastro antes de assinar." },
        { status: 400 },
      );
    }

    const parsed = preapprovalSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados da assinatura inválidos.", issues: issuesOf(parsed.error) },
        { status: 400 },
      );
    }

    const { method, planTier, cardTokenId } = parsed.data;
    const appUrl = getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    const backUrl = `${appUrl}/configuracoes/cobranca?mp=retorno`;

    const base = {
      tenantId: session.tenantId,
      planTier,
      payerEmail,
      backUrl,
    };

    const preapproval =
      method === "card_preapproval"
        ? // O zod já exige `cardTokenId` neste ramo; o fallback vazio é barrado
          // por `assertNonEmpty` na lib (400 com mensagem acionável).
          await createCardPreapproval({ ...base, cardTokenId: cardTokenId ?? "" })
        : await createPixAutomaticoMandate(base);

    log.info("Assinatura criada no Mercado Pago", {
      tenantId: session.tenantId,
      preapprovalId: preapproval.preapprovalId,
      status: preapproval.status,
      paymentMethod: preapproval.paymentMethod,
      planTier,
    });

    return NextResponse.json({
      preapprovalId: preapproval.preapprovalId,
      status: preapproval.status,
      initPoint: preapproval.initPoint,
      paymentMethod: preapproval.paymentMethod,
    });
  } catch (error) {
    if (error instanceof MercadoPagoError) {
      log.warn("Falha do Mercado Pago ao criar assinatura", {
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

    log.error("Erro inesperado ao criar assinatura", error);
    return NextResponse.json(
      { error: "Não foi possível criar a assinatura agora. Tente novamente em instantes." },
      { status: 500 },
    );
  }
}
