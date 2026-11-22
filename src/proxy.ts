import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 substitui `middleware.ts` por `proxy.ts`.
 * Responsabilidades aqui: refresh de sessão Supabase + guarda de rota.
 * Nenhuma decisão de autorização de dados acontece aqui — isso é RLS no banco.
 */

const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/auth/error", "/pricing", "/privacidade", "/termos"];
const AUTH_ENTRY = "/login";
const DEFAULT_APP = "/app";

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Webhooks (HMAC) e worker (x-worker-secret) se autenticam sozinhos.
    return (
      pathname.startsWith("/api/webhooks/") ||
      pathname.startsWith("/api/jobs/") ||
      pathname.startsWith("/_next/") ||
      pathname === "/favicon.ico"
    );
}

export default async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem Supabase configurado (build/preview sem env) não bloqueamos navegação.
  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (user && (pathname === AUTH_ENTRY || pathname === "/")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = DEFAULT_APP;
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  if (!user && !isPublic(pathname)) {
    // APIs respondem JSON 401; a UI é redirecionada para o login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Sessão ausente ou expirada. Entre novamente.", code: "unauthenticated" },
        { status: 401 },
      );
    }

    const redirect = request.nextUrl.clone();
    redirect.pathname = AUTH_ENTRY;
    redirect.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, exceto assets estáticos e imagens otimizadas.
     * Rotas de webhook também são excluídas do guard de sessão (mas validadas por HMAC).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
