import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  FileStack,
  FileText,
  Image as ImageIcon,
  Layers,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
  Type,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { buildWeeklyIdeas } from "@/lib/onboarding/extract";
import { CREDIT_COSTS, PLANS } from "@/lib/pricing";
import {
  computeBrandCompleteness,
  packageDisplayName,
  resolveNextBestAction,
  type BrandCompletenessInput,
} from "@/lib/ui/workspace-insights";
import { formatDateTimeBR, formatPercent } from "@/lib/utils";
import type { CampaignAssetRow, PerformanceTelemetryRow } from "@/types/domain";

export const metadata: Metadata = { title: "Início" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  awaiting_approval: "Aguardando aprovação",
  approved: "Pronto",
  exported: "Publicado",
};

const TYPE_LABEL: Record<string, string> = {
  short_script_kit: "Roteiro de vídeo",
  typo_carousel: "Carrossel Instagram",
  hybrid_carousel: "Carrossel ilustrado",
  single_creative: "Post único",
  geo_article: "Artigo GEO",
  lp_copy: "Página de vendas",
};

const TYPE_ICON: Record<string, typeof FileText> = {
  short_script_kit: Type,
  typo_carousel: Layers,
  hybrid_carousel: ImageIcon,
  single_creative: Sparkles,
  geo_article: FileText,
  lp_copy: FileText,
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
      .select(
        "id, brand_name, website_url, icp_description, tone_of_voice, visual_tokens, entity_facts, google_verification_token",
      )
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("campaigns_and_assets")
      .select("id, title, asset_type, status, created_at, thread_id, credits_charged")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: false })
      .limit(24),
    supabase
      .from("performance_telemetry")
      .select("hook_rate, impressions, ai_citations_count")
      .eq("tenant_id", session.tenantId)
      .limit(500),
  ]);

  const planTier = tenant.data?.plan_tier ?? "essential";
  const plan = PLANS[planTier];
  const packageName = packageDisplayName(planTier);
  const creditBalance = tenant.data?.credit_balance ?? 0;

  const brandRows = (brands.data ?? []) as BrandCompletenessInput[];
  const assetRows = (assets.data ?? []) as Pick<
    CampaignAssetRow,
    "id" | "title" | "asset_type" | "status" | "created_at" | "thread_id" | "credits_charged"
  >[];
  const telemetryRows = (telemetry.data ?? []) as Pick<
    PerformanceTelemetryRow,
    "hook_rate" | "impressions" | "ai_citations_count"
  >[];

  const pendingAssets = assetRows.filter((row) => row.status === "awaiting_approval");
  const readyAssets = assetRows.filter((row) => row.status === "approved");
  const exportedAssets = assetRows.filter((row) => row.status === "exported");
  const draftAssets = assetRows.filter((row) => row.status === "draft");

  const withImpressions = telemetryRows.filter((row) => Number(row.impressions) > 0);
  const avgHookRate =
    withImpressions.length > 0
      ? withImpressions.reduce((total, row) => total + Number(row.hook_rate), 0) / withImpressions.length
      : null;
  const citations = telemetryRows.reduce((total, row) => total + Number(row.ai_citations_count), 0);

  const primaryBrand = brandRows[0];
  const completeness = primaryBrand ? computeBrandCompleteness(primaryBrand) : null;
  const weeklyIdeas = primaryBrand
    ? buildWeeklyIdeas({
        brand_name: primaryBrand.brand_name,
        icp_description: primaryBrand.icp_description,
        entity_facts: primaryBrand.entity_facts ?? undefined,
      }).slice(0, 3)
    : [];

  const nextAction = resolveNextBestAction({
    brandCount: brandRows.length,
    primaryBrandId: primaryBrand?.id,
    primaryBrandName: primaryBrand?.brand_name,
    brandCompletenessScore: completeness?.score,
    pendingApprovalCount: pendingAssets.length,
    firstPendingThreadId: pendingAssets[0]?.thread_id,
    totalAssets: assetRows.length,
    telemetryCount: telemetryRows.length,
    creditBalance,
  });

  const remainingCarousels = Math.floor(creditBalance / CREDIT_COSTS.typo_carousel);
  const remainingGeoArticles = Math.floor(creditBalance / CREDIT_COSTS.geo_article);
  const recentAssets = assetRows.slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={`Olá, ${tenant.data?.name ?? "bem-vindo"}`}
        description="Seu painel de produção, prioridades da semana e saldo de créditos."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/campaigns">Biblioteca</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/studio/new">
                <Sparkles className="size-4" aria-hidden="true" />
                Criar conteúdo
              </Link>
            </Button>
          </div>
        }
      />

      {/* Próxima Melhor Ação — Âncora Navy da marca (contraste imediato no topo) */}
      <section
        aria-label="Próxima melhor ação"
        className="relative overflow-hidden rounded-2xl border border-brand-navy/20 bg-brand-navy p-5 text-white shadow-card sm:p-6"
      >
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/75">
              <span className="inline-block size-2 rounded-full bg-brand-signal" aria-hidden="true" />
              {nextAction.eyebrow}
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
              {nextAction.title}
            </h2>
            <p className="text-sm leading-relaxed text-white/75">{nextAction.description}</p>
          </div>
          <Link
            href={nextAction.href}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-brand-navy shadow-xs transition-all hover:bg-white/90"
          >
            {nextAction.ctaLabel}
            <ArrowRight className="size-4 text-brand-signal" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Pipeline de produção + capacidade de créditos */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Saldo de créditos</span>
            <Wallet className="size-4 text-brand-signal" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {creditBalance}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / {plan.monthlyCredits} ({packageName})
            </span>
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Até {remainingCarousels} posts ou {remainingGeoArticles} artigos GEO
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Pipeline de conteúdos</span>
            <FileStack className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {assetRows.length}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">na biblioteca</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            <span>{pendingAssets.length} aguardando</span>
            <span>· {readyAssets.length} prontos</span>
            <span>· {exportedAssets.length} publicados</span>
            {draftAssets.length > 0 ? <span>· {draftAssets.length} rasc.</span> : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Retenção nos 3s</span>
            <Target className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {avgHookRate === null ? "—" : formatPercent(avgHookRate)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {withImpressions.length > 0
              ? `Média em ${withImpressions.length} registro(s)`
              : "Registre seu 1º resultado em Resultados"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Citações em Buscas / IA</span>
            <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {citations}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Citações registradas nos artigos GEO
          </p>
        </div>
      </div>

      {/* Área principal assimétrica */}
      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <div className="space-y-6">
          {/* Ideias prontas da semana */}
          {primaryBrand && weeklyIdeas.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="size-4 text-brand-signal" aria-hidden="true" />
                  Ideias da semana para {primaryBrand.brand_name}
                </CardTitle>
                <CardDescription>
                  Clique em uma ideia para gerar imagens e legenda em menos de 1 minuto.
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
                      className="group flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface-inset/45 p-3.5 transition-all hover:border-foreground/30 hover:bg-card hover:shadow-xs"
                    >
                      <div className="space-y-1.5">
                        <span className="inline-block rounded-md bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {idea.badge}
                        </span>
                        <p className="text-sm font-semibold leading-snug text-foreground group-hover:underline">
                          {idea.title}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                        Abrir no estúdio{" "}
                        <ArrowRight className="size-3.5 text-brand-signal" aria-hidden="true" />
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          {/* Conteúdos recentes em cards */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
              <div>
                <CardTitle>Conteúdos recentes</CardTitle>
                <CardDescription>Seus últimos carrosséis, roteiros e artigos.</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/campaigns">
                  Ver biblioteca <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentAssets.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="size-5" aria-hidden="true" />}
                  title="Nenhum conteúdo criado ainda"
                  description="Crie o primeiro em menos de um minuto: roteiro ou carrossel custa 1 crédito."
                  action={
                    <Button asChild size="sm">
                      <Link href="/studio/new">Criar primeiro conteúdo</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {recentAssets.map((row) => {
                    const Icon = TYPE_ICON[row.asset_type] ?? FileText;
                    return (
                      <div
                        key={row.id}
                        className="group flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface-inset/35 p-3.5 transition-colors hover:border-foreground/25 hover:bg-card"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <Icon className="size-3.5" aria-hidden="true" />
                              {TYPE_LABEL[row.asset_type] ?? row.asset_type}
                            </span>
                            <Badge variant={STATUS_VARIANT[row.status] ?? "outline"} className="text-xs">
                              {STATUS_LABEL[row.status] ?? row.status}
                            </Badge>
                          </div>
                          <Link
                            href={`/studio/${row.thread_id}`}
                            className="line-clamp-2 block text-sm font-semibold leading-snug text-foreground underline-offset-4 hover:underline"
                          >
                            {row.title}
                          </Link>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2.5 text-xs text-muted-foreground">
                          <span className="font-mono">{formatDateTimeBR(row.created_at)}</span>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/studio/${row.thread_id}`}
                              className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              Abrir
                            </Link>
                            <a
                              href={`/api/assets/${row.id}/export?format=zip`}
                              aria-label={`Baixar ZIP de ${row.title}`}
                              className="inline-flex items-center text-muted-foreground hover:text-foreground"
                            >
                              <Download className="size-3.5" aria-hidden="true" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral: Saúde da marca + Aprendizado */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Saúde da marca</CardTitle>
                {completeness ? (
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {completeness.score}%
                  </span>
                ) : null}
              </div>
              <CardDescription>
                {brandRows.length} de {plan.maxBrands} marca(s) no pacote {packageName}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {completeness && primaryBrand ? (
                <>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-surface-inset"
                    role="progressbar"
                    aria-valuenow={completeness.score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Completude da marca ${primaryBrand.brand_name}: ${completeness.score}%`}
                  >
                    <div
                      className={
                        completeness.score >= 80
                          ? "h-full rounded-full bg-success"
                          : "h-full rounded-full bg-brand-signal"
                      }
                      style={{ width: `${completeness.score}%` }}
                    />
                  </div>

                  <ul className="space-y-2 text-xs">
                    {completeness.items.map((item) => (
                      <li key={item.key} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-foreground">
                          {item.done ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                          ) : (
                            <Circle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          )}
                          <span className={item.done ? "text-muted-foreground line-through" : undefined}>
                            {item.label}
                          </span>
                        </span>
                        {!item.done ? (
                          <Link
                            href={item.href}
                            className="shrink-0 font-medium text-foreground underline underline-offset-4"
                          >
                            Ajustar
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {brandRows.length > 1 ? (
                    <div className="border-t border-border pt-3">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Suas marcas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {brandRows.map((brand) => (
                          <Link
                            key={brand.id}
                            href={`/settings/brand?brand=${brand.id}`}
                            className="rounded-md border border-border bg-surface-inset/50 px-2 py-1 text-xs font-medium hover:border-foreground/30"
                          >
                            {brand.brand_name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <Button asChild className="w-full" variant="outline">
                  <Link href="/onboarding">Cadastrar primeira marca</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Aprendizado de ganchos</CardTitle>
              <CardDescription>
                Marque os posts que performaram bem para o estúdio repetir suas melhores aberturas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Button asChild variant="outline" className="w-full">
                <Link href="/telemetry">Abrir resultados</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full text-xs text-muted-foreground">
                <Link href="/google">Configurar Pacote Google (SEO/GEO)</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
