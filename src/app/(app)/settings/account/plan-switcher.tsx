"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
}

function PlanAction({ tier, label, variant }: PlanActionProps) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    changePlanAction,
    {},
  );

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="tier" value={tier} />
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
  return (
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
                  />
                  <p className="text-xs text-muted-foreground">{decision.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
