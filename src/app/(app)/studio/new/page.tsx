import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewRunForm } from "./new-run-form";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import type { AssetType } from "@/types/domain";

export const metadata: Metadata = { title: "Criar conteúdo" };

const ASSET_TYPES: AssetType[] = [
  "short_script_kit",
  "typo_carousel",
  "hybrid_carousel",
  "single_creative",
  "geo_article",
  "lp_copy",
];

export default async function NewStudioRunPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; type?: string; objective?: string; product?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const brandsQuery = await supabase
    .from("brand_profiles")
    .select("id, brand_name, icp_description, entity_facts")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true });

  const brands = (brandsQuery.data ?? []) as {
    id: string;
    brand_name: string;
    icp_description?: string | null;
    entity_facts?: { claim: string }[];
  }[];

  if (brands.length === 0) {
    redirect("/onboarding");
  }

  const tenant = await supabase
    .from("tenants")
    .select("credit_balance")
    .eq("id", session.tenantId)
    .single<{ credit_balance: number }>();

  const assetType =
    params.type && ASSET_TYPES.includes(params.type as AssetType)
      ? (params.type as AssetType)
      : undefined;

  const defaultBrandId =
    params.brand && brands.some((brand) => brand.id === params.brand) ? params.brand : brands[0]?.id;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="O que vamos publicar?"
        description="Escolha seu objetivo da semana ou clique em uma sugestão pronta. O estúdio cria o texto, verifica as regras do CONAR e entrega as imagens no tamanho certo."
      />
      <NewRunForm
        brands={brands}
        defaultBrandId={defaultBrandId}
        defaultAssetType={assetType}
        defaultObjective={params.objective}
        defaultProduct={params.product}
        creditBalance={tenant.data?.credit_balance ?? 0}
        mockMode={getServerEnv().LLM_PROVIDER_MODE === "mock"}
      />
    </div>
  );
}
