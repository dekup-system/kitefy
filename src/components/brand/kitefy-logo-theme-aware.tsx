"use client";

import { KitefyLogo } from "@/components/brand/kitefy-logo";

/**
 * Logomarca ciente do tema, para o shell autenticado (que tem modo escuro).
 *
 * Sobre `#181331` a versão padrão desaparece; a variante `onDark` coloca o
 * ícone em container claro e escreve o nome em branco. Trocamos por CSS para
 * não depender de estado no cliente (sem divergência de hidratação).
 */
export function KitefyLogoThemeAware({ height = 32 }: { height?: number }) {
  return (
    <>
      <span className="inline-flex dark:hidden">
        <KitefyLogo height={height} />
      </span>
      <span className="hidden dark:inline-flex">
        <KitefyLogo variant="onDark" height={height} />
      </span>
    </>
  );
}
