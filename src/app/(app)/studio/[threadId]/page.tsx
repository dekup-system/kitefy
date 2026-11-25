import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Flame,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { readStudioRun, runBelongsToTenant } from "@/lib/agent/runner";
import {
  applyComplianceFixAction,
  decideStudioRunAction,
  markAssetPostedAction,
} from "@/lib/studio/actions";
import { suggestComplianceRewrite } from "@/lib/compliance/rewrite";
import { recordQuickFeedbackAction } from "@/lib/telemetry/actions";
import { signVisualPaths } from "@/lib/agent/visual-adapter";
import { buildCleanCopyText } from "@/lib/export/pack";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { serializeJsonLd } from "@/lib/geo/jsonld";
import { CREDIT_COSTS } from "@/lib/pricing";
import { buildPublishChecklist, computeContentScore } from "@/lib/ui/workspace-insights";
import type { AngleType, AssetType, CampaignAssetRow, ContentPayload, HookVariantRow } from "@/types/domain";

export const metadata: Metadata = { title: "Estúdio" };
export const maxDuration = 300;

const ASSET_LABEL: Record<string, string> = {
  short_script_kit: "Roteiro de Vídeo Curto (Reels / TikTok)",
  typo_carousel: "Carrossel para Instagram",
  hybrid_carousel: "Carrossel Ilustrado",
  single_creative: "Post Único para Feed",
  geo_article: "Artigo para Blog e Buscadores",
  lp_copy: "Texto de Página de Vendas",
};

const ANGLE_HUMAN_LABEL: Record<AngleType, string> = {
  vace_pattern_interrupt: "Curiosidade (Quebra de padrão)",
  contrarian_frame: "Mito vs. Verdade",
  outcome_anchored: "Foco no resultado prático",
  negative_constraint: "Erro comum a evitar",
};

function extractReadyCaption(payload: ContentPayload | null): {
  fullText: string;
  captionOnly: string;
  hashtags: string[];
  charCount: number;
  foldPreview: string;
} | null {
  if (!payload) return null;

  if (
    payload.kind === "short_script_kit" ||
    payload.kind === "typo_carousel" ||
    payload.kind === "hybrid_carousel" ||
    payload.kind === "single_creative"
  ) {
    const captionOnly = payload.caption.seo.trim();
    const hashtags = payload.caption.hashtags;
    const hashtagLine = hashtags.join(" ");
    const fullText = hashtagLine ? `${captionOnly}\n\n${hashtagLine}` : captionOnly;
    return {
      fullText,
      captionOnly,
      hashtags,
      charCount: fullText.length,
      foldPreview: captionOnly.slice(0, 125),
    };
  }

  return null;
}

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ aprovado?: string; rejeitado?: string; error?: string; erro?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) notFound();

  const { threadId } = await params;
  const query = await searchParams;

  const run = await readStudioRun(threadId).catch(() => null);

  // Defesa em profundidade: o thread só é exibido para o tenant dono.
  if (run && !(await runBelongsToTenant(threadId, session.tenantId).catch(() => false))) {
    notFound();
  }

  // Fallback: ativo já aprovado/persistido no banco (sobrevive a restart ou limpeza de checkpoint).
  const supabase = await createSupabaseServerClient();
  const persisted = await supabase
    .from("campaigns_and_assets")
    .select("*")
    .eq("thread_id", threadId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<CampaignAssetRow>();

  if (!run && !persisted.data) {
    if (!process.env.SUPABASE_DB_URL) {
      return (
        <div className="mx-auto max-w-2xl space-y-6 py-12">
          <PageHeader
            title="Rascunho não disponível nesta instância"
            description="O conteúdo foi gerado, mas a conexão direta com o banco de estado não estava ativa."
          />
          <Alert variant="warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertDescription>
              Configure <code className="font-mono">SUPABASE_DB_URL</code> para manter rascunhos entre requisições.
            </AlertDescription>
          </Alert>
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/studio/new">Criar novo conteúdo</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/campaigns">Ver meus conteúdos</Link>
            </Button>
          </div>
        </div>
      );
    }

    notFound();
  }

  const asset = persisted.data ?? null;

  // Se o ativo já foi aprovado e o checkpoint não está em memória, recupera os ganchos do banco.
  let persistedHooks: HookVariantRow[] = [];
  if (asset && (!run || run.view.hooks.length === 0)) {
    const hooksQuery = await supabase
      .from("hook_variants")
      .select("*")
      .eq("asset_id", asset.id)
      .eq("tenant_id", session.tenantId)
      .order("is_selected", { ascending: false });
    persistedHooks = (hooksQuery.data ?? []) as HookVariantRow[];
  }

  const brandQuery = await supabase
    .from("brand_profiles")
    .select("id, brand_name")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; brand_name: string }>();

  const brandName = brandQuery.data?.brand_name ?? "Sua marca";
  const brandId = asset?.brand_id ?? brandQuery.data?.id ?? "";
  // Bugfix P0.5: faz fallback para asset.content_payload quando run.view.draft não estiver no checkpointer
  const draft = (run?.view.draft ?? asset?.content_payload ?? null) as ContentPayload | null;
  const hooks =
    run && run.view.hooks.length > 0
      ? run.view.hooks
      : persistedHooks.map((h, idx) => ({
          index: idx,
          hook_text: h.hook_text,
          angle_type: h.angle_type,
          framework: h.framework,
        }));

  const compliance = run?.view.compliance ?? null;
  const visualPaths =
    run && run.view.visualPaths.length > 0 ? run.view.visualPaths : (asset?.visual_urls ?? []);
  const signedUrls = await signVisualPaths(visualPaths).catch(() => []);
  const awaiting = run?.status === "awaiting_approval" && !asset;
  const approved = Boolean(asset) || run?.status === "approved";
  const isExported = asset?.status === "exported";
  const credits =
    asset?.credits_charged ??
    run?.interrupt?.creditsCost ??
    CREDIT_COSTS[(run?.view.assetType ?? "short_script_kit") as keyof typeof CREDIT_COSTS] ??
    1;

  const cleanCopyText = draft
    ? buildCleanCopyText(draft, run?.interrupt?.title ?? asset?.title ?? "Conteúdo")
    : "";

  const readyCaption = extractReadyCaption(draft);
  const jsonLdText = asset?.json_ld ? serializeJsonLd(asset.json_ld) : null;
  const resolvedAssetType = (run?.view.assetType ?? asset?.asset_type ?? "short_script_kit") as AssetType;
  const contentScore = computeContentScore({
    payload: draft,
    hookCount: hooks.length,
    visualCount: signedUrls.length,
    compliancePassed: compliance ? compliance.approved : true,
    complianceIssuesCount: compliance ? compliance.violations.length : 0,
    hasJsonLd: Boolean(jsonLdText),
  });
  const publishChecklist = buildPublishChecklist(resolvedAssetType);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para a biblioteca
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {ASSET_LABEL[run?.view.assetType ?? asset?.asset_type ?? "short_script_kit"]}
            <Badge variant={isExported ? "secondary" : approved ? "success" : awaiting ? "warning" : "outline"}>
              {isExported
                ? "Já publicado"
                : approved
                  ? "Pronto para postar"
                  : awaiting
                    ? "Aguardando sua aprovação"
                    : "Rascunho"}
            </Badge>
          </span>
        }
        description={run?.view.objective ?? asset?.title ?? "Conteúdo gerado pelo estúdio."}
        actions={
          approved && asset ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm">
                <a href={`/api/assets/${asset.id}/export?format=zip`}>
                  Baixar pacote completo (.ZIP) <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </Button>
              {!isExported ? (
                <form action={markAssetPostedAction}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="threadId" value={threadId} />
                  <Button type="submit" variant="outline" size="sm">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Marcar como já postado
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null
        }
      />

      {/* Content Score determinístico (0–100) + Checklist de publicação por formato */}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 text-brand-signal" aria-hidden="true" />
                Qualidade do conteúdo (Content Score)
              </CardTitle>
              <Badge
                variant={
                  contentScore.tier === "excelente"
                    ? "success"
                    : contentScore.tier === "bom"
                      ? "secondary"
                      : "warning"
                }
                className="font-mono"
              >
                {contentScore.score}/100
              </Badge>
            </div>
            <CardDescription>
              Avaliação automática de ganchos, conformidade da marca, estrutura e entregáveis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-inset"
              role="progressbar"
              aria-valuenow={contentScore.score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Content Score: ${contentScore.score} de 100`}
            >
              <div
                className={
                  contentScore.tier === "excelente"
                    ? "h-full rounded-full bg-success"
                    : contentScore.tier === "bom"
                      ? "h-full rounded-full bg-brand-navy"
                      : "h-full rounded-full bg-brand-signal"
                }
                style={{ width: `${contentScore.score}%` }}
              />
            </div>
            <ul className="space-y-2 text-xs">
              {contentScore.checks.map((check) => (
                <li key={check.label} className="flex items-start gap-2">
                  {check.passed ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                  )}
                  <span>
                    <strong className="text-foreground">{check.label}:</strong>{" "}
                    <span className="text-muted-foreground">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Checklist de exportação e publicação</CardTitle>
            <CardDescription>
              Passos recomendados para publicar este formato com máximo aproveitamento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-xs text-muted-foreground">
              {publishChecklist.map((step, idx) => (
                <li key={step} className="flex items-start gap-2">
                  <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-inset font-mono text-[10px] font-semibold text-foreground">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {query.aprovado ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>
            Conteúdo aprovado! Copie a legenda e baixe as imagens na ordem abaixo para publicar.
          </AlertDescription>
        </Alert>
      ) : null}

      {query.rejeitado ? (
        <Alert variant="warning">
          <XCircle className="size-4" aria-hidden="true" />
          <AlertDescription>
            Rascunho descartado. Nenhum crédito foi descontado da sua conta.
          </AlertDescription>
        </Alert>
      ) : null}

      {query.erro ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>{decodeURIComponent(query.erro)}</AlertDescription>
        </Alert>
      ) : null}

      {run?.view.error ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>{run.view.error}</AlertDescription>
        </Alert>
      ) : null}

      {(() => {
        const blockersCount = compliance
          ? compliance.violations.filter((v) => v.severity === "blocker").length
          : 0;
        const warningsCount = compliance
          ? compliance.violations.filter((v) => v.severity === "warning").length
          : 0;

        if (blockersCount > 0) {
          return (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-950 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
              <AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              <span>
                <strong className="font-semibold">
                  Revisão CONAR: {blockersCount} proibição{blockersCount > 1 ? "ões" : ""}
                  {warningsCount > 0 ? ` e ${warningsCount} recomendação${warningsCount > 1 ? "ões" : ""}` : ""} encontrada{blockersCount + warningsCount > 1 ? "s" : ""}.
                </strong>{" "}
                Abra a aba <em>Revisão CONAR</em> abaixo para aplicar as sugestões de correção automática.
              </span>
            </div>
          );
        }

        if (warningsCount > 0) {
          return (
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>
                <strong className="font-semibold">
                  Revisão publicitária concluída com {warningsCount} recomendação{warningsCount > 1 ? "ões" : ""} de melhoria.
                </strong>{" "}
                Nenhum termo proibido, mas há sugestões prontas para aplicar na aba <em>Revisão CONAR</em> abaixo.
              </span>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
            <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>
              <strong className="font-semibold">Revisão publicitária concluída (100% conforme):</strong>{" "}
              nenhum termo proibido ou recomendação pendente pelo CONAR.
            </span>
          </div>
        );
      })()}

      {(compliance?.requires_transparency_label || asset?.has_ai_imagery) ? (
        <Alert variant="warning">
          <AlertDescription>
            Este conteúdo contém ilustração gerada por IA. Ao postar no Instagram ou TikTok, marque a opção &ldquo;Conteúdo gerado por IA&rdquo;.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Finalização e escolha da abertura */}
      {awaiting ? (
        <Card className="border-foreground/30">
          <CardHeader>
            <CardTitle>Passo final: escolha a abertura e salve na biblioteca</CardTitle>
            <CardDescription>
              {credits} crédito{credits > 1 ? "s" : ""} já debitado{credits > 1 ? "s" : ""} na geração deste conteúdo. Escolha sua abertura favorita abaixo para salvar na biblioteca e liberar o download completo (.ZIP).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={decideStudioRunAction} className="space-y-4">
              <input type="hidden" name="threadId" value={threadId} />
              {hooks.length > 0 ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Qual frase de abertura combina mais com você hoje?</legend>
                  {hooks.map((hook) => (
                    <label
                      key={hook.index}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm hover:bg-accent/40"
                    >
                      <input
                        type="radio"
                        name="selectedHookIndex"
                        value={hook.index}
                        defaultChecked={hook.index === 0}
                        className="mt-1 size-4 accent-foreground"
                      />
                      <span className="space-y-1">
                        <span className="block font-medium text-pretty">{hook.hook_text}</span>
                        <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Estilo: {ANGLE_HUMAN_LABEL[hook.angle_type] ?? "Direto"}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" name="approved" value="true" size="lg" className="flex-1">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Salvar na biblioteca e liberar download (.ZIP)
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Momento 1: Imagens prontas na ordem com download individual */}
      {signedUrls.length > 0 ? (
        <section aria-labelledby="visuals-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="visuals-title" className="text-base font-semibold">
                Imagens prontas na ordem ({signedUrls.length} {signedUrls.length === 1 ? "imagem" : "slides"} · 1080×1350)
              </h2>
              <p className="text-xs text-muted-foreground">
                Baixe na ordem abaixo (Slide 1 é a capa) e selecione no seu Instagram.
              </p>
            </div>
            {approved && asset ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`/api/assets/${asset.id}/export?format=zip`}>
                  <Download className="size-3.5" aria-hidden="true" />
                  Baixar todas (.ZIP)
                </a>
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {signedUrls.map((url, index) => (
              <div
                key={url}
                className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
              >
                <a href={url} target="_blank" rel="noreferrer" className="group overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Slide ${index + 1}`}
                    className="aspect-[4/5] w-full object-cover transition-transform group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                </a>
                <div className="flex items-center justify-between border-t border-border px-2.5 py-2">
                  <span className="text-xs font-medium">
                    Slide {index + 1} {index === 0 ? "(Capa)" : ""}
                  </span>
                  <a
                    href={url}
                    download={`slide-0${index + 1}.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4 hover:text-primary"
                  >
                    <Download className="size-3" aria-hidden="true" />
                    Abrir/Salvar
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Momento 2: Legenda pronta para copiar em 1 clique + Medidor de Legenda */}
      {readyCaption ? (
        <Card>
          <CardHeader className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Legenda pronta com hashtags</CardTitle>
              <CardDescription>
                {readyCaption.charCount} de 2.200 caracteres · {readyCaption.hashtags.length} hashtags incluídas
              </CardDescription>
            </div>
            <CopyButton value={readyCaption.fullText} label="Copiar legenda pronta" size="default" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3.5 text-sm leading-relaxed whitespace-pre-wrap">
              {readyCaption.fullText}
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">Prévia antes do &ldquo;...mais&rdquo; no Instagram (primeiros 125 caracteres):</strong>{" "}
              &ldquo;{readyCaption.foldPreview}...&rdquo;
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Modo Teleprompter / Roteiro fácil para short_script_kit */}
      {draft?.kind === "short_script_kit" ? (
        <Card>
          <CardHeader className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                Texto para você falar na câmera (~{draft.body.estimated_seconds} segundos)
              </CardTitle>
              <CardDescription>
                Leia com naturalidade olhando para a lente do celular.
              </CardDescription>
            </div>
            <CopyButton value={draft.body.script} label="Copiar fala do vídeo" size="sm" variant="outline" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 text-lg font-medium leading-relaxed">
              {draft.body.script}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Passo a passo das cenas (o que mostrar e escrever na tela)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {draft.scene_guide.map((scene) => (
                  <div key={scene.scene} className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
                    <span className="font-semibold text-foreground">Cena {scene.scene + 1}</span>
                    <p className="text-muted-foreground">{scene.visual}</p>
                    <p className="font-medium text-foreground">Texto na tela: &ldquo;{scene.on_screen_text}&rdquo;</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Opções de gancho A/B em linguagem humana */}
      {hooks.length > 0 ? (
        <section aria-labelledby="hooks-title" className="space-y-3">
          <h2 id="hooks-title" className="text-sm font-medium">
            Opções de frase de abertura (Ganchos)
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {hooks.map((hook) => (
              <Card key={`${hook.index}-${hook.hook_text.slice(0, 12)}`} className="gap-2">
                <CardHeader className="gap-1.5">
                  <Badge variant="outline" className="w-fit text-[11px]">
                    {ANGLE_HUMAN_LABEL[hook.angle_type] ?? "Abertura direta"}
                  </Badge>
                  <CardTitle className="text-pretty text-sm leading-snug">{hook.hook_text}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CopyButton value={hook.hook_text} label="Copiar frase" size="sm" variant="ghost" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Feedback de resultado em 1 clique (F1) para alimentar o aprendizado da marca */}
      {approved && asset && brandId ? (
        <Card className="bg-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Já publicou? Conte em 1 clique como esse post foi</CardTitle>
            <CardDescription>
              Sua resposta ensina o estúdio a repetir o estilo de abertura que mais traz clientes para a {brandName}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <form action={recordQuickFeedbackAction}>
              <input type="hidden" name="assetId" value={asset.id} />
              <input type="hidden" name="brandId" value={brandId} />
              <input type="hidden" name="threadId" value={threadId} />
              <input type="hidden" name="rating" value="great" />
              <Button type="submit" variant="outline" size="sm">
                <Flame className="size-3.5 text-orange-600" aria-hidden="true" />
                Bombou (Muito engajamento)
              </Button>
            </form>
            <form action={recordQuickFeedbackAction}>
              <input type="hidden" name="assetId" value={asset.id} />
              <input type="hidden" name="brandId" value={brandId} />
              <input type="hidden" name="threadId" value={threadId} />
              <input type="hidden" name="rating" value="average" />
              <Button type="submit" variant="outline" size="sm">
                <ThumbsUp className="size-3.5" aria-hidden="true" />
                Foi bem (Na média)
              </Button>
            </form>
            <form action={recordQuickFeedbackAction}>
              <input type="hidden" name="assetId" value={asset.id} />
              <input type="hidden" name="brandId" value={brandId} />
              <input type="hidden" name="threadId" value={threadId} />
              <input type="hidden" name="rating" value="weak" />
              <Button type="submit" variant="ghost" size="sm">
                <ThumbsDown className="size-3.5" aria-hidden="true" />
                Fraco (Tentar outro estilo no próximo)
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Detalhes completos e exportação técnica (Progressive Disclosure) */}
      <Tabs defaultValue="conteudo" className="space-y-3">
        <TabsList>
          <TabsTrigger value="conteudo">Texto completo</TabsTrigger>
          <TabsTrigger value="conformidade">Revisão CONAR</TabsTrigger>
          {jsonLdText ? <TabsTrigger value="jsonld">Código para Site (Schema.org)</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="conteudo" className="space-y-3">
          {cleanCopyText ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">Texto pronto para copiar e colar</CardTitle>
                  <CardDescription className="text-xs">
                    Formatado em texto limpo, sem símbolos de código ou marcações de IA.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <CopyButton value={cleanCopyText} label="Copiar tudo" size="sm" />
                  {approved && asset ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/assets/${asset.id}/export?format=html`}>Baixar HTML</a>
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <div className="scrollbar-thin max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-4 font-sans text-sm leading-relaxed text-foreground">
                  {cleanCopyText}
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">
              Texto não encontrado para este rascunho.
            </p>
          )}
        </TabsContent>

        <TabsContent value="conformidade" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Relatório de segurança publicitária (CONAR)</CardTitle>
              <CardDescription>
                Verificação automática contra promessas enganosas, termos proibidos e regras do tom de voz da sua marca.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {compliance ? (
                <>
                  {compliance.violations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma restrição encontrada. Conteúdo seguro para publicação.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {compliance.violations.map((violation, index) => {
                        const suggested = suggestComplianceRewrite(violation.excerpt, violation.rule);
                        return (
                          <li
                            key={`${violation.rule}-${index}`}
                            className={`space-y-2.5 rounded-lg border p-3.5 ${
                              violation.severity === "blocker"
                                ? "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
                                : "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge variant={violation.severity === "blocker" ? "destructive" : "warning"}>
                                {violation.severity === "blocker" ? "Proibição (ajuste obrigatório)" : "Recomendação"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              <strong className="text-foreground">Trecho encontrado:</strong> &ldquo;{violation.excerpt}&rdquo;
                            </p>
                            <div className="rounded-md border border-border bg-background p-2.5 text-xs">
                              <p className="font-medium text-foreground">Sugestão automática de reescrita:</p>
                              <p className="mt-1 text-muted-foreground">&ldquo;{suggested}&rdquo;</p>
                            </div>
                            <form action={applyComplianceFixAction}>
                              <input type="hidden" name="threadId" value={threadId} />
                              <input type="hidden" name="assetId" value={asset?.id ?? ""} />
                              <input type="hidden" name="original" value={violation.excerpt} />
                              <input type="hidden" name="replacement" value={suggested} />
                              <Button type="submit" size="sm" variant="outline">
                                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                Aplicar correção
                              </Button>
                            </form>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Conteúdo revisado e aprovado pelas regras do CONAR.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {jsonLdText ? (
          <TabsContent value="jsonld">
            <CodeBlock code={jsonLdText} language="json" title="Dados estruturados Schema.org para o seu site" />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
