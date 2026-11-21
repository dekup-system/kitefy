import Link from "next/link";
import type { Metadata } from "next";
import { Check, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CREDIT_COSTS, PLANS, PLAN_ORDER, formatBRL, monthlyCapacity } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Planos",
  description: "Planos em BRL com créditos transparentes e Pix Automático.",
};

const ASSET_LABEL: Record<string, string> = {
  short_script_kit: "Roteiro curto + 3 ganchos",
  typo_carousel: "Carrossel tipográfico 7–10 slides",
  serp_analysis: "Análise SERP/GEO avulsa",
  single_creative: "Criativo único com imagem",
  hybrid_carousel: "Carrossel híbrido",
  lp_copy: "Pack de landing page",
  geo_article: "Artigo GEO 1.500–2.500 palavras",
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="mb-4">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Voltar
        </Link>
      </div>

      <PageHeader
        title="Planos e créditos"
        description="Sem contrato longo, sem taxa de setup. O consumo é por ativo e o débito acontece só depois que você aprova."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          return (
            <Card key={tier} className={tier === "pro" ? "border-foreground/30" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {tier === "pro" ? <Badge variant="secondary">Mais escolhido</Badge> : null}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <p className="pt-1 font-mono text-2xl font-medium">
                  {formatBRL(plan.priceCents)}
                  <span className="text-sm font-normal text-muted-foreground">/mês</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="mb-1 font-medium text-foreground">Rendimento estimado no mês</p>
                  {monthlyCapacity(tier).map((row) => (
                    <p key={row.asset} className="font-mono">
                      {row.count}× {ASSET_LABEL[row.asset]}
                    </p>
                  ))}
                </div>

                <Button asChild className="w-full">
                  <Link href="/login">Começar com {plan.name}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8 border-foreground/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="size-4" aria-hidden="true" />
            Pix Automático é a opção recomendada
          </CardTitle>
          <CardDescription>
            Menor taxa para você, renovação sem atrito e nenhuma cobrança na janela noturna
            (20h–06h), que costuma ser bloqueada em contas pessoa física.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Na tela de cobrança você autoriza o mandato no app do banco uma única vez. As renovações
            seguintes acontecem entre 08h e 18h (BRT), com aviso de recibo por e-mail.
          </p>
        </CardContent>
      </Card>

      <section className="mt-12" aria-labelledby="table-title">
        <h2 id="table-title" className="text-lg font-semibold tracking-tight">
          Custo por tipo de ativo
        </h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Ativo
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Créditos
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(CREDIT_COSTS).map(([key, cost]) => (
                <tr key={key} className="border-t border-border">
                  <td className="px-3 py-2">{ASSET_LABEL[key] ?? key}</td>
                  <td className="px-3 py-2 text-right font-mono">{cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Falha técnica em qualquer etapa gera estorno automático no extrato de créditos.
        </p>
      </section>
    </div>
  );
}
