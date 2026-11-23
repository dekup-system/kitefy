"use client";

import { useActionState } from "react";
import { Loader2, TicketPercent } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createCouponAction, type AdminActionState } from "@/lib/admin/actions";

export function CouponCreateForm() {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    createCouponAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor="couponCode"
          label="Código (opcional)"
          hint="Em branco gera um código único. Use 4–32 caracteres (A-Z, 0-9 e hífen)."
        >
          <Input
            id="couponCode"
            name="code"
            maxLength={32}
            placeholder="KITE-ABC123"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            disabled={pending}
          />
        </Field>
        <Field htmlFor="percentOff" label="Desconto (%)" hint="Vale para o valor recorrente.">
          <Input
            id="percentOff"
            name="percentOff"
            type="number"
            min={1}
            max={90}
            defaultValue={20}
            required
            disabled={pending}
          />
        </Field>
        <Field htmlFor="maxRedemptions" label="Limite de usos" hint="Contado na confirmação do pagamento.">
          <Input
            id="maxRedemptions"
            name="maxRedemptions"
            type="number"
            min={1}
            max={100000}
            defaultValue={10}
            required
            disabled={pending}
          />
        </Field>
        <Field htmlFor="validUntil" label="Válido até (opcional)" hint="Fim do dia no horário de Brasília.">
          <Input id="validUntil" name="validUntil" type="date" disabled={pending} />
        </Field>
      </div>

      <Field htmlFor="couponNote" label="Observação interna (opcional)">
        <Input
          id="couponNote"
          name="note"
          maxLength={200}
          placeholder="Ex.: campanha de lançamento"
          disabled={pending}
        />
      </Field>

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

      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <TicketPercent className="size-4" aria-hidden="true" />
        )}
        Gerar cupom
      </Button>
    </form>
  );
}
