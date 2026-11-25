"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteBrandAction, type BrandDeleteState } from "@/lib/brand/actions";

const initialState: BrandDeleteState = {};

export function BrandDeleteForm({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteBrandAction, initialState);

  useEffect(() => {
    if (state.deleted) {
      router.push("/settings/brand");
      router.refresh();
    }
  }, [state.deleted, router]);

  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div>
        <p className="text-sm font-medium text-destructive">Excluir marca e todo o histórico</p>
        <p className="text-xs text-muted-foreground">
          Remove definitivamente <strong>{brandName}</strong>, sua logomarca, todos os conteúdos
          criados, imagens renderizadas, personas, telemetria e aprendizado acumulado. Esta ação não
          pode ser desfeita.
        </p>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {!confirming ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir {brandName}
        </Button>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="brandId" value={brandId} />
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
            Confirmar exclusão definitiva de {brandName}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancelar
          </Button>
        </form>
      )}
    </div>
  );
}
