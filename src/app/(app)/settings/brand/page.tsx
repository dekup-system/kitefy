import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandForm } from "./brand-form";
import { BrandCreateForm } from "./brand-create-form";
import { BrandLogoForm } from "./brand-logo-form";
import { BrandDeleteForm } from "./brand-delete-form";
import { BrandFactsCard } from "./brand-facts-card";
import { AudienceStudyCard } from "./audience-study-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { signBrandLogo } from "@/lib/brand/logo-storage";
import { PLANS } from "@/lib/pricing";
import type { BrandProfileRow } from "@/types/domain";

export const metadata: Metadata = { title: "Marcas e Personas" };

export default async function BrandSettingsPage({
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
    .select("*")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true });

  const brands = (brandsQuery.data ?? []) as BrandProfileRow[];
  const selected = brands.find((brand) => brand.id === params.brand) ?? brands[0];
  const plan = PLANS[session.planTier];

  const logoPath = selected?.visual_tokens?.logo_path ?? null;
  const logoUrl = logoPath ? await signBrandLogo(logoPath) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Marcas e Personas"
        description="Configure identidade visual, DNA estratégico, tom de voz e estudo de público/personas (IBGE + ABEP). Tudo é cruzado automaticamente antes de gerar cada anúncio."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Adicionar marca</CardTitle>
          <CardDescription>
            {brands.length} de {plan.maxBrands} marca(s) do plano {plan.name}. Cada marca tem tom de
            voz, cores e logomarca próprios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandCreateForm
            brandCount={brands.length}
            maxBrands={plan.maxBrands}
            planName={plan.name}
          />
        </CardContent>
      </Card>

      {brands.length === 0 ? (
        <EmptyState
          title="Nenhuma marca cadastrada"
          description="Crie a primeira marca em menos de um minuto."
          action={
            <Link href="/onboarding" className="text-sm underline underline-offset-4">
              Ir para o onboarding
            </Link>
          }
        />
      ) : (
        <>
          {brands.length > 1 ? (
            <nav aria-label="Selecionar marca" className="flex flex-wrap gap-2">
              {brands.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/settings/brand?brand=${brand.id}`}
                  aria-current={brand.id === selected?.id ? "page" : undefined}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-sm ${
                    brand.id === selected?.id
                      ? "border-foreground/40 bg-accent font-medium"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  {brand.brand_name}
                </Link>
              ))}
            </nav>
          ) : null}

          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Perfil da marca · {selected.brand_name}</CardTitle>
                <CardDescription>
                  {brands.length} de {plan.maxBrands} marca(s) do plano {plan.name}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <BrandLogoForm
                  key={`logo-${selected.id}`}
                  brandId={selected.id}
                  brandName={selected.brand_name}
                  logoUrl={logoUrl}
                  hasLogo={Boolean(logoPath)}
                />
                <BrandForm key={`form-${selected.id}`} brand={selected} />

                <div className="border-t border-border pt-4">
                  <BrandDeleteForm
                    key={`delete-${selected.id}`}
                    brandId={selected.id}
                    brandName={selected.brand_name}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {selected ? <AudienceStudyCard key={`audience-${selected.id}`} brand={selected} /> : null}

          {selected ? (
            <BrandFactsCard
              key={`facts-${selected.id}`}
              brandId={selected.id}
              facts={selected.entity_facts ?? []}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
