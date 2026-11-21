"use client";

import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

/** Props que o `Field` injeta no controle (input, textarea, select trigger etc.). */
type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
};

type FieldProps = Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Mostra o asterisco e "(obrigatório)" no rótulo (o `required` real vai no controle). */
  required?: boolean;
  /** Sobrescreve o `id` do controle; por padrão usa o `id` do filho ou um gerado. */
  htmlFor?: string;
  /** Um único controle, que recebe `id`, `aria-describedby` e `aria-invalid`. */
  children: React.ReactElement<FieldControlProps>;
};

/**
 * Campo de formulário completo: rótulo associado ao controle, dica e erro.
 * Os ids são gerados com `useId` e ligados via `aria-describedby`, então o erro
 * é anunciado ao focar o controle (sem depender só da cor).
 */
function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  children,
  className,
  ...props
}: FieldProps) {
  const generatedId = React.useId();
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;
  const controlId = htmlFor ?? children.props.id ?? generatedId;

  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const showHint = hint !== undefined && hint !== null && !hasError;

  const describedBy =
    [showHint ? hintId : null, hasError ? errorId : null, children.props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;

  const control = React.cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": hasError ? true : children.props["aria-invalid"],
  });

  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)} {...props}>
      <Label htmlFor={controlId}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only">(obrigatório)</span>
          </>
        ) : null}
      </Label>
      {control}
      {showHint ? (
        <p id={hintId} data-slot="field-hint" className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {hasError ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/**
 * Mensagem de erro. O texto fica em `foreground` (19,5:1) e o ícone carrega
 * `--destructive`; o próprio token destructive como cor de texto ficaria em
 * 4,44:1, abaixo do mínimo AA de 4,5:1 para texto normal.
 */
function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (children === undefined || children === null || children === false) {
    return null;
  }

  return (
    <p
      data-slot="field-error"
      className={cn("flex items-start gap-1.5 text-sm font-medium text-foreground", className)}
      {...props}
    >
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <span>{children}</span>
    </p>
  );
}

/** Agrupa vários `Field` em um `<fieldset>` sem borda/padding padrão. */
function FieldGroup({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-group"
      className={cn("m-0 flex min-w-0 flex-col gap-6 border-0 p-0", className)}
      {...props}
    />
  );
}

export { Field, FieldError, FieldGroup };
export type { FieldProps };
