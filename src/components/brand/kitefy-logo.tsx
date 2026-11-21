import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Aplicação da logomarca Kitefy conforme o manual.
 *
 * Regra crítica: a faceta esquerda do ícone e a tipografia são `#181331`, a
 * mesma cor das seções escuras. Sobre `#181331` a versão padrão desaparece,
 * então existe a variante `onDark`, que coloca o ícone num container claro
 * arredondado e escreve o nome em branco.
 */

const LOGO_SRC = "/brand/kitefy-logomarca-principal.png";
const ICON_SRC = "/brand/kitefy-icone-site.png";
const LOGO_RATIO = 2184 / 882;

type LogoProps = {
  /** `onLight` para canvas/branco; `onDark` para #181331. */
  variant?: "onLight" | "onDark";
  /** Altura do lockup em px (manual: 36–44 no header). */
  height?: number;
  className?: string;
  priority?: boolean;
};

export function KitefyLogo({ variant = "onLight", height = 40, className, priority }: LogoProps) {
  if (variant === "onDark") {
    return (
      <span className={cn("inline-flex items-center gap-2.5", className)}>
        <span
          className="inline-flex items-center justify-center rounded-[10px] bg-[var(--brand-canvas)] p-1.5"
          style={{ height, width: height }}
        >
          <Image
            src={ICON_SRC}
            alt=""
            aria-hidden="true"
            width={512}
            height={512}
            priority={priority}
            className="h-full w-full object-contain"
          />
        </span>
        <span
          className="font-semibold tracking-tight text-white"
          style={{ fontSize: Math.round(height * 0.67) }}
        >
          Kitefy
        </span>
      </span>
    );
  }

  return (
    <Image
      src={LOGO_SRC}
      alt="Kitefy"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      priority={priority}
      className={cn("w-auto", className)}
      style={{ height }}
    />
  );
}

export function KitefyIcon({ size = 32, className, priority }: { size?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src={ICON_SRC}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      priority={priority}
      className={cn("object-contain", className)}
      style={{ height: size, width: size }}
    />
  );
}
