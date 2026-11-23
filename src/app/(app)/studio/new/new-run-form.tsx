"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Layers, Lightbulb, Loader2, Sparkles, Type } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CREDIT_COSTS, totalRunCreditCost } from "@/lib/pricing";
import { buildWeeklyIdeas } from "@/lib/onboarding/extract";
import type { AssetType } from "@/types/domain";

interface BrandOption {
  id: string;
  brand_name: string;
  icp_description?: string | null;
  entity_facts?: { claim: string }[];
}

/** Atalhos para quem não sabe escrever o briefing: preenchem o objetivo. */
const OBJECTIVE_PRESETS = [
  {
    label: "Por que escolher a gente",
    text: "Explicar por que nossa forma de atender é diferente e por que isso importa para o cliente",
  },
  {
    label: "Erro comum do cliente",
    text: "Mostrar o erro mais comum que o cliente comete nesse assunto e como evitar sem gastar mais",
  },
  {
    label: "Oferta do mês",
    text: "Apresentar a oferta do mês com clareza: o que inclui, para quem serve e como começar",
  },
  {
    label: "Dúvida frequente",
    text: "Responder a dúvida que mais aparece no WhatsApp, em linguagem simples e sem promessa exagerada",
  },
] as const;

const ASSET_OPTIONS: {
  type: AssetType;
  intent: string;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    type: "typo_carousel",
    intent: "Explicar e gerar salvamentos",
    label: "Carrossel para Instagram (7–10 imagens)",
    description: "Slides 1080×1350 prontos com as cores da sua marca + legenda com hashtags.",
    icon: Layers,
  },
  {
    type: "short_script_kit",
    intent: "Atrair seguidores com vídeo curto",
    label: "Roteiro de Reels / TikTok (30–60s)",
    description: "3 opções de abertura + texto fácil para você gravar no celular + legenda.",
    icon: Type,
  },
  {
    type: "single_creative",
    intent: "Aviso rápido ou oferta direta",
    label: "Post único para Feed (1 imagem + legenda)",
    description: "1 imagem 1080×1350 diagramada com chamada direta e legenda pronta.",
    icon: Sparkles,
  },
  {
    type: "hybrid_carousel",
    intent: "Carrossel com espaço para imagem",
    label: "Carrossel ilustrado (7–10 slides)",
    description: "Slides nas cores da marca com faixa para ilustração e selo de transparência.",
    icon: ImageIcon,
  },
  {
    type: "geo_article",
    intent: "Aparecer no Google e em IAs",
    label: "Artigo completo para Blog / Site",
    description: "1.500–2.500 palavras com perguntas frequentes e dados para buscadores.",
    icon: FileText,
  },
  {
    type: "lp_copy",
    intent: "Vender um serviço ou produto",
    label: "Texto de Página de Vendas (Landing Page)",
    description: "Título principal, problema, solução, provas, perguntas frequentes e botão.",
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
  const [assetType, setAssetType] = useState<AssetType>(defaultAssetType ?? "typo_carousel");
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? "");
  const [objective, setObjective] = useState(defaultObjective ?? "");
  const [product, setProduct] = useState(defaultProduct ?? "");
  const [research, setResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentBrand = brands.find((b) => b.id === brandId) ?? brands[0];
  const weeklyIdeas = currentBrand ? buildWeeklyIdeas(currentBrand) : [];

  const isResearchActive = assetType === "geo_article" ? true : research;
  const cost = totalRunCreditCost(assetType, isResearchActive);
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
            researchEnabled: isResearchActive,
          }),
        });

        const payload = (await response.json()) as { threadId?: string; error?: string };
        if (!response.ok) {
          setError(payload.error ?? "Não foi possível gerar o conteúdo.");
          return;
        }
        if (payload.threadId) {
          router.push(`/studio/${payload.threadId}`);
        }
      } catch {
        setError("Falha de rede ao gerar o conteúdo. Tente novamente.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {brands.length > 1 ? (
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
      ) : null}

      {weeklyIdeas.length > 0 ? (
        <div className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="size-3.5 text-foreground" aria-hidden="true" />
            Sem ideia hoje? Clique em uma sugestão pronta para {currentBrand?.brand_name}:
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {weeklyIdeas.map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => {
                  setAssetType(idea.assetType);
                  setObjective(idea.objective);
                  setProduct(idea.productInput);
                }}
                className="flex flex-col justify-between gap-1.5 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-foreground/40 hover:bg-accent/50"
              >
                <span className="text-[11px] font-medium text-muted-foreground">{idea.badge}</span>
                <span className="text-xs font-semibold leading-snug text-foreground">{idea.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">1. Qual é o seu objetivo hoje?</legend>
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
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {option.intent}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <option.icon className="size-4 shrink-0" aria-hidden="true" />
                    {option.label}
                  </span>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {CREDIT_COSTS[option.type]} cr
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <FieldGroup>
        <Field
          htmlFor="objective"
          label="2. Sobre o que vamos falar?"
          hint="Explique a ideia ou dúvida que você quer responder para o seu cliente. Se preferir, comece por uma sugestão:"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {OBJECTIVE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setObjective(preset.text)}
                  className="rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <Input
              id="objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Ex.: explicar por que fazer a revisão preventiva economiza tempo e dinheiro"
              maxLength={280}
            />
          </div>
        </Field>
        <Field
          htmlFor="product"
          label="3. Qual serviço ou produto você quer destacar no final?"
          hint="O que a pessoa deve procurar ou pedir no seu WhatsApp/site depois de ver o post."
        >
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
            Incluir dúvidas reais do Google sobre este assunto
          </Label>
          <p className="text-xs text-muted-foreground">
            Busca as perguntas mais feitas pelas pessoas no Google para enriquecer o post (+1 crédito; já incluso no Artigo para Blog).
          </p>
        </div>
        <Switch
          id="research"
          checked={isResearchActive}
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
            Este conteúdo usa {cost} créditos e você tem {creditBalance}.{" "}
            <a href="/settings/billing" className="underline underline-offset-4">
              Ver pacotes
            </a>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {mockMode ? (
        <p className="text-xs text-muted-foreground">
          Modo demonstração ativo: o conteúdo é gerado instantaneamente para teste.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Você só usa <span className="font-mono font-medium text-foreground">{cost}</span> crédito{cost > 1 ? "s" : ""} se aprovar o resultado · seu saldo:{" "}
          <span className="font-mono">{creditBalance}</span>
        </p>
        <Button onClick={submit} disabled={!canSubmit} size="lg">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {pending ? "Criando seu conteúdo…" : "Criar conteúdo agora"}
        </Button>
      </div>
    </div>
  );
}
