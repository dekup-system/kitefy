import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { createSupabaseServerClient, getSessionContext } from "@/lib/supabase/server";
import { nextDaytimeBillingWindow } from "@/lib/billing/subscription-sync";
import type { PaymentMethod, PlanTier } from "@/types/domain";

/**
 * GET /api/billing/status
 *
 * Devolve a assinatura atual e o saldo de créditos do tenant da sessão.
 * Lê pelo cliente de sessão (RLS como fronteira): o `tenant_id` vem do
 * membership, nunca da query string.
 *
 * Funciona mesmo sem Mercado Pago configurado: é leitura pura de banco.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.billing.status");

interface TenantStatusRow {
  plan_tier: PlanTier;
  credit_balance: number;
}

interface SubscriptionStatusRow {
  mp_preapproval_id: string;
  payment_method: PaymentMethod;
  plan_tier: PlanTier;
  status: string;
  next_billing_date: string | null;
  updated_at: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json(
        { error: "Sessão ausente ou expirada. Entre novamente para ver a assinatura." },
        { status: 401 },
      );
    }

    const supabase = await createSupabaseServerClient();

    const tenantResult = await supabase
      .from("tenants")
      .select("plan_tier, credit_balance")
      .eq("id", session.tenantId)
      .maybeSingle();

    if (tenantResult.error) {
      log.error("Falha ao carregar o tenant na rota de status", {
        tenantId: session.tenantId,
        code: tenantResult.error.code,
        message: tenantResult.error.message,
      });
      return NextResponse.json(
        { error: "Não foi possível carregar o status da conta agora. Tente novamente." },
        { status: 500 },
      );
    }

    const tenant = tenantResult.data as TenantStatusRow | null;
    if (!tenant) {
      return NextResponse.json(
        { error: "Conta não encontrada para a sessão atual. Refaça o login." },
        { status: 404 },
      );
    }

    const subscriptionResult = await supabase
      .from("mp_subscriptions")
      .select("mp_preapproval_id, payment_method, plan_tier, status, next_billing_date, updated_at")
      .eq("tenant_id", session.tenantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionResult.error) {
      log.error("Falha ao carregar a assinatura na rota de status", {
        tenantId: session.tenantId,
        code: subscriptionResult.error.code,
        message: subscriptionResult.error.message,
      });
      return NextResponse.json(
        { error: "Não foi possível carregar a assinatura agora. Tente novamente." },
        { status: 500 },
      );
    }

    const subscription = subscriptionResult.data as SubscriptionStatusRow | null;

    return NextResponse.json({
      tenantId: session.tenantId,
      planTier: tenant.plan_tier,
      creditBalance: tenant.credit_balance,
      subscription: subscription
        ? {
            preapprovalId: subscription.mp_preapproval_id,
            paymentMethod: subscription.payment_method,
            planTier: subscription.plan_tier,
            status: subscription.status,
            nextBillingDate: subscription.next_billing_date,
            updatedAt: subscription.updated_at,
          }
        : null,
      // Próxima janela diurna de cobrança (08:00–18:00 America/Sao_Paulo).
      nextBillingWindow: nextDaytimeBillingWindow(new Date()).toISOString(),
    });
  } catch (error) {
    log.error("Erro inesperado na rota de status de billing", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o status da conta agora. Tente novamente." },
      { status: 500 },
    );
  }
}
