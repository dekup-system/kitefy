"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  FileStack,
  Globe,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

/**
 * Busca global Cmd+K / Ctrl+K.
 * Atalho registrado no documento, funciona em qualquer página autenticada.
 */

const DESTINATIONS = [
  { href: "/app", label: "Visão geral", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campanhas", icon: FileStack },
  { href: "/telemetry", label: "Telemetria", icon: BarChart3 },
  { href: "/google", label: "Pacote Google", icon: Globe },
  { href: "/settings/account", label: "Minha conta", icon: UserRound },
  { href: "/settings/brand", label: "Marca e voz", icon: Settings },
  { href: "/settings/privacy", label: "Privacidade e LGPD", icon: ShieldCheck },
];

const ADMIN_DESTINATION = { href: "/admin", label: "Administração", icon: ShieldAlert } as const;

export function CommandMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const destinations = isAdmin ? [ADMIN_DESTINATION, ...DESTINATIONS] : DESTINATIONS;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCommandK) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir busca global (Ctrl K)"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Ir para, criar ativo, buscar campanha…" />
        <CommandList>
          <CommandEmpty>Nada encontrado. Tente &quot;campanhas&quot; ou &quot;telemetria&quot;.</CommandEmpty>
          <CommandGroup heading="Ações">
            <CommandItem value="novo ativo criar" onSelect={() => go("/studio/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Criar novo ativo
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Navegar">
            {destinations.map((item) => (
              <CommandItem key={item.href} value={`${item.label} ${item.href}`} onSelect={() => go(item.href)}>
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
