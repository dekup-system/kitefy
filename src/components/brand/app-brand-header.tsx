"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { KitefyLogo } from "@/components/brand/kitefy-logo";

/**
 * Cabeçalho das páginas internas (login, onboarding, estúdio).
 * Fundo claro: a logomarca padrão tem contraste garantido aqui.
 */
export function AppBrandHeader({ subtle = false }: { subtle?: boolean }) {
  return (
    <header
      className={`flex items-center justify-between gap-4 border-b border-brand-border px-5 py-3 ${
        subtle ? "bg-brand-canvas" : "bg-white"
      }`}
    >
      <Link href="/" aria-label="Kitefy — página inicial">
        <KitefyLogo height={36} />
      </Link>
      <ThemeToggle />
    </header>
  );
}
