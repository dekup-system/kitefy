"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updatePasswordAction } from "@/lib/auth/actions";

const initialState = { error: undefined as string | undefined, notice: undefined as string | undefined };

/** Tela de nova senha, aberta pelo link enviado em "Esqueci minha senha". */
export function ResetForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initialState);

  return (
    <form action={action} className="space-y-4">
      <FieldGroup>
        <Field htmlFor="new-password" label="Nova senha" hint="Mínimo de 8 caracteres.">
          <Input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="••••••••"
          />
        </Field>
        <Field htmlFor="new-password-confirm" label="Repita a nova senha">
          <Input
            id="new-password-confirm"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="••••••••"
          />
        </Field>
      </FieldGroup>

      {state.error ? <FieldError>{state.error}</FieldError> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Salvar nova senha
      </Button>
    </form>
  );
}
