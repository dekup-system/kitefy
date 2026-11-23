"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { generateCouponCode, normalizeCouponCode } from "@/lib/billing/coupons";
import { PLANS } from "@/lib/pricing";
import { getAdminSession } from "./auth";

/**
 * Ações do console administrativo.
 *
 * Toda action:
 *  1. revalida a flag de admin no servidor (nunca confia na UI);
 *  2. usa service_role somente depois dessa checagem;
 *  3. grava em `admin_audit_log` quem fez o quê;
 *  4. revalida as páginas afetadas.
 */

const log = createLogger("admin.actions");

export interface AdminActionState {
  error?: string;
  notice?: string;
}

export interface CreditAdjustState extends AdminActionState {
  balance?: number;
}

const PLAN_TIERS = ["essential", "pro", "agency"] as const;

async function audit(input: {
  adminUserId: string;
  adminEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("admin_audit_log").insert({
      admin_user_id: input.adminUserId,
      admin_email: input.adminEmail,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      payload: input.payload,
    });

    if (error) {
      log.warn("Falha ao gravar auditoria administrativa", {
        action: input.action,
        message: error.message,
      });
    }
  } catch (error) {
    log.warn("Auditoria administrativa indisponível", {
      action: input.action,
      message: error instanceof Error ? error.message : "erro",
    });
  }
}

const tenantIdSchema = z.string().uuid("Conta inválida.");

const planSchema = z.object({
  tenantId: tenantIdSchema,
  planTier: z.enum(PLAN_TIERS),
  note: z.string().trim().max(200).optional(),
});

export async function setTenantPlanAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await getAdminSession();
  if (!session) return { error: "Acesso negado." };

  const parsed = planSchema.safeParse({
    tenantId: formData.get("tenantId"),
    planTier: formData.get("planTier"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const admin = createSupabaseAdminClient();
    const previous = await admin
      .from("tenants")
      .select("plan_tier")
      .eq("id", parsed.data.tenantId)
      .maybeSingle<{ plan_tier: string }>();

    const updated = await admin
      .from("tenants")
      .update({ plan_tier: parsed.data.planTier })
      .eq("id", parsed.data.tenantId)
      .select("id");

    if (updated.error) {
      log.warn("Falha ao alterar plano pelo admin", { message: updated.error.message });
      return { error: "Não foi possível alterar o plano agora." };
    }
    if (!updated.data || updated.data.length === 0) {
      return { error: "Conta não encontrada." };
    }

    await audit({
      adminUserId: session.user.id,
      adminEmail: session.user.email ?? null,
      action: "tenant.plan_changed",
      targetType: "tenant",
      targetId: parsed.data.tenantId,
      payload: {
        planTier: parsed.data.planTier,
        previousPlan: previous.data?.plan_tier ?? null,
        note: parsed.data.note ?? null,
      },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/contas");
    revalidatePath(`/admin/contas/${parsed.data.tenantId}`);

    return {
      notice: `Plano alterado para ${PLANS[parsed.data.planTier].name}. A assinatura no Mercado Pago não foi alterada.`,
    };
  } catch (error) {
    log.error("Erro inesperado ao alterar plano", error);
    return { error: "Não foi possível alterar o plano agora." };
  }
}

const creditsSchema = z.object({
  tenantId: tenantIdSchema,
  delta: z.coerce
    .number()
    .int("O ajuste precisa ser um número inteiro.")
    .min(-100_000, "Ajuste máximo de -100.000 créditos.")
    .max(100_000, "Ajuste máximo de +100.000 créditos.")
    .refine((value) => value !== 0, { message: "Informe um ajuste diferente de zero." }),
  reason: z
    .string()
    .trim()
    .min(3, "Descreva o motivo do ajuste (mínimo 3 caracteres).")
    .max(200),
});

export async function adjustTenantCreditsAction(
  _prev: CreditAdjustState,
  formData: FormData,
): Promise<CreditAdjustState> {
  const session = await getAdminSession();
  if (!session) return { error: "Acesso negado." };

  const parsed = creditsSchema.safeParse({
    tenantId: formData.get("tenantId"),
    delta: formData.get("delta"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const admin = createSupabaseAdminClient();
    const referenceId = `admin_adjustment:${session.user.id}:${randomUUID()}`;
    const { data, error } = await admin.rpc("consume_credits", {
      p_tenant_id: parsed.data.tenantId,
      p_delta: parsed.data.delta,
      p_reason: `ajuste_admin: ${parsed.data.reason}`,
      p_reference_id: referenceId,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("insufficient_credits")) {
        return { error: "Saldo insuficiente para esse débito." };
      }
      if (message.includes("tenant_not_found")) {
        return { error: "Conta não encontrada." };
      }
      log.warn("Falha ao ajustar créditos pelo admin", { message });
      return { error: "Não foi possível ajustar os créditos agora." };
    }

    const balance = typeof data === "number" ? data : Number(data);

    await audit({
      adminUserId: session.user.id,
      adminEmail: session.user.email ?? null,
      action: "tenant.credits_adjusted",
      targetType: "tenant",
      targetId: parsed.data.tenantId,
      payload: {
        delta: parsed.data.delta,
        reason: parsed.data.reason,
        balance,
        referenceId,
      },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/contas");
    revalidatePath(`/admin/contas/${parsed.data.tenantId}`);
    revalidatePath("/settings/account");

    return {
      notice: `Créditos ajustados. Novo saldo: ${balance}.`,
      balance: Number.isFinite(balance) ? balance : undefined,
    };
  } catch (error) {
    log.error("Erro inesperado ao ajustar créditos", error);
    return { error: "Não foi possível ajustar os créditos agora." };
  }
}

const couponSchema = z.object({
  code: z.string().trim().max(32).optional(),
  percentOff: z.coerce
    .number()
    .int("O desconto precisa ser um número inteiro.")
    .min(1, "O desconto mínimo é 1%.")
    .max(90, "O desconto máximo é 90%."),
  maxRedemptions: z.coerce
    .number()
    .int("O limite precisa ser um número inteiro.")
    .min(1, "O limite mínimo é 1 uso.")
    .max(100_000, "O limite máximo é 100.000 usos."),
  validUntil: z.string().trim().optional(),
  note: z.string().trim().max(200).optional(),
});

function parseValidUntil(raw: string | undefined): { ok: true; value: string | null } | { ok: false } {
  if (!raw) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false };

  const date = new Date(`${raw}T23:59:59-03:00`);
  if (Number.isNaN(date.getTime())) return { ok: false };

  return { ok: true, value: date.toISOString() };
}

export async function createCouponAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await getAdminSession();
  if (!session) return { error: "Acesso negado." };

  const parsed = couponSchema.safeParse({
    code: formData.get("code") || undefined,
    percentOff: formData.get("percentOff"),
    maxRedemptions: formData.get("maxRedemptions"),
    validUntil: formData.get("validUntil") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const customCode = parsed.data.code ? normalizeCouponCode(parsed.data.code) : null;
  if (parsed.data.code && !customCode) {
    return {
      error:
        "Código inválido: use de 4 a 32 caracteres, com letras, números e hífen (ex.: KITE-ABC123).",
    };
  }

  const validUntil = parseValidUntil(parsed.data.validUntil);
  if (!validUntil.ok) {
    return { error: "Data de validade inválida." };
  }

  try {
    const admin = createSupabaseAdminClient();
    let createdCode: string | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 5 && !createdCode; attempt += 1) {
      const candidate = customCode ?? generateCouponCode();
      const inserted = await admin
        .from("discount_coupons")
        .insert({
          code: candidate,
          percent_off: parsed.data.percentOff,
          max_redemptions: parsed.data.maxRedemptions,
          valid_until: validUntil.value,
          note: parsed.data.note ?? null,
          created_by: session.user.id,
          active: true,
        })
        .select("id")
        .single<{ id: string }>();

      if (!inserted.error && inserted.data) {
        createdCode = candidate;
        break;
      }

      lastError = inserted.error?.message ?? null;

      // Código personalizado duplicado: não sorteia outro, devolve o erro.
      if (inserted.error?.code === "23505" && customCode) {
        return { error: "Já existe um cupom com esse código." };
      }
      // Código gerado colidiu: tenta outro.
      if (inserted.error?.code !== "23505") {
        break;
      }
    }

    if (!createdCode) {
      log.warn("Falha ao criar cupom", { message: lastError ?? "sem código único" });
      return { error: "Não foi possível gerar um código único agora. Tente novamente." };
    }

    await audit({
      adminUserId: session.user.id,
      adminEmail: session.user.email ?? null,
      action: "coupon.created",
      targetType: "coupon",
      targetId: createdCode,
      payload: {
        percentOff: parsed.data.percentOff,
        maxRedemptions: parsed.data.maxRedemptions,
        validUntil: validUntil.value,
        note: parsed.data.note ?? null,
      },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/cupons");

    const expiresLabel = validUntil.value
      ? ` Válido até ${new Date(validUntil.value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
      : "";
    return {
      notice: `Cupom ${createdCode} criado com ${parsed.data.percentOff}% de desconto.${expiresLabel}`,
    };
  } catch (error) {
    log.error("Erro inesperado ao criar cupom", error);
    return { error: "Não foi possível criar o cupom agora." };
  }
}

const couponToggleSchema = z.object({
  couponId: z.string().uuid("Cupom inválido."),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export async function setCouponActiveAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await getAdminSession();
  if (!session) return { error: "Acesso negado." };

  const parsed = couponToggleSchema.safeParse({
    couponId: formData.get("couponId"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { error: "Cupom inválido." };
  }

  try {
    const admin = createSupabaseAdminClient();
    const updated = await admin
      .from("discount_coupons")
      .update({ active: parsed.data.active })
      .eq("id", parsed.data.couponId)
      .select("code");

    if (updated.error) {
      log.warn("Falha ao alterar cupom", { message: updated.error.message });
      return { error: "Não foi possível alterar o cupom agora." };
    }
    if (!updated.data || updated.data.length === 0) {
      return { error: "Cupom não encontrado." };
    }

    const code = (updated.data[0] as { code?: string }).code ?? parsed.data.couponId;

    await audit({
      adminUserId: session.user.id,
      adminEmail: session.user.email ?? null,
      action: parsed.data.active ? "coupon.activated" : "coupon.deactivated",
      targetType: "coupon",
      targetId: code,
      payload: { active: parsed.data.active },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/cupons");

    return { notice: parsed.data.active ? "Cupom reativado." : "Cupom desativado." };
  } catch (error) {
    log.error("Erro inesperado ao alterar cupom", error);
    return { error: "Não foi possível alterar o cupom agora." };
  }
}
