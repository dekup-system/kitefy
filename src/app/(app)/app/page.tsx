import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, FileStack, Sparkles, Target, Wallet } from "lucide-react";
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
import { PLANS } from "@/lib/pricing";
import { formatDateTimeBR, formatPercent } from "@/lib/utils";
import type { CampaignAssetRow, PerformanceTelemetryRow } from "@/types/domain";

export const metadata: Metadata = { title: "Visão geral" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  awaiting_approval: "Aguardando",
  approved: "Aprovado",
  exported: "Exportado",
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
    supabase.from("brand_profiles").select("id, brand_name").eq("tenant_id", session.tenantId),
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

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Olá, ${tenant.data?.name ?? "bem-vindo"}`}
        description="Tudo o que importa agora: créditos, ativos recentes e o retorno observado do orgânico."
        actions={
          <Button asChild>
            <Link href="/studio/new">
              <Sparkles className="size-4" aria-hidden="true" />
              Novo ativo
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Créditos disponíveis"
          value={<span className="font-mono">{tenant.data?.credit_balance ?? 0}</span>}
          hint={`Plano ${plan.name} · ${plan.monthlyCredits}/mês`}
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Ativos no mês"
          value={<span className="font-mono">{assetsThisMonth}</span>}
          hint="Aprovados ou em revisão neste ciclo"
          icon={<FileStack className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Hook rate médio"
          value={<span className="font-mono">{avgHookRate === null ? "—" : formatPercent(avgHookRate)}</span>}
          hint="Retenção nos 3 primeiros segundos"
          icon={<Target className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Citações em IA"
          value={<span className="font-mono">{citations}</span>}
          hint="Somatório da telemetria registrada"
          icon={<BarChart3 className="size-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Ativos recentes</CardTitle>
              <CardDescription>Os últimos conteúdos gerados pelo estúdio.</CardDescription>
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
                title="Nenhum ativo ainda"
                description="Gere o primeiro em menos de um minuto: roteiro curto custa 1 crédito."
                action={
                  <Button asChild size="sm">
                    <Link href="/studio/new">Começar agora</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ativo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Criado</TableHead>
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
                        <span className="block text-xs text-muted-foreground">{row.asset_type}</span>
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
              <CardTitle>Aprendizado</CardTitle>
              <CardDescription>
                O estúdio usa Thompson Sampling: cada telemetria registrada ajusta a probabilidade do
                ângulo vencedor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/telemetry">Registrar telemetria</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
