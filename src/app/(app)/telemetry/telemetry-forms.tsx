"use client";

import { useActionState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addTelemetryAction,
  importTelemetryCsvAction,
  type TelemetryActionState,
} from "@/lib/telemetry/actions";

const initialState: TelemetryActionState = {};

interface BrandOption {
  id: string;
  brand_name: string;
}

interface AssetOption {
  id: string;
  title: string;
  brand_id: string;
}

export function TelemetryForms({
  brands,
  assets,
}: {
  brands: BrandOption[];
  assets: AssetOption[];
}) {
  const [manualState, manualAction, manualPending] = useActionState(addTelemetryAction, initialState);
  const [csvState, csvAction, csvPending] = useActionState(importTelemetryCsvAction, initialState);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Entrada manual</CardTitle>
          <CardDescription>
            Uma linha por peça. O hook rate é calculado pelo banco (coluna gerada).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={manualAction} className="space-y-3">
            <FieldGroup>
              <Field htmlFor="manual-brand" label="Marca">
                <select
                  id="manual-brand"
                  name="brandId"
                  required
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.brand_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field htmlFor="manual-asset" label="Ativo (opcional)" hint="Vincular ao ativo ensina o bandit.">
                <select
                  id="manual-asset"
                  name="assetId"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Sem vínculo</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.title}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGroup>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="manual-impressions">Impressões</Label>
                <Input id="manual-impressions" name="impressions" type="number" min={0} required defaultValue={1000} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-views">Views em 3s</Label>
                <Input id="manual-views" name="views3s" type="number" min={0} required defaultValue={400} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-retention">Retenção 50% (0–1)</Label>
                <Input id="manual-retention" name="retention50" type="number" min={0} max={1} step="0.01" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-saves">Saves ou cliques</Label>
                <Input id="manual-saves" name="savesOrClicks" type="number" min={0} defaultValue={0} />
              </div>
            </div>

            <Button type="submit" disabled={manualPending} className="w-full">
              {manualPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Registrar telemetria
            </Button>

            {manualState.error ? (
              <Alert variant="destructive">
                <AlertDescription>{manualState.error}</AlertDescription>
              </Alert>
            ) : null}
            {manualState.notice ? (
              <Alert variant="success">
                <AlertDescription>{manualState.notice}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Importar CSV</CardTitle>
          <CardDescription>
            Cabeçalhos aceitos em PT e EN: impressoes, views_3s, retencao_50, saves, citacoes_ia,
            data, canal, ativo_id.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={csvAction} className="space-y-3">
            <Field htmlFor="csv-brand" label="Marca">
              <select
                id="csv-brand"
                name="brandId"
                required
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.brand_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field htmlFor="csv-file" label="Arquivo CSV" hint="Até 4 MB por importação.">
              <Input id="csv-file" name="file" type="file" accept=".csv,text/csv" required />
            </Field>

            <Button type="submit" variant="secondary" disabled={csvPending} className="w-full">
              {csvPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              Importar
            </Button>

            {csvState.error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {csvState.error}
                  {csvState.details && csvState.details.length > 0 ? (
                    <ul className="mt-1 list-disc pl-4 text-xs">
                      {csvState.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            {csvState.notice ? (
              <Alert variant="success">
                <AlertDescription>
                  {csvState.notice}
                  {csvState.details && csvState.details.length > 0 ? (
                    <ul className="mt-1 list-disc pl-4 text-xs">
                      {csvState.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
