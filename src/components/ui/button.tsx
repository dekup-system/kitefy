import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botão base da Kitefy.
 * Alvos de toque: sm 32px, default 36px, lg 40px, icon 36px.
 * O foco usa anel de 3px sobre `--ring` (4,79:1 contra o fundo no tema claro).
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
    "outline-none select-none transition-[color,background-color,border-color,box-shadow]",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        outline:
          "border border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        /**
         * Tratamento tingido em vez de sólido: `--destructive` com texto branco
         * mede 4,44:1 (claro) e 3,82:1 (escuro), abaixo do mínimo AA de 4,5:1.
         * Com borda/fundo tingidos e texto `foreground`, o contraste fica >16:1
         * e o vermelho continua identificando a ação.
         */
        destructive:
          "border border-destructive/40 bg-destructive/15 text-foreground shadow-xs hover:bg-destructive/25",
        link: "text-foreground underline underline-offset-4 hover:text-muted-foreground",
      },
      size: {
        sm: "h-8 gap-1.5 rounded-md px-3",
        default: "h-9 px-4 py-2",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Renderiza o filho (ex.: `<Link>`) mantendo os estilos do botão. */
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
