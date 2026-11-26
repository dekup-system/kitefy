"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  FileStack,
  Globe,
  LayoutDashboard,
  Menu,
  Palette,
  Radar,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Produção",
    items: [
      { href: "/app", label: "Início", icon: LayoutDashboard },
      { href: "/campaigns", label: "Biblioteca", icon: FileStack },
      { href: "/schedule", label: "Agendamentos", icon: CalendarDays },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { href: "/settings/brand", label: "Marcas e Personas", icon: Palette },
      { href: "/competitors", label: "Concorrentes", icon: Radar },
      { href: "/telemetry", label: "Resultados", icon: TrendingUp },
      { href: "/google", label: "Pacote Google", icon: Globe },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/settings/billing", label: "Plano e créditos", icon: CreditCard },
      { href: "/settings/account", label: "Minha conta", icon: UserRound },
    ],
  },
] as const;

const MOBILE_ITEMS = [
  { href: "/app", label: "Início", icon: LayoutDashboard },
  { href: "/studio/new", label: "Criar", icon: Sparkles },
  { href: "/campaigns", label: "Biblioteca", icon: FileStack },
  { href: "/settings/brand", label: "Marcas", icon: Palette },
] as const;

function isRouteActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted/80">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isRouteActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-signal"
                    />
                  ) : null}
                  <item.icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      active ? "text-brand-signal" : "text-sidebar-muted group-hover:text-sidebar-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {isAdmin ? (
        <div className="space-y-1 border-t border-sidebar-border pt-4">
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted/70">
            Operação
          </p>
          <Link
            href="/admin"
            aria-current={isRouteActive(pathname, "/admin") ? "page" : undefined}
            className={cn(
              "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
              isRouteActive(pathname, "/admin")
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Administração</span>
          </Link>
        </div>
      ) : null}
    </nav>
  );
}

/**
 * CTA principal na sidebar Navy: fundo branco + texto navy (17,85:1 AAA) com
 * ícone em laranja sinal, garantindo destaque imediato sem violar WCAG AA.
 */
export function NewAssetLink({ className }: { className?: string }) {
  return (
    <Link
      href="/studio/new"
      className={cn(
        "flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-brand-navy shadow-xs transition-all hover:bg-white/90 active:translate-y-px",
        className,
      )}
    >
      <Sparkles className="size-4 text-brand-signal" aria-hidden="true" />
      Criar conteúdo
    </Link>
  );
}

/** Navegação inferior dedicada ao mobile + drawer completo com todas as rotas do menu lateral. */
export function MobileBottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu completo"
        >
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
            className="flex-1 bg-black/60 backdrop-blur-xs"
          />
          <div className="flex h-full w-[82vw] max-w-[300px] flex-col gap-4 overflow-y-auto border-l border-sidebar-border bg-sidebar p-4 text-sidebar-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-sidebar-border pb-3">
              <span className="text-sm font-semibold text-white">Menu completo</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar menu"
                className="inline-flex size-9 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div onClick={() => setDrawerOpen(false)} className="flex-1 space-y-4">
              <NewAssetLink />
              <AppSidebar isAdmin={isAdmin} />
            </div>

            <a
              href="https://www.m3dmultidev.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto flex items-center gap-2.5 rounded-xl border border-sidebar-border/80 bg-black/25 px-2.5 py-2 transition-colors hover:border-white/25 hover:bg-black/40"
              title="Visitar M3D Multidev"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/m3d-multidev-logo.png"
                alt="M3D Multidev"
                className="size-8 shrink-0 rounded-md object-contain"
              />
              <div className="min-w-0 leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-signal">
                  Suporte
                </p>
                <p className="truncate text-[11px] font-medium text-white/90">M3D Multidev</p>
                <p className="truncate text-[10px] text-sidebar-muted">suporte@m3dmultidev.com.br</p>
              </div>
            </a>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Navegação inferior"
        className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-border bg-card/95 px-1 py-1.5 backdrop-blur lg:hidden"
      >
        {MOBILE_ITEMS.map((item) => {
          const active = isRouteActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon
                className={cn("size-4", active ? "text-brand-signal" : undefined)}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Menu className="size-4" aria-hidden="true" />
          <span className="truncate">Menu</span>
        </button>
      </nav>
    </>
  );
}

/** Rótulo contextual da rota atual exibido na topbar do desktop. */
export function TopbarSectionTitle() {
  const pathname = usePathname();
  const title =
    pathname === "/app"
      ? "Início"
      : pathname.startsWith("/studio/new")
        ? "Estúdio · Novo conteúdo"
        : pathname.startsWith("/studio")
          ? "Estúdio · Revisão e exportação"
          : pathname.startsWith("/campaigns")
            ? "Biblioteca de conteúdos"
            : pathname.startsWith("/schedule")
              ? "Agendamentos"
              : pathname.startsWith("/competitors")
                ? "Concorrentes"
                : pathname.startsWith("/telemetry")
                  ? "Resultados"
                  : pathname.startsWith("/google")
                    ? "Pacote Google"
                    : pathname.startsWith("/settings/brand")
                      ? "Marcas e Personas"
                      : pathname.startsWith("/settings/billing")
                        ? "Plano e créditos"
                        : pathname.startsWith("/settings/account")
                          ? "Minha conta"
                          : pathname.startsWith("/settings/privacy")
                            ? "Privacidade e LGPD"
                            : pathname.startsWith("/admin")
                              ? "Administração"
                              : "Kitefy";

  return (
    <span className="hidden truncate text-sm font-medium text-muted-foreground lg:inline">
      {title}
    </span>
  );
}
