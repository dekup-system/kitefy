"use client";

import { useActionState } from "react";
import { Loader2, MapPin, Sparkles, TrendingUp, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  generateAudienceStudyAction,
  type AudienceStudyActionState,
} from "@/lib/onboarding/actions";
import type { AudiencePersona, BrandProfileRow } from "@/types/domain";

function formatPersonaForCopy(persona: AudiencePersona, brandName: string): string {
  return [
    `PERSONA — ${persona.name} (${brandName})`,
    `Perfil: ${persona.archetype}`,
    `Faixa etária: ${persona.ageRange} | Classe ABEP: ${persona.abepClass}`,
    "",
    `Job Funcional: ${persona.jtbdFunctional}`,
    `Job Emocional: ${persona.jtbdEmotional}`,
    `Job Social: ${persona.jtbdSocial}`,
    "",
    `Já tentou e frustrou: ${persona.triedAndFailed}`,
    `Gatilho de compra: ${persona.buyingTrigger}`,
    "",
    "Objeções ocultas:",
    ...persona.hiddenObjections.map((o) => `- ${o}`),
    "",
    "Voz do Cliente:",
    ...persona.vocPhrases.map((p) => `- "${p}"`),
  ].join("\n");
}

const initialState: AudienceStudyActionState = {};

export function AudienceStudyCard({ brand }: { brand: BrandProfileRow }) {
  const [state, action, pending] = useActionState(generateAudienceStudyAction, initialState);
  const study = brand.tone_of_voice?.audience_study;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-brand-signal" aria-hidden="true" />
            Estudo de Público-Alvo, Personas (JTBD/VoC) &amp; Dados Demográficos (IBGE/ABEP)
          </CardTitle>
          {study ? (
            <Badge variant="secondary" className="font-mono text-[11px]">
              {study.personas.length} personas · {study.ibge.regionLabel}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          Cruza dados oficiais do IBGE (Censo 2022 + PNAD Contínua), Critério Brasil (ABEP) e o DNA
          da marca para gerar personas reais e análise de consumo usadas automaticamente pelo Agente
          Orquestrador em toda geração.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="brandId" value={brand.id} />
          <div className="flex-1">
            <Field
              htmlFor="audienceRegion"
              label="Região ou cidade de atuação da marca"
              hint="Ex.: Curitiba, PR · São Paulo, SP · Florianópolis, SC · ou Brasil"
            >
              <Input
                id="audienceRegion"
                name="region"
                defaultValue={study?.region ?? "Brasil"}
                maxLength={120}
                placeholder="Ex.: São Paulo, SP ou Brasil"
                disabled={pending}
              />
            </Field>
          </div>
          <Button type="submit" disabled={pending} className="shrink-0">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {study ? "Atualizar estudo & personas" : "Gerar estudo, personas e dados IBGE"}
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

        {study ? (
          <div className="space-y-5">
            {/* Bloco 1: Demografia real IBGE + ABEP */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                  <MapPin className="size-3.5 text-brand-signal" aria-hidden="true" />
                  Dados Demográficos Reais — {study.ibge.regionLabel}
                </p>
                <span className="text-[11px] text-muted-foreground">{study.ibge.source}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[11px] text-muted-foreground">População da UF (Censo IBGE)</p>
                  <p className="mt-0.5 font-mono text-base font-semibold">
                    {study.ibge.population.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[11px] text-muted-foreground">Renda per capita (PNAD IBGE)</p>
                  <p className="mt-0.5 font-mono text-base font-semibold">
                    R$ {study.ibge.perCapitaIncomeBrl.toLocaleString("pt-BR")}/mês
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[11px] text-muted-foreground">Classes predominantes (ABEP)</p>
                  <p className="mt-0.5 font-mono text-base font-semibold">
                    {study.ibge.dominantAbepClasses.join(" · ")}
                  </p>
                </div>
              </div>
            </div>

            {/* Bloco 2: Análise de Consumo */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                <TrendingUp className="size-3.5 text-brand-signal" aria-hidden="true" />
                Análise de Comportamento de Consumo
              </p>
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-foreground">Ciclo de decisão:</span>{" "}
                  <span className="text-muted-foreground">{study.consumptionAnalysis.decisionCycle}</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Sensibilidade a valor/preço:</span>{" "}
                  <span className="text-muted-foreground">{study.consumptionAnalysis.priceSensitivity}</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Fricção atual do mercado:</span>{" "}
                  <span className="text-muted-foreground">{study.consumptionAnalysis.marketFriction}</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Canais de decisão:</span>{" "}
                  <span className="text-muted-foreground">
                    {study.consumptionAnalysis.mainChannels.join(" · ")}
                  </span>
                </div>
              </div>
              <div className="pt-1">
                <p className="text-xs font-semibold text-foreground">Gatilhos de compra identificados:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {study.consumptionAnalysis.buyingTriggers.map((trigger) => (
                    <li key={trigger}>{trigger}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Bloco 3: Personas Baseadas em Evidência (JTBD + VoC) */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Personas Baseadas em Evidência (Jobs-to-be-Done + Voz do Cliente)
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {study.personas.map((persona) => (
                  <div
                    key={persona.name}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-xs"
                  >
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{persona.name}</p>
                        <p className="text-muted-foreground">{persona.archetype}</p>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <Badge variant="outline" className="text-[10px]">
                            {persona.ageRange}
                          </Badge>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            ABEP {persona.abepClass}
                          </Badge>
                        </div>
                      </div>

                      <div className="scrollbar-thin max-h-64 space-y-2.5 overflow-y-auto pr-1">
                        <div className="space-y-1.5 rounded-lg bg-muted/30 p-2.5">
                          <p>
                            <strong className="text-foreground">Job Funcional:</strong>{" "}
                            <span className="text-muted-foreground">{persona.jtbdFunctional}</span>
                          </p>
                          <p>
                            <strong className="text-foreground">Job Emocional:</strong>{" "}
                            <span className="text-muted-foreground">{persona.jtbdEmotional}</span>
                          </p>
                          <p>
                            <strong className="text-foreground">Job Social:</strong>{" "}
                            <span className="text-muted-foreground">{persona.jtbdSocial}</span>
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p>
                            <strong className="text-foreground">Já tentou e frustrou:</strong>{" "}
                            <span className="text-muted-foreground">{persona.triedAndFailed}</span>
                          </p>
                          <p>
                            <strong className="text-foreground">Gatilho de compra:</strong>{" "}
                            <span className="text-muted-foreground">{persona.buyingTrigger}</span>
                          </p>
                        </div>

                        <div>
                          <p className="font-semibold text-foreground">Objeções ocultas:</p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                            {persona.hiddenObjections.map((obj) => (
                              <li key={obj}>{obj}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
                          <p className="font-semibold text-foreground">Voz do Cliente:</p>
                          <ul className="mt-1 space-y-1 italic text-muted-foreground">
                            {persona.vocPhrases.map((phrase) => (
                              <li key={phrase}>&ldquo;{phrase}&rdquo;</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border/70 pt-2">
                      <CopyButton
                        value={formatPersonaForCopy(persona, brand.brand_name)}
                        label="Copiar texto"
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhum estudo de personas e demografia gerado ainda para {brand.brand_name}. Informe a
            cidade/estado (ou Brasil) e clique no botão acima para gerar agora.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
