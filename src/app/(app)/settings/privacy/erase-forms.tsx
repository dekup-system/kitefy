"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { eraseDataAction, type PrivacyActionState } from "@/lib/privacy/actions";

const initialState: PrivacyActionState = {};

export function EraseForms({
  brands,
}: {
  brands: { id: string; brand_name: string }[];
}) {
  const [state, action, pending] = useActionState(eraseDataAction, initialState);
  const [scope, setScope] = useState<"brand" | "account">("brand");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [confirmation, setConfirmation] = useState("");

  const canSubmit = confirmation.trim().toUpperCase() === "EXCLUIR" && !pending;

  return (
    <form id="erase-form" action={action} className="space-y-4">
      <input type="hidden" name="scope" value={scope} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">O que excluir</legend>
        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <input
            type="radio"
            name="scopeRadio"
            checked={scope === "brand"}
            onChange={() => setScope("brand")}
            className="mt-1 size-4 accent-foreground"
          />
          <span>
            <span className="block font-medium">Uma marca específica</span>
            <span className="block text-xs text-muted-foreground">
              Remove ativos, vetores, arquivos e histórico do agente daquela marca. A conta continua.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <input
            type="radio"
            name="scopeRadioAlt"
            checked={scope === "account"}
            onChange={() => setScope("account")}
            className="mt-1 size-4 accent-foreground"
          />
          <span>
            <span className="block font-medium">Conta inteira</span>
            <span className="block text-xs text-muted-foreground">
              Remove todas as marcas, arquivos, assinatura e o usuário. Registros fiscais são
              mantidos apenas de forma anonimizada (sem vínculo pessoal).
            </span>
          </span>
        </label>
      </fieldset>

      {scope === "brand" && brands.length > 0 ? (
        <Field htmlFor="erase-brand" label="Marca">
          <select
            id="erase-brand"
            name="brandId"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.brand_name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field
        htmlFor="confirmation"
        label="Confirmação"
        hint="Digite EXCLUIR (maiúsculas) para liberar o botão. A ação é irreversível."
      >
        <Input
          id="confirmation"
          name="confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="EXCLUIR"
          autoComplete="off"
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

      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" disabled={!canSubmit}>
            <Trash2 className="size-4" aria-hidden="true" />
            Excluir definitivamente
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tem certeza?</DialogTitle>
            <DialogDescription>
              Esta ação remove dados de forma permanente. Não é possível desfazer. O histórico do
              agente (checkpoints) e os arquivos no Storage também são apagados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="submit" form="erase-form" variant="destructive" disabled={!canSubmit}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Confirmar exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
