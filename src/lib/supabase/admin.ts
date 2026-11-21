import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabase } from "@/lib/env";

/**
 * Cliente com service_role: ignora RLS.
 *
 * Regras de uso (não-negociáveis):
 *  - NUNCA importar em componente cliente;
 *  - toda operação que aceita dados do usuário deve revalidar o tenant no servidor;
 *  - webhooks somente após validação HMAC.
 */
let adminClient: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const { url, serviceRoleKey } = requireSupabase();
  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "brandpulse-admin" },
    },
  });

  return adminClient;
}

/** Somente para testes. */
export function resetAdminClient(): void {
  adminClient = null;
}
