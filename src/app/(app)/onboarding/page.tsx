import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "./onboarding-form";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionContext } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Primeiros passos",
  description: "Configure sua marca em menos de 90 segundos.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const params = await searchParams;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Comece pelo que você já tem"
        description="Cole a URL do seu site ou descreva o produto. Extraímos o tom de voz, o público e as cores para você não começar de uma tela em branco."
      />

      {params.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Faltou alguma informação para iniciar o primeiro ativo. Revise e tente novamente.
        </p>
      ) : null}

      <OnboardingForm />

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground">O que não fazemos:</strong> não conectamos
        Instagram, TikTok, LinkedIn, X ou YouTube; não armazenamos tokens sociais; não geramos
        avatar, vídeo falado, clonagem ou síntese de voz. O conteúdo é entregue para exportação.
      </div>
    </div>
  );
}
