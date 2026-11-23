"use client";

import { useActionState } from "react";
import { Coins, Loader2, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  adjustTenantCreditsAction,
  setTenantPlanAction,
  type AdminActionState,
  type CreditAdjustState,
} from "@/lib/admin/actions";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import type { PlanTier } from "@/types/domain";

function Feedback({ state }: { state: AdminActionState }) {
  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  if (state.notice) {
    return (
      <Alert variant="success">
        <AlertDescription>{state.notice}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

export function TenantPlanForm({
  tenantId,
  currentPlan,
}: {
  tenantId: string;
  currentPlan: PlanTier;
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    setTenantPlanAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      <Field
        htmlFor="planTier"
        label="Plano da conta"
        hint="Altera o plano interno (limite de marcas e recursos). Não altera a cobrança no Mercado Pago."
      >
        <select
          id="planTier"
          name="planTier"
          defaultValue={currentPlan}
          disabled={pending}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {PLAN_ORDER.map((tier) => (
            <option key={tier} value={tier}>
              {PLANS[tier].name} · {PLANS[tier].maxBrands} marca(s)
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="planNote" label="Observação (opcional)" hint="Fica na auditoria administrativa.">
        <Input id="planNote" name="note" maxLength={200} disabled={pending} />
      </Field>
      <Feedback state={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="size-4" aria-hidden="true" />
        )}
        Salvar plano
      </Button>
    </form>
  );
}

export function TenantCreditsForm({
  tenantId,
  creditBalance,
}: {
  tenantId: string;
  creditBalance: number;
}) {
  const [state, action, pending] = useActionState<CreditAdjustState, FormData>(
    adjustTenantCreditsAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      <p className="text-sm text-muted-foreground">
        Saldo atual: <span className="font-mono text-foreground">{creditBalance}</span> créditos.
      </p>
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field htmlFor="delta" label="Ajuste" hint="Ex.: 50 ou -20">
          <Input
            id="delta"
            name="delta"
            type="number"
            step={1}
            min={-100000}
            max={100000}
            required
            disabled={pending}
          />
        </Field>
        <Field
          htmlFor="creditReason"
          label="Motivo"
          hint="Aparece no extrato de créditos do cliente."
        >
          <Input
            id="creditReason"
            name="reason"
            minLength={3}
            maxLength={200}
            required
            disabled={pending}
            placeholder="Ex.: cortesia por indisponibilidade"
          />
        </Field>
      </div>
      <Feedback state={state} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Coins className="size-4" aria-hidden="true" />
        )}
        Ajustar créditos
      </Button>
    </form>
  );
}
