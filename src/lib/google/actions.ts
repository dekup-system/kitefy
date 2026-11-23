"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";
import { parseVerificationToken } from "@/lib/export/google-pack";
import { createLogger } from "@/lib/logger";

/**
 * Token de verificação do Search Console por marca.
 *
 * O token é público (vai no `<meta>` do index.html), então não é segredo — mas
 * ainda pertence a uma marca e por isso passa pela RLS de `brand_profiles`.
 * Aceita colar o token puro, `google-site-verification=...` ou a meta tag inteira.
 */

const log = createLogger("google.actions");

export interface GoogleTokenState {
  error?: string;
  notice?: string;
}

const brandIdSchema = z.string().uuid("Marca inválida.");

export async function saveVerificationTokenAction(
  _prev: GoogleTokenState,
  formData: FormData,
): Promise<GoogleTokenState> {
  const session = await requireSessionContext();

  if (session.role !== "owner" && session.role !== "editor") {
    return { error: "Seu perfil não tem permissão para alterar a marca." };
  }

  const parsedBrand = brandIdSchema.safeParse(formData.get("brandId"));
  if (!parsedBrand.success) {
    return { error: "Marca inválida." };
  }

  const raw = formData.get("token");
  if (typeof raw !== "string") {
    return { error: "Token inválido." };
  }
  if (raw.length > 500) {
    return { error: "Cole apenas o valor do token ou a meta tag, não a página inteira." };
  }

  const token = parseVerificationToken(raw);
  if (!token.ok) {
    return { error: token.error };
  }

  const supabase = await createSupabaseServerClient();
  const update = await supabase
    .from("brand_profiles")
    .update({ google_verification_token: token.token })
    .eq("id", parsedBrand.data)
    .eq("tenant_id", session.tenantId)
    .select("id");

  if (update.error) {
    log.warn("Falha ao salvar token do Search Console", { message: update.error.message });
    return { error: "Não foi possível salvar o token agora. Tente novamente." };
  }
  if (!update.data || update.data.length === 0) {
    return { error: "Marca não encontrada nesta conta." };
  }

  revalidatePath("/google");
  revalidatePath("/settings/brand");

  return {
    notice: token.token
      ? "Token salvo. Gere o pacote novamente para incluir a verificação no index.html."
      : "Token removido da marca.",
  };
}
