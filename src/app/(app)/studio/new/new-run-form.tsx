"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Layers, Loader2, Sparkles, Type } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CREDIT_COSTS } from "@/lib/pricing";
import type { AssetType } from "@/types/domain";

interface BrandOption {
  id: string;
  brand_name: string;
}

const ASSET_OPTIONS: {
  type: AssetType;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    type: "short_script_kit",
    label: "Roteiro curto",
    description: "3 ganchos A/B + corpo de 30–60s para gravação humana.",
    icon: Type,
  },
  {
    type: "typo_carousel",
    label: "Carrossel tipográfico",
    description: "7–10 slides renderizados via Satori, custo zero de imagem.",
    icon: Layers,
  },
  {
    type: "hybrid_carousel",
    label: "Carrossel híbrido",
    description: "Slides + até 2 ilustrações geradas, com aviso de transparência.",
    icon: ImageIcon,
  },
  {
    type: "single_creative",
    label: "Criativo único",
    description: "1 imagem com overlay tipográfico + legenda.",
    icon: Sparkles,
  },
  {
    type: "geo_article",
    label: "Artigo GEO",
    description: "1.500–2.500 palavras, SERP + Schema.org Article/FAQ/Product.",
    icon: FileText,
  },
  {
    type: "lp_copy",
    label: "Copy de landing page",
    description: "Pack completo: hero, problema, solução, prova e FAQ.",
    icon: FileText,
  },
];

export function NewRunForm({
  brands,
  defaultBrandId,
  defaultAssetType,
  defaultObjective,
  defaultProduct,
  creditBalance,
  mockMode,
}: {
  brands: BrandOption[];
  defaultBrandId?: string;
  defaultAssetType?: AssetType;
  defaultObjective?: string;
  defaultProduct?: string;
  creditBalance: number;
  mockMode: boolean;
}) {
  const router = useRouter();
  const [assetType, setAssetType] = useState<AssetType>(defaultAssetType ?? "short_script_kit");
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? "");
  const [objective, setObjective] = useState(defaultObjective ?? "");
  const [product, setProduct] = useState(defaultProduct ?? "");
  const [research, setResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cost = CREDIT_COSTS[assetType];
  const insufficient = creditBalance < cost;
  const canSubmit = Boolean(brandId) && objective.trim().length >= 8 && product.trim().length >= 3 && !insufficient && !pending;

  async function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/studio/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId,
            assetType,
            objective: objective.trim(),
            productInput: product.trim(),
            researchEnabled: research,
          }),
        });

        const payload = (await response.json()) as { threadId?: string; error?: string };
        if (!response.ok) {
          setError(payload.error ?? "Não foi possível gerar o ativo.");
          return;
        }
        if (payload.threadId) {
          router.push(`/studio/${payload.threadId}`);
        }
      } catch {
        setError("Falha de rede ao gerar o ativo. Tente novamente.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Marca</legend>
        <div className="flex flex-wrap gap-2">
          {brands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => setBrandId(brand.id)}
              aria-pressed={brandId === brand.id}
              className={`inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors ${
                brandId === brand.id
                  ? "border-foreground/40 bg-accent font-medium"
                  : "border-border hover:bg-accent/50"
              }`}
            >
              {brand.brand_name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Tipo de ativo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ASSET_OPTIONS.map((option) => {
            const active = assetType === option.type;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => setAssetType(option.type)}
                aria-pressed={active}
                className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                  active ? "border-foreground/40 bg-accent" : "border-border bg-card hover:bg-accent/40"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <option.icon className="size-4" aria-hidden="true" />
                    {option.label}
                  </span>
                  <Badge variant="outline" className="font-mono">
                    {CREDIT_COSTS[option.type]}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <FieldGroup>
        <Field htmlFor="objective" label="Objetivo do ativo" hint="O que precisa acontecer depois que a pessoa consome isso?">
          <Input
            id="objective"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="Ex.: explicar o valor da avaliação preventiva em 45 segundos"
            maxLength={280}
          />
        </Field>
        <Field htmlFor="product" label="Produto ou oferta" hint="Seja específico: o nome da oferta e para quem.">
          <Input
            id="product"
            value={product}
            onChange={(event) => setProduct(event.target.value)}
            placeholder="Ex.: avaliação preventiva em três etapas"
            maxLength={280}
          />
        </Field>
      </FieldGroup>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="research" className="text-sm font-medium">
            Pesquisa de mercado (SERP)
          </Label>
          <p className="text-xs text-muted-foreground">
            Consulta People Also Ask e lacunas de concorrentes. Consome 1 crédito extra; marcado
            automaticamente em artigos GEO.
          </p>
        </div>
        <Switch
          id="research"
          checked={assetType === "geo_article" ? true : research}
          onCheckedChange={setResearch}
          disabled={assetType === "geo_article"}
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {insufficient ? (
        <Alert variant="warning">
          <AlertDescription>
            Este ativo custa {cost} créditos e você tem {creditBalance}.{" "}
            <a href="/settings/billing" className="underline underline-offset-4">
              Ver planos
            </a>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {mockMode ? (
        <p className="text-xs text-muted-foreground">
          Modo demonstração: o conteúdo é gerado localmente, sem chamadas a provedores externos.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Custo: <span className="font-mono">{cost}</span> crédito{cost > 1 ? "s" : ""} · saldo{" "}
          <span className="font-mono">{creditBalance}</span>
        </p>
        <Button onClick={submit} disabled={!canSubmit} size="lg">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {pending ? "Gerando…" : "Gerar ativo"}
        </Button>
      </div>
    </div>
  );
}
