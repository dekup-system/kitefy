/* eslint-disable @next/next/no-img-element */
"use client";

import { useActionState, useEffect, useState, type ChangeEvent } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  removeBrandLogoAction,
  uploadBrandLogoAction,
  type BrandLogoState,
} from "@/lib/brand/actions";

/**
 * Upload da logomarca para o bucket PRIVADO.
 * A pré-visualização local usa `URL.createObjectURL`; a imagem salva chega à
 * página como URL assinada (nunca um link público).
 */
export function BrandLogoForm({
  brandId,
  brandName,
  logoUrl,
  hasLogo,
}: {
  brandId: string;
  brandName: string;
  logoUrl: string | null;
  hasLogo: boolean;
}) {
  const [uploadState, uploadAction, uploading] = useActionState<BrandLogoState, FormData>(
    uploadBrandLogoAction,
    {},
  );
  const [removeState, removeAction, removing] = useActionState<BrandLogoState, FormData>(
    removeBrandLogoAction,
    {},
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
    setFileName(file?.name ?? null);
  }

  const shownLogo = preview ?? logoUrl;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background">
          {shownLogo ? (
            <img
              src={shownLogo}
              alt={`Logomarca de ${brandName}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium">Logomarca da marca</p>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG ou WebP até 2 MB. A imagem é otimizada para 1024px e fica em Storage
              privado — aparece no painel por URL assinada.
            </p>
          </div>

          <form action={uploadAction} className="space-y-3">
            <input type="hidden" name="brandId" value={brandId} />
            <Field htmlFor="brandLogo" label="Escolher arquivo">
              <Input
                id="brandLogo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onFileChange}
                disabled={uploading || removing}
              />
            </Field>
            {fileName ? (
              <p className="text-xs text-muted-foreground">Selecionado: {fileName}</p>
            ) : null}
            <Button type="submit" size="sm" disabled={uploading || removing || !fileName}>
              {uploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="size-4" aria-hidden="true" />
              )}
              Enviar logomarca
            </Button>
          </form>

          {hasLogo ? (
            <form action={removeAction}>
              <input type="hidden" name="brandId" value={brandId} />
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={uploading || removing}
              >
                {removing ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                Remover logomarca
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {uploadState.error ? (
        <Alert variant="destructive">
          <AlertDescription>{uploadState.error}</AlertDescription>
        </Alert>
      ) : null}
      {uploadState.notice ? (
        <Alert variant="success">
          <AlertDescription>{uploadState.notice}</AlertDescription>
        </Alert>
      ) : null}
      {removeState.error ? (
        <Alert variant="destructive">
          <AlertDescription>{removeState.error}</AlertDescription>
        </Alert>
      ) : null}
      {removeState.notice ? (
        <Alert variant="success">
          <AlertDescription>{removeState.notice}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
