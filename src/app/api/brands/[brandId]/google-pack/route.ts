import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { buildGooglePack, GooglePackError, type GooglePackArticle } from "@/lib/export/google-pack";
import { createLogger } from "@/lib/logger";
import type { GeoArticlePayload } from "@/types/domain";

/**
 * GET /api/brands/[brandId]/google-pack
 *
 * Gera o ZIP do Pacote Google (sitemap, robots, index, LEIA-ME) para a marca
 * da sessão. Lê pelo cliente de sessão: a RLS garante que `brandId` de outro
 * tenant simplesmente não é encontrado (404), nunca vaza conteúdo.
 *
 * Erros de configuração (marca sem site, token inválido) redirecionam de volta
 * para /google com a mensagem, em vez de baixar um JSON de erro.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.google-pack");

interface BrandRow {
  brand_name: string;
  website_url: string | null;
  icp_description: string | null;
  google_verification_token: string | null;
}

interface ArticleRow {
  title: string;
  content_payload: unknown;
  created_at: string;
}

function errorRedirect(request: NextRequest, brandId: string, message: string): NextResponse {
  const target = new URL("/google", request.url);
  target.searchParams.set("brand", brandId);
  target.searchParams.set("erro", message.slice(0, 220));
  return NextResponse.redirect(target);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ brandId: string }> },
): Promise<NextResponse> {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { brandId } = await context.params;

  const supabase = await createSupabaseServerClient();
  const brandQuery = await supabase
    .from("brand_profiles")
    .select("brand_name, website_url, icp_description, google_verification_token")
    .eq("id", brandId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<BrandRow>();

  if (brandQuery.error) {
    log.error("Falha ao carregar marca para o Pacote Google", {
      brandId,
      message: brandQuery.error.message,
    });
    return NextResponse.json({ error: "Não foi possível carregar a marca." }, { status: 500 });
  }
  if (!brandQuery.data) {
    return NextResponse.json({ error: "Marca não encontrada." }, { status: 404 });
  }

  const brand = brandQuery.data;

  const articlesQuery = await supabase
    .from("campaigns_and_assets")
    .select("title, content_payload, created_at")
    .eq("tenant_id", session.tenantId)
    .eq("brand_id", brandId)
    .eq("asset_type", "geo_article")
    .in("status", ["approved", "exported"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (articlesQuery.error) {
    log.error("Falha ao carregar artigos para o Pacote Google", {
      brandId,
      message: articlesQuery.error.message,
    });
    return NextResponse.json(
      { error: "Não foi possível carregar os artigos da marca." },
      { status: 500 },
    );
  }

  const articles: GooglePackArticle[] = ((articlesQuery.data ?? []) as ArticleRow[]).flatMap(
    (row) => {
      const payload = row.content_payload as Partial<GeoArticlePayload> | null;
      if (!payload || payload.kind !== "geo_article") return [];
      if (typeof payload.slug !== "string" || typeof payload.title !== "string") return [];

      return [
        {
          slug: payload.slug,
          title: payload.title || row.title,
          description: typeof payload.meta_description === "string" ? payload.meta_description : null,
          updatedAt: row.created_at,
        },
      ];
    },
  );

  try {
    const file = buildGooglePack({
      brand: {
        name: brand.brand_name,
        websiteUrl: brand.website_url,
        description: brand.icp_description,
      },
      articles,
      verificationToken: brand.google_verification_token,
    });

    log.info("Pacote Google gerado", {
      brandId,
      articles: articles.length,
      bytes: file.buffer.length,
    });

    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Content-Length": String(file.buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof GooglePackError) {
      log.warn("Pacote Google recusado por configuração", { brandId, message: error.message });
      return errorRedirect(request, brandId, error.message);
    }

    log.error("Erro inesperado ao gerar Pacote Google", error);
    return NextResponse.json(
      { error: "Não foi possível gerar o pacote agora. Tente novamente." },
      { status: 500 },
    );
  }
}
