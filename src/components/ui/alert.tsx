import * as React from "react";
import { cva } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertVariant = "default" | "destructive" | "warning" | "success";

const alertVariants = cva(
  "relative flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-foreground",
        warning: "border-warning/40 bg-warning/15 text-foreground",
        success: "border-success/30 bg-success/10 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const alertIconColor: Record<AlertVariant, string> = {
  default: "text-muted-foreground",
  destructive: "text-destructive",
  warning: "text-warning",
  success: "text-success",
};

/** Ícones decorativos: o título/descrição já carregam o significado. */
const defaultAlertIcons: Record<AlertVariant, React.ReactNode> = {
  default: <Info aria-hidden="true" />,
  destructive: <CircleAlert aria-hidden="true" />,
  warning: <TriangleAlert aria-hidden="true" />,
  success: <CircleCheck aria-hidden="true" />,
};

type AlertProps = React.ComponentProps<"div"> & {
  variant?: AlertVariant;
  /** Substitui o ícone padrão da variante. Use `null` para não renderizar ícone. */
  icon?: React.ReactNode;
};

/**
 * Aviso inline. A variante `destructive` recebe `role="alert"` (pode ser
 * sobrescrito por prop). O ícone nunca é o único canal: sempre há texto.
 */
function Alert({ className, variant = "default", icon, children, ...props }: AlertProps) {
  const resolvedIcon = icon === undefined ? defaultAlertIcons[variant] : icon;

  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={variant === "destructive" ? "alert" : undefined}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {resolvedIcon === null ? null : (
        <span
          data-slot="alert-icon"
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
            alertIconColor[variant],
          )}
        >
          {resolvedIcon}
        </span>
      )}
      <div data-slot="alert-content" className="flex min-w-0 flex-1 flex-col gap-1">
        {children}
      </div>
    </div>
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("text-sm font-medium leading-snug text-foreground", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-sm text-muted-foreground [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
