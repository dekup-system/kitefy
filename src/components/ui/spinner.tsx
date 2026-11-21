import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SpinnerProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** Texto anunciado por leitores de tela. Padrão: "Carregando". */
  label?: string;
};

/**
 * Indicador de progresso indefinido. `role="status"` + rótulo textual garantem
 * que o estado não dependa apenas da animação.
 */
function Spinner({ className, label = "Carregando", ...props }: SpinnerProps) {
  return (
    <span
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center text-muted-foreground [&>svg]:size-4",
        className,
      )}
      {...props}
    >
      <Loader2 aria-hidden="true" className="animate-spin" />
    </span>
  );
}

export { Spinner };
