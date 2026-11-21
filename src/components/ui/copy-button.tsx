"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

/**
 * Copia usando a Clipboard API e, se ela rejeitar (permissão negada, contexto
 * inseguro ou navegador antigo), cai para um `<textarea>` + `execCommand`.
 * Retorna `false` só quando as duas estratégias falham.
 */
async function copyToClipboard(value: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Sem permissão/contexto seguro: tenta o fallback abaixo.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    previouslyFocused?.focus({ preventScroll: true });

    return copied;
  } catch {
    return false;
  }
}

type CopyButtonProps = Omit<ButtonProps, "children" | "onClick" | "asChild" | "value"> & {
  /** Texto que será copiado. */
  value: string;
  label?: string;
  copiedLabel?: string;
  errorMessage?: string;
  /** Só o ícone (o `aria-label` passa a ser obrigatório e é aplicado aqui). */
  iconOnly?: boolean;
};

/**
 * Botão de cópia em um clique, com estado "Copiado" por 2s e anúncio via
 * `aria-live`. Se a cópia falhar, um toast do sonner explica o que fazer.
 */
function CopyButton({
  value,
  label = "Copiar",
  copiedLabel = "Copiado",
  errorMessage = "Não foi possível copiar. Selecione o texto e copie manualmente.",
  iconOnly = false,
  variant = "ghost",
  size = "sm",
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlyIcon = iconOnly || size === "icon";

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleClick() {
    const success = await copyToClipboard(value);

    if (!success) {
      toast.error(errorMessage);
      return;
    }

    setCopied(true);
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      aria-label={onlyIcon ? (copied ? copiedLabel : label) : undefined}
      className={cn("gap-1.5", className)}
      {...props}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
      {onlyIcon ? null : <span>{copied ? copiedLabel : label}</span>}
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </Button>
  );
}

export { CopyButton, copyToClipboard };
export type { CopyButtonProps };
