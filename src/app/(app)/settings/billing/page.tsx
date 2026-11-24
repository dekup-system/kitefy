import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { PLANS, PLAN_ORDER, formatBRL } from "@/lib/pricing";
import { packageDisplayName } from "@/lib/ui/workspace-insights";
import { nextDaytimeBillingWindow } from "@/lib/billing/subscription-sync";
import { subscribeToPlanAction } from "@/lib/billing/actions";
import { Button } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/utils";
import type { MpSubscriptionRow } from "@/types/domain";

export const metadata: Metadata = { title: "Plano e cobrança" };

export default async function BillingPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const subscription = await supabase
    .from("mp_subscriptions")
    .select("mp_preapproval_id, payment_method, plan_tier, status, next_billing_date, updated_at")
    .eq("tenant_id", session.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<MpSubscriptionRow, "mp_preapproval_id" | "payment_method" | "plan_tier" | "status" | "next_billing_date" | "updated_at">>();

  const env = getServerEnv();
  const currentPlan = PLANS[session.planTier];
  const hasActiveSubscription = subscription.data?.status === "active";
  const nextWindow = nextDaytimeBillingWindow(new Date());

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Plano e créditos"
        description="Acompanhe seu saldo, compare pacotes e gerencie sua assinatura mensal em reais."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/account">Minha conta</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Pacote atual"
          value={packageDisplayName(session.planTier)}
          hint={
            hasActiveSubscription
              ? `${currentPlan.monthlyCredits} créditos/mês`
              : `Ainda não assinado · ${currentPlan.monthlyCredits} créditos/mês ao assinar`
          }
        />
        <StatCard
          label="Assinatura"
          value={subscription.data?.status ?? "não assinada"}
          hint={
            subscription.data?.payment_method === "pix_automatico"
              ? "Mercado Pago"
              : subscription.data?.payment_method === "card_preapproval"
                ? "Cartão recorrente"
                : "Escolha um plano abaixo"
          }
        />
        <StatCard
          label={hasActiveSubscription ? "Próxima cobrança" : "Como ativar"}
          value={
            hasActiveSubscription
              ? subscription.data?.next_billing_date
                ? formatDateTimeBR(subscription.data.next_billing_date)
                : formatDateTimeBR(nextWindow.toISOString())
              : "Assine um plano abaixo"
          }
          hint={
            hasActiveSubscription
              ? "Sempre em janela diurna (08h–18h BRT)"
              : "Os créditos do mês entram na aprovação do pagamento"
          }
        />
      </div>

      {env.MP_ACCESS_TOKEN ? null : (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-sm">Mercado Pago não configurado neste ambiente</CardTitle>
            <CardDescription>
              Os botões de assinatura responderão 503 até MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET serem
              definidos no servidor. Nenhuma cobrança é simulada localmente.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const pkgName = packageDisplayName(tier);
          const isCurrent = tier === session.planTier && hasActiveSubscription;
          return (
            <Card
              key={tier}
              className={
                isCurrent
                  ? "border-foreground/40"
                  : tier === "pro"
                    ? "border-brand-signal/50"
                    : undefined
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{pkgName}</CardTitle>
                  {isCurrent ? (
                    <Badge variant="secondary">Atual</Badge>
                  ) : tier === "pro" ? (
                    <Badge variant="warning">Mais escolhido</Badge>
                  ) : tier === "agency" ? (
                    <Badge variant="outline">Escala</Badge>
                  ) : null}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <p className="pt-1 font-mono text-lg font-medium">
                  {formatBRL(plan.priceCents)}
                  <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">/mês</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <p className="text-xs text-muted-foreground">
                    Você já está neste pacote. Os créditos renovam a cada pagamento aprovado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <form action={subscribeToPlanAction}>
                      <input type="hidden" name="tier" value={tier} />
                      <Button
                        type="submit"
                        className="w-full"
                        variant={tier === "essential" ? "outline" : "default"}
                      >
                        Assinar {pkgName}
                      </Button>
                    </form>
                    <p className="text-xs text-muted-foreground">
                      Checkout oficial do Mercado Pago em reais. Sem fidelidade.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-brand-signal" aria-hidden="true" />
            Pagamento transparente e protegido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Pagamentos processados pelo Mercado Pago com proteção automática contra cobrança
            duplicada. Os créditos entram na sua conta assim que a confirmação é recebida.
          </p>
          <p>
            Renovações recorrentes acontecem em horário comercial (08h–18h BRT) para evitar
            bloqueios de limite noturno em contas pessoa física.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
