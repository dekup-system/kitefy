import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Selo compacto (14px). Variantes semânticas usam fundo tingido + texto
 * `foreground`: `--success` (4,46:1) e `--destructive` (4,44:1) não passam em
 * 4,5:1 como cor de texto, então a cor fica no fundo/borda e no ícone opcional.
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap",
    "rounded-md border px-2 py-0.5 text-sm font-medium",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5",
    "transition-colors",
  ],
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-foreground [&_svg]:text-destructive",
        success: "border-success/30 bg-success/10 text-foreground [&_svg]:text-success",
        warning: "border-warning/40 bg-warning/15 text-foreground [&_svg]:text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
export type { BadgeProps };
