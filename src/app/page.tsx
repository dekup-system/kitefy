import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleSlash,
  FileJson,
  Gauge,
  Layers,
  Lock,
  Search,
  Sparkles,
  Timer,
} from "lucide-react";
import { KitefyLogo, KitefyIcon } from "@/components/brand/kitefy-logo";
import { PackageCard } from "@/components/marketing/package-card";
import { KITEFY_PACKAGES } from "@/lib/marketing/packages";
import { CREDIT_COSTS } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Kitefy — Estúdio de Marketing Orgânico, Carrosséis, Roteiros e Artigos GEO com IA",
  description:
    "Roteiros com 3 ganchos A/B, carrosséis prontos e artigos GEO entregues com padrão de marca e aprendizado por telemetria. Escolha um pacote, aprove e exporte. Sem OAuth social, sem avatar, sem fidelidade.",
  alternates: {
    canonical: "https://www.kitefy.com.br/",
  },
  openGraph: {
    title: "Kitefy — Estúdio de Marketing Orgânico, Carrosséis, Roteiros e Artigos GEO",
    description:
      "Conteúdo orgânico com padrão de marca e prova em dado. Pacotes Start, Lift e Flow.",
    url: "https://www.kitefy.com.br",
    locale: "pt_BR",
    type: "website",
  },
};

const HERO_STATS = [
  { value: "90s", label: "para extrair o perfil da sua marca a partir da URL" },
  { value: "1", label: "crédito por roteiro com 3 ganchos A/B" },
  { value: "5", label: "créditos por artigo GEO com Schema.org validado" },
  { value: "0", label: "redes sociais conectadas ou tokens armazenados" },
];

const PAINS = [
  {
    title: "Calendário cheio, resultado invisível",
    body: "Publica-se muito e aprende-se pouco: sem registro do que funcionou, cada semana recomeça do zero.",
  },
  {
    title: "Cada post parece de uma marca diferente",
    body: "Sem padrão de voz e de cor, o feed vira colagem — e a percepção de profissionalismo cai junto.",
  },
  {
    title: "Conteúdo bom, mas não citável",
    body: "Texto sem fato direto, sem fonte e sem dado verificável não é aproveitado por buscadores nem por assistentes de IA.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Diagnóstico em 90 segundos",
    body: "Você cola a URL do site ou descreve o produto. A Kitefy extrai tom de voz, público, cores e fatos verificáveis — sem formulário de 20 campos.",
  },
  {
    step: "02",
    title: "Pacote e primeiro ativo no mesmo dia",
    body: "Escolha Start, Lift ou Flow. O estúdio cruza seu contexto com pesquisa de busca e seleciona o ângulo por Thompson Sampling, não por opinião.",
  },
  {
    step: "03",
    title: "Aprovação humana e exportação",
    body: "Você revisa em uma tela, escolhe o gancho principal e aprova. Sai em PNG, Markdown, HTML, JSON-LD ou ZIP — e a publicação continua sendo sua.",
  },
];

const DELIVERABLES = [
  {
    icon: Layers,
    title: "Carrossel pronto",
    detail: "7 a 10 slides, título ≤ 8 palavras, corpo ≤ 35 palavras.",
    cost: CREDIT_COSTS.typo_carousel,
  },
  {
    icon: Sparkles,
    title: "Roteiro gravável",
    detail: "3 ganchos A/B, corpo de 30 a 60s e guia de cena — para gravação humana.",
    cost: CREDIT_COSTS.short_script_kit,
  },
  {
    icon: Search,
    title: "Artigo GEO",
    detail: "1.500 a 2.500 palavras em fato direto, contexto e dado verificável.",
    cost: CREDIT_COSTS.geo_article,
  },
  {
    icon: FileJson,
    title: "Landing page",
    detail: "Pack completo de copy: hero, problema, solução, prova e FAQ.",
    cost: CREDIT_COSTS.lp_copy,
  },
];

const WHY = [
  {
    icon: BarChart3,
    title: "O ângulo é escolhido por dado",
    body: "Cada telemetria registrada atualiza o Thompson Sampling. O que retém atenção na sua marca ganha prioridade; o que ainda não foi testado entra obrigatoriamente em exploração.",
  },
  {
    icon: Gauge,
    title: "Padrão de marca, não genérico",
    body: "Tom de voz, cores e fatos verificáveis entram em todo ativo. O resultado parece escrito por uma pessoa que conhece o negócio — porque o contexto vem dele.",
  },
  {
    icon: Lock,
    title: "Entrega, não publicação",
    body: "Nenhuma conexão com Instagram, TikTok, LinkedIn, X ou YouTube. Nenhum token social guardado. Você recebe o arquivo e decide onde publicar.",
  },
];

const FAQ = [
  {
    q: "O que exatamente eu recebo em cada pacote?",
    a: "Cada pacote entrega ativos exportáveis: roteiros com 3 ganchos A/B, carrosséis de 7 a 10 slides, artigos GEO com JSON-LD e packs de landing page. O consumo é por crédito (1 por roteiro ou carrossel, 2 por criativo, 3 por carrossel híbrido ou LP, 5 por artigo GEO) e o débito só acontece depois da sua aprovação.",
  },
  {
    q: "Preciso conectar minhas redes sociais?",
    a: "Não. A Kitefy não usa OAuth social, não publica em seu nome e não armazena tokens de plataforma. Todo conteúdo é entregue para cópia em 1 clique, download em PNG/JPEG, Markdown, HTML, JSON-LD ou webhook para o CMS da sua empresa.",
  },
  {
    q: "Existe avatar falante, locução ou clonagem de voz?",
    a: "Não. Os roteiros são feitos para gravação humana, com a sua voz. Não há TTS, lip-sync, avatar digital nem coleta de dados biométricos faciais ou vocais.",
  },
  {
    q: "Como funciona a aprovação antes da cobrança?",
    a: "O ativo é gerado e fica em revisão. Você escolhe o gancho principal e aprova; só então os créditos são debitados e o ativo é gravado. Se rejeitar, nada é cobrado. Falha técnica gera estorno automático.",
  },
  {
    q: "Meus dados são usados para treinar modelos?",
    a: "Não. O conteúdo é gerado apenas para a sua marca e não é usado para treinar modelos. Você pode exportar tudo em JSON e solicitar exclusão definitiva na área de privacidade, com remoção de arquivos e histórico do agente.",
  },
  {
    q: "Dá para começar pequeno?",
    a: "Sim. O pacote Start foi desenhado para validar o orgânico com risco baixo: 1 marca, 120 créditos por mês e o primeiro ativo no mesmo dia. Você sobe para Lift ou Flow quando o processo já estiver rodando.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function KitefyLandingPage() {
  return (
    <div data-surface="kitefy-light" className="min-h-dvh bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* ---------------- Header (60% claro) ---------------- */}
      <header className="sticky top-0 z-30 border-b border-brand-border bg-brand-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="Kitefy — página inicial" className="shrink-0">
            <KitefyLogo height={40} priority />
          </Link>

          <nav aria-label="Navegação principal" className="hidden items-center gap-7 text-sm text-brand-navy-soft md:flex">
            <a href="#como-funciona" className="transition-colors hover:text-brand-signal-text">
              Como funciona
            </a>
            <a href="#pacotes" className="transition-colors hover:text-brand-signal-text">
              Pacotes
            </a>
            <a href="#entregaveis" className="transition-colors hover:text-brand-signal-text">
              Entregáveis
            </a>
            <a href="#faq" className="transition-colors hover:text-brand-signal-text">
              Dúvidas
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-brand-navy transition-colors hover:text-brand-signal-text sm:inline"
            >
              Entrar
            </Link>
            <Link href="#pacotes" className="kitefy-cta-compact">
              Escolher pacote
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-brand-border">
          <div className="pointer-events-none absolute inset-0 grid-lines opacity-[0.35]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
            <div>
              <p className="kitefy-eyebrow">
                <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-brand-signal" />
                Pacotes ágeis de marketing orgânico
              </p>

              <h1
                id="hero-title"
                className="mt-5 text-balance text-[2.5rem] font-semibold leading-[1.06] tracking-[-0.03em] text-brand-navy sm:text-[3.25rem] lg:text-[3.75rem]"
              >
                Destrave o marketing orgânico da sua marca e{" "}
                <span className="text-brand-signal">voe alto</span>.
              </h1>

              <p className="mt-5 max-w-xl text-pretty text-[1.0625rem] leading-relaxed text-brand-navy-soft">
                A Kitefy transforma a sua marca em um fluxo de roteiros, carrosséis e artigos que
                buscadores e assistentes de IA conseguem citar. Você escolhe o pacote, aprova o ativo
                e exporta. Sem agência no meio do caminho e sem rede social conectada.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="#pacotes" className="kitefy-cta">
                  Escolher meu pacote
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link
                  href="#como-funciona"
                  className="inline-flex h-[3.25rem] items-center justify-center gap-2 rounded-[8px] px-4 text-[1.0625rem] font-medium text-brand-navy underline-offset-4 transition-colors hover:text-brand-signal-text hover:underline"
                >
                  Ver como funciona
                </Link>
              </div>

              <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--brand-text-muted-strong)]">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-brand-navy" aria-hidden="true" />
                  Sem fidelidade
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-brand-navy" aria-hidden="true" />
                  Débito só após aprovação
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-brand-navy" aria-hidden="true" />
                  Dados no Brasil
                </span>
              </p>
            </div>

            {/* Painel ilustrativo: métricas com indicadores laranja (10%) */}
            <div className="relative">
              <div className="rounded-xl border border-brand-border bg-white p-5 shadow-[0_24px_60px_-40px_rgba(24,19,49,0.35)]">
                <div className="flex items-center justify-between gap-3 border-b border-brand-border pb-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-muted-strong)]">
                    Exemplo de painel
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0EB] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#C42D00]">
                    <span aria-hidden="true" className="inline-block size-1 rounded-full bg-brand-signal" />
                    ao vivo
                  </span>
                </div>

                <dl className="mt-4 space-y-4">
                  <div>
                    <dt className="text-sm text-brand-navy-soft">Hook rate médio</dt>
                    <dd className="mt-1 flex items-end justify-between gap-2">
                      <span className="font-mono text-3xl font-semibold tracking-tight text-brand-navy">38,4%</span>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-signal-text">
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                        +6,2 p.p.
                      </span>
                    </dd>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-subtle">
                      <div className="h-full w-[62%] rounded-full bg-brand-navy" aria-hidden="true" />
                    </div>
                  </div>

                  <div>
                    <dt className="text-sm text-brand-navy-soft">Citações em respostas de IA</dt>
                    <dd className="mt-1 flex items-end justify-between gap-2">
                      <span className="font-mono text-3xl font-semibold tracking-tight text-brand-navy">12</span>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-signal-text">
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                        +3 no mês
                      </span>
                    </dd>
                  </div>

                  <div className="flex items-center justify-between border-t border-brand-border pt-3 text-xs text-[var(--brand-text-muted-strong)]">
                    <span>Braço vencedor</span>
                    <span className="font-mono text-brand-navy">vace_pattern_interrupt : pas</span>
                  </div>
                </dl>
              </div>
              <p className="mt-3 text-xs text-[var(--brand-text-muted-strong)]">
                Interface ilustrativa. Números reais variam por marca e por categoria.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- Faixa de fatos (sem métrica inventada) ---------------- */}
        <section aria-label="Fatos do produto" className="border-b border-brand-border bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-brand-border px-0 sm:grid-cols-4">
            {HERO_STATS.map((stat) => (
              <div key={stat.label} className="bg-white px-5 py-6">
                <p className="font-mono text-2xl font-semibold tracking-tight text-brand-navy">{stat.value}</p>
                <p className="mt-1 text-pretty text-xs leading-relaxed text-[var(--brand-text-muted-strong)]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Problema (superfície secundária) ---------------- */}
        <section aria-labelledby="problema-title" className="border-b border-brand-border bg-brand-subtle">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="max-w-2xl">
              <div className="kitefy-rule" aria-hidden="true" />
              <h2
                id="problema-title"
                className="mt-4 text-balance text-3xl font-semibold tracking-[-0.02em] text-brand-navy sm:text-4xl"
              >
                O problema quase nunca é falta de ideia.
              </h2>
              <p className="mt-3 text-pretty text-base leading-relaxed text-brand-navy-soft">
                É falta de critério: sem padrão de marca, sem prova e sem registro, cada semana
                recomeça no improviso — e o orgânico nunca acumula.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {PAINS.map((pain) => (
                <article key={pain.title} className="rounded-xl border border-brand-border bg-white p-5">
                  <h3 className="text-pretty text-base font-semibold text-brand-navy">{pain.title}</h3>
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-brand-navy-soft">{pain.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Como funciona ---------------- */}
        <section id="como-funciona" aria-labelledby="como-title" className="scroll-mt-20 border-b border-brand-border bg-brand-canvas">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <p className="kitefy-eyebrow">Processo</p>
                <h2
                  id="como-title"
                  className="mt-4 text-balance text-3xl font-semibold tracking-[-0.02em] text-brand-navy sm:text-4xl"
                >
                  Três passos. Nenhuma burocracia.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-[var(--brand-text-muted-strong)]">
                Do primeiro clique ao arquivo exportado no mesmo dia. O que costuma levar semanas em
                uma agência tradicional acontece aqui em três telas.
              </p>
            </div>

            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((item) => (
                <li key={item.step} className="relative rounded-xl border border-brand-border bg-white p-6">
                  <span className="font-mono text-sm font-semibold text-brand-signal-text">{item.step}</span>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-brand-navy">{item.title}</h3>
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-brand-navy-soft">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- Pacotes ---------------- */}
        <section id="pacotes" aria-labelledby="pacotes-title" className="scroll-mt-20 border-b border-brand-border bg-brand-canvas">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="kitefy-eyebrow mx-auto">Pacotes</p>
              <h2
                id="pacotes-title"
                className="mt-4 text-balance text-3xl font-semibold tracking-[-0.02em] text-brand-navy sm:text-4xl"
              >
                Escolha o ritmo. Troque de pacote quando quiser.
              </h2>
              <p className="mt-3 text-pretty text-base leading-relaxed text-brand-navy-soft">
                Todos incluem o estúdio completo, exportação sem atrito e o loop de aprendizado. O
                que muda é o volume de créditos e o número de marcas.
              </p>
            </div>

            <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
              {KITEFY_PACKAGES.map((pkg) => (
                <div key={pkg.id} className={pkg.highlighted ? "lg:-mt-4 lg:mb-4" : undefined}>
                  <PackageCard pkg={pkg} />
                </div>
              ))}
            </div>

            <p className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[var(--brand-text-muted-strong)]">
              <span className="inline-flex items-center gap-1.5">
                <CircleSlash className="size-3.5" aria-hidden="true" />
                Sem taxa de setup
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Timer className="size-3.5" aria-hidden="true" />
                Renovação mensal, cancele quando quiser
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" aria-hidden="true" />
                Pix Automático ou cartão via Mercado Pago
              </span>
            </p>
          </div>
        </section>

        {/* ---------------- Por que funciona (30% estrutura escura) ---------------- */}
        <section aria-labelledby="porque-title" className="bg-brand-navy">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <KitefyLogo variant="onDark" height={40} />
                <h2
                  id="porque-title"
                  className="mt-6 text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl"
                >
                  Por que o orgânico com método vence o orgânico por volume.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-white/70">
                A Kitefy não vende “mais posts”. Vende um sistema que aprende o que a sua marca faz
                bem e repete o acerto com padrão.
              </p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-xl bg-white/10 md:grid-cols-3">
              {WHY.map((item) => (
                <article key={item.title} className="bg-brand-navy p-6">
                  <item.icon className="size-5 text-brand-signal" aria-hidden="true" />
                  <h3 className="mt-4 text-lg font-semibold tracking-tight text-white">{item.title}</h3>
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-white/70">{item.body}</p>
                </article>
              ))}
            </div>

            <div className="mt-10 rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
              <p className="flex items-start gap-3 text-sm leading-relaxed text-white/80">
                <Check className="mt-0.5 size-4 shrink-0 text-brand-signal" aria-hidden="true" />
                <span>
                  <strong className="font-semibold text-white">Transparência por ativo:</strong> o
                  registro de modelos usados, o relatório de conformidade e o aviso de imagem
                  sintética ficam no próprio conteúdo.
                </span>
              </p>
              <Link
                href="/privacidade"
                className="mt-4 inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-white underline underline-offset-4 transition-colors hover:text-brand-signal sm:mt-0"
              >
                Política de privacidade
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------- Entregáveis ---------------- */}
        <section id="entregaveis" aria-labelledby="entregaveis-title" className="scroll-mt-20 border-b border-brand-border bg-brand-canvas">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="max-w-2xl">
              <p className="kitefy-eyebrow">Entregáveis</p>
              <h2
                id="entregaveis-title"
                className="mt-4 text-balance text-3xl font-semibold tracking-[-0.02em] text-brand-navy sm:text-4xl"
              >
                O que sai pronto para publicar.
              </h2>
              <p className="mt-3 text-pretty text-base leading-relaxed text-brand-navy-soft">
                Tudo com revisão humana obrigatória e exportação em um clique. O custo em créditos
                é sempre visível antes de gerar.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DELIVERABLES.map((item) => (
                <article key={item.title} className="flex h-full flex-col rounded-xl border border-brand-border bg-white p-5">
                  <item.icon className="size-5 text-brand-navy" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-semibold text-brand-navy">{item.title}</h3>
                  <p className="mt-1.5 text-pretty text-sm leading-relaxed text-brand-navy-soft">{item.detail}</p>
                  <p className="mt-auto pt-4 text-xs text-[var(--brand-text-muted-strong)]">
                    <span className="font-mono text-brand-navy">{item.cost}</span>{" "}
                    {item.cost === 1 ? "crédito" : "créditos"} por ativo
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-b border-brand-border bg-white">
          <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
            <h2 id="faq-title" className="text-balance text-3xl font-semibold tracking-[-0.02em] text-brand-navy sm:text-4xl">
              Dúvidas diretas, respostas diretas.
            </h2>

            <div className="mt-8 divide-y divide-brand-border border-y border-brand-border">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-brand-navy marker:content-none">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="grid size-6 shrink-0 place-items-center rounded-full border border-brand-border text-brand-navy transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-brand-navy-soft">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- CTA final ---------------- */}
        <section aria-labelledby="cta-title" className="bg-brand-canvas">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="rounded-2xl border border-brand-border bg-white p-8 sm:p-12">
              <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <KitefyIcon size={40} />
                  <h2
                    id="cta-title"
                    className="mt-4 text-balance text-3xl font-semibold tracking-[-0.02em] text-brand-navy sm:text-[2.5rem]"
                  >
                    O próximo ativo da sua marca pode sair hoje.
                  </h2>
                  <p className="mt-3 text-pretty text-base leading-relaxed text-brand-navy-soft">
                    Cole a URL do site e veja o primeiro conteúdo pronto antes de decidir qualquer
                    coisa. Sem cartão para começar.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:flex-col">
                  <Link href="/login" className="kitefy-cta">
                    Começar agora
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="#pacotes"
                    className="inline-flex h-[3.25rem] items-center justify-center rounded-[8px] border border-brand-navy bg-white px-6 text-base font-semibold text-brand-navy transition-colors hover:bg-brand-navy hover:text-white"
                  >
                    Comparar pacotes
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------- Footer (escuro, logo em container claro) ---------------- */}
      <footer className="bg-brand-navy">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              <KitefyLogo variant="onDark" height={36} />
              <p className="mt-4 text-pretty text-sm leading-relaxed text-white/70">
                Pacotes ágeis de marketing digital orgânico. Conteúdo com padrão de marca,
                aprendizado por telemetria e entrega sem atrito.
              </p>
            </div>

            <nav aria-label="Rodapé" className="grid grid-cols-2 gap-8 text-sm sm:gap-14">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/50">Produto</h2>
                <ul className="mt-3 space-y-2">
                  <li>
                    <a href="#pacotes" className="text-white/80 transition-colors hover:text-brand-signal">
                      Pacotes
                    </a>
                  </li>
                  <li>
                    <a href="#entregaveis" className="text-white/80 transition-colors hover:text-brand-signal">
                      Entregáveis
                    </a>
                  </li>
                  <li>
                    <a href="#como-funciona" className="text-white/80 transition-colors hover:text-brand-signal">
                      Como funciona
                    </a>
                  </li>
                  <li>
                    <Link href="/pricing" className="text-white/80 transition-colors hover:text-brand-signal">
                      Preços
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/50">Empresa</h2>
                <ul className="mt-3 space-y-2">
                  <li>
                    <Link href="/privacidade" className="text-white/80 transition-colors hover:text-brand-signal">
                      Privacidade
                    </Link>
                  </li>
                  <li>
                    <Link href="/termos" className="text-white/80 transition-colors hover:text-brand-signal">
                      Termos de uso
                    </Link>
                  </li>
                  <li>
                    <Link href="/login" className="text-white/80 transition-colors hover:text-brand-signal">
                      Entrar
                    </Link>
                  </li>
                </ul>
              </div>
            </nav>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
            <p>todos os direitos reservados © {new Date().getFullYear()} Kitefy.</p>
            <a
              href="https://www.m3dmultidev.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 transition-colors hover:text-white/80"
              aria-label="Site da M3D Multidev (abre em nova aba)"
            >
              <span>
                desenvolvido por{" "}
                <span className="font-medium text-white/80 underline-offset-4 group-hover:text-brand-signal group-hover:underline">
                  M3D Multidev
                </span>
              </span>
              {/* O logo tem fundo escuro: no rodapé navy ele fica em um chip claro. */}
              <span className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-white p-0.5 transition-transform group-hover:scale-105">
                <Image
                  src="/m3d-multidev.png"
                  alt="Logo M3D Multidev"
                  width={24}
                  height={24}
                  className="size-6 rounded-[4px] object-contain"
                />
              </span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
