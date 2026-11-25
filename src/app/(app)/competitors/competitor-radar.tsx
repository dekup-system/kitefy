"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Globe, Loader2, Plus, Radar, Sparkles, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  addCompetitorToRadarAction,
  extractCompetitorIdeasAction,
  removeCompetitorFromRadarAction,
  type RadarActionState,
} from "@/lib/competitors/radar-actions";
import type { CompetitorRadarEntry } from "@/types/domain";

const initialState: RadarActionState = {};

const ASSET_LABEL: Record<string, string> = {
  typo_carousel: "Carrossel",
  short_script_kit: "Reels / TikTok",
  single_creative: "Post único",
  geo_article: "Artigo GEO",
};

export function CompetitorRadar({
  brandId,
  brandName,
  entries,
}: {
  brandId: string;
  brandName: string;
  entries: CompetitorRadarEntry[];
}) {
  const [state, addAction, adding] = useActionState(addCompetitorToRadarAction, initialState);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="size-4 text-brand-signal" aria-hidden="true" />
            Radar de Concorrentes · {brandName}
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[11px]">
            {entries.length}/10 observados
          </Badge>
        </div>
        <CardDescription>
          Salve concorrentes (site ou perfil de Instagram, LinkedIn, TikTok, YouTube) para monitorar
          e extrair novas ideias de conteúdo em 1 clique.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <form action={addAction} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <input type="hidden" name="brandId" value={brandId} />
          <Field htmlFor="radarName" label="Nome do concorrente">
            <Input
              id="radarName"
              name="name"
              required
              maxLength={100}
              placeholder="Ex.: Clínica Modelo"
              disabled={adding}
            />
          </Field>
          <Field htmlFor="radarUrl" label="Site ou rede social">
            <Input
              id="radarUrl"
              name="url"
              type="url"
              required
              defaultValue="https://"
              maxLength={500}
              placeholder="https://concorrente.com.br ou https://instagram.com/perfil"
              disabled={adding}
            />
          </Field>
          <Button type="submit" disabled={adding}>
            {adding ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            Salvar no radar
          </Button>
        </form>

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

        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nenhum concorrente salvo no radar de {brandName}. Adicione o primeiro acima para extrair ideias.
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="space-y-3 rounded-xl border border-border bg-muted/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Globe className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <p className="font-semibold text-sm text-foreground">{entry.name}</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {entry.kind === "social" ? "Rede social" : "Site"}
                      </Badge>
                    </div>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      {entry.url}
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <form action={extractCompetitorIdeasAction}>
                      <input type="hidden" name="brandId" value={brandId} />
                      <input type="hidden" name="competitorId" value={entry.id} />
                      <Button type="submit" size="sm" variant="outline">
                        <Sparkles className="size-3.5 text-brand-signal" aria-hidden="true" />
                        Extrair novas ideias
                      </Button>
                    </form>
                    <form action={removeCompetitorFromRadarAction}>
                      <input type="hidden" name="brandId" value={brandId} />
                      <input type="hidden" name="competitorId" value={entry.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        title="Remover do radar"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </form>
                  </div>
                </div>

                {(entry.topics ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(entry.topics ?? []).map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : null}

                {(entry.ideas ?? []).length > 0 ? (
                  <div className="grid gap-2.5 pt-1 sm:grid-cols-3">
                    {(entry.ideas ?? []).map((idea) => {
                      const studioUrl = `/studio/new?brand=${encodeURIComponent(brandId)}&type=${encodeURIComponent(idea.assetType)}&objective=${encodeURIComponent(idea.objective)}&product=${encodeURIComponent(idea.productInput)}`;
                      return (
                        <div
                          key={idea.title}
                          className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-card p-3 text-xs"
                        >
                          <div className="space-y-1">
                            <Badge variant="outline" className="text-[10px]">
                              {ASSET_LABEL[idea.assetType] ?? "Conteúdo"}
                            </Badge>
                            <p className="font-semibold leading-snug text-foreground">{idea.title}</p>
                            <p className="line-clamp-2 text-[11px] text-muted-foreground">
                              {idea.objective}
                            </p>
                          </div>
                          <Link
                            href={studioUrl}
                            className="inline-flex items-center gap-1 pt-1 font-semibold text-brand-signal hover:underline"
                          >
                            Aplicar em novo conteúdo
                            <ArrowRight className="size-3" aria-hidden="true" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
