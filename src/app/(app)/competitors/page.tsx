import { PageHeader } from "@/components/ui/page-header";
import { createSupabaseServerClient, getSessionContext } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { CompetitorForm } from "./competitor-form";

export const metadata = { title: "Concorrentes" };

export default async function CompetitorsPage() {
  const session = await getSessionContext();
  const supabase = await createSupabaseServerClient();

  const brand = session
    ? await supabase
        .from("brand_profiles")
        .select("brand_name, website_url")
        .eq("tenant_id", session.tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ brand_name: string; website_url: string | null }>()
    : { data: null };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Concorrentes"
        description="Veja quais assuntos os concorrentes cobrem e a sua marca ainda não — e use como pauta."
      />

      {!brand.data?.website_url ? (
        <EmptyState
          title="Falta o site da sua marca"
          description="Cadastre a URL em Configurações → Marca. É a partir dela que comparamos os assuntos."
        />
      ) : (
        <CompetitorForm brandName={brand.data.brand_name} />
      )}
    </div>
  );
}
