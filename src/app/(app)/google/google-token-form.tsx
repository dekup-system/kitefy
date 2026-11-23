"use client";

import { useActionState } from "react";
import { Loader2, SearchCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveVerificationTokenAction, type GoogleTokenState } from "@/lib/google/actions";

/**
 * Campo do token do Search Console (opcional).
 * Aceita o token puro, `google-site-verification=...` ou a meta tag inteira —
 * a normalização é feita no servidor por `parseVerificationToken`.
 */
export function GoogleTokenForm({
  brandId,
  token,
}: {
  brandId: string;
  token: string | null;
}) {
  const [state, action, pending] = useActionState<GoogleTokenState, FormData>(
    saveVerificationTokenAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="brandId" value={brandId} />
      <Field
        htmlFor="gscToken"
        label="Token do Search Console"
        hint={'Pode colar o token ou a meta tag <meta name="google-site-verification" … /> inteira.'}
      >
        <Input
          id="gscToken"
          name="token"
          defaultValue={token ?? ""}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          placeholder="ex.: AbC123…"
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

      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <SearchCheck className="size-4" aria-hidden="true" />
        )}
        Salvar token
      </Button>
    </form>
  );
}
