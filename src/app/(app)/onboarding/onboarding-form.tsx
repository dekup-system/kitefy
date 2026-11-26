"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createBrandFromOnboardingAction, type BrandFormState } from "@/lib/onboarding/actions";
import { firstAssetSuggestion, NICHE_TEMPLATES } from "@/lib/onboarding/extract";

const initialState: BrandFormState = {};

export function OnboardingForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createBrandFromOnboardingAction, initialState);
  const [templateId, setTemplateId] = useState<string>("");
  const [input, setInput] = useState("https://");

  useEffect(() => {
    if (state.brandId) {
      // Fluxo: após criar a primeira marca, conduz direto para Marcas e Personas
      // para concluir logomarca, DNA estratégico e estudo das 3 personas.
      router.replace(`/settings/brand?brand=${state.brandId}`);
    }
  }, [state.brandId, router]);

  if (state.brandId) {
    const brandConfigUrl = `/settings/brand?brand=${state.brandId}`;
    const suggestion = firstAssetSuggestion(templateId || "geral");
    const params = new URLSearchParams({
      brand: state.brandId,
      type: suggestion.assetType,
      objective: suggestion.objective,
      product: suggestion.productInput,
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" aria-hidden="true" />
            Marca criada! Agora finalize sua marca e personas.
          </CardTitle>
          <CardDescription>
            {state.notice ??
              "Redirecionando para Marcas e Personas para enviar sua logomarca, revisar o DNA estratégico e gerar as 3 personas."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="flex-1">
              <a href={brandConfigUrl}>
                Configurar marca e personas <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={`/studio/new?${params.toString()}`}>Ir para criação de conteúdos</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="templateId" value={templateId} />

      <FieldGroup>
        <Field
          htmlFor="onboarding-input"
          label="Cole a URL do seu site ou descreva seu produto"
          hint="Uma frase basta. Não pedimos acesso a redes sociais em nenhum momento."
        >
          <Input
            id="onboarding-input"
            name="input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="https://suamarca.com.br ou “Clínica de fisioterapia esportiva em SP”"
            autoFocus
            required
            minLength={4}
            maxLength={600}
            className="h-11 text-base"
          />
        </Field>
      </FieldGroup>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Ou comece por um nicho</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {NICHE_TEMPLATES.map((template) => {
            const active = templateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  setTemplateId(active ? "" : template.id);
                  if (!input.trim() || /^https?:\/\/?$/i.test(input.trim())) {
                    setInput(template.example_input);
                  }
                }}
                aria-pressed={active}
                className={`flex h-full flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-foreground/40 bg-accent"
                    : "border-border bg-card hover:bg-accent/50"
                }`}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {template.label}
                  {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </span>
                <span className="text-xs text-muted-foreground">{template.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Sem tour bloqueante. Você pode ajustar tom, cores e fatos depois.
        </p>
        <Button type="submit" size="lg" disabled={pending || input.trim().length < 4}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Wand2 className="size-4" aria-hidden="true" />
          )}
          {pending ? "Extraindo sua marca…" : "Continuar"}
        </Button>
      </div>
    </form>
  );
}
