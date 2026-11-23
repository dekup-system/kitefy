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
        title="Plano e cobrança"
        description="Assinatura mensal em BRL pelo Mercado Pago. Você escolhe a conta no checkout e os créditos entram na aprovação."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/account">Minha conta</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Plano atual"
          value={currentPlan.name}
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
          const isCurrent = tier === session.planTier && hasActiveSubscription;
          return (
            <Card key={tier} className={isCurrent ? "border-foreground/30" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent ? <Badge variant="secondary">Atual</Badge> : null}
                  {tier === "agency" ? <Badge variant="outline">Escala</Badge> : null}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <p className="pt-1 font-mono text-lg font-medium">{formatBRL(plan.priceCents)}</p>
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
                    Você já está neste plano. Créditos são renovados na cobrança aprovada.
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
                        Assinar {plan.name}
                      </Button>
                    </form>
                    <p className="text-xs text-muted-foreground">
                      Você paga no Mercado Pago com a conta que preferir — ou cria uma na hora.
                    </p>
                  </div>
                )}

                {tier === "pro" ? (
                  <p className="text-xs text-muted-foreground">
                    Inclui importação CSV e webhook GA4 de telemetria.
                  </p>
                ) : null}
                {tier === "agency" ? (
                  <p className="text-xs text-muted-foreground">
                    Inclui links externos de aprovação com senha e expiração opcionais.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Como a cobrança funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Cada criação de pagamento usa <code className="font-mono">X-Idempotency-Key</code> (UUID
            v4) para impedir cobrança duplicada em retentativa.
          </p>
          <p>
            O webhook valida <code className="font-mono">x-signature</code> com HMAC-SHA256 em tempo
            constante, responde 200 imediatamente e processa em fila. Status do pagamento é sempre
            confirmado na API do Mercado Pago antes de creditar.
          </p>
          <p>
            Cobranças recorrentes são agendadas entre 08h e 18h (BRT) para evitar o bloqueio de
            limite noturno (20h–06h) em contas pessoa física.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
