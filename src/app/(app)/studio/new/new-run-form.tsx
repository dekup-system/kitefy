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
import type { AssetType, ToneOfVoice, VisualThemeId } from "@/types/domain";

interface BrandOption {
  id: string;
  brand_name: string;
  icp_description?: string | null;
  tone_of_voice?: ToneOfVoice | null;
  entity_facts?: { claim: string }[];
  knowledge_highlights?: string[];
}

/** Gera 5 balões de objetivo dinâmicos com base no estudo real de cada marca. */
function buildBrandObjectiveChips(brand?: BrandOption): { label: string; text: string }[] {
  const name = brand?.brand_name ?? "nossa marca";
  const tone = brand?.tone_of_voice;
  const primaryPersona = tone?.audience_study?.personas?.[0];
  const icpShort = brand?.icp_description?.trim().slice(0, 85);
  const firstFact = brand?.entity_facts?.[0]?.claim?.trim();
  const firstObjection =
    tone?.objections?.[0]?.trim() || primaryPersona?.hiddenObjections?.[0]?.trim();
  const firstVoc = primaryPersona?.vocPhrases?.[0]?.trim();
  const buyingTrigger = primaryPersona?.buyingTrigger?.trim();

  return [
    {
      label: "Quebrar mito do mercado",
      text: tone?.contrarian_thesis?.trim()
        ? `Desmistificar a crença comum defendendo a tese de ${name}: "${tone.contrarian_thesis.trim()}"`
        : `Expor o erro mais caro que ${icpShort || `o público de ${name}`} comete ao escolher uma solução genérica`,
    },
    {
      label: "Derrubar objeção real",
      text: firstObjection
        ? `Responder com clareza e provas práticas a objeção real do cliente: "${firstObjection}"`
        : `Responder sem rodeios a dúvida que mais trava o fechamento com ${name}`,
    },
    {
      label: "Mostrar mecanismo único",
      text: tone?.uvp?.trim()
        ? `Explicar na prática como funciona o diferencial exclusivo de ${name}: ${tone.uvp.trim()}`
        : firstFact
          ? `Mostrar por que ${name} se destaca na prática com base em: ${firstFact}`
          : `Explicar por que o método de trabalho de ${name} traz mais previsibilidade e segurança`,
    },
    {
      label: "Falar na voz do cliente",
      text: firstVoc
        ? `Responder diretamente à fala real do cliente ideal: "${firstVoc}"`
        : tone?.jtbd_functional?.trim()
          ? `Mostrar passo a passo como ajudar o cliente a ${tone.jtbd_functional.trim()}`
          : `Mostrar uma situação real do cotidiano de ${icpShort || "nosso público"} e como resolver`,
    },
    {
      label: "Gatilho de decisão",
      text: buyingTrigger
        ? `Ativar o momento de decisão do cliente (${buyingTrigger}) convidando para conversar com ${name}`
        : `Apresentar a oferta principal de ${name} com clareza: para quem é, o que entrega e próximo passo`,
    },
  ];
}

const ASSET_OPTIONS: {
  type: AssetType;
  intent: string;
  eta: string;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    type: "typo_carousel",
    intent: "Explicar e gerar salvamentos",
    eta: "~35s",
    label: "Carrossel Instagram (7–10 slides)",
    description: "Slides prontos nas cores da marca + legenda e hashtags.",
    icon: Layers,
  },
  {
    type: "short_script_kit",
    intent: "Atrair seguidores com vídeo",
    eta: "~25s",
    label: "Roteiro Reels / TikTok (30–60s)",
    description: "3 ganchos A/B + guia de cena para gravação humana + legenda.",
    icon: Type,
  },
  {
    type: "single_creative",
    intent: "Aviso rápido ou oferta direta",
    eta: "~25s",
    label: "Post único para Feed",
    description: "1 arte diagramada com chamada direta e legenda pronta.",
    icon: Sparkles,
  },
  {
    type: "hybrid_carousel",
    intent: "Carrossel com ilustração IA",
    eta: "~50s",
    label: "Carrossel ilustrado (7–10 slides)",
    description: "Slides nas cores da marca com faixa de imagem e transparência.",
    icon: ImageIcon,
  },
  {
    type: "geo_article",
    intent: "Aparecer no Google e em IAs",
    eta: "~65s",
    label: "Artigo GEO para Blog / Site",
    description: "1.500–2.500 palavras, FAQ e JSON-LD Schema.org validado.",
    icon: FileText,
  },
  {
    type: "lp_copy",
    intent: "Vender serviço ou produto",
    eta: "~45s",
    label: "Texto de Página de Vendas",
    description: "Hero, problema, solução, provas, FAQ e chamada para ação.",
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
  const [visualFormat, setVisualFormat] = useState<"4:5" | "9:16">("4:5");
  const [visualStyle, setVisualStyle] = useState<"auto" | VisualThemeId>("auto");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentBrand = brands.find((b) => b.id === brandId) ?? brands[0];
  const weeklyIdeas = currentBrand ? buildWeeklyIdeas(currentBrand) : [];
  const objectiveChips = buildBrandObjectiveChips(currentBrand);

  const needsVisualFormat =
    assetType === "typo_carousel" ||
    assetType === "hybrid_carousel" ||
    assetType === "single_creative";
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
            visualFormat,
            visualStyle,
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
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Lightbulb className="size-3.5 text-foreground" aria-hidden="true" />
              Sugestões geradas a partir do estudo de {currentBrand?.brand_name}:
            </div>
            <span className="text-[11px] text-muted-foreground">
              Baseadas no ICP, diferenciais e páginas lidas do site
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {weeklyIdeas.map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => {
                  setAssetType(idea.assetType);
                  setObjective(idea.objective);
                  setProduct(idea.productInput);
                }}
                className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-foreground/40 hover:bg-accent/50"
              >
                <span className="text-[11px] font-medium text-muted-foreground">{idea.badge}</span>
                <span className="text-xs font-semibold leading-snug text-foreground">{idea.title}</span>
                <span className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {idea.objective}
                </span>
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
                    {CREDIT_COSTS[option.type]} cr · {option.eta}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {needsVisualFormat ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Onde você vai postar?"
            hint="Feed é 1080×1350; Story/Reels é 1080×1920."
          >
            <div className="flex flex-wrap gap-2">
              {[
                { value: "4:5" as const, label: "Feed (4:5)" },
                { value: "9:16" as const, label: "Story / Reels (9:16)" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setVisualFormat(option.value)}
                  aria-pressed={visualFormat === option.value}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    visualFormat === option.value
                      ? "border-foreground/40 bg-accent font-medium"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          <Field
            htmlFor="visualStyle"
            label="Estilo visual do carrossel / post"
            hint="Escolha a direção de arte desta peça antes de gerar."
          >
            <select
              id="visualStyle"
              value={visualStyle}
              onChange={(event) => setVisualStyle(event.target.value as "auto" | VisualThemeId)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
            >
              <option value="auto">Estilo da Marca (baseado no estudo e biblioteca)</option>
              <option value="editorial_classic">Editorial Clássico (capa escura + cards)</option>
              <option value="magazine_split">Magazine Split (faixa lateral + número gigante)</option>
              <option value="dark_impact">Dark Impacto (alto contraste escuro)</option>
              <option value="swiss_minimal">Minimalista Suíço (grid preciso + respiro)</option>
            </select>
          </Field>
        </div>
      ) : null}

      <FieldGroup>
        <Field
          htmlFor="objective"
          label="2. Sobre o que vamos falar?"
          hint="Explique a ideia ou dúvida que você quer responder para o seu cliente. Se preferir, comece por uma sugestão:"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {objectiveChips.map((preset) => (
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

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-inset/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5 text-xs">
          <p className="font-medium text-foreground">
            Custo da geração: <span className="font-mono">{cost}</span> crédito{cost > 1 ? "s" : ""} (estorno automático em erro técnico)
          </p>
          <p className="text-muted-foreground">
            Saldo atual: <span className="font-mono text-foreground">{creditBalance} cr</span>
            {!insufficient ? (
              <>
                {" "}· saldo previsto: <span className="font-mono text-foreground">{creditBalance - cost} cr</span>
              </>
            ) : null}
          </p>
        </div>
        <Button onClick={submit} disabled={!canSubmit} size="lg">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {pending ? "Criando seu conteúdo…" : "Criar conteúdo agora"}
        </Button>
      </div>
    </div>
  );
}
