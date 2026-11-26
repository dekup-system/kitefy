"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  FileStack,
  Globe,
  LayoutDashboard,
  Palette,
  Plus,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
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
 * Busca global Cmd+K / Ctrl+K com vocabulário sincronizado ao glossário canônico.
 */

const DESTINATIONS = [
  { href: "/app", label: "Início", keywords: "visao geral dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Biblioteca", keywords: "conteudos ativos campanhas", icon: FileStack },
  { href: "/schedule", label: "Agendamentos", keywords: "calendario semana horarios lembrete email", icon: TrendingUp },
  { href: "/competitors", label: "Radar de Concorrentes", keywords: "serp analise mercado concorrencia", icon: Radar },
  { href: "/telemetry", label: "Resultados", keywords: "telemetria metricas ganchos ga4", icon: TrendingUp },
  { href: "/google", label: "Pacote Google", keywords: "seo sitemap robots search console", icon: Globe },
  { href: "/settings/brand", label: "Marca e voz", keywords: "logo identidade fatos personas", icon: Palette },
  { href: "/settings/billing", label: "Plano e créditos", keywords: "assinatura pacote upgrade", icon: CreditCard },
  { href: "/settings/account", label: "Minha conta", keywords: "cadastro email senha", icon: UserRound },
  { href: "/settings/privacy", label: "Privacidade e LGPD", keywords: "exportar excluir dados", icon: ShieldCheck },
];

const ADMIN_DESTINATION = {
  href: "/admin",
  label: "Administração",
  keywords: "admin contas cupons receita",
  icon: ShieldAlert,
} as const;

export function CommandMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const destinations = isAdmin ? [...DESTINATIONS, ADMIN_DESTINATION] : DESTINATIONS;

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
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
      >
        <Search className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Ir para tela, criar conteúdo ou buscar…" />
        <CommandList>
          <CommandEmpty>Nada encontrado. Tente &quot;biblioteca&quot;, &quot;marca&quot; ou &quot;resultados&quot;.</CommandEmpty>
          <CommandGroup heading="Ações rápidas">
            <CommandItem value="criar conteudo novo post carrossel roteiro" onSelect={() => go("/studio/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Criar conteúdo
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Navegar">
            {destinations.map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.label} ${item.keywords} ${item.href}`}
                onSelect={() => go(item.href)}
              >
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
