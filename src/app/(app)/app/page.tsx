import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, FileStack, Lightbulb, Sparkles, Target, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { buildWeeklyIdeas } from "@/lib/onboarding/extract";
import { PLANS } from "@/lib/pricing";
import { formatDateTimeBR, formatPercent } from "@/lib/utils";
import type { CampaignAssetRow, PerformanceTelemetryRow } from "@/types/domain";

export const metadata: Metadata = { title: "Visão geral" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  awaiting_approval: "Aguardando",
  approved: "Pronto",
  exported: "Publicado",
};

const TYPE_LABEL: Record<string, string> = {
  short_script_kit: "Roteiro de vídeo",
  typo_carousel: "Carrossel Instagram",
  hybrid_carousel: "Carrossel ilustrado",
  single_creative: "Post único",
  geo_article: "Artigo para Blog",
  lp_copy: "Página de vendas",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "outline"> = {
  draft: "outline",
  awaiting_approval: "warning",
  approved: "success",
  exported: "secondary",
};

export default async function DashboardPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();

  const [tenant, brands, assets, telemetry] = await Promise.all([
    supabase
      .from("tenants")
      .select("credit_balance, plan_tier, name")
      .eq("id", session.tenantId)
      .single<{ credit_balance: number; plan_tier: keyof typeof PLANS; name: string }>(),
    supabase
      .from("brand_profiles")
      .select("id, brand_name, icp_description, entity_facts")
      .eq("tenant_id", session.tenantId),
    supabase
      .from("campaigns_and_assets")
      .select("id, title, asset_type, status, created_at, thread_id")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("performance_telemetry")
      .select("hook_rate, impressions, ai_citations_count")
      .eq("tenant_id", session.tenantId)
      .limit(500),
  ]);

  const plan = PLANS[tenant.data?.plan_tier ?? "essential"];
  const assetRows = (assets.data ?? []) as Pick<
    CampaignAssetRow,
    "id" | "title" | "asset_type" | "status" | "created_at" | "thread_id"
  >[];
  const telemetryRows = (telemetry.data ?? []) as Pick<
    PerformanceTelemetryRow,
    "hook_rate" | "impressions" | "ai_citations_count"
  >[];

  const withImpressions = telemetryRows.filter((row) => Number(row.impressions) > 0);
  const avgHookRate =
    withImpressions.length > 0
      ? withImpressions.reduce((total, row) => total + Number(row.hook_rate), 0) / withImpressions.length
      : null;
  const citations = telemetryRows.reduce((total, row) => total + Number(row.ai_citations_count), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const assetsThisMonth = assetRows.filter((row) => new Date(row.created_at) >= monthStart).length;

  const primaryBrand = (brands.data ?? [])[0] as
    | { id: string; brand_name: string; icp_description?: string | null; entity_facts?: { claim: string }[] }
    | undefined;
  const weeklyIdeas = primaryBrand ? buildWeeklyIdeas(primaryBrand) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Olá, ${tenant.data?.name ?? "bem-vindo"}`}
        description="Seus conteúdos prontos para publicar, ideias da semana e créditos disponíveis."
        actions={
          <Button asChild>
            <Link href="/studio/new">
              <Sparkles className="size-4" aria-hidden="true" />
              Criar conteúdo
            </Link>
          </Button>
        }
      />

      {primaryBrand && weeklyIdeas.length > 0 ? (
        <Card className="border-foreground/20 bg-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4" aria-hidden="true" />
              O que postar esta semana em {primaryBrand.brand_name}
            </CardTitle>
            <CardDescription>
              Escolha uma sugestão abaixo para criar o conteúdo completo com imagens e legenda em menos de 1 minuto.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {weeklyIdeas.map((idea) => {
              const params = new URLSearchParams({
                brand: primaryBrand.id,
                type: idea.assetType,
                objective: idea.objective,
                product: idea.productInput,
              });
              return (
                <Link
                  key={idea.id}
                  href={`/studio/new?${params.toString()}`}
                  className="group flex flex-col justify-between gap-2 rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-foreground/40 hover:bg-accent/40"
                >
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">{idea.badge}</span>
                    <p className="text-sm font-semibold leading-snug group-hover:underline">{idea.title}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                    Criar agora <ArrowRight className="size-3" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Créditos disponíveis"
          value={<span className="font-mono">{tenant.data?.credit_balance ?? 0}</span>}
          hint={`Plano ${plan.name} · ${plan.monthlyCredits}/mês`}
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Conteúdos no mês"
          value={<span className="font-mono">{assetsThisMonth}</span>}
          hint="Prontos ou publicados neste ciclo"
          icon={<FileStack className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Atenção nos 3s (Média)"
          value={<span className="font-mono">{avgHookRate === null ? "—" : formatPercent(avgHookRate)}</span>}
          hint="Pessoas que continuam vendo o post"
          icon={<Target className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Presença em Buscas / IA"
          value={<span className="font-mono">{citations}</span>}
          hint="Citações registradas nos seus artigos"
          icon={<BarChart3 className="size-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Conteúdos recentes</CardTitle>
              <CardDescription>Seus últimos posts, carrosséis e roteiros gerados.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/campaigns">
                Ver todos <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {assetRows.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="size-5" aria-hidden="true" />}
                title="Nenhum conteúdo ainda"
                description="Crie o primeiro em menos de um minuto: carrossel ou roteiro custa 1 crédito."
                action={
                  <Button asChild size="sm">
                    <Link href="/studio/new">Criar primeiro post</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/studio/${row.thread_id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.title}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {TYPE_LABEL[row.asset_type] ?? row.asset_type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {formatDateTimeBR(row.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Marcas</CardTitle>
              <CardDescription>
                {brands.data?.length ?? 0} de {plan.maxBrands} permitidas no plano.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(brands.data ?? []).length === 0 ? (
                <Button asChild className="w-full" variant="outline">
                  <Link href="/onboarding">Criar minha marca</Link>
                </Button>
              ) : (
                <ul className="space-y-1.5">
                  {(brands.data ?? []).map((brand) => (
                    <li key={brand.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{brand.brand_name}</span>
                      <Link
                        href={`/settings/brand?brand=${brand.id}`}
                        className="text-xs text-muted-foreground underline underline-offset-4"
                      >
                        editar
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Como o estúdio aprende</CardTitle>
              <CardDescription>
                Quando você marca um post como &ldquo;Bombou&rdquo;, o estúdio guarda o estilo de abertura para repetir o que dá resultado no seu público.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/telemetry">Ver resultados</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
