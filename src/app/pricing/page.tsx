import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Check, QrCode } from "lucide-react";
import { KitefyLogo } from "@/components/brand/kitefy-logo";
import { PackageCard } from "@/components/marketing/package-card";
import { KITEFY_PACKAGES } from "@/lib/marketing/packages";
import { CREDIT_COSTS, formatBRL, PLANS } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pacotes e créditos — Start, Lift e Flow",
  description:
    "Pacotes Kitefy Start, Lift e Flow para marketing orgânico e artigos GEO com créditos transparentes, aprovação humana antes do débito e cobrança em BRL.",
  alternates: {
    canonical: "https://www.kitefy.com.br/pricing",
  },
  openGraph: {
    title: "Pacotes e créditos — Kitefy Start, Lift e Flow",
    description:
      "Preço claro e crédito transparente: o débito só acontece após a sua aprovação do ativo.",
    url: "https://www.kitefy.com.br/pricing",
    locale: "pt_BR",
    type: "website",
  },
};

const ASSET_LABEL: Record<string, string> = {
  short_script_kit: "Roteiro curto + 3 ganchos A/B",
  typo_carousel: "Carrossel tipográfico (7–10 slides)",
  serp_analysis: "Análise SERP/GEO avulsa",
  single_creative: "Criativo único com imagem",
  hybrid_carousel: "Carrossel híbrido",
  lp_copy: "Pack de landing page",
  geo_article: "Artigo GEO (1.500–2.500 palavras)",
};

export default function PricingPage() {
  return (
    <div data-surface="kitefy-light" className="min-h-dvh bg-background">
      <header className="border-b border-brand-border bg-brand-canvas">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="Kitefy — página inicial">
            <KitefyLogo height={36} />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-navy transition-colors hover:text-brand-signal-text"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <div className="max-w-2xl">
          <p className="kitefy-eyebrow">Pacotes</p>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] text-brand-navy sm:text-5xl">
            Preço claro, crédito transparente.
          </h1>
          <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-brand-navy-soft">
            Sem taxa de setup e sem contrato longo. O consumo é por ativo e o débito acontece apenas
            depois da sua aprovação. Falha técnica gera estorno automático.
          </p>
        </div>

        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {KITEFY_PACKAGES.map((pkg) => (
            <div key={pkg.id} className={pkg.highlighted ? "lg:-mt-4 lg:mb-4" : undefined}>
              <PackageCard pkg={pkg} />
            </div>
          ))}
        </div>

        <section aria-labelledby="creditos-title" className="mt-16">
          <h2 id="creditos-title" className="text-xl font-semibold tracking-tight text-brand-navy">
            Custo por tipo de ativo
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-brand-border bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Créditos consumidos por tipo de ativo na Kitefy
              </caption>
              <thead className="bg-brand-subtle text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-brand-navy">
                    Ativo
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-brand-navy">
                    Créditos
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(CREDIT_COSTS).map(([key, cost]) => (
                  <tr key={key} className="border-t border-brand-border">
                    <td className="px-4 py-3 text-brand-navy-soft">{ASSET_LABEL[key] ?? key}</td>
                    <td className="px-4 py-3 text-right font-mono text-brand-navy">{cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--brand-text-muted-strong)]">
            O total de créditos de cada pacote é:{" "}
            {KITEFY_PACKAGES.map((pkg) => `${pkg.name.replace("Kitefy ", "")} ${pkg.credits}`).join(" · ")}.
          </p>
        </section>

        <section aria-labelledby="pagamento-title" className="mt-12">
          <div className="rounded-xl border border-brand-border bg-brand-subtle p-6 sm:p-8">
            <h2 id="pagamento-title" className="flex items-center gap-2 text-lg font-semibold text-brand-navy">
              <QrCode className="size-5" aria-hidden="true" />
              Pix Automático é a forma recomendada
            </h2>
            <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-brand-navy-soft">
              Menor taxa, renovação sem atrito e nenhuma cobrança na janela noturna (20h–06h), que
              costuma ser bloqueada em contas pessoa física. Você autoriza o mandato uma única vez no
              app do banco; as renovações seguintes acontecem entre 08h e 18h (BRT).
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {KITEFY_PACKAGES.map((pkg) => (
                <p key={pkg.id} className="flex items-center justify-between gap-2 rounded-lg border border-brand-border bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-brand-navy">{pkg.name}</span>
                  <span className="font-mono text-brand-navy">{formatBRL(PLANS[pkg.tier].priceCents)}</span>
                </p>
              ))}
            </div>

            <ul className="mt-5 space-y-1.5 text-sm text-brand-navy-soft">
              {[
                "Cartão recorrente também disponível, com tokenização no navegador (Payment Brick).",
                "Idempotência em toda criação de cobrança: nenhuma duplicidade em retentativa.",
                "Webhook validado por assinatura HMAC antes de creditar qualquer valor.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-navy" aria-hidden="true" />
                  <span className="text-pretty">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="mt-12 flex flex-col gap-3 border-t border-brand-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--brand-text-muted-strong)]">
            Dúvida sobre qual pacote começar? O Start existe para validar com risco baixo.
          </p>
          <div className="flex gap-3">
            <Link href="/login" className="kitefy-cta">
              Começar agora
            </Link>
            <Link
              href="/"
              className="inline-flex h-[3.25rem] items-center justify-center rounded-[8px] border border-brand-navy bg-white px-6 text-base font-semibold text-brand-navy transition-colors hover:bg-brand-navy hover:text-white"
            >
              Ver a página inicial
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
