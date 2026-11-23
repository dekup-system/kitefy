"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Globe2, ShieldCheck, TicketPercent, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Visão geral", icon: ShieldCheck },
  { href: "/admin/contas", label: "Contas e planos", icon: Users },
  { href: "/admin/cupons", label: "Cupons", icon: TicketPercent },
  { href: "/admin/receita", label: "Receita e custos", icon: BarChart3 },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação administrativa"
      className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1"
    >
      {ITEMS.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-background font-medium text-foreground shadow-xs"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-3.5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
      <span className="ml-auto hidden items-center gap-1.5 px-3 text-xs text-muted-foreground sm:inline-flex">
        <Globe2 className="size-3.5" aria-hidden="true" />
        Brasil · BRL
      </span>
    </nav>
  );
}
