"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getPublicEnv } from "@/lib/env";

/**
 * Autenticação: Google SSO + e-mail/senha (<= 3 campos).
 * Nenhum token social é armazenado — o Google é apenas provedor de identidade
 * do Supabase Auth, não uma integração de publicação.
 */

const log = createLogger("auth");

const credentialsSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa de ao menos 8 caracteres."),
  brandName: z.string().trim().max(120).optional(),
});

export interface AuthActionState {
  error?: string;
  notice?: string;
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    log.warn("Falha de login", { message: error.message });
    return { error: "E-mail ou senha incorretos. Verifique e tente novamente." };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    brandName: formData.get("brandName") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Confirmação de senha é checada aqui (o navegador pode ser contornado).
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (confirmPassword.length > 0 && confirmPassword !== parsed.data.password) {
    return { error: "As senhas não conferem. Digite a mesma senha nos dois campos." };
  }
  if (confirmPassword.length === 0) {
    return { error: "Confirme a senha no segundo campo." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { brand_name: parsed.data.brandName ?? null },
      emailRedirectTo: `${getPublicEnv().appUrl}/auth/callback`,
    },
  });

  if (error) {
    log.warn("Falha no cadastro", { message: error.message });
    const alreadyExists = /already registered|already exists/i.test(error.message);
    return {
      error: alreadyExists
        ? "Este e-mail já tem conta. Use a aba Entrar."
        : "Não foi possível criar a conta agora. Tente novamente em instantes.",
    };
  }

  // Quando a confirmação de e-mail está ativa, sessão vem nula.
  if (!data.session) {
    return { notice: "Enviamos um link de confirmação para o seu e-mail." };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

/**
 * "Entrar sem senha": envia um link mágico para o e-mail informado.
 * A resposta é sempre a mesma, para não revelar se o e-mail tem conta.
 */
export async function sendMagicLinkAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: "Informe um e-mail válido." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${getPublicEnv().appUrl}/auth/callback` },
  });

  if (error) {
    log.warn("Falha ao enviar link mágico", { message: error.message });
    return { error: "Não foi possível enviar o link agora. Tente novamente." };
  }

  return { notice: "Enviamos um link de acesso para o seu e-mail. Ele vale por 1 hora." };
}

/** Envia o e-mail de redefinição de senha. */
export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: "Informe um e-mail válido." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getPublicEnv().appUrl}/auth/callback?next=/reset`,
  });

  if (error) {
    log.warn("Falha ao pedir redefinição de senha", { message: error.message });
    return { error: "Não foi possível enviar o e-mail agora. Tente novamente." };
  }

  return { notice: "Enviamos um link para você criar uma senha nova. Ele vale por 1 hora." };
}

/** Grava a nova senha do usuário autenticado pelo link de redefinição. */
export async function updatePasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "A senha precisa ter pelo menos 8 caracteres." };
  }
  if (password !== confirmPassword) {
    return { error: "As senhas não conferem." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    log.warn("Falha ao atualizar senha", { message: error.message });
    return { error: "Não foi possível salvar a nova senha. Peça um novo link." };
  }

  redirect("/app");
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const next = safeNext(formData.get("next"));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getPublicEnv().appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error || !data.url) {
    log.error("Falha ao iniciar SSO Google", { message: error?.message ?? "sem url" });
    redirect(`/login?error=${encodeURIComponent("Não foi possível iniciar o login com Google.")}`);
  }

  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
