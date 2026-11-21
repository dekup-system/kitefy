"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";

/** Raiz do cmdk. Para a paleta com overlay, use `CommandDialog`. */
function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

type CommandDialogProps = React.ComponentProps<typeof Dialog> & {
  /** Título do diálogo (obrigatório no Radix); fica visível só para leitores de tela. */
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  children?: React.ReactNode;
};

/**
 * Paleta de comandos em diálogo Radix. O título/descrição ficam em `sr-only`
 * para satisfazer o Radix e nomear a região; `CommandInput` já tem `aria-label`.
 */
function CommandDialog({
  title = "Busca global",
  description = "Busque por páginas, marcas e conteúdos.",
  className,
  showCloseButton = true,
  children,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn("max-w-xl gap-0 overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command className="bg-transparent [&_[data-slot=command-input-wrapper]]:pr-12">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

type CommandInputProps = React.ComponentProps<typeof CommandPrimitive.Input> & {
  /** Atalho exibido à direita. Use `null` para esconder. */
  shortcut?: React.ReactNode;
};

function CommandInput({
  className,
  shortcut = "⌘K",
  ...props
}: CommandInputProps) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-12 items-center gap-2 border-b border-border px-4"
    >
      <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        data-slot="command-input"
        aria-label="Busca global"
        className={cn(
          "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-hidden",
          "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {shortcut ? (
        <kbd
          aria-hidden="true"
          className="pointer-events-none hidden h-6 shrink-0 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-sm font-medium text-muted-foreground sm:inline-flex"
        >
          {shortcut}
        </kbd>
      ) : null}
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-80 scroll-py-1 overflow-x-hidden overflow-y-auto p-1", className)}
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-8 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground",
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
        "[&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-medium",
        "[&_[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-sm outline-hidden",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/** Dica de atalho à direita do item, ex.: `⌘⏎`. */
function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto font-mono text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
};
