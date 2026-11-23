import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Autorização do console administrativo.
 *
 * A flag vive em `auth.users.app_metadata.is_admin` (gravada apenas com
 * service_role/Admin API) e é lida direto do `auth.getUser()` — o admin NÃO
 * precisa de tenant/membership para acessar o console. Este módulo é a única
 * porta de entrada: páginas usam `requireAdminPage` (404 para quem não é admin)
 * e as actions revalidam a sessão antes de qualquer service_role.
 */

export interface AdminSession {
  user: User;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.is_admin !== true) return null;
  return { user };
}

export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) notFound();
  return session;
}
