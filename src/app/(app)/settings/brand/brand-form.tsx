"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateBrandAction, type BrandFormState } from "@/lib/onboarding/actions";
import type { BrandProfileRow } from "@/types/domain";

const initialState: BrandFormState = {};

export function BrandForm({ brand }: { brand: BrandProfileRow }) {
  const [state, action, pending] = useActionState(updateBrandAction, initialState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="brandId" value={brand.id} />

      <FieldGroup>
        <Field htmlFor="brandName" label="Nome da marca">
          <Input id="brandName" name="brandName" defaultValue={brand.brand_name} required maxLength={160} />
        </Field>
        <Field htmlFor="websiteUrl" label="Site" hint="Usado para sinais de entidade no GEO.">
          <Input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            defaultValue={brand.website_url ?? ""}
            placeholder="https://suamarca.com.br"
          />
        </Field>
        <Field
          htmlFor="icpDescription"
          label="Público (ICP)"
          hint="Descreva quem compra e qual problema resolve."
        >
          <Textarea
            id="icpDescription"
            name="icpDescription"
            defaultValue={brand.icp_description ?? ""}
            rows={3}
            maxLength={1200}
          />
        </Field>
        <Field
          htmlFor="tone"
          label="Descritores de tom de voz"
          hint="Separe por vírgula. Ex.: direto, cuidadoso, sem alarmismo."
        >
          <Input
            id="tone"
            name="tone"
            defaultValue={(brand.tone_of_voice?.descriptors ?? []).join(", ")}
            maxLength={300}
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
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Salvar alterações
      </Button>
    </form>
  );
}
