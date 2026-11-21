import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireSupabasePublic } from "@/lib/env";
import type { PlanTier, TenantRole } from "@/types/domain";

/**
 * Cliente Supabase para Server Components / Server Actions / Route Handlers.
 * Toda query roda com o JWT do usuário — a RLS é a fronteira de segurança.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabasePublic();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookie; o middleware cuida da sessão.
        }
      },
    },
  });
}

export interface SessionContext {
  user: User;
  tenantId: string;
  role: TenantRole;
  planTier: PlanTier;
  brandCount: number;
}

/**
 * Sessão + tenant ativo do usuário.
 * Retorna null quando não há sessão; lança quando a sessão existe mas não há
 * membership (estado inconsistente que a UI de onboarding resolve).
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const membership = await supabase
    .from("tenant_members")
    .select("tenant_id, role, tenants!inner(plan_tier)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership.error) {
    throw new Error(`Falha ao carregar membership: ${membership.error.message}`);
  }

  const row = membership.data as
    | { tenant_id: string; role: TenantRole; tenants: { plan_tier: PlanTier } }
    | null;

  if (!row) return null;

  const brands = await supabase
    .from("brand_profiles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", row.tenant_id);

  return {
    user,
    tenantId: row.tenant_id,
    role: row.role,
    planTier: row.tenants.plan_tier,
    brandCount: brands.count ?? 0,
  };
}

/** Exige sessão; redireciona a página se ausente é responsabilidade do caller. */
export async function requireSessionContext(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}
