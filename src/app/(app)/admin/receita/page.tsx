import { BarChart3, ReceiptText, Wallet } from "lucide-react";
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
import { getAdminRevenuePage } from "@/lib/admin/data";
import { PLANS, formatBRL } from "@/lib/pricing";
import { formatDateTimeBR, formatUsd } from "@/lib/utils";

export default async function AdminRevenuePage() {
  const data = await getAdminRevenuePage();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatBRL(data.mrr.totalCents)}
          hint={`${data.mrr.activeCount} assinatura(s) · ARPU ${formatBRL(data.arpuCents)}`}
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Receita (30d)"
          value={formatBRL(data.revenue.last30Cents)}
          change={data.revenueChange ?? undefined}
          hint={`Total histórico ${formatBRL(data.revenue.allTimeCents)}`}
          icon={<ReceiptText className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Custo de API (30d)"
          value={formatUsd(data.usageCurrentCostUsd)}
          change={data.usageChange ?? undefined}
          hint={`${data.usage.calls} chamada(s) · ${Math.round(data.usage.inputTokens + data.usage.outputTokens).toLocaleString("pt-BR")} tokens`}
          icon={<BarChart3 className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Margem estimada (30d)"
          value={formatBRL(data.marginCents)}
          hint={`Custo convertido a R$ ${data.usdBrlRate.toFixed(2)}/US$ (estimativa gerencial)`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">MRR por plano</CardTitle>
            <CardDescription>Valor real das assinaturas ativas (com cupons aplicados).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Assinaturas</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">Receita 30d</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byPlan.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      Nenhuma cobrança registrada ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.byPlan.map((row) => {
                    const plan = row.plan_tier ? PLANS[row.plan_tier] : null;
                    const mrr = plan
                      ? data.mrr.byPlan.find((item) => item.tier === plan.tier)?.mrrCents ?? 0
                      : 0;
                    return (
                      <TableRow key={row.plan_tier ?? "other"}>
                        <TableCell className="font-medium">{plan?.name ?? "Avulso / outro"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {plan
                            ? data.mrr.byPlan.find((item) => item.tier === plan.tier)?.count ?? 0
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatBRL(mrr)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBRL(Number(row.cents_last30))}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receita por mês</CardTitle>
            <CardDescription>Últimos 6 meses de cobranças confirmadas.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem histórico de receita.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Cobranças</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthly.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-mono text-xs">{row.month}</TableCell>
                      <TableCell className="text-right font-mono">{row.events}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatBRL(Number(row.cents))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Custo por modelo (30 dias)</CardTitle>
          <CardDescription>
            Estimativa por tokens de entrada/saída. Não inclui embeddings, SERP ou imagens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.usageRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum uso de LLM registrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Chamadas</TableHead>
                    <TableHead className="text-right">Entrada</TableHead>
                    <TableHead className="text-right">Saída</TableHead>
                    <TableHead className="text-right">Cache</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.usageRows.map((row) => (
                    <TableRow key={`${row.provider}:${row.model}`}>
                      <TableCell className="font-mono text-xs">{row.provider}</TableCell>
                      <TableCell className="font-mono text-xs">{row.model}</TableCell>
                      <TableCell className="text-right font-mono">{row.calls}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {Math.round(row.input_tokens).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {Math.round(row.output_tokens).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {Math.round(row.cached_tokens).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatUsd(row.cost_usd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cobranças recentes</CardTitle>
          <CardDescription>Extrato idempotente por cobrança confirmada no MP.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentRevenue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem cobranças registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentRevenue.map((event) => (
                  <TableRow key={`${event.source}:${event.external_id}`}>
                    <TableCell>{event.tenant_name ?? "conta removida"}</TableCell>
                    <TableCell className="font-mono text-xs">{event.source}</TableCell>
                    <TableCell className="text-xs">
                      {event.plan_tier ? PLANS[event.plan_tier].name : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatBRL(Number(event.amount_cents))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatDateTimeBR(event.occurred_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
