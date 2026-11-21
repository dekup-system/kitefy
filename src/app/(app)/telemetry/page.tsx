import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { TelemetryForms } from "./telemetry-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDateTimeBR, formatPercent } from "@/lib/utils";
import type { BanditArmStatRow, PerformanceTelemetryRow } from "@/types/domain";

export const metadata: Metadata = { title: "Telemetria" };

export default async function TelemetryPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();

  const [brands, assets, rows, arms] = await Promise.all([
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telemetria orgânica"
        description="Cada registro alimenta o Thompson Sampling: o estúdio passa a priorizar os ângulos que retêm atenção na sua marca."
      />

      {brandOptions.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" aria-hidden="true" />}
          title="Cadastre uma marca primeiro"
          description="A telemetria é sempre vinculada a uma marca e, quando possível, a um ativo."
        />
      ) : (
        <Tabs defaultValue="registrar" className="space-y-4">
          <TabsList>
            <TabsTrigger value="registrar">Registrar</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="aprendizado">Aprendizado</TabsTrigger>
          </TabsList>

          <TabsContent value="registrar">
            <TelemetryForms brands={brandOptions} assets={assetOptions} />
            <p className="mt-3 text-xs text-muted-foreground">
              Webhook GA4 disponível para o plano Pro e Agência: envie eventos para{" "}
              <code className="font-mono">/api/webhooks/ga4</code> com o header de segredo do seu
              tenant.
            </p>
          </TabsContent>

          <TabsContent value="historico">
            {telemetryRows.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="size-5" aria-hidden="true" />}
                title="Sem telemetria registrada"
                description="Registre manualmente ou importe um CSV para começar o aprendizado."
              />
            ) : (
              <Card className="overflow-hidden">
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
                <CardTitle className="text-sm">Braços do bandit</CardTitle>
                <CardDescription>
                  alpha e beta são os parâmetros Beta da amostragem. pulls é quantas vezes o braço foi
                  usado em produção.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {armRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum braço atualizado ainda. O primeiro ajuste ocorre quando você vincula
                    telemetria a um ativo.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Braço</TableHead>
                        <TableHead className="text-right">alpha</TableHead>
                        <TableHead className="text-right">beta</TableHead>
                        <TableHead className="text-right">pulls</TableHead>
                        <TableHead className="text-right">média</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {armRows.map((arm) => {
                        const alpha = Number(arm.alpha);
                        const beta = Number(arm.beta);
                        return (
                          <TableRow key={arm.arm_key}>
                            <TableCell className="font-mono text-xs">{arm.arm_key}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{alpha.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{beta.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{arm.pulls}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
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
      )}
    </div>
  );
}
