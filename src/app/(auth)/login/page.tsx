import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import { LoginForm } from "./login-form";
import { getSessionContext } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o estúdio orgânico e GEO da sua marca.",
};

const HIGHLIGHTS = [
  { icon: Zap, text: "Primeiro ativo em menos de 90 segundos, sem tour bloqueante." },
  { icon: CheckCircle2, text: "Roteiros, carrosséis e artigos GEO com padrão de marca." },
  { icon: ShieldCheck, text: "Sem OAuth social, sem avatar, sem narração sintética." },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getSessionContext().catch(() => null);
  if (session) redirect("/app");

  const params = await searchParams;
  const error = params.error ? decodeURIComponent(params.error) : undefined;
  const next = params.next ?? "/app";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between border-r border-border bg-muted/30 p-12 lg:flex">
        <Link href="/" className="inline-flex items-center gap-2 font-medium">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-foreground" />
          BrandPulse
        </Link>

        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <h1 className="text-balance text-3xl font-semibold tracking-tight">
              O estúdio de conteúdo orgânico que aprende com o seu resultado.
            </h1>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              Você traz a marca e a oferta. O estúdio devolve roteiros graváveis, carrosséis prontos e
              artigos que motores de busca e assistentes de IA conseguem citar.
            </p>
          </div>

          <ul className="space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-sm text-muted-foreground">
                <item.icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Conteúdo entregue para exportação — cópia em 1 clique, PNG, Markdown, HTML e JSON-LD.
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium lg:hidden">
              <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-foreground" />
              BrandPulse
            </Link>
            <h2 className="text-2xl font-semibold tracking-tight">Entrar no estúdio</h2>
            <p className="text-sm text-muted-foreground">
              Um campo de e-mail e uma senha. O resto a gente resolve.
            </p>
          </div>

          <LoginForm next={next} oauthError={error} />

          <p className="text-center text-xs text-muted-foreground">
            Ainda não conhece?{" "}
            <Link href="/pricing" className="inline-flex items-center gap-1 underline underline-offset-4">
              Ver planos <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
