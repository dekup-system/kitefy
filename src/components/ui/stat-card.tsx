import * as React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Formatador único para evitar divergência entre servidor e cliente. */
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

type StatCardProps = React.ComponentProps<"dl"> & {
  label: React.ReactNode;
  /** Normalmente uma string já formatada (ou `<Skeleton />` durante o load). */
  value: React.ReactNode;
  /** Variação como fração: `0.123` = +12,3%. Positivo/negativo define a cor. */
  change?: number;
  /** Contexto adicional, ex.: "vs. últimos 30 dias". */
  hint?: React.ReactNode;
  /** Ícone decorativo alinhado ao rótulo. */
  icon?: React.ReactNode;
};

/**
 * Métrica em cartão. O valor usa Geist Mono com `tabular-nums`; a variação
 * combina sinal, ícone e cor — nunca só cor. `--success`/`--destructive` não
 * atingem 4,5:1 como texto, então o número fica em `foreground` e a cor vai
 * para o ícone.
 */
function StatCard({ label, value, change, hint, icon, className, ...props }: StatCardProps) {
  const hasChange = typeof change === "number" && Number.isFinite(change);
  const isPositive = hasChange && change > 0;
  const isNegative = hasChange && change < 0;
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const trendLabel = isPositive ? "Aumento de" : isNegative ? "Queda de" : "Sem variação de";

  return (
    <dl
      data-slot="stat-card"
      className={cn(
        "flex flex-col gap-1 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-card",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
          {icon ? (
            <span
              aria-hidden="true"
              className="flex size-4 items-center justify-center text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
            >
              {icon}
            </span>
          ) : null}
        </div>
        <dd className="flex flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              data-slot="stat-card-value"
              className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground"
            >
              {value}
            </span>
            {hasChange ? (
              <span
                data-slot="stat-card-change"
                className="inline-flex items-center gap-1 text-sm font-medium"
              >
                <span className="sr-only">{trendLabel} </span>
                <TrendIcon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    isPositive
                      ? "text-success"
                      : isNegative
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                />
                <span className="font-mono tabular-nums text-foreground">
                  {percentFormatter.format(change)}
                </span>
              </span>
            ) : null}
          </span>
          {hint ? (
            <span data-slot="stat-card-hint" className="text-sm text-muted-foreground text-pretty">
              {hint}
            </span>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}

export { StatCard };
