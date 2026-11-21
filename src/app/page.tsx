import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  FileJson,
  Gauge,
  Layers,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS, PLAN_ORDER, formatBRL } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "BrandPulse — Organic & GEO Studio",
  description:
    "Estúdio de conteúdo orgânico com padrão de marca, aprendizado por telemetria e exportação sem atrito. Sem OAuth social, sem avatar, sem narração sintética.",
};

const PILLARS = [
  {
    icon: Gauge,
    title: "Thompson Sampling no lugar de intuição",
    description:
      "Cada telemetria registrada atualiza alpha/beta do ângulo usado. O estúdio passa a apostar no que já retém atenção na sua marca e mantém exploração controlada para descobrir novos ângulos.",
  },
  {
    icon: Search,
    title: "GEO de verdade, não keyword stuffing",
    description:
      "Artigos estruturados em fato direto, contexto e dados verificáveis, com Schema.org Article + FAQPage + Product. É o formato que motores de busca e assistentes de IA conseguem citar.",
  },
  {
    icon: Layers,
    title: "Renderização programática a custo zero",
    description:
      "Carrosséis e criativos saem em PNG 1080x1350 e 1080x1920 via Satori + resvg, com os tokens visuais da sua marca. Ilustração por IA é opcional e sempre sinalizada.",
  },
];

const PROHIBITIONS = [
  "Nenhum OAuth de Meta, Instagram, TikTok, LinkedIn, X ou YouTube",
  "Nenhum token social armazenado",
  "Nenhum avatar digital, lip-sync, TTS ou clonagem de voz",
  "Nenhum dado biométrico facial ou vocal",
  "Nenhum treinamento de modelo com dados de clientes",
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-16">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-foreground" />
          BrandPulse
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/pricing" className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">
            Planos
          </Link>
          <Link href="/privacidade" className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">
            Privacidade
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Entrar</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto mt-16 max-w-3xl text-center sm:mt-24">
        <Badge variant="outline" className="mx-auto mb-5">
          Organic &amp; GEO Studio
        </Badge>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Conteúdo orgânico com padrão de marca e aprendizado mensurável.
        </h1>
        <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Roteiros graváveis, carrosséis prontos e artigos que motores de busca e assistentes de IA
          conseguem citar. Você cola a URL do site, o estúdio extrai o contexto da marca e entrega o
          primeiro ativo em menos de 90 segundos.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/login">
              Criar conta gratuita <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/pricing">Ver planos e créditos</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Sem cartão para começar. 10 créditos de boas-vindas.
        </p>
      </section>

      <section className="mt-20 grid gap-4 md:grid-cols-3" aria-label="Pilares do produto">
        {PILLARS.map((pillar) => (
          <Card key={pillar.title}>
            <CardHeader>
              <pillar.icon className="size-5" aria-hidden="true" />
              <CardTitle className="text-base">{pillar.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{pillar.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-20 grid gap-6 lg:grid-cols-2" aria-label="Entrega e limites">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="size-4" aria-hidden="true" />
              Entrega sem atrito
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
              Cópia em 1 clique, download ZIP com PNG/JPEG, Markdown, HTML e JSON-LD.
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
              Integração com o CMS próprio da sua marca por webhook — a publicação continua sua.
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
              Revisão humana obrigatória, com relatório de conformidade por ativo.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ban className="size-4" aria-hidden="true" />
              O que nunca fazemos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {PROHIBITIONS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-destructive" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="mt-20" aria-labelledby="pricing-preview">
        <h2 id="pricing-preview" className="text-center text-2xl font-semibold tracking-tight">
          Preço em real, crédito transparente
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          Roteiro e carrossel tipográfico custam 1 crédito. Criativo único, 2. Artigo GEO, 5. O
          débito só acontece após você aprovar.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLAN_ORDER.map((tier) => {
            const plan = PLANS[tier];
            return (
              <Card key={tier}>
                <CardHeader>
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <p className="font-mono text-lg">{formatBRL(plan.priceCents)}<span className="text-sm text-muted-foreground">/mês</span></p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>{plan.monthlyCredits} créditos · até {plan.maxBrands} marca(s)</p>
                  <p>{plan.tagline}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="mt-6 text-center">
          <Button asChild>
            <Link href="/pricing">
              Comparar planos <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="mt-24 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row">
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          LGPD: exportação e exclusão definitiva em 1 clique.
        </p>
        <nav className="flex gap-4">
          <Link href="/privacidade" className="hover:text-foreground">
            Privacidade
          </Link>
          <Link href="/termos" className="hover:text-foreground">
            Termos
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Planos
          </Link>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-3" aria-hidden="true" /> BrandPulse
          </span>
        </nav>
      </footer>
    </div>
  );
}
