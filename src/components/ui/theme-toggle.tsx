"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./button";

const THEME_CYCLE = ["light", "dark", "system"] as const;
type ThemeName = (typeof THEME_CYCLE)[number];

const THEME_LABELS: Record<ThemeName, string> = {
  light: "claro",
  dark: "escuro",
  system: "sistema",
};

function isThemeName(value: string | undefined): value is ThemeName {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Alterna claro → escuro → sistema.
 *
 * Sem estado de "mounted": o ícone é escolhido por CSS (`dark:`), então o HTML
 * do servidor e o primeiro render do cliente são idênticos — nenhuma divergência
 * de hidratação e nenhum setState dentro de efeito.
 */
function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const current: ThemeName = isThemeName(theme) ? theme : "system";
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length] ?? "light";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={`Tema atual: ${THEME_LABELS[current]}. Ativar tema ${THEME_LABELS[next]}.`}
    >
      <Moon className="size-4 dark:hidden" aria-hidden="true" />
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
    </Button>
  );
}

export { ThemeToggle };
