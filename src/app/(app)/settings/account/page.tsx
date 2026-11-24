import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import {
  AccountEmailForm,
  AccountNameForm,
  AccountPasswordForm,
} from "./account-forms";
import { PlanSwitcher, type PlanSummary } from "./plan-switcher";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { nextDaytimeBillingWindow } from "@/lib/billing/subscription-sync";
import { PLANS, PLAN_ORDER, formatBRL } from "@/lib/pricing";
import { packageDisplayName } from "@/lib/ui/workspace-insights";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils";
import type { PaymentMethod, PlanTier } from "@/types/domain";

export const metadata: Metadata = { title: "Minha conta" };

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  pending: "Pendente",
  paused: "Pausada",
  cancelled: "Cancelada",
  unknown: "Indefinida",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "outline"> = {
  active: "success",
  pending: "warning",
  paused: "warning",
  cancelled: "outline",
  unknown: "outline",
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  card_preapproval: "Cartão recorrente",
  pix_automatico: "Pix Automático",
};

interface AccountSubscription {
  mp_preapproval_id: string;
  payment_method: PaymentMethod;
  plan_tier: PlanTier;
  status: string;
  next_billing_date: string | null;
  updated_at: string;
}

export default async function AccountPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();

  const [tenantQuery, subscriptionQuery] = await Promise.all([
    supabase
      .from("tenants")
      .select("name, slug, plan_tier, credit_balance, created_at")
      .eq("id", session.tenantId)
      .single<{
        name: string;
        slug: string;
        plan_tier: PlanTier;
        credit_balance: number;
        created_at: string;
      }>(),
    supabase
      .from("mp_subscriptions")
      .select("mp_preapproval_id, payment_method, plan_tier, status, next_billing_date, updated_at")
      .eq("tenant_id", session.tenantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<AccountSubscription>(),
  ]);

  const tenant = tenantQuery.data;
  const subscription = subscriptionQuery.data;
  const active = subscription?.status === "active";
  const effectiveTier: PlanTier = active && subscription ? subscription.plan_tier : session.planTier;
  const plan = PLANS[effectiveTier];
  const nextWindow = nextDaytimeBillingWindow(new Date());

  const plans: PlanSummary[] = PLAN_ORDER.map((tier) => ({
    tier,
    name: packageDisplayName(tier),
    tagline: PLANS[tier].tagline,
    priceLabel: formatBRL(PLANS[tier].priceCents),
    monthlyCredits: PLANS[tier].monthlyCredits,
    features: PLANS[tier].features,
  }));

  const isOwner = session.role === "owner";
  const currentPackageName = packageDisplayName(effectiveTier);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Minha conta"
        description="Seu pacote, créditos, renovação e dados de acesso."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pacote atual"
          value={currentPackageName}
          hint={`${plan.monthlyCredits} créditos/mês · ${formatBRL(plan.priceCents)}`}
          icon={<Sparkles className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Créditos disponíveis"
          value={<span className="font-mono">{tenant?.credit_balance ?? 0}</span>}
          hint="Saldo após consumo, estornos e renovação"
          icon={<CreditCard className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Assinatura"
          value={
            subscription ? (
              <Badge variant={STATUS_VARIANT[subscription.status] ?? "outline"}>
                {STATUS_LABEL[subscription.status] ?? subscription.status}
              </Badge>
            ) : (
              "Não assinada"
            )
          }
          hint={
            subscription
              ? PAYMENT_LABEL[subscription.payment_method]
              : "Escolha um plano abaixo para ativar"
          }
          icon={<CreditCard className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label={active ? "Próxima cobrança" : "Como renovar"}
          value={
            active
              ? subscription?.next_billing_date
                ? formatDateTimeBR(subscription.next_billing_date)
                : formatDateTimeBR(nextWindow.toISOString())
              : "Escolha um plano"
          }
          hint={
            active
              ? "Renovação automática em janela diurna (08h–18h BRT)"
              : "A renovação reativa a cobrança recorrente"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Seu pacote: {plan.name}</CardTitle>
          <CardDescription>
            {plan.tagline} Você pode mudar de plano a qualquer momento — o novo valor passa a valer na
            autorização do Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Conta criada em {formatDateBR(tenant?.created_at)} · identificador{" "}
            <code className="font-mono">{tenant?.slug ?? "—"}</code>
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Renovar ou mudar de plano</h2>
          <p className="text-sm text-muted-foreground">
            A troca encerra a assinatura antiga antes de você autorizar a nova, sem cobrança
            duplicada.
          </p>
        </div>
        <PlanSwitcher
          plans={plans}
          currentTier={effectiveTier}
          subscriptionStatus={subscription?.status ?? null}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Dados cadastrais
            </CardTitle>
            <CardDescription>
              Nome da conta e e-mail de acesso. O e-mail novo só passa a valer depois da confirmação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AccountNameForm tenantName={tenant?.name ?? "Minha conta"} isOwner={isOwner} />
            <div className="border-t border-border pt-6">
              <AccountEmailForm email={session.user.email ?? ""} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Senha e acesso</CardTitle>
              <CardDescription>
                Reenvie o link de redefinição para o e-mail da sessão.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountPasswordForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Privacidade e documentos</CardTitle>
              <CardDescription>
                Exportar ou excluir seus dados, além dos termos do produto.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-sm">
              <Link href="/settings/privacy" className="underline underline-offset-4">
                Privacidade e LGPD
              </Link>
              <Link href="/termos" className="underline underline-offset-4">
                Termos de uso
              </Link>
              <Link href="/privacidade" className="underline underline-offset-4">
                Política de privacidade
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
