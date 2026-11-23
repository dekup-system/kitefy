"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateBrandAction, type BrandFormState } from "@/lib/onboarding/actions";
import type { BrandProfileRow } from "@/types/domain";

const initialState: BrandFormState = {};

const COLOR_PRESETS: { label: string; primary: string; background: string; accent: string }[] = [
  { label: "Clássico Claro", primary: "#1f1f23", background: "#fdfdfd", accent: "#3f3f46" },
  { label: "Verde Saúde", primary: "#0f3d3e", background: "#fbfdfc", accent: "#1f7a6e" },
  { label: "Vinho Estética", primary: "#4a2535", background: "#fffcfd", accent: "#9c4a6b" },
  { label: "Terracota Artesanal", primary: "#5c2c16", background: "#fffdf9", accent: "#c85a28" },
  { label: "Azul Confiança", primary: "#1e293b", background: "#fcfcfd", accent: "#0284c7" },
  { label: "Elegante Escuro", primary: "#f5f5f6", background: "#131316", accent: "#3f5efb" },
];

export function BrandForm({ brand }: { brand: BrandProfileRow }) {
  const [state, action, pending] = useActionState(updateBrandAction, initialState);
  const [primaryColor, setPrimaryColor] = useState(brand.visual_tokens?.primary ?? "#1f1f23");
  const [backgroundColor, setBackgroundColor] = useState(brand.visual_tokens?.background ?? "#fdfdfd");
  const [accentColor, setAccentColor] = useState(brand.visual_tokens?.accent ?? "#3f3f46");

  const defaultFactsText = (brand.entity_facts ?? [])
    .map((fact) => (fact.source_url ? `${fact.claim} | ${fact.source_url}` : fact.claim))
    .join("\n");

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="brandId" value={brand.id} />

      <FieldGroup>
        <Field htmlFor="brandName" label="Nome do seu negócio ou marca">
          <Input id="brandName" name="brandName" defaultValue={brand.brand_name} required maxLength={160} />
        </Field>
        <Field htmlFor="websiteUrl" label="Site ou link principal (opcional)" hint="Pode ser o site oficial da sua empresa.">
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
          label="Quem é o seu cliente ideal?"
          hint="Descreva em poucas palavras quem compra de você e o que essa pessoa procura."
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
          label="Como sua marca conversa?"
          hint="Separe por vírgula. Ex.: acolhedor, direto, sem promessas milagrosas."
        >
          <Input
            id="tone"
            name="tone"
            defaultValue={(brand.tone_of_voice?.descriptors ?? []).join(", ")}
            maxLength={300}
          />
        </Field>
      </FieldGroup>

      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
        <div>
          <p className="text-sm font-medium">Cores dos seus carrosséis e imagens</p>
          <p className="text-xs text-muted-foreground">
            Escolha uma combinação pronta ou personalize com as cores da sua marca. O contraste de leitura é ajustado automaticamente.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setPrimaryColor(preset.primary);
                setBackgroundColor(preset.background);
                setAccentColor(preset.accent);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-accent"
            >
              <span
                className="inline-block size-3 rounded-full border border-border"
                style={{ backgroundColor: preset.primary }}
                aria-hidden="true"
              />
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <Field htmlFor="primaryColor" label="Cor principal">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor.startsWith("#") ? primaryColor : "#1f1f23"}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-11 cursor-pointer rounded border border-input bg-background p-0.5"
                aria-label="Seletor de cor principal"
              />
              <Input
                id="primaryColor"
                name="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                maxLength={7}
                className="font-mono text-xs"
              />
            </div>
          </Field>

          <Field htmlFor="backgroundColor" label="Cor de fundo do slide">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={backgroundColor.startsWith("#") ? backgroundColor : "#fdfdfd"}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-9 w-11 cursor-pointer rounded border border-input bg-background p-0.5"
                aria-label="Seletor de cor de fundo"
              />
              <Input
                id="backgroundColor"
                name="backgroundColor"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                maxLength={7}
                className="font-mono text-xs"
              />
            </div>
          </Field>

          <Field htmlFor="accentColor" label="Cor de detalhe">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor.startsWith("#") ? accentColor : "#3f3f46"}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-11 cursor-pointer rounded border border-input bg-background p-0.5"
                aria-label="Seletor de cor de detalhe"
              />
              <Input
                id="accentColor"
                name="accentColor"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                maxLength={7}
                className="font-mono text-xs"
              />
            </div>
          </Field>
        </div>
      </div>

      <Field
        htmlFor="factsText"
        label="Fatos e diferenciais reais do seu negócio (1 por linha)"
        hint="O estúdio usa apenas estes fatos nos posts para nunca inventar números. Exemplo: Atendimento em Curitiba desde 2018"
      >
        <Textarea
          id="factsText"
          name="factsText"
          defaultValue={defaultFactsText}
          rows={4}
          maxLength={3000}
          placeholder={"Mais de 800 clientes atendidos desde 2019\nOrçamento sem compromisso em até 24 horas\nEstacionamento próprio no local"}
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
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Salvar alterações da marca
      </Button>
    </form>
  );
}
