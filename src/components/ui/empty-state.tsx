import * as React from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** Ícone decorativo (ex.: `<Inbox />`). Recebe `aria-hidden` no wrapper. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ação principal (ex.: `<Button>Novo roteiro</Button>`). */
  action?: React.ReactNode;
};

/** Estado vazio de página/seção: ícone, título, descrição e ação opcional. */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          data-slot="empty-state-icon"
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-5"
        >
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <p data-slot="empty-state-title" className="text-base font-semibold text-balance">
          {title}
        </p>
        {description ? (
          <p
            data-slot="empty-state-description"
            className="mx-auto max-w-md text-sm text-muted-foreground text-pretty"
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div data-slot="empty-state-action" className="mt-1 flex items-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState };
