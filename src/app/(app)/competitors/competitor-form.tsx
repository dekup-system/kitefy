"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import type { CompetitorAnalysis } from "@/lib/competitors/analyze";
import type { SerpCompetitorAnalysis } from "@/lib/competitors/serp-analysis";

/**
 * Comparação de concorrentes: o usuário informa até 3 sites e recebe o que eles
 * cobrem e a marca não. É leitura de site público, sem IA e sem custo por uso.
 */
export function CompetitorForm({ brandName }: { brandName: string }) {
  const [urls, setUrls] = useState<string[]>(["https://", "https://", "https://"]);
  const [result, setResult] = useState<CompetitorAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [themesText, setThemesText] = useState("");
  const [serpResult, setSerpResult] = useState<SerpCompetitorAnalysis | null>(null);
  const [serpLoading, setSerpLoading] = useState(false);

  async function submitThemes() {
    setError(null);
    setSerpResult(null);
    setSerpLoading(true);
    try {
      const themes = themesText
        .split(/\r?\n|,/)
        .map((theme) => theme.trim())
        .filter((theme) => theme.length >= 4)
        .slice(0, 4);

      const response = await fetch("/api/competitors/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themes }),
      });
      const payload = (await response.json()) as {
        serpAnalysis?: SerpCompetitorAnalysis;
        error?: string;
      };
      if (!response.ok || !payload.serpAnalysis) {
        setError(payload.error ?? "Não foi possível consultar a busca agora.");
        return;
      }
      setSerpResult(payload.serpAnalysis);
    } catch {
      setError("Falha de rede ao consultar a busca.");
    } finally {
      setSerpLoading(false);
    }
  }

  const filled = urls
    .map((url) => url.trim())
    .filter((url) => url.length > 8 && !/^https?:\/\/?$/i.test(url));

  async function submit() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const response = await fetch("/api/competitors/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorUrls: filled }),
      });
      const payload = (await response.json()) as {
        analysis?: CompetitorAnalysis;
        error?: string;
      };
      if (!response.ok || !payload.analysis) {
        setError(payload.error ?? "Não foi possível analisar agora.");
        return;
      }
      setResult(payload.analysis);
    } catch {
      setError("Falha de rede ao analisar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por tema (busca do Google no Brasil)</CardTitle>
          <CardDescription>
            Escreva de 1 a 4 temas do seu negócio. Mostramos quem aparece na busca, as perguntas
            reais do público e os assuntos que os resultados deixam de fora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field htmlFor="themes" label="Temas" hint="Um por linha. Ex.: check-up preventivo, exames de rotina">
            <Textarea
              id="themes"
              value={themesText}
              onChange={(event) => setThemesText(event.target.value)}
              rows={3}
              maxLength={600}
              placeholder={"check-up preventivo\nexames de rotina"}
            />
          </Field>
          <Button
            onClick={submitThemes}
            disabled={serpLoading || themesText.trim().length < 4}
            variant="outline"
          >
            {serpLoading ? "Consultando o Google…" : "Analisar por tema"}
          </Button>
        </CardContent>
      </Card>

      {serpResult ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quem aparece na busca</CardTitle>
              <CardDescription>Sites que cobrem mais de um dos seus temas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {serpResult.domains.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum domínio recorrente.</p>
              ) : (
                serpResult.domains.map((domain) => (
                  <p key={domain.domain} className="text-sm">
                    <span className="font-medium">{domain.domain}</span>{" "}
                    <span className="text-muted-foreground">
                      · {domain.themes} tema(s)
                    </span>
                  </p>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perguntas reais do público</CardTitle>
              <CardDescription>Ótimas para virar FAQ e conteúdo de resposta rápida.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {serpResult.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  O Google não mostrou perguntas para estes temas hoje.
                </p>
              ) : (
                serpResult.questions.map((question) => (
                  <p key={question} className="text-sm">
                    · {question}
                  </p>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assuntos pouco cobertos</CardTitle>
              <CardDescription>
                Aparecem na busca, mas os resultados tratam de forma superficial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {serpResult.gaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma lacuna evidente.</p>
              ) : (
                serpResult.gaps.map((gap) => (
                  <p key={gap} className="text-sm">
                    · {gap}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sites concorrentes</CardTitle>
          <CardDescription>
            Até 3 endereços. Comparamos os assuntos que eles cobrem com os do site da{" "}
            <strong>{brandName}</strong>. Leitura pública, sem custo de IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup>
            {urls.map((value, index) => (
              <Field key={index} htmlFor={`competitor-${index}`} label={`Concorrente ${index + 1}`}>
                <Input
                  id={`competitor-${index}`}
                  value={value}
                  onChange={(event) => {
                    const next = [...urls];
                    next[index] = event.target.value;
                    setUrls(next);
                  }}
                  placeholder="https://concorrente.com.br"
                  inputMode="url"
                  maxLength={200}
                />
              </Field>
            ))}
          </FieldGroup>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button onClick={submit} disabled={loading || filled.length === 0}>
            {loading ? "Lendo os sites…" : "Comparar concorrentes"}
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Lacunas: assuntos que eles cobrem e você não
              </CardTitle>
              <CardDescription>
                {result.gaps.length === 0
                  ? "Nenhuma lacuna encontrada nos sites lidos — sua marca já cobre os temas."
                  : "Use estes temas como pauta do próximo conteúdo."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {result.gaps.map((gap) => (
                  <li key={gap.topic} className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">{gap.topic}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Coberto por {gap.covered_by.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sites lidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.competitors.map((competitor) => (
                <div key={competitor.url} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{competitor.url}</span>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {competitor.topics.length} tópicos
                    </Badge>
                    {competitor.blocked_by_robots ? (
                      <Badge variant="warning">robots.txt bloqueou</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {competitor.topics.slice(0, 6).join(" · ")}
                  </p>
                </div>
              ))}
              {result.shared.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Em comum com a sua marca: {result.shared.slice(0, 6).join(" · ")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
