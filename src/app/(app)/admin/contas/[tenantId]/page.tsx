import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";
import { TenantCreditsForm, TenantPlanForm } from "./tenant-admin-forms";
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
import { getAdminTenant } from "@/lib/admin/data";
import { PLANS, formatBRL } from "@/lib/pricing";
import { formatDateTimeBR, formatUsd } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  pending: "Pendente",
  paused: "Pausada",
  cancelled: "Cancelada",
  unknown: "Indefinida",
};

export default async function AdminTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const detail = await getAdminTenant(tenantId);

  if (!detail) notFound();

  const { account } = detail;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/admin/contas">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Contas
            </Link>
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">{account.name}</h2>
          <p className="text-sm text-muted-foreground">
            {account.owner_email ?? "sem e-mail"} · <code className="font-mono">{account.slug}</code>{" "}
            · criada em {formatDateTimeBR(account.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{PLANS[account.plan_tier].name}</Badge>
          {account.subscription_status ? (
            <Badge variant={account.subscription_status === "active" ? "success" : "warning"}>
              Assinatura {STATUS_LABEL[account.subscription_status] ?? account.subscription_status}
            </Badge>
          ) : (
            <Badge variant="outline">Sem assinatura</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Créditos"
          value={<span className="font-mono">{account.credit_balance}</span>}
          hint="Saldo atual do tenant"
        />
        <StatCard
          label="Receita total"
          value={formatBRL(detail.revenueAllTimeCents)}
          hint={`${formatBRL(detail.revenueLast30Cents)} nos últimos 30 dias`}
        />
        <StatCard
          label="Custo de API (30d)"
          value={formatUsd(detail.usageCostUsd)}
          hint={`${account.brands} marca(s) · ${account.assets} conteúdo(s)`}
          icon={<Sparkles className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Assinatura"
          value={
            account.subscription_amount_cents !== null
              ? formatBRL(account.subscription_amount_cents)
              : account.subscription_plan
                ? formatBRL(PLANS[account.subscription_plan].priceCents)
                : "—"
          }
          hint={account.next_billing_date ? formatDateTimeBR(account.next_billing_date) : "Sem próxima cobrança"}
          icon={<ReceiptText className="size-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Plano e permissões
            </CardTitle>
            <CardDescription>
              O plano manual não mexe na assinatura do Mercado Pago: se houver cobrança ativa, o
              próximo webhook pode sincronizar o plano de volta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TenantPlanForm tenantId={account.id} currentPlan={account.plan_tier} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ajuste de créditos</CardTitle>
            <CardDescription>
              Usa a mesma função transacional do produto (`consume_credits`), com registro no
              extrato e na auditoria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TenantCreditsForm tenantId={account.id} creditBalance={account.credit_balance} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Custo por modelo (30d)</CardTitle>
            <CardDescription>Consumo estimado desta conta.</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.usageRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma chamada de LLM registrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Chamadas</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.usageRows.map((row) => (
                    <TableRow key={`${row.provider}:${row.model}`}>
                      <TableCell className="font-mono text-xs">
                        {row.provider}:{row.model}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.calls}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {Math.round(row.input_tokens + row.output_tokens).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatUsd(row.cost_usd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receita recente</CardTitle>
            <CardDescription>Últimas cobranças confirmadas.</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.recentRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.recentRevenue.map((event) => (
                    <TableRow key={`${event.source}:${event.external_id}`}>
                      <TableCell className="font-mono text-xs">
                        {event.source}
                        {event.plan_tier ? ` · ${PLANS[event.plan_tier].name}` : ""}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Auditoria desta conta</CardTitle>
          <CardDescription>Ações administrativas registradas (mais recentes primeiro).</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ação administrativa registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ação</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead className="text-right">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.auditLog.map((entry, index) => (
                  <TableRow key={`${entry.created_at}-${index}`}>
                    <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                    <TableCell className="text-xs">{entry.admin_email ?? "—"}</TableCell>
                    <TableCell className="max-w-[22rem] truncate font-mono text-xs text-muted-foreground">
                      {JSON.stringify(entry.payload)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatDateTimeBR(entry.created_at)}
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
