import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, Lock, Webhook } from "lucide-react";
import { TelemetryForms } from "./telemetry-forms";
import { TelemetryCharts } from "./telemetry-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { BanditArmStatRow, PerformanceTelemetryRow, PlanTier } from "@/types/domain";

export const metadata: Metadata = { title: "Resultados" };

export default async function TelemetryPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();

  const [tenantQuery, brands, assets, rows, arms] = await Promise.all([
    supabase
      .from("tenants")
      .select("plan_tier")
      .eq("id", session.tenantId)
      .single<{ plan_tier: PlanTier }>(),
    supabase
      .from("brand_profiles")
      .select("id, brand_name")
      .eq("tenant_id", session.tenantId)
      .order("created_at"),
    supabase
      .from("campaigns_and_assets")
      .select("id, title, brand_id")
      .eq("tenant_id", session.tenantId)
      .in("status", ["approved", "exported"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("performance_telemetry")
      .select("id, channel_label, impressions, views_3s, hook_rate, retention_50_pct, saves_or_clicks, ai_citations_count, source_mode, recorded_at")
      .eq("tenant_id", session.tenantId)
      .order("recorded_at", { ascending: false })
      .limit(50),
    supabase
      .from("bandit_arm_stats")
      .select("arm_key, alpha, beta, pulls")
      .eq("tenant_id", session.tenantId)
      .order("pulls", { ascending: false })
      .limit(12),
  ]);

  const brandOptions = (brands.data ?? []) as { id: string; brand_name: string }[];
  const assetOptions = (assets.data ?? []) as { id: string; title: string; brand_id: string }[];
  const telemetryRows = (rows.data ?? []) as Pick<
    PerformanceTelemetryRow,
    | "id"
    | "channel_label"
    | "impressions"
    | "views_3s"
    | "hook_rate"
    | "retention_50_pct"
    | "saves_or_clicks"
    | "ai_citations_count"
    | "source_mode"
    | "recorded_at"
  >[];
  const armRows = (arms.data ?? []) as Pick<BanditArmStatRow, "arm_key" | "alpha" | "beta" | "pulls">[];
  const planTier: PlanTier = tenantQuery.data?.plan_tier ?? "essential";
  const ga4Included = session.isPlatformAdmin || PLANS[planTier].includes.ga4Webhook;
  const ga4Endpoint = "https://www.kitefy.com.br/api/webhooks/ga4";
  const firstBrandId = brandOptions[0]?.id ?? "<BRAND_ID>";
  const ga4SamplePayload = JSON.stringify(
    {
      tenantId: session.tenantId,
      brandId: firstBrandId,
      events: [
        {
          channel_label: "blog-geo",
          impressions: 1200,
          views_3s: 680,
          saves_or_clicks: 94,
          ai_citations_count: 3,
        },
      ],
    },
    null,
    2,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resultados dos seus posts (Telemetria)"
        description="Informe os números reais das suas publicações para o estúdio aprender quais aberturas mais prendem a atenção do seu público — sem conectar nem pedir senha das suas redes sociais."
      />

      <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 text-xs leading-relaxed sm:grid-cols-3">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">1. Registro manual (qualquer rede)</p>
          <p className="text-muted-foreground">
            Abra as métricas no app da sua rede (Instagram Insights, TikTok, LinkedIn ou YouTube) e
            digite impressões, visualizações nos 3 primeiros segundos e salvamentos/cliques abaixo.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">2. Planilha CSV (vários posts de uma vez)</p>
          <p className="text-muted-foreground">
            CSV é um arquivo de tabela simples (tipo Excel/Google Planilhas) que você exporta do Meta
            Business Suite, TikTok Analytics ou YouTube Studio e sobe aqui em lote.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">3. Google Analytics 4 (automático)</p>
          <p className="text-muted-foreground">
            Para artigos e páginas do seu site, os pacotes Lift e Flow recebem métricas
            automaticamente via webhook <code className="font-mono">/api/webhooks/ga4</code>.
          </p>
        </div>
      </div>

      {brandOptions.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" aria-hidden="true" />}
          title="Cadastre uma marca primeiro"
          description="A telemetria é sempre vinculada a uma marca e, quando possível, a um ativo."
        />
      ) : (
        <>
          <TelemetryCharts rows={telemetryRows} arms={armRows} />
          <Tabs defaultValue="registrar" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap gap-1">
            <TabsTrigger value="registrar">Registrar</TabsTrigger>
            <TabsTrigger value="ga4">Integração GA4</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="aprendizado">Aprendizado</TabsTrigger>
          </TabsList>

          <TabsContent value="registrar">
            <TelemetryForms brands={brandOptions} assets={assetOptions} />
          </TabsContent>

          <TabsContent value="ga4" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Webhook className="size-4 text-brand-signal" aria-hidden="true" />
                    Integração automática com Google Analytics 4 (GA4)
                  </CardTitle>
                  <Badge variant={ga4Included ? "success" : "warning"}>
                    {ga4Included ? "Liberada no seu pacote" : "Disponível no Lift e Flow"}
                  </Badge>
                </div>
                <CardDescription>
                  Envie métricas reais de artigos GEO e páginas de vendas diretamente do GA4 (via Google Tag Manager, Make ou n8n) para alimentar o aprendizado automático da Kitefy.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {ga4Included ? (
                  <>
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      <span>
                        Sua conta possui acesso completo ao webhook GA4. Copie os identificadores abaixo para conectar sua automação.
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Endpoint POST</span>
                          <CopyButton value={ga4Endpoint} label="Copiar URL" size="sm" />
                        </div>
                        <p className="break-all font-mono text-xs text-foreground">{ga4Endpoint}</p>
                      </div>

                      <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">ID da Conta (tenantId)</span>
                          <CopyButton value={session.tenantId} label="Copiar ID" size="sm" />
                        </div>
                        <p className="break-all font-mono text-xs text-foreground">{session.tenantId}</p>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs font-medium text-foreground">IDs das suas marcas (brandId)</p>
                      <div className="space-y-2">
                        {brandOptions.map((brand) => (
                          <div
                            key={brand.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{brand.brand_name}</p>
                              <p className="break-all font-mono text-[11px] text-muted-foreground">{brand.id}</p>
                            </div>
                            <CopyButton value={brand.id} label="Copiar brandId" size="sm" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-foreground">
                          Exemplo de payload JSON (Header: <code className="font-mono">x-ga4-secret</code>)
                        </p>
                        <CopyButton value={ga4SamplePayload} label="Copiar JSON" size="sm" />
                      </div>
                      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
                        {ga4SamplePayload}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
                    <div className="flex items-start gap-2.5">
                      <Lock className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          Recurso exclusivo dos pacotes Kitefy Lift e Kitefy Flow
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Faça upgrade para receber automaticamente impressões, retenção e citações de IA do Google Analytics 4 direto na sua telemetria.
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm">
                      <Link href="/settings/billing">Conhecer pacotes Lift e Flow</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historico">
            {telemetryRows.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="size-5" aria-hidden="true" />}
                title="Sem telemetria registrada"
                description="Registre manualmente ou importe um CSV para começar o aprendizado."
              />
            ) : (
              <Card className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Impr.</TableHead>
                      <TableHead className="text-right">3s</TableHead>
                      <TableHead className="text-right">Hook rate</TableHead>
                      <TableHead className="text-right">Citações IA</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {telemetryRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{formatDateTimeBR(row.recorded_at)}</TableCell>
                        <TableCell className="text-sm">{row.channel_label}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{row.impressions}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{row.views_3s}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatPercent(Number(row.hook_rate))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{row.ai_citations_count}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {row.source_mode}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="aprendizado">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Estilos de abertura vencedores</CardTitle>
                <CardDescription>
                  O estúdio mede quais abordagens geram mais retenção no seu público e prioriza as
                  vencedoras nas próximas gerações.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {armRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum estilo calibrado ainda. O aprendizado começa assim que você registra o
                    primeiro resultado de um conteúdo publicado.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estilo de abertura</TableHead>
                        <TableHead className="text-right">Usos</TableHead>
                        <TableHead className="text-right">Taxa de sucesso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {armRows.map((arm) => {
                        const alpha = Number(arm.alpha);
                        const beta = Number(arm.beta);
                        return (
                          <TableRow key={arm.arm_key}>
                            <TableCell className="font-mono text-xs">{arm.arm_key}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{arm.pulls}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-medium">
                              {formatPercent(alpha / (alpha + beta))}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </>
      )}
    </div>
  );
}
