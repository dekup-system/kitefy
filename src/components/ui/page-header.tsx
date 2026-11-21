import * as React from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  /** Deve ser o `h1` da página. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ações alinhadas à direita no desktop. */
  actions?: React.ReactNode;
  /** Trilha de navegação pronta (a `<nav>` com `aria-label` é renderizada aqui). */
  breadcrumb?: React.ReactNode;
};

/** Cabeçalho de página: breadcrumb opcional, `h1`, descrição e ações. */
function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-col gap-4 border-b border-border pb-6", className)}
      {...props}
    >
      {breadcrumb ? (
        <nav data-slot="page-header-breadcrumb" aria-label="Trilha de navegação" className="text-sm text-muted-foreground">
          {breadcrumb}
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground text-pretty">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export { PageHeader };
