import { NextResponse } from "next/server";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { exportTenantData, exportFileName } from "@/lib/privacy/export";

/**
 * LGPD Art. 18 (II) — download de todos os dados do tenant em JSON.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const tenant = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", session.tenantId)
    .maybeSingle<{ slug: string }>();

  const payload = await exportTenantData(session.tenantId);
  const fileName = exportFileName(tenant.data?.slug ?? "dados");

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
