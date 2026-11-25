import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { createSupabaseServerClient, getSessionContext } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { CompetitorForm } from "./competitor-form";
import { CompetitorRadar } from "./competitor-radar";
import type { ToneOfVoice } from "@/types/domain";

export const metadata = { title: "Concorrentes" };

interface BrandItem {
  id: string;
  brand_name: string;
  website_url: string | null;
  tone_of_voice: ToneOfVoice | null;
}

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const brandsQuery = await supabase
    .from("brand_profiles")
    .select("id, brand_name, website_url, tone_of_voice")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true });

  const brands = (brandsQuery.data ?? []) as BrandItem[];
  const selected = brands.find((b) => b.id === params.brand) ?? brands[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Concorrentes & Radar"
        description="Monitore concorrentes de cada marca (site ou rede social), extraia ideias em 1 clique e descubra lacunas de busca."
      />

      {brands.length === 0 ? (
        <EmptyState
          title="Nenhuma marca cadastrada"
          description="Cadastre sua primeira marca em Inteligência → Marcas e Personas para monitorar concorrentes."
        />
      ) : (
        <>
          {brands.length > 1 ? (
            <nav aria-label="Selecionar marca" className="flex flex-wrap gap-2">
              {brands.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/competitors?brand=${brand.id}`}
                  aria-current={brand.id === selected?.id ? "page" : undefined}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors ${
                    brand.id === selected?.id
                      ? "border-brand-navy bg-brand-navy font-medium text-white"
                      : "border-border bg-card hover:bg-accent/50"
                  }`}
                >
                  {brand.brand_name}
                </Link>
              ))}
            </nav>
          ) : null}

          {selected ? (
            <div className="space-y-6">
              <CompetitorRadar
                key={`radar-${selected.id}`}
                brandId={selected.id}
                brandName={selected.brand_name}
                entries={selected.tone_of_voice?.competitor_radar ?? []}
              />

              {selected.website_url ? (
                <CompetitorForm key={`form-${selected.id}`} brandName={selected.brand_name} />
              ) : (
                <EmptyState
                  title={`Análise comparativa de site indisponível para ${selected.brand_name}`}
                  description="O Radar acima já funciona normalmente. Para comparar lacunas de páginas com o seu site, cadastre a URL em Marcas e Personas."
                />
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
