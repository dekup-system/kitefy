"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CompetitorAnalysis } from "@/lib/competitors/analyze";

/**
 * Comparação de concorrentes: o usuário informa até 3 sites e recebe o que eles
 * cobrem e a marca não. É leitura de site público, sem IA e sem custo por uso.
 */
export function CompetitorForm({ brandName }: { brandName: string }) {
  const [urls, setUrls] = useState<string[]>(["", "", ""]);
  const [result, setResult] = useState<CompetitorAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filled = urls.filter((url) => url.trim().length > 3);

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
