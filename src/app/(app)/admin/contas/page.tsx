import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminAccounts } from "@/lib/admin/data";
import { PLANS, formatBRL } from "@/lib/pricing";
import { formatDateBR, formatUsd } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  pending: "Pendente",
  paused: "Pausada",
  cancelled: "Cancelada",
  unknown: "—",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "outline"> = {
  active: "success",
  pending: "warning",
  paused: "warning",
  cancelled: "outline",
  unknown: "outline",
};

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q ?? "").trim();
  const accounts = await getAdminAccounts(search);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="size-4" aria-hidden="true" />
          Contas cadastradas
        </CardTitle>
        <CardDescription>
          {accounts.length} conta(s) encontradas. O plano pode ser ajustado manualmente; a cobrança
          recorrente continua sendo a do Mercado Pago.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form method="get" action="/admin/contas" className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="q"
            defaultValue={search}
            placeholder="Buscar por nome, slug ou e-mail"
            maxLength={80}
            className="sm:max-w-sm"
          />
          <Button type="submit" variant="outline">
            <Search className="size-4" aria-hidden="true" />
            Buscar
          </Button>
          {search ? (
            <Button asChild variant="ghost">
              <Link href="/admin/contas">Limpar</Link>
            </Button>
          ) : null}
        </form>

        {accounts.length === 0 ? (
          <EmptyState
            title="Nenhuma conta encontrada"
            description={search ? "Tente outro termo de busca." : "Ainda não há contas cadastradas."}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Assinatura</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                  <TableHead className="text-right">Marcas</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">API 30d</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <Link
                        href={`/admin/contas/${account.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {account.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {account.owner_email ?? "sem e-mail"} · {account.slug}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PLANS[account.plan_tier].name}</Badge>
                    </TableCell>
                    <TableCell>
                      {account.subscription_status ? (
                        <div className="space-y-1">
                          <Badge
                            variant={
                              STATUS_VARIANT[account.subscription_status] ?? "outline"
                            }
                          >
                            {STATUS_LABEL[account.subscription_status] ??
                              account.subscription_status}
                          </Badge>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {account.subscription_amount_cents !== null
                              ? formatBRL(account.subscription_amount_cents)
                              : account.subscription_plan
                                ? formatBRL(PLANS[account.subscription_plan].priceCents)
                                : "—"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nenhuma</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{account.credit_balance}</TableCell>
                    <TableCell className="text-right font-mono">{account.brands}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatBRL(account.revenue_cents)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatUsd(account.usage_cost_usd)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDateBR(account.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/contas/${account.id}`}>Gerenciar</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
