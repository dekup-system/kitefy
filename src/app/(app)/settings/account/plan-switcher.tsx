"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, TicketPercent } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changePlanAction, type AccountFormState } from "@/lib/account/actions";
import { resolvePlanChange, type SubscriptionStatusLike } from "@/lib/billing/plan-change";
import type { PlanTier } from "@/types/domain";

export interface PlanSummary {
  tier: PlanTier;
  name: string;
  tagline: string;
  priceLabel: string;
  monthlyCredits: number;
  features: string[];
}

interface PlanActionProps {
  tier: PlanTier;
  label: string;
  variant: "default" | "outline";
  couponCode: string;
}

function PlanAction({ tier, label, variant, couponCode }: PlanActionProps) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    changePlanAction,
    {},
  );

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="tier" value={tier} />
        {couponCode ? (
          <input type="hidden" name="couponCode" value={couponCode} />
        ) : null}
        <Button type="submit" className="w-full" variant={variant} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? "Abrindo o Mercado Pago…" : label}
        </Button>
      </form>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert variant="success">
          <AlertDescription>{state.notice}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Escolha de plano no painel do usuário.
 *
 * A decisão de rótulo/cancelamento vem de `resolvePlanChange` (função pura), a
 * mesma usada pela server action — UI e servidor nunca divergem.
 */
export function PlanSwitcher({
  plans,
  currentTier,
  subscriptionStatus,
}: {
  plans: PlanSummary[];
  currentTier: PlanTier;
  subscriptionStatus: SubscriptionStatusLike;
}) {
  const [couponCode, setCouponCode] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <label htmlFor="couponCode" className="flex items-center gap-2 text-sm font-medium">
          <TicketPercent className="size-4" aria-hidden="true" />
          Cupom de desconto (opcional)
        </label>
        <Input
          id="couponCode"
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
          placeholder="KITE-XXXXXX"
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
          className="mt-2 max-w-xs font-mono"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          O desconto vale para o valor recorrente da assinatura e aparece no checkout do Mercado
          Pago. Cupons inválidos ou esgotados são recusados antes de abrir o pagamento.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const decision = resolvePlanChange({
            currentTier,
            targetTier: plan.tier,
            subscriptionStatus,
          });
          const isCurrent = decision.kind === "current";
          const isCurrentPlan = plan.tier === currentTier;

          return (
            <Card key={plan.tier} className={isCurrentPlan ? "border-foreground/30" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent ? <Badge variant="secondary">Atual</Badge> : null}
                  {isCurrentPlan && !isCurrent ? <Badge variant="outline">Seu plano</Badge> : null}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <p className="pt-1 font-mono text-lg font-medium">{plan.priceLabel}</p>
                <p className="text-xs text-muted-foreground">{plan.monthlyCredits} créditos/mês</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {plan.features.slice(0, 3).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <p className="text-xs text-muted-foreground">{decision.description}</p>
                ) : (
                  <div className="space-y-2">
                    <PlanAction
                      tier={plan.tier}
                      label={decision.label}
                      variant={plan.tier === "essential" ? "outline" : "default"}
                      couponCode={couponCode.trim()}
                    />
                    <p className="text-xs text-muted-foreground">{decision.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
