"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createBrandAction, type BrandCreateState } from "@/lib/brand/actions";

/**
 * Criação de marca pelo painel (manual e rápida).
 * O onboarding continua sendo o caminho com leitura do site; aqui é só o
 * cadastro básico para quem já sabe o que quer e depois edita os detalhes.
 */
export function BrandCreateForm({
  brandCount,
  maxBrands,
  planName,
}: {
  brandCount: number;
  maxBrands: number;
  planName: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<BrandCreateState, FormData>(
    createBrandAction,
    {},
  );

  useEffect(() => {
    if (state.brandId) {
      router.push(`/settings/brand?brand=${state.brandId}`);
      router.refresh();
    }
  }, [state.brandId, router]);

  if (brandCount >= maxBrands) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          Você usa {brandCount} de {maxBrands} marca(s) do plano {planName}. Para cadastrar outra,
          faça upgrade do pacote.
        </p>
        <Link
          href="/settings/account"
          className="mt-2 inline-block font-medium text-foreground underline underline-offset-4"
        >
          Ver planos e fazer upgrade
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <FieldGroup>
        <Field htmlFor="newBrandName" label="Nome da marca" required>
          <Input
            id="newBrandName"
            name="brandName"
            required
            maxLength={160}
            placeholder="Ex.: Clínica Aurora"
            disabled={pending}
          />
        </Field>
        <Field
          htmlFor="newBrandWebsite"
          label="Site oficial ou rede social (opcional)"
          hint="Cole o site ou perfil público (Instagram, LinkedIn, TikTok, YouTube) para extrair o contexto automaticamente."
        >
          <Input
            id="newBrandWebsite"
            name="websiteUrl"
            type="url"
            defaultValue="https://"
            placeholder="https://suamarca.com.br ou https://instagram.com/suamarca"
            disabled={pending}
          />
        </Field>
        <Field
          htmlFor="newBrandIcp"
          label="Cliente ideal (opcional)"
          hint="Em uma frase: quem compra e o que essa pessoa procura."
        >
          <Textarea
            id="newBrandIcp"
            name="icpDescription"
            rows={2}
            maxLength={1200}
            disabled={pending}
          />
        </Field>
      </FieldGroup>

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
          <Plus className="size-4" aria-hidden="true" />
        )}
        Criar marca
      </Button>
    </form>
  );
}
