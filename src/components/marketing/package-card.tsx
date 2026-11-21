import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KitefyPackage } from "@/lib/marketing/packages";

/**
 * Cartão de pacote Kitefy.
 *
 * Código de cores fixo do manual:
 *  - Start: badge lilás (#ECEBF5 / #181331 / borda #D5D3E6), botão contornado navy;
 *  - Lift: borda 2px #FD3E01, badge #FFF0EB, botão primário laranja;
 *  - Flow: badge verde-água (#E8F8F1 / #0F766E / borda #BCEAD5), botão navy sólido.
 *
 * O rótulo do botão laranja fica em 19px/600 (texto grande) porque branco sobre
 * #FD3E01 mede 3.58:1 — conforme apenas nesse limiar (WCAG AA).
 */

const BADGE_STYLES: Record<KitefyPackage["badgeStyle"], string> = {
  start: "border border-[#D5D3E6] bg-[#ECEBF5] text-[#181331]",
  signal: "border border-[#FD3E01]/30 bg-[#FFF0EB] text-[#C42D00]",
  flow: "border border-[#BCEAD5] bg-[#E8F8F1] text-[#0F766E]",
};

export function PackageCard({
  pkg,
  ctaHref = "/login",
  className,
}: {
  pkg: KitefyPackage;
  ctaHref?: string;
  className?: string;
}) {
  const highlighted = pkg.highlighted;

  return (
    <article
      aria-labelledby={`pacote-${pkg.id}`}
      className={cn(
        "relative flex h-full flex-col rounded-xl bg-white p-6 sm:p-7",
        highlighted
          ? "border-2 border-brand-signal shadow-[0_18px_40px_-24px_rgba(253,62,1,0.45)]"
          : "border border-brand-border shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {highlighted ? (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-brand-signal px-3 py-1 text-xs font-semibold text-white">
          <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-white" />
          Mais escolhido
        </span>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]", BADGE_STYLES[pkg.badgeStyle])}>
          {pkg.badge}
        </span>
      </div>

      <h3 id={`pacote-${pkg.id}`} className="mt-4 text-xl font-semibold tracking-tight text-brand-navy">
        {pkg.name}
      </h3>
      <p className="mt-0.5 text-sm font-medium text-brand-signal-text">{pkg.kicker}</p>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-brand-navy-soft">{pkg.promise}</p>

      <p className="mt-6 flex items-baseline gap-1.5">
        <span className="font-mono text-[2rem] font-semibold leading-none tracking-tight text-brand-navy">
          {pkg.priceLabel}
        </span>
        <span className="text-sm text-[var(--brand-text-muted-strong)]">/ {pkg.cadence}</span>
      </p>
      <p className="mt-1 text-xs text-[var(--brand-text-muted-strong)]">
        <span className="font-mono">{pkg.credits}</span> créditos · até{" "}
        <span className="font-mono">{pkg.brands}</span>{" "}
        {pkg.brands === 1 ? "marca" : "marcas"}
      </p>

      <ul className="mt-6 space-y-2.5 text-sm text-brand-navy-soft">
        {pkg.deliverables.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-navy" aria-hidden="true" />
            <span className="text-pretty leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-7">
        {pkg.ctaStyle === "primary" ? (
          <Link href={ctaHref} className="kitefy-cta w-full">
            {pkg.ctaLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : pkg.ctaStyle === "navy" ? (
          <Link href={ctaHref} className="kitefy-cta-compact w-full">
            {pkg.ctaLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href={ctaHref}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] border border-brand-navy bg-white text-[0.9375rem] font-semibold text-brand-navy transition-colors hover:bg-brand-navy hover:text-white"
          >
            {pkg.ctaLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}
