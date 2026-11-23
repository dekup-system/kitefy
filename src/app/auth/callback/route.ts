import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Callback do Supabase Auth (Google SSO e confirmação de e-mail).
 * Troca o `code` por sessão em cookies httpOnly e redireciona.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description");
  const nextParam = searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  // O Supabase devolve `error_description` quando o link já foi usado, expirou
  // ou foi aberto por um verificador de e-mail. A mensagem genérica escondia a
  // saída: "entre com a senha" resolve 90% dos casos.
  if (errorDescription) {
    const friendly = /expired|invalid|already|used/i.test(errorDescription)
      ? "Este link já foi usado ou expirou. Entre com sua senha ou peça um novo link."
      : /access_denied|cancel/i.test(errorDescription)
        ? "Confirmação cancelada. Se ainda precisar, peça um novo link."
        : "Não foi possível concluir o login. Tente novamente.";

    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(friendly)}`);
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Código de autorização ausente.")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Sessão expirada. Tente entrar novamente.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
