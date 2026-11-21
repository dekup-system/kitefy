import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { readStudioRun } from "@/lib/agent/runner";
import { decideStudioRunAction } from "@/lib/studio/actions";
import { signVisualPaths } from "@/lib/agent/visual-adapter";
import { buildContentMarkdown } from "@/lib/export/pack";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { serializeJsonLd } from "@/lib/geo/jsonld";
import { CREDIT_COSTS } from "@/lib/pricing";
import type { CampaignAssetRow } from "@/types/domain";

export const metadata: Metadata = { title: "Estúdio" };
export const maxDuration = 300;

const ASSET_LABEL: Record<string, string> = {
  short_script_kit: "Roteiro curto",
  typo_carousel: "Carrossel tipográfico",
  hybrid_carousel: "Carrossel híbrido",
  single_creative: "Criativo único",
  geo_article: "Artigo GEO",
  lp_copy: "Copy de landing page",
};

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ aprovado?: string; rejeitado?: string; error?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) notFound();

  const { threadId } = await params;
  const query = await searchParams;

  const run = await readStudioRun(threadId).catch(() => null);

  // Fallback: ativo já aprovado/persistido no banco (sobrevive a restart).
  const supabase = await createSupabaseServerClient();
  const persisted = await supabase
    .from("campaigns_and_assets")
    .select("*")
    .eq("thread_id", threadId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<CampaignAssetRow>();

  if (!run && !persisted.data) {
    notFound();
  }

  const asset = persisted.data ?? null;

  const brandQuery = await supabase
    .from("brand_profiles")
    .select("brand_name")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ brand_name: string }>();

  const brandName = brandQuery.data?.brand_name ?? "Sua marca";
  const draft = run?.view.draft ?? null;
  const hooks = run?.view.hooks ?? [];
  const compliance = run?.view.compliance ?? null;
  const visualPaths = run?.view.visualPaths ?? asset?.visual_urls ?? [];
  const signedUrls = await signVisualPaths(visualPaths).catch(() => []);
  const awaiting = run?.status === "awaiting_approval";
  const approved = Boolean(asset) || run?.status === "approved";
  const credits = asset?.credits_charged ?? CREDIT_COSTS[(run?.view.assetType ?? "short_script_kit") as keyof typeof CREDIT_COSTS] ?? 1;

  const markdown = draft
    ? buildContentMarkdown(draft, {
        title: run?.interrupt?.title ?? asset?.title ?? "Ativo",
        brandName,
        credits,
        transparency: compliance?.requires_transparency_label,
      })
    : "";

  const jsonLdText = asset?.json_ld ? serializeJsonLd(asset.json_ld) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Campanhas
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {ASSET_LABEL[run?.view.assetType ?? asset?.asset_type ?? "short_script_kit"]}
            <Badge variant={approved ? "success" : awaiting ? "warning" : "outline"}>
              {approved ? "Aprovado" : awaiting ? "Aguardando aprovação" : run?.status ?? "Rascunho"}
            </Badge>
          </span>
        }
        description={run?.view.objective ?? "Ativo gerado pelo estúdio."}
        actions={
          approved && asset ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={`/api/assets/${asset.id}/export?format=zip`}>
                  Baixar ZIP <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/assets/${asset.id}/export?format=md`}>Markdown</a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/assets/${asset.id}/export?format=jsonld`}>JSON-LD</a>
              </Button>
            </div>
          ) : null
        }
      />

      {query.aprovado ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>
            Ativo aprovado, créditos debitados ({credits}) e salvo em Campanhas. Exportação liberada.
          </AlertDescription>
        </Alert>
      ) : null}

      {query.rejeitado ? (
        <Alert variant="warning">
          <XCircle className="size-4" aria-hidden="true" />
          <AlertDescription>
            Ativo rejeitado. Nenhum crédito foi debitado. Ajuste o briefing e gere novamente.
          </AlertDescription>
        </Alert>
      ) : null}

      {run?.view.error ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>{run.view.error}</AlertDescription>
        </Alert>
      ) : null}

      {compliance && !compliance.approved ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>
            Conteúdo reprovado no guardrail: {compliance.violations.filter((v) => v.severity === "blocker").length}{" "}
            bloqueador(es). Edite o briefing ou gere novamente.
          </AlertDescription>
        </Alert>
      ) : null}

      {compliance?.requires_transparency_label ? (
        <Alert variant="warning">
          <AlertDescription>
            Este ativo inclui imagem sintética fotorrealista. Rotule como conteúdo gerado por IA ao
            publicar — exigência de transparência (LGPD/consumidor).
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Ganchos A/B em primeiro plano */}
      {hooks.length > 0 ? (
        <section aria-labelledby="hooks-title" className="space-y-3">
          <h2 id="hooks-title" className="text-sm font-medium">
            Ganchos A/B
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {hooks.map((hook) => (
              <Card key={`${hook.index}-${hook.hook_text.slice(0, 12)}`} className="gap-2">
                <CardHeader className="gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {hook.angle_type.replaceAll("_", " ")}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{hook.framework}</span>
                  </div>
                  <CardTitle className="text-pretty text-sm leading-snug">{hook.hook_text}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CopyButton value={hook.hook_text} label="Copiar gancho" size="sm" variant="ghost" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Aprovação humana */}
      {awaiting ? (
        <Card>
          <CardHeader>
            <CardTitle>Revisar e aprovar</CardTitle>
            <CardDescription>
              O débito de {credits} crédito{credits > 1 ? "s" : ""} acontece somente após a
              aprovação. Você pode escolher qual gancho será o principal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={decideStudioRunAction} className="space-y-4">
              <input type="hidden" name="threadId" value={threadId} />
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Gancho principal</legend>
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
                    <span className="space-y-0.5">
                      <span className="block font-medium text-pretty">{hook.hook_text}</span>
                      <span className="block text-xs text-muted-foreground">
                        {hook.angle_type} · {hook.framework}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" name="approved" value="true" size="lg" className="flex-1">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Aprovar e debitar {credits}
                </Button>
                <Button type="submit" name="approved" value="false" variant="outline" size="lg">
                  <XCircle className="size-4" aria-hidden="true" />
                  Rejeitar sem debitar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {signedUrls.length > 0 ? (
        <section aria-labelledby="visuals-title" className="space-y-3">
          <h2 id="visuals-title" className="text-sm font-medium">
            Slides renderizados
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {signedUrls.map((url, index) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-lg border border-border"
              >
                {/* URLs assinadas do Supabase: next/image não é usado de propósito. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Slide ${index + 1} do ativo`}
                  className="aspect-[4/5] w-full object-cover transition-transform group-hover:scale-[1.02]"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {/* Progressive disclosure: detalhes só sob demanda */}
      <Tabs defaultValue="conteudo" className="space-y-3">
        <TabsList>
          <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>
          <TabsTrigger value="conformidade">Conformidade</TabsTrigger>
          <TabsTrigger value="jsonld">JSON-LD</TabsTrigger>
          <TabsTrigger value="ia">Uso de IA</TabsTrigger>
        </TabsList>

        <TabsContent value="conteudo" className="space-y-3">
          {markdown ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm">Prévia em Markdown</CardTitle>
                <CopyButton value={markdown} label="Copiar tudo" size="sm" />
              </CardHeader>
              <CardContent>
                <pre className="scrollbar-thin max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                  {markdown}
                </pre>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">
              Conteúdo disponível apenas durante a execução; o ativo aprovado fica em Campanhas.
            </p>
          )}
        </TabsContent>

        <TabsContent value="conformidade" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Relatório do guardrail</CardTitle>
              <CardDescription>
                Verificação determinística (CONAR/publicidade) + revisão leve por LLM.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {compliance ? (
                <>
                  <p className="text-sm">
                    Revisor: <span className="font-medium">{compliance.reviewer}</span> ·{" "}
                    {compliance.violations.length} apontamento(s)
                  </p>
                  {compliance.violations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma violação objetiva encontrada.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {compliance.violations.map((violation, index) => (
                        <li key={`${violation.rule}-${index}`} className="rounded-md border border-border p-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={violation.severity === "blocker" ? "destructive" : "warning"}>
                              {violation.severity === "blocker" ? "Bloqueador" : "Aviso"}
                            </Badge>
                            <span className="text-sm font-medium">{violation.rule}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">“{violation.excerpt}”</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sem relatório para este estado.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jsonld">
          {jsonLdText ? (
            <CodeBlock code={jsonLdText} language="json" title="Schema.org (Article + FAQPage + Product)" />
          ) : (
            <p className="text-sm text-muted-foreground">
              JSON-LD é gerado para artigos GEO e disponibilizado após a aprovação.
            </p>
          )}
        </TabsContent>

        <TabsContent value="ia" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Transparência e custo</CardTitle>
              <CardDescription>
                Registro de uso de IA por ativo (metadados do conteúdo).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Tokens de entrada: <span className="font-mono">{run?.view.usage.input_tokens ?? 0}</span>{" "}
                · saída: <span className="font-mono">{run?.view.usage.output_tokens ?? 0}</span>
              </p>
              <p>
                Custo estimado:{" "}
                <span className="font-mono">
                  US$ {(run?.view.usage.cost_usd ?? 0).toFixed(4)}
                </span>
              </p>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Não há avatar, narração sintética, clonagem de voz ou publicação automática em redes
                sociais neste ativo. Todo conteúdo exige revisão humana antes de publicar.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
