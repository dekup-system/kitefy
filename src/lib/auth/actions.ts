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
