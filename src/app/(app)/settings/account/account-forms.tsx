"use client";

import { useActionState } from "react";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  sendPasswordLinkAction,
  updateAccountNameAction,
  updateEmailAction,
  type AccountFormState,
} from "@/lib/account/actions";

function Feedback({ state }: { state: AccountFormState }) {
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

export function AccountNameForm({
  tenantName,
  isOwner,
}: {
  tenantName: string;
  isOwner: boolean;
}) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    updateAccountNameAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <Field
        htmlFor="tenantName"
        label="Nome da conta"
        hint={
          isOwner
            ? "Aparece no topo do painel e nos e-mails transacionais."
            : "Apenas o proprietário da conta pode alterar este campo."
        }
      >
        <Input
          id="tenantName"
          name="tenantName"
          defaultValue={tenantName}
          maxLength={120}
          required
          disabled={!isOwner || pending}
        />
      </Field>
      <Feedback state={state} />
      <Button type="submit" disabled={!isOwner || pending} size="sm">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Salvar nome
      </Button>
    </form>
  );
}

export function AccountEmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    updateEmailAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <Field
        htmlFor="email"
        label="E-mail de acesso"
        hint="A troca só vale depois que você clicar no link enviado ao novo endereço."
      >
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={email}
          autoComplete="email"
          maxLength={254}
          required
          disabled={pending}
        />
      </Field>
      <Feedback state={state} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Mail className="size-4" aria-hidden="true" />
        )}
        Enviar confirmação de novo e-mail
      </Button>
    </form>
  );
}

export function AccountPasswordForm() {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    sendPasswordLinkAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Enviamos um link de uso único para o seu e-mail. Por segurança, a senha nunca é exibida nem
        armazenada em texto no painel.
      </p>
      <Feedback state={state} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="size-4" aria-hidden="true" />
        )}
        Receber link para trocar a senha
      </Button>
    </form>
  );
}
