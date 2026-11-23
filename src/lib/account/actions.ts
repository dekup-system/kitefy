"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPublicEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createPlanCheckout } from "@/lib/billing/plan-checkout";
import { cancelPreApproval, isMpConfigured, MercadoPagoError } from "@/lib/billing/mercadopago";
import { resolvePlanChange } from "@/lib/billing/plan-change";
import type { PlanTier } from "@/types/domain";

/**
 * Painel do usuário: dados cadastrais e troca de plano.
 *
 * Regras:
 *  - nome da conta e troca de plano são exclusivos do `owner` (mesma regra do RLS);
 *  - e-mail e senha são do próprio usuário autenticado (Supabase Auth);
 *  - upgrade nunca cobra duas vezes: cria o checkout novo e encerra a assinatura
 *    antiga antes de redirecionar. Se o cancelamento falhar, nada é autorizado.
 */

const log = createLogger("account.actions");

export interface AccountFormState {
  error?: string;
  notice?: string;
}

const tenantNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da conta.")
  .max(120, "O nome da conta pode ter no máximo 120 caracteres.");

const emailSchema = z
  .string()
  .trim()
  .email("Informe um e-mail válido.")
  .max(254, "E-mail longo demais.");

const tierSchema = z.enum(["essential", "pro", "agency"]);

export async function updateAccountNameAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireSessionContext();

  if (session.role !== "owner") {
    return { error: "Apenas o proprietário da conta pode alterar o nome." };
  }

  const parsed = tenantNameSchema.safeParse(formData.get("tenantName"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nome inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const updated = await supabase
    .from("tenants")
    .update({ name: parsed.data })
    .eq("id", session.tenantId)
    .select("id");

  if (updated.error) {
    log.warn("Falha ao atualizar nome da conta", { message: updated.error.message });
    return { error: "Não foi possível salvar o nome agora. Tente novamente." };
  }

  revalidatePath("/settings/account");
  revalidatePath("/app");
  revalidatePath("/", "layout");
  return { notice: "Nome da conta atualizado." };
}

/**
 * Altera o e-mail de acesso. O Supabase envia um link de confirmação para o
 * novo endereço; até a confirmação, o e-mail antigo continua valendo.
 */
export async function updateEmailAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireSessionContext();
  const parsed = emailSchema.safeParse(formData.get("email"));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  }
  if (parsed.data.toLowerCase() === (session.user.email ?? "").toLowerCase()) {
    return { error: "Este já é o seu e-mail de acesso." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    {
      emailRedirectTo: `${getPublicEnv().appUrl}/auth/callback?next=/settings/account`,
    },
  );

  if (error) {
    log.warn("Falha ao solicitar troca de e-mail", { message: error.message });
    const alreadyUsed = /already|registered|exists/i.test(error.message);
    return {
      error: alreadyUsed
        ? "Este e-mail já está em uso por outra conta. Use outro endereço."
        : "Não foi possível enviar a confirmação agora. Tente novamente em instantes.",
    };
  }

  return {
    notice:
      "Enviamos um link de confirmação para o novo e-mail. O endereço atual continua valendo até você confirmar.",
  };
}

/** Envia para o e-mail da sessão o link que permite definir uma senha nova. */
export async function sendPasswordLinkAction(
  _prev: AccountFormState,
  _formData: FormData,
): Promise<AccountFormState> {
  const session = await requireSessionContext();
  const email = session.user.email;

  if (!email) {
    return { error: "Sua conta não tem e-mail cadastrado. Fale com o suporte." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getPublicEnv().appUrl}/auth/callback?next=/reset`,
  });

  if (error) {
    log.warn("Falha ao enviar link de senha pelo painel", { message: error.message });
    return { error: "Não foi possível enviar o link agora. Tente novamente." };
  }

  return { notice: "Enviamos um link para criar uma senha nova. Ele vale por 1 hora." };
}

/**
 * Troca de plano com segurança contra cobrança dupla.
 *
 * Ordem deliberada:
 *  1. cria o checkout do novo plano (ainda não cobra: o cliente autoriza depois);
 *  2. se havia assinatura ativa, cancela no Mercado Pago;
 *  3. só então redireciona para o checkout.
 *
 * Se o passo 2 falhar, o passo 3 não acontece — o cliente continua com o plano
 * antigo e nenhuma autorização nova foi concluída.
 */
export async function changePlanAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireSessionContext();

  if (session.role !== "owner") {
    return { error: "Apenas o proprietário da conta pode trocar o plano." };
  }

  const parsedTier = tierSchema.safeParse(formData.get("tier"));
  if (!parsedTier.success) {
    return { error: "Plano inválido." };
  }
  const targetTier = parsedTier.data as PlanTier;

  const supabase = await createSupabaseServerClient();
  const subscriptionQuery = await supabase
    .from("mp_subscriptions")
    .select("mp_preapproval_id, plan_tier, status")
    .eq("tenant_id", session.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      mp_preapproval_id: string;
      plan_tier: PlanTier;
      status: string;
    }>();

  if (subscriptionQuery.error) {
    log.warn("Falha ao carregar assinatura para troca de plano", {
      message: subscriptionQuery.error.message,
    });
    return { error: "Não foi possível consultar sua assinatura agora. Tente novamente." };
  }

  const subscription = subscriptionQuery.data;
  const active = subscription?.status === "active";
  const currentTier = active && subscription ? subscription.plan_tier : session.planTier;

  const decision = resolvePlanChange({
    currentTier,
    targetTier,
    subscriptionStatus: subscription?.status,
  });

  if (decision.kind === "current") {
    return { notice: decision.description };
  }

  if (!isMpConfigured()) {
    return {
      error:
        "O Mercado Pago não está configurado neste ambiente. Nenhuma cobrança foi criada; tente novamente quando o pagamento estiver disponível.",
    };
  }

  let initPoint: string;

  try {
    const checkout = await createPlanCheckout({
      tenantId: session.tenantId,
      tier: targetTier,
      appUrl: getPublicEnv().appUrl,
    });
    initPoint = checkout.initPoint;

    if (decision.requiresCancellation) {
      if (!subscription) {
        throw new Error("assinatura ativa sem registro local");
      }

      await cancelPreApproval(subscription.mp_preapproval_id);

      // Espelha o cancelamento imediatamente; o webhook do MP confirma depois.
      try {
        const admin = createSupabaseAdminClient();
        const cancelled = await admin
          .from("mp_subscriptions")
          .update({ status: "cancelled" })
          .eq("mp_preapproval_id", subscription.mp_preapproval_id);

        if (cancelled.error) {
          log.warn("Cancelamento no MP feito, mas status local não atualizou", {
            preapprovalId: subscription.mp_preapproval_id,
            message: cancelled.error.message,
          });
        }
      } catch (adminError) {
        log.warn("Cancelamento no MP feito, mas não foi possível espelhar localmente", {
          message: adminError instanceof Error ? adminError.message : "erro",
        });
      }

      log.info("Assinatura anterior cancelada para troca de plano", {
        tenantId: session.tenantId,
        from: currentTier,
        to: targetTier,
      });
    }
  } catch (error) {
    if (error instanceof MercadoPagoError) {
      log.warn("Falha do Mercado Pago na troca de plano", {
        code: error.code,
        status: error.status,
        context: error.context,
      });
      return { error: error.message };
    }

    log.error("Falha inesperada na troca de plano", error);
    return {
      error:
        "Não foi possível iniciar a troca de plano agora. Nenhuma cobrança nova foi autorizada; tente novamente.",
    };
  }

  revalidatePath("/settings/account");
  revalidatePath("/settings/billing");
  redirect(initPoint);
}
