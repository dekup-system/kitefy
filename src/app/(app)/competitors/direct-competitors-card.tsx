"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Compass, ExternalLink, Globe, Loader2, MapPin, Share2, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAZIL_REGIONS, formatTargetRegions } from "@/lib/brand/regions";
import type {
  DirectCompetitorAiReport,
  DirectCompetitorCandidate,
} from "@/lib/competitors/ai-correlator";

const ASSET_LABEL: Record<string, string> = {
  typo_carousel: "Carrossel Instagram",
  hybrid_carousel: "Carrossel Ilustrado IA",
  short_script_kit: "Roteiro Reels / TikTok",
  single_creative: "Post único",
  geo_article: "Artigo GEO",
};

export function DirectCompetitorsCard({
  brandId,
  brandName,
  initialRegions,
}: {
  brandId: string;
  brandName: string;
  initialRegions: string[];
}) {
  const [selectedRegions, setSelectedRegions] = useState<string[]>(
    initialRegions.length > 0 ? initialRegions : ["Todo o Brasil"],
  );
  const [candidates, setCandidates] = useState<DirectCompetitorCandidate[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null);
  const [report, setReport] = useState<DirectCompetitorAiReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regionLabel = formatTargetRegions(selectedRegions);

  function toggleRegion(regionId: string) {
    if (regionId === "Todo o Brasil") {
      setSelectedRegions(["Todo o Brasil"]);
      return;
    }
    setSelectedRegions((prev) => {
      const withoutNational = prev.filter((r) => r !== "Todo o Brasil");
      const exists = withoutNational.includes(regionId);
      const next = exists
        ? withoutNational.filter((r) => r !== regionId)
        : [...withoutNational, regionId];
      return next.length === 0 ? ["Todo o Brasil"] : next;
    });
  }

  async function discover() {
    setError(null);
    setDiscovering(true);
    try {
      const res = await fetch("/api/competitors/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover", brandId, targetRegions: selectedRegions }),
      });
      const data = (await res.json()) as {
        candidates?: DirectCompetitorCandidate[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível buscar concorrentes diretos agora.");
        return;
      }
      setCandidates(data.candidates ?? []);
      if ((data.candidates ?? []).length === 0) {
        setError("Nenhum concorrente direto retornado para os dados atuais. Enriquecer o ICP e diferenciais em Marcas e Personas melhora a busca.");
      }
    } catch {
      setError("Falha de rede ao pesquisar concorrentes.");
    } finally {
      setDiscovering(false);
    }
  }

  async function analyze(candidate: DirectCompetitorCandidate) {
    setError(null);
    setAnalyzingUrl(candidate.url);
    try {
      const res = await fetch("/api/competitors/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          brandId,
          competitorName: candidate.name,
          competitorUrl: candidate.url,
        }),
      });
      const data = (await res.json()) as {
        report?: DirectCompetitorAiReport;
        error?: string;
      };
      if (!res.ok || !data.report) {
        setError(data.error ?? "Não foi possível concluir a análise comparativa.");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Falha de rede ao analisar concorrente.");
    } finally {
      setAnalyzingUrl(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="size-4 text-brand-signal" aria-hidden="true" />
            Concorrentes Diretos na Região · {brandName}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 text-[11px]">
              <MapPin className="size-3" aria-hidden="true" />
              {regionLabel}
            </Badge>
          </div>
        </div>
        <CardDescription>
          Defina a área de atuação de <strong>{brandName}</strong> no Brasil e pesquise sites e
          redes sociais de empresas e profissionais compatíveis. Clique em{" "}
          <strong>Analisar (2 créditos)</strong> para o Agente de IA gerar o comparativo e conceitos
          criativos aplicáveis.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3.5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
              Área de atuação no Brasil · {brandName}
            </p>
            <p className="text-xs text-muted-foreground">
              Marque as regiões de interesse (IBGE) ou Todo o Brasil. A escolha é salva automaticamente na marca ao pesquisar.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {BRAZIL_REGIONS.map((region) => {
              const checked = selectedRegions.includes(region.id);
              return (
                <label
                  key={region.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                    checked
                      ? "border-brand-navy bg-brand-navy/5 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRegion(region.id)}
                    className="mt-0.5 size-4 rounded border-input accent-brand-navy"
                  />
                  <span className="min-w-0 leading-tight">
                    <span className="block font-semibold text-foreground">{region.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{region.states}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={discover} disabled={discovering}>
            {discovering ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Compass className="size-4" aria-hidden="true" />
            )}
            {discovering ? "Pesquisando concorrentes..." : "Pesquisar concorrentes diretos"}
          </Button>
          <span className="text-xs text-muted-foreground">
            A listagem é gratuita; a análise comparativa por IA consome 2 créditos.
          </span>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {candidates.length > 0 ? (
          <ul className="space-y-2.5">
            {candidates.map((candidate) => {
              const isAnalyzing = analyzingUrl === candidate.url;
              return (
                <li
                  key={candidate.url}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{candidate.name}</p>
                      <Badge
                        variant={candidate.channel === "social" ? "secondary" : "outline"}
                        className="gap-1 text-[10px]"
                      >
                        {candidate.channel === "social" ? (
                          <Share2 className="size-2.5" aria-hidden="true" />
                        ) : (
                          <Globe className="size-2.5" aria-hidden="true" />
                        )}
                        {candidate.channelLabel}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {candidate.domain}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{candidate.snippet}</p>
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Abrir site <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(analyzingUrl)}
                    onClick={() => analyze(candidate)}
                    className="shrink-0"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="size-3.5 text-brand-signal" aria-hidden="true" />
                    )}
                    {isAnalyzing ? "Analisando..." : "Analisar (2 créditos)"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {report ? (
          <div className="space-y-4 rounded-xl border border-brand-navy/20 bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-signal">
                  Comparativo por Agente de IA
                </p>
                <h3 className="text-base font-semibold text-foreground">
                  {brandName} × {report.competitorName}
                </h3>
              </div>
              <Badge variant="secondary">{report.regionLabel}</Badge>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">{report.summary}</p>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-foreground">Dimensão</th>
                    <th className="px-3 py-2 font-semibold text-foreground">{report.competitorName}</th>
                    <th className="px-3 py-2 font-semibold text-foreground">Vantagem de {brandName}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.comparison.map((row) => (
                    <tr key={row.dimension} className="border-t border-border align-top">
                      <td className="px-3 py-2.5 font-medium text-foreground">{row.dimension}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.competitorApproach}</td>
                      <td className="px-3 py-2.5 text-foreground">{row.brandAdvantage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Conceitos criativos correlacionados para criar agora
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {report.creativeConcepts.map((concept) => {
                  const params = new URLSearchParams({
                    brand: brandId,
                    type: concept.assetType,
                    objective: concept.objective,
                    product: concept.productInput,
                  });
                  return (
                    <div
                      key={concept.title}
                      className="flex flex-col justify-between gap-3 rounded-lg border border-orange-200/80 bg-orange-50/60 p-3.5 dark:border-orange-900/50 dark:bg-orange-950/20"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="bg-background text-[10px]">
                            {ASSET_LABEL[concept.assetType] ?? concept.assetType}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {concept.angle}
                          </Badge>
                        </div>
                        <p className="text-xs font-semibold leading-snug text-foreground">
                          {concept.title}
                        </p>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {concept.rationale}
                        </p>
                      </div>

                      <Button asChild size="sm" className="w-full">
                        <Link href={`/studio/new?${params.toString()}`}>
                          Aplicar Conceito <ArrowRight className="size-3.5" aria-hidden="true" />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
