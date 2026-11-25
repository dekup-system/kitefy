"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";
import { crawlBrandSite } from "@/lib/crawl/site";
import type { CompetitorRadarEntry, CompetitorRadarIdea, ToneOfVoice } from "@/types/domain";

const SOCIAL_HOSTS = ["instagram.com", "linkedin.com", "tiktok.com", "youtube.com", "facebook.com"];

const addSchema = z.object({
  brandId: z.string().uuid("Marca inválida."),
  name: z.string().trim().min(2, "Informe o nome do concorrente.").max(100),
  url: z.string().trim().url("Informe uma URL válida (começando com https://).").max(500),
});

export interface RadarActionState {
  error?: string;
  notice?: string;
}

function isSocialUrl(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return SOCIAL_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export async function addCompetitorToRadarAction(
  _prev: RadarActionState,
  formData: FormData,
): Promise<RadarActionState> {
  const session = await requireSessionContext();
  const parsed = addSchema.safeParse({
    brandId: formData.get("brandId"),
    name: formData.get("name"),
    url: formData.get("url"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: brand, error: fetchErr } = await supabase
    .from("brand_profiles")
    .select("id, tone_of_voice")
    .eq("id", parsed.data.brandId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{ id: string; tone_of_voice: ToneOfVoice | null }>();

  if (fetchErr || !brand) {
    return { error: "Marca não encontrada nesta conta." };
  }

  const currentTone = brand.tone_of_voice ?? {};
  const currentList = Array.isArray(currentTone.competitor_radar) ? currentTone.competitor_radar : [];

  if (currentList.length >= 10) {
    return { error: "Limite de 10 concorrentes no radar por marca atingido. Remova um para adicionar outro." };
  }

  const normalizedUrl = parsed.data.url.trim();
  if (currentList.some((c) => c.url.toLowerCase() === normalizedUrl.toLowerCase())) {
    return { error: "Este endereço já está salvo no radar desta marca." };
  }

  const entry: CompetitorRadarEntry = {
    id: randomUUID(),
    name: parsed.data.name,
    url: normalizedUrl,
    kind: isSocialUrl(normalizedUrl) ? "social" : "site",
    topics: [],
    ideas: [],
    lastAnalyzedAt: null,
  };

  const { error: updateErr } = await supabase
    .from("brand_profiles")
    .update({
      tone_of_voice: {
        ...currentTone,
        competitor_radar: [entry, ...currentList],
      },
    })
    .eq("id", brand.id)
    .eq("tenant_id", session.tenantId);

  if (updateErr) {
    return { error: `Não foi possível salvar no radar: ${updateErr.message}` };
  }

  revalidatePath("/competitors");
  return { notice: `${entry.name} adicionado ao radar. Clique em "Extrair novas ideias" para analisar.` };
}

export async function removeCompetitorFromRadarAction(formData: FormData): Promise<void> {
  const session = await requireSessionContext();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const competitorId = String(formData.get("competitorId") ?? "").trim();
  if (!brandId || !competitorId) return;

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from("brand_profiles")
    .select("id, tone_of_voice")
    .eq("id", brandId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{ id: string; tone_of_voice: ToneOfVoice | null }>();

  if (!brand) return;
  const currentTone = brand.tone_of_voice ?? {};
  const currentList = Array.isArray(currentTone.competitor_radar) ? currentTone.competitor_radar : [];

  await supabase
    .from("brand_profiles")
    .update({
      tone_of_voice: {
        ...currentTone,
        competitor_radar: currentList.filter((item) => item.id !== competitorId),
      },
    })
    .eq("id", brand.id)
    .eq("tenant_id", session.tenantId);

  revalidatePath("/competitors");
}

function buildDifferentiatedIdeas(input: {
  brandName: string;
  brandFact: string;
  competitorName: string;
  topics: string[];
  description: string;
}): CompetitorRadarIdea[] {
  const topic1 = input.topics[0] || input.description.slice(0, 75) || `posicionamento de ${input.competitorName}`;
  const topic2 = input.topics[1] || `critérios de escolha comparados a ${input.competitorName}`;

  return [
    {
      title: `Contra-ângulo superior sobre "${topic1.slice(0, 52)}${topic1.length > 52 ? "…" : ""}"`,
      assetType: "typo_carousel",
      objective: `Abordar o tema "${topic1}" com muito mais clareza e profundidade prática do que concorrentes como ${input.competitorName}, mostrando o que o cliente realmente precisa avaliar`,
      productInput: input.brandFact,
    },
    {
      title: `Roteiro rápido: o que o mercado não explica sobre ${topic2.slice(0, 42)}`,
      assetType: "short_script_kit",
      objective: `Gravar vídeo curto de 45s desmistificando o discurso padrão do mercado sobre "${topic2}" e destacando o diferencial real de ${input.brandName}`,
      productInput: input.brandFact,
    },
    {
      title: `Guia de decisão (SEO/GEO) para vencer a busca nesse tema`,
      assetType: "geo_article",
      objective: `Criar guia comparativo objetivo e citável no Google respondendo às dúvidas que quem pesquisa "${topic1}" tem antes de escolher ${input.brandName}`,
      productInput: input.brandFact,
    },
  ];
}

export async function extractCompetitorIdeasAction(formData: FormData): Promise<void> {
  const session = await requireSessionContext();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const competitorId = String(formData.get("competitorId") ?? "").trim();
  if (!brandId || !competitorId) return;

  const supabase = await createSupabaseServerClient();
  const { data: brand } = await supabase
    .from("brand_profiles")
    .select("id, brand_name, tone_of_voice, entity_facts")
    .eq("id", brandId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{
      id: string;
      brand_name: string;
      tone_of_voice: ToneOfVoice | null;
      entity_facts: { claim: string }[] | null;
    }>();

  if (!brand) return;
  const currentTone = brand.tone_of_voice ?? {};
  const currentList = Array.isArray(currentTone.competitor_radar) ? currentTone.competitor_radar : [];
  const target = currentList.find((c) => c.id === competitorId);
  if (!target) return;

  let topics: string[] = [];
  let description = "";
  try {
    const crawl = await crawlBrandSite(target.url, { maxPages: 3 });
    topics = crawl.topics.slice(0, 6);
    description = crawl.description;
  } catch {
    topics = [];
    description = `Conteúdos públicos de ${target.name}`;
  }

  const brandFact =
    brand.entity_facts?.[0]?.claim?.slice(0, 120) || `diferencial e atendimento de ${brand.brand_name}`;

  const ideas = buildDifferentiatedIdeas({
    brandName: brand.brand_name,
    brandFact,
    competitorName: target.name,
    topics,
    description,
  });

  const nextList = currentList.map((item) =>
    item.id === competitorId
      ? {
          ...item,
          topics,
          ideas,
          lastAnalyzedAt: new Date().toISOString(),
        }
      : item,
  );

  await supabase
    .from("brand_profiles")
    .update({
      tone_of_voice: {
        ...currentTone,
        competitor_radar: nextList,
      },
    })
    .eq("id", brand.id)
    .eq("tenant_id", session.tenantId);

  revalidatePath("/competitors");
}
