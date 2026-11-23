import Link from "next/link";
import { redirect } from "next/navigation";
import { KitefyLogo } from "@/components/brand/kitefy-logo";
import { getSessionContext } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Nova senha — Kitefy" };

/**
 * Página aberta pelo link de redefinição. Exige sessão: o `/auth/callback`
 * troca o código antes de encaminhar para cá.
 */
export default async function ResetPasswordPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login?error=Link%20expirado.%20Pe%C3%A7a%20um%20novo.");

  return (
    <div data-surface="kitefy-light" className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3">
          <KitefyLogo variant="onLight" height={30} />
          <h1 className="text-2xl font-semibold tracking-tight">Crie uma senha nova</h1>
          <p className="text-sm text-muted-foreground">
            Escolha uma senha que você não use em outros sites. Depois de salvar, você já entra no
            painel.
          </p>
        </div>

        <ResetForm />

        <p className="text-center text-xs text-muted-foreground">
          Prefere{" "}
          <Link href="/login" className="underline underline-offset-4">
            voltar para o login
          </Link>
          ?
        </p>
      </div>
    </div>
  );
}
