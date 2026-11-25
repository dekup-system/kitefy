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
        <Field
          htmlFor="websiteUrl"
          label="Site oficial ou link da rede social (opcional)"
          hint="Aceita site (https://suamarca.com.br) ou perfil público (Instagram, LinkedIn, YouTube, TikTok)."
        >
          <Input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            defaultValue={brand.website_url || "https://"}
            placeholder="https://suamarca.com.br ou https://instagram.com/suamarca"
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
            Ao enviar sua logomarca, o Kitefy extrai automaticamente as cores predominantes com 3 variações prontas. Você também pode escolher um preset ou personalizar.
          </p>
        </div>

        {(brand.visual_tokens?.logo_palettes ?? []).length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
              Extraídas da sua logomarca
            </p>
            <div className="flex flex-wrap gap-2">
              {(brand.visual_tokens?.logo_palettes ?? []).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setPrimaryColor(preset.primary);
                    setBackgroundColor(preset.background);
                    setAccentColor(preset.accent);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-foreground/30 bg-background px-3 py-1 text-xs font-medium hover:bg-accent"
                >
                  <span
                    className="inline-block size-3 rounded-full border border-border"
                    style={{ backgroundColor: preset.primary }}
                    aria-hidden="true"
                  />
                  <span
                    className="inline-block size-3 rounded-full border border-border"
                    style={{ backgroundColor: preset.accent }}
                    aria-hidden="true"
                  />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

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

      <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
        <div>
          <p className="text-sm font-medium">DNA Estratégico, Persona (ABEP / JTBD) &amp; Tom de Voz</p>
          <p className="text-xs text-muted-foreground">
            Dados cruzados automaticamente pelo Agente Orquestrador antes de cada geração para eliminar textos genéricos.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            htmlFor="uvp"
            label="Mecanismo Único / Proposta de Valor"
            hint="Como sua marca resolve diferente dos concorrentes?"
          >
            <Input
              id="uvp"
              name="uvp"
              defaultValue={brand.tone_of_voice?.uvp ?? ""}
              maxLength={400}
              placeholder="Ex.: Protocolo próprio em 3 etapas sem contratos longos"
            />
          </Field>

          <Field
            htmlFor="contrarianThesis"
            label="Tese Contrária / Mito que você combate"
            hint="Contra qual prática comum do seu mercado você se posiciona?"
          >
            <Input
              id="contrarianThesis"
              name="contrarianThesis"
              defaultValue={brand.tone_of_voice?.contrarian_thesis ?? ""}
              maxLength={400}
              placeholder="Ex.: Postar todo dia sem estratégia só queima alcance"
            />
          </Field>
        </div>

        <Field
          htmlFor="abepClass"
          label="Perfil Econômico do Público (Critério Brasil ABEP)"
          hint="Calibra argumentos de valor e vocabulário brasileiro."
        >
          <select
            id="abepClass"
            name="abepClass"
            defaultValue={brand.tone_of_voice?.abep_class ?? "misto"}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
          >
            <option value="misto">Público Amplo / Misto</option>
            <option value="A">Classe A (Alta Renda / Curadoria &amp; Tempo)</option>
            <option value="B1">Classe B1 (Média-Alta / Previsibilidade &amp; ROI)</option>
            <option value="B2">Classe B2 (Média Consolidada / Custo-Benefício)</option>
            <option value="C1">Classe C1 (Média Emergente / Praticidade Direta)</option>
            <option value="C2">Classe C2 (Popular Consolidada / Economia Real)</option>
            <option value="DE">Classes D-E (Essencial &amp; Acessível)</option>
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="jtbdFunctional" label="Job Funcional (o que o cliente quer resolver)">
            <Input
              id="jtbdFunctional"
              name="jtbdFunctional"
              defaultValue={brand.tone_of_voice?.jtbd_functional ?? ""}
              maxLength={300}
              placeholder="Ex.: Atrair clientes qualificados sem depender de indicação"
            />
          </Field>
          <Field htmlFor="jtbdEmotional" label="Job Emocional (como quer se sentir)">
            <Input
              id="jtbdEmotional"
              name="jtbdEmotional"
              defaultValue={brand.tone_of_voice?.jtbd_emotional ?? ""}
              maxLength={300}
              placeholder="Ex.: Ter previsibilidade de agenda sem medo de desperdiçar verba"
            />
          </Field>
        </div>

        <Field
          htmlFor="objectionsText"
          label="Principais objeções dos clientes (1 por linha)"
          hint="O estúdio antecipa e derruba essas objeções em carrosséis, roteiros e LPs."
        >
          <Textarea
            id="objectionsText"
            name="objectionsText"
            defaultValue={(brand.tone_of_voice?.objections ?? []).join("\n")}
            rows={2}
            maxLength={1200}
            placeholder={"Acho caro contratar agora\nJá tentei agência antes e não deu retorno"}
          />
        </Field>

        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <Field htmlFor="formality" label="Formal (1) ↔ Casual (10)">
            <input
              id="formality"
              name="formality"
              type="range"
              min={1}
              max={10}
              defaultValue={brand.tone_of_voice?.formality ?? 6}
              className="w-full accent-brand-navy"
            />
          </Field>
          <Field htmlFor="humor" label="Sério (1) ↔ Bem-humorado (10)">
            <input
              id="humor"
              name="humor"
              type="range"
              min={1}
              max={10}
              defaultValue={brand.tone_of_voice?.humor ?? 4}
              className="w-full accent-brand-navy"
            />
          </Field>
          <Field htmlFor="irreverence" label="Diplomático (1) ↔ Provocador (10)">
            <input
              id="irreverence"
              name="irreverence"
              type="range"
              min={1}
              max={10}
              defaultValue={brand.tone_of_voice?.irreverence ?? 5}
              className="w-full accent-brand-navy"
            />
          </Field>
          <Field htmlFor="enthusiasm" label="Sóbrio (1) ↔ Vibrante (10)">
            <input
              id="enthusiasm"
              name="enthusiasm"
              type="range"
              min={1}
              max={10}
              defaultValue={brand.tone_of_voice?.enthusiasm ?? 6}
              className="w-full accent-brand-navy"
            />
          </Field>
        </div>
      </div>

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
