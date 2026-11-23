import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { analyzeCompetitors } from "@/lib/competitors/analyze";
import { createLogger } from "@/lib/logger";

const log = createLogger("api.competitors.analyze");

const bodySchema = z.object({
  competitorUrls: z.array(z.string().trim().min(4)).min(1).max(3),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionContext();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe de 1 a 3 URLs de concorrentes." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const brand = await supabase
    .from("brand_profiles")
    .select("brand_name, website_url")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ brand_name: string; website_url: string | null }>();

  if (!brand.data?.website_url) {
    return NextResponse.json(
      { error: "Cadastre o site da sua marca em Configurações → Marca antes de comparar." },
      { status: 400 },
    );
  }

  try {
    const analysis = await analyzeCompetitors({
      brandUrl: brand.data.website_url,
      competitorUrls: parsed.data.competitorUrls,
      budgetMs: 7_000,
    });
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao analisar concorrentes.";
    log.warn("Análise de concorrentes falhou", { message });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
