"use client";

import { CreditCard, LogOut, Palette, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "K";
  const last = parts[parts.length - 1];
  if (parts.length === 1 || !last) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function UserMenu({
  accountName,
  isAdmin = false,
  variant = "default",
}: {
  accountName: string;
  isAdmin?: boolean;
  variant?: "default" | "sidebar";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border text-xs transition-colors",
          variant === "sidebar"
            ? "h-10 w-full border-sidebar-border bg-sidebar-accent/40 px-2.5 text-sidebar-foreground hover:bg-sidebar-accent"
            : "h-8 border-border bg-card px-2 text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label={`Menu da conta ${accountName}`}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-semibold",
            variant === "sidebar"
              ? "bg-white/15 text-white"
              : "bg-brand-navy text-white",
          )}
        >
          {initials(accountName)}
        </span>
        <span className="max-w-[9.5rem] truncate font-medium">{accountName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{accountName}</DropdownMenuLabel>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <a href="/admin" className="flex items-center gap-2">
              <ShieldAlert className="size-4" aria-hidden="true" />
              Administração
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <a href="/settings/account" className="flex items-center gap-2">
            <UserRound className="size-4" aria-hidden="true" />
            Minha conta
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/settings/billing" className="flex items-center gap-2">
            <CreditCard className="size-4" aria-hidden="true" />
            Plano e créditos
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/settings/brand" className="flex items-center gap-2">
            <Palette className="size-4" aria-hidden="true" />
            Marca e voz
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/settings/privacy" className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Privacidade e LGPD
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center gap-2 text-left">
              <LogOut className="size-4" aria-hidden="true" />
              Sair
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
