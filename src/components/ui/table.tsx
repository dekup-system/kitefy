import * as React from "react";
import { cn } from "@/lib/utils";

type TableProps = React.ComponentProps<"table"> & {
  /** Classes extras no contêiner que rola horizontalmente. */
  containerClassName?: string;
  /** Props do contêiner (ex.: `aria-label` para leitores de tela). */
  containerProps?: Omit<React.ComponentProps<"div">, "children" | "className">;
};

/**
 * Tabela com contêiner que rola na horizontal. O contêiner é focável
 * (`tabIndex={0}`) para que o scroll horizontal funcione por teclado; informe
 * `containerProps={{ "aria-label": "..." }}` para nomear a região.
 */
function Table({ className, containerClassName, containerProps, ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      tabIndex={0}
      className={cn(
        "relative w-full overflow-x-auto rounded-lg border border-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        containerClassName,
      )}
      {...containerProps}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 whitespace-nowrap px-3 text-left align-middle text-sm font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 py-2.5 align-middle text-sm text-foreground", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("px-3 py-3 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

type TableEmptyProps = React.ComponentProps<"td"> & {
  /** Colunas ocupadas pela mensagem; use a largura total da tabela. */
  colSpan?: number;
};

/**
 * Linha vazia para `<TableBody>`. Não use junto de `EmptyState` na mesma
 * tabela: `EmptyState` é para a página/seção, `TableEmpty` é a linha da tabela.
 */
function TableEmpty({ className, children, colSpan = 99, ...props }: TableEmptyProps) {
  return (
    <tr data-slot="table-empty-row">
      <td
        data-slot="table-empty"
        colSpan={colSpan}
        className={cn("px-3 py-10 text-center text-sm text-muted-foreground", className)}
        {...props}
      >
        {children ?? "Nenhum resultado encontrado."}
      </td>
    </tr>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TableEmpty,
};
