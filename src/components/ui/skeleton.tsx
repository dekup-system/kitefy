import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder de carregamento. Usa `.skeleton-shimmer` (globals.css), que já
 * respeita `prefers-reduced-motion`, e fica escondido de leitores de tela.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("skeleton-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
