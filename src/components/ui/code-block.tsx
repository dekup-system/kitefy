"use client";

import * as React from "react";
import { Braces, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { CopyButton } from "./copy-button";

type CodeBlockProps = Omit<React.ComponentProps<"figure">, "title" | "children"> & {
  /** Payload completo (JSON-LD, Markdown, etc.). */
  code: string;
  title?: React.ReactNode;
  /** Rótulo da linguagem exibido como badge, ex.: "JSON-LD". */
  language?: string;
  /** Painel colapsável via `<details>` acessível (padrão: `true`). */
  collapsible?: boolean;
  defaultOpen?: boolean;
  copyable?: boolean;
};

/**
 * Painel de código com fonte mono, botão "Copiar" (feedback de 2s + fallback
 * para `execCommand`) e `<details>` nativo, que já entrega teclado e leitor de
 * tela de graça. O `<summary>` tem rótulo textual ("Ver/Ocultar código") e
 * contagem de linhas, sem depender do ícone.
 */
function CodeBlock({
  code,
  title,
  language,
  collapsible = true,
  defaultOpen = false,
  copyable = true,
  className,
  ...props
}: CodeBlockProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const lineCount = React.useMemo(() => code.split("\n").length, [code]);

  const codeElement = (
    <pre
      data-slot="code-block-pre"
      tabIndex={0}
      aria-label="Bloco de código"
      className="max-h-80 overflow-auto rounded-sm p-4 outline-none scrollbar-thin focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <code className="whitespace-pre font-mono text-sm leading-relaxed text-foreground">{code}</code>
    </pre>
  );

  return (
    <figure
      data-slot="code-block"
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    >
      <figcaption className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Braces aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{title ?? "Código"}</span>
          {language ? <Badge variant="outline">{language}</Badge> : null}
        </div>
        {copyable ? <CopyButton value={code} /> : null}
      </figcaption>

      {collapsible ? (
        <details
          className="group"
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary
            className={cn(
              "flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground",
              "outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "[&::-webkit-details-marker]:hidden",
            )}
          >
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
            />
            <span>{open ? "Ocultar código" : "Ver código"}</span>
            <span className="ml-auto font-mono text-sm text-muted-foreground">
              {lineCount} {lineCount === 1 ? "linha" : "linhas"}
            </span>
          </summary>
          <div className="border-t border-border">{codeElement}</div>
        </details>
      ) : (
        codeElement
      )}
    </figure>
  );
}

export { CodeBlock };
export type { CodeBlockProps };
