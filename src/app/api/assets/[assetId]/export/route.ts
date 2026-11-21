import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { buildExportFile, type ExportFormat } from "@/lib/export/pack";
import { createLogger } from "@/lib/logger";
import type { CampaignAssetRow } from "@/types/domain";

/**
 * Exportação sem atrito. Nunca publica em rede social: entrega arquivo.
 * Formatos: zip (imagens + markdown + json-ld), md, html, json, jsonld.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api.export");

const VALID_FORMATS: ExportFormat[] = ["zip", "md", "html", "json", "jsonld"];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
): Promise<NextResponse> {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { assetId } = await context.params;
  const formatParam = request.nextUrl.searchParams.get("format") ?? "zip";
  if (!VALID_FORMATS.includes(formatParam as ExportFormat)) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 422 });
  }
  const format = formatParam as ExportFormat;

  // RLS: só encontra ativos do tenant da sessão.
  const supabase = await createSupabaseServerClient();
  const assetQuery = await supabase
    .from("campaigns_and_assets")
    .select("*, brand_profiles!inner(brand_name, website_url)")
    .eq("id", assetId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<
      CampaignAssetRow & { brand_profiles: { brand_name: string; website_url: string | null } }
    >();

  if (assetQuery.error) {
    return NextResponse.json({ error: "Falha ao carregar o ativo." }, { status: 500 });
  }
  if (!assetQuery.data) {
    return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });
  }

  const { brand_profiles: brand, ...asset } = assetQuery.data;

  const visuals: { fileName: string; data: Buffer }[] = [];
  if (format === "zip" && asset.visual_urls.length > 0) {
    const admin = createSupabaseAdminClient();
    const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;

    const downloads: ({ fileName: string; data: Buffer } | null)[] = await Promise.all(
      asset.visual_urls.map(async (path) => {
        const { data, error } = await admin.storage.from(bucket).download(path);
        if (error || !data) {
          log.warn("Visual não encontrado no Storage", { path, message: error?.message });
          return null;
        }
        const buffer = Buffer.from(await data.arrayBuffer());
        const fileName = path.split("/").pop() ?? `slide-${path.length}.png`;
        return { fileName, data: buffer };
      }),
    );

    for (const item of downloads) {
      if (item) visuals.push(item);
    }
  }

  const file = buildExportFile({
    asset: asset as CampaignAssetRow,
    brandName: brand.brand_name,
    websiteUrl: brand.website_url,
    visuals,
    format,
  });

  log.info("Ativo exportado", { assetId, format, bytes: file.buffer.length });

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
