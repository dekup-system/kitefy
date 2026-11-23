import { TicketPercent, TrendingUp, Users } from "lucide-react";
import { CouponCreateForm } from "./coupon-create-form";
import { CouponToggle } from "./coupon-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminCoupons, type AdminCouponRow } from "@/lib/admin/data";
import { formatBRL } from "@/lib/pricing";
import { formatDateBR } from "@/lib/utils";

type CouponStatus = {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline";
};

function statusOf(coupon: AdminCouponRow): CouponStatus {
  if (!coupon.active) return { label: "Desativado", variant: "outline" };
  if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
    return { label: "Expirado", variant: "warning" };
  }
  if (coupon.times_redeemed >= coupon.max_redemptions) {
    return { label: "Esgotado", variant: "secondary" };
  }
  return { label: "Ativo", variant: "success" };
}

export default async function AdminCouponsPage() {
  const coupons = await getAdminCoupons();

  const active = coupons.filter((coupon) => statusOf(coupon).label === "Ativo").length;
  const redemptions = coupons.reduce((total, coupon) => total + coupon.times_redeemed, 0);
  const revenue = coupons.reduce(
    (total, coupon) => total + Number(coupon.redeemed_amount_cents),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cupons criados"
          value={<span className="font-mono">{coupons.length}</span>}
          hint={`${active} ativo(s) agora`}
          icon={<TicketPercent className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Resgates confirmados"
          value={<span className="font-mono">{redemptions}</span>}
          hint="Somente assinaturas com pagamento autorizado"
          icon={<Users className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Receita com cupons"
          value={formatBRL(revenue)}
          hint="Valor efetivamente cobrado nas assinaturas com cupom"
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Desconto máximo"
          value={
            <span className="font-mono">
              {coupons.length > 0 ? `${Math.max(...coupons.map((coupon) => coupon.percent_off))}%` : "—"}
            </span>
          }
          hint="Percentual por assinatura recorrente"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TicketPercent className="size-4" aria-hidden="true" />
            Gerar cupom
          </CardTitle>
          <CardDescription>
            O desconto é aplicado no valor recorrente do Mercado Pago. O uso só é contado quando a
            assinatura fica ativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CouponCreateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cupons</CardTitle>
          <CardDescription>
            Códigos são visíveis apenas no admin e validados no servidor durante o checkout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coupons.length === 0 ? (
            <EmptyState
              title="Nenhum cupom criado"
              description="Gere o primeiro cupom para acompanhar resgates e receita."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Usos</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receita gerada</TableHead>
                    <TableHead>Criado</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((coupon) => {
                    const status = statusOf(coupon);
                    return (
                      <TableRow key={coupon.id}>
                        <TableCell>
                          <span className="font-mono text-xs font-medium">{coupon.code}</span>
                          {coupon.note ? (
                            <span className="block text-xs text-muted-foreground">{coupon.note}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono">{coupon.percent_off}%</TableCell>
                        <TableCell className="font-mono text-xs">
                          {coupon.times_redeemed}/{coupon.max_redemptions}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {coupon.valid_until ? formatDateBR(coupon.valid_until) : "Sem prazo"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBRL(Number(coupon.redeemed_amount_cents))}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatDateBR(coupon.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <CouponToggle couponId={coupon.id} active={coupon.active} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
