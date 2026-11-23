import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  FileStack,
  Sparkles,
  TicketPercent,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminOverview } from "@/lib/admin/data";
import { PLANS, formatBRL } from "@/lib/pricing";
import { formatDateTimeBR, formatUsd } from "@/lib/utils";

export default async function AdminOverviewPage() {
  const data = await getAdminOverview();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatBRL(data.mrr.totalCents)}
          hint={`${data.mrr.activeCount} assinatura(s) ativa(s) · ARPU ${formatBRL(data.arpuCents)}`}
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Receita realizada (30d)"
          value={formatBRL(data.revenue.last30Cents)}
          change={data.revenueChange ?? undefined}
          hint="Cobranças confirmadas no Mercado Pago"
          icon={<BarChart3 className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Custo de APIs (30d)"
          value={formatUsd(data.usageCurrentCostUsd)}
          change={data.usageChange ?? undefined}
          hint={`${data.usage.calls} chamada(s) de LLM · câmbio R$ ${data.usdBrlRate.toFixed(2)}`}
          icon={<Sparkles className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Margem estimada (30d)"
          value={formatBRL(data.marginCents)}
          hint="Receita realizada menos custo de API convertido"
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Contas"
          value={<span className="font-mono">{data.counts.tenants}</span>}
          hint={`${data.counts.members} vínculo(s) de usuário`}
          icon={<Users className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Marcas"
          value={<span className="font-mono">{data.counts.brands}</span>}
          hint={`${data.counts.chunks} chunk(s) de conhecimento`}
          icon={<Sparkles className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Conteúdos gerados"
          value={<span className="font-mono">{data.counts.assets}</span>}
          hint="Somatório de ativos de todas as contas"
          icon={<FileStack className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Cupons ativos"
          value={<span className="font-mono">{data.counts.activeCoupons}</span>}
          hint="Descontos percentuais disponíveis"
          icon={<TicketPercent className="size-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Receita por plano</CardTitle>
              <CardDescription>MRR contratado, com o valor real das assinaturas.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Assinaturas</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.mrr.byPlan.map((plan) => (
                  <TableRow key={plan.tier}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell className="text-right font-mono">{plan.count}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatBRL(plan.mrrCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Custo por modelo (30d)</CardTitle>
            <CardDescription>
              Estimativa por tokens. Chamadas de embedding/SERP podem não estar incluídas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.usageRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum uso registrado ainda. O custo aparece depois da primeira geração.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Chamadas</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.usageRows.slice(0, 6).map((row) => (
                    <TableRow key={`${row.provider}:${row.model}`}>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {row.provider}:{row.model}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.calls}</TableCell>
                      <TableCell className="text-right font-mono">{formatUsd(row.cost_usd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Contas recentes</CardTitle>
              <CardDescription>Últimos cadastros da plataforma.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/contas">
                Ver todas <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Criada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <Link
                        href={`/admin/contas/${tenant.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {tenant.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {tenant.owner_email ?? "sem e-mail"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PLANS[tenant.plan_tier].name}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatDateTimeBR(tenant.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Uso recente de APIs</CardTitle>
            <CardDescription>Últimas execuções com custo estimado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentUsage.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem chamadas registradas.</p>
            ) : (
              data.recentUsage.map((row, index) => (
                <div
                  key={`${row.created_at}-${index}`}
                  className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.tenant_name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {row.provider}:{row.model}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs">{formatUsd(row.cost_usd)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTimeBR(row.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
