"use client";

import { LogOut, ShieldCheck, ShieldAlert, User, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/auth/actions";

export function UserMenu({
  accountName,
  isAdmin = false,
}: {
  accountName: string;
  isAdmin?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={`Menu da conta ${accountName}`}
      >
        <User className="size-3.5" aria-hidden="true" />
        <span className="max-w-[9rem] truncate">{accountName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Conta</DropdownMenuLabel>
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
          <a href="/settings/brand" className="flex items-center gap-2">
            <User className="size-4" aria-hidden="true" />
            Perfil da marca
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/settings/privacy" className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Privacidade e dados
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
