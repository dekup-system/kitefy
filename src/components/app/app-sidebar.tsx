"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileStack, Globe, LayoutDashboard, Settings, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Início", icon: LayoutDashboard },
  { href: "/campaigns", label: "Meus conteúdos", icon: FileStack },
  { href: "/competitors", label: "Concorrentes", icon: BarChart3 },
  { href: "/telemetry", label: "Resultados", icon: BarChart3 },
  { href: "/google", label: "Pacote Google", icon: Globe },
  { href: "/settings/brand", label: "Configurações", icon: Settings },
] as const;

const ADMIN_NAV = { href: "/admin", label: "Administração", icon: ShieldAlert } as const;

export function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [NAV[0], ADMIN_NAV, ...NAV.slice(1)] : NAV;

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function NewAssetLink({ className }: { className?: string }) {
  return (
    <Link
      href="/studio/new"
      className={cn(
        "flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        className,
      )}
    >
      <Sparkles className="size-4" aria-hidden="true" />
      Criar conteúdo
    </Link>
  );
}
