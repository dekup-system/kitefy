"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";
import { extractBrandDraft } from "@/lib/onboarding/extract";
import { generateBrandAudienceStudy } from "@/lib/audience/persona-generator";
import { PLANS } from "@/lib/pricing";
import { createLogger } from "@/lib/logger";
import type { AbepClass, PlanTier } from "@/types/domain";

/**
 * Onboarding: um campo (URL ou descrição) + template de nicho opcional.
 * Cria a marca e devolve o controle para a UI iniciar o primeiro ativo.
 */

const log = createLogger("onboarding.actions");

export interface BrandFormState {
  error?: string;
  notice?: string;
  brandId?: string;
}

const brandInputSchema = z.object({
  input: z
    .string()
    .trim()
    .min(4, "Cole a URL do seu site ou descreva o seu negócio em uma frase.")
    .max(600),
  templateId: z.enum(["saude", "beleza", "ecommerce", "gastronomia", "servicos", "b2b"]).optional(),
});

export async function createBrandFromOnboardingAction(
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const session = await requireSessionContext();
  const supabase = await createSupabaseServerClient();

  const parsed = brandInputSchema.safeParse({
    input: formData.get("input"),
    templateId: formData.get("templateId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const planTier = session.planTier as PlanTier;
  const maxBrands = PLANS[planTier].maxBrands;

  if (session.brandCount >= maxBrands) {
    return {
      error: `Seu plano ${PLANS[planTier].name} permite ${maxBrands} marca(s). Faça upgrade para adicionar mais.`,
    };
  }

  const draft = await extractBrandDraft(parsed.data.input, parsed.data.templateId);

  const inserted = await supabase
    .from("brand_profiles")
    .insert({
      tenant_id: session.tenantId,
      brand_name: draft.brand_name,
      website_url: draft.website_url,
      icp_description: draft.icp_description,
      tone_of_voice: draft.tone_of_voice,
      visual_tokens: draft.visual_tokens,
      entity_facts: draft.entity_facts,
    })
    .select("id")
    .single<{ id: string }>();

  if (inserted.error || !inserted.data) {
    log.error("Falha ao criar marca", { message: inserted.error?.message });
    return { error: "Não foi possível salvar a marca agora. Tente novamente." };
  }

  revalidatePath("/app");
  revalidatePath("/onboarding");

  const site = draft.site_analysis;
  const siteSummary =
    site && site.pages_read > 0
      ? `Analisei ${site.pages_read} página(s) do seu site` +
        (site.topics.length > 0 ? ` e encontrei ${site.topics.length} tema(s) do seu negócio` : "") +
        ". "
      : "";

  return {
    brandId: inserted.data.id,
    notice:
      draft.needs_review.length > 0
        ? `${siteSummary}Marca configurada! Dica: ${draft.needs_review[0]}`
        : `${siteSummary}Marca configurada com sucesso.`,
  };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const brandUpdateSchema = z.object({
  brandId: z.string().uuid(),
  brandName: z.string().trim().min(1).max(160),
  websiteUrl: z.string().trim().url().optional().or(z.literal("")),
  icpDescription: z.string().trim().max(1200).optional(),
  tone: z.string().trim().max(2000).optional(),
  primaryColor: z.string().trim().regex(HEX_COLOR).optional().or(z.literal("")),
  backgroundColor: z.string().trim().regex(HEX_COLOR).optional().or(z.literal("")),
  accentColor: z.string().trim().regex(HEX_COLOR).optional().or(z.literal("")),
  factsText: z.string().trim().max(3000).optional(),
  uvp: z.string().trim().max(400).optional(),
  contrarianThesis: z.string().trim().max(400).optional(),
  objectionsText: z.string().trim().max(1200).optional(),
  abepClass: z.enum(["A", "B1", "B2", "C1", "C2", "DE", "misto"]).optional(),
  jtbdFunctional: z.string().trim().max(300).optional(),
  jtbdEmotional: z.string().trim().max(300).optional(),
  formality: z.coerce.number().int().min(1).max(10).optional(),
  humor: z.coerce.number().int().min(1).max(10).optional(),
  irreverence: z.coerce.number().int().min(1).max(10).optional(),
  enthusiasm: z.coerce.number().int().min(1).max(10).optional(),
  visualStylePreference: z
    .enum(["auto", "editorial_classic", "magazine_split", "dark_impact", "swiss_minimal"])
    .optional(),
});

export async function updateBrandAction(
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const session = await requireSessionContext();
  const supabase = await createSupabaseServerClient();

  const parsed = brandUpdateSchema.safeParse({
    brandId: formData.get("brandId"),
    brandName: formData.get("brandName"),
    websiteUrl: formData.get("websiteUrl") ?? "",
    icpDescription: formData.get("icpDescription") ?? undefined,
    tone: formData.get("tone") ?? undefined,
    primaryColor: formData.get("primaryColor") ?? "",
    backgroundColor: formData.get("backgroundColor") ?? "",
    accentColor: formData.get("accentColor") ?? "",
    factsText: formData.get("factsText") ?? undefined,
    uvp: formData.get("uvp") ?? undefined,
    contrarianThesis: formData.get("contrarianThesis") ?? undefined,
    objectionsText: formData.get("objectionsText") ?? undefined,
    abepClass: formData.get("abepClass") || undefined,
    jtbdFunctional: formData.get("jtbdFunctional") ?? undefined,
    jtbdEmotional: formData.get("jtbdEmotional") ?? undefined,
    formality: formData.get("formality") || undefined,
    humor: formData.get("humor") || undefined,
    irreverence: formData.get("irreverence") || undefined,
    enthusiasm: formData.get("enthusiasm") || undefined,
    visualStylePreference: formData.get("visualStylePreference") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const descriptors = (parsed.data.tone ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  const existing = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, visual_tokens, entity_facts")
    .eq("id", parsed.data.brandId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle<{
      tone_of_voice: Record<string, unknown>;
      visual_tokens: Record<string, unknown>;
      entity_facts: { claim: string; source_url?: string }[];
    }>();

  const nextVisualTokens: Record<string, unknown> = {
    ...(existing.data?.visual_tokens ?? {}),
    ...(parsed.data.primaryColor ? { primary: parsed.data.primaryColor } : {}),
    ...(parsed.data.backgroundColor ? { background: parsed.data.backgroundColor } : {}),
    ...(parsed.data.accentColor ? { accent: parsed.data.accentColor } : {}),
  };

  let nextEntityFacts = existing.data?.entity_facts ?? [];
  if (parsed.data.factsText !== undefined) {
    nextEntityFacts = parsed.data.factsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 4)
      .slice(0, 8)
      .map((line) => {
        const [claimPart, urlPart] = line.split("|").map((s) => s.trim());
        const validUrl = urlPart && /^https?:\/\//i.test(urlPart) ? urlPart : undefined;
        return {
          claim: (claimPart || line).slice(0, 220),
          ...(validUrl ? { source_url: validUrl } : {}),
        };
      });
  }

  const objections =
    parsed.data.objectionsText !== undefined
      ? parsed.data.objectionsText
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter((item) => item.length >= 3)
          .slice(0, 6)
      : undefined;

  const update = await supabase
    .from("brand_profiles")
    .update({
      brand_name: parsed.data.brandName,
      website_url: parsed.data.websiteUrl || null,
      icp_description: parsed.data.icpDescription ?? null,
      tone_of_voice: {
        ...(existing.data?.tone_of_voice ?? {}),
        ...(descriptors.length > 0 ? { descriptors } : {}),
        ...(parsed.data.uvp !== undefined ? { uvp: parsed.data.uvp || undefined } : {}),
        ...(parsed.data.contrarianThesis !== undefined
          ? { contrarian_thesis: parsed.data.contrarianThesis || undefined }
          : {}),
        ...(objections !== undefined ? { objections } : {}),
        ...(parsed.data.abepClass ? { abep_class: parsed.data.abepClass } : {}),
        ...(parsed.data.jtbdFunctional !== undefined
          ? { jtbd_functional: parsed.data.jtbdFunctional || undefined }
          : {}),
        ...(parsed.data.jtbdEmotional !== undefined
          ? { jtbd_emotional: parsed.data.jtbdEmotional || undefined }
          : {}),
        ...(parsed.data.formality !== undefined ? { formality: parsed.data.formality } : {}),
        ...(parsed.data.humor !== undefined ? { humor: parsed.data.humor } : {}),
        ...(parsed.data.irreverence !== undefined ? { irreverence: parsed.data.irreverence } : {}),
        ...(parsed.data.enthusiasm !== undefined ? { enthusiasm: parsed.data.enthusiasm } : {}),
        ...(parsed.data.visualStylePreference
          ? { visual_style_preference: parsed.data.visualStylePreference }
          : {}),
      },
      visual_tokens: nextVisualTokens,
      entity_facts: nextEntityFacts,
    })
    .eq("id", parsed.data.brandId)
    .eq("tenant_id", session.tenantId);

  if (update.error) {
    return { error: `Não foi possível salvar: ${update.error.message}` };
  }

  revalidatePath("/settings/brand");
  revalidatePath("/studio/new");
  revalidatePath("/app");
  return { notice: "Marca, cores e diferenciais atualizados com sucesso." };
}

export async function startFirstAssetAction(formData: FormData): Promise<void> {
  await requireSessionContext();
  const brandId = String(formData.get("brandId") ?? "");
  const assetType = String(formData.get("assetType") ?? "short_script_kit");
  const objective = String(formData.get("objective") ?? "").slice(0, 280);
  const productInput = String(formData.get("productInput") ?? "").slice(0, 280);

  if (!brandId || !objective || !productInput) {
    redirect("/onboarding?error=1");
  }

  // A geração em si acontece na rota /api/studio/start (chamada pelo client);
  // aqui apenas devolvemos o controle com os parâmetros já validados.
  const params = new URLSearchParams({
    brand: brandId,
    type: assetType,
    objective,
    product: productInput,
  });
  revalidatePath("/onboarding");
  redirect(`/studio/new?${params.toString()}`);
}

export async function skipOnboardingAction(): Promise<void> {
  await requireSessionContext();
  redirect("/app");
}

export interface AudienceStudyActionState {
  error?: string;
  notice?: string;
}

export async function generateAudienceStudyAction(
  _prev: AudienceStudyActionState,
  formData: FormData,
): Promise<AudienceStudyActionState> {
  const session = await requireSessionContext();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const region = String(formData.get("region") ?? "Brasil").trim().slice(0, 120);

  if (!brandId) {
    return { error: "Marca inválida." };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: brand, error: brandErr }, { data: chunks }] = await Promise.all([
    supabase
      .from("brand_profiles")
      .select("id, brand_name, website_url, icp_description, tone_of_voice, entity_facts")
      .eq("id", brandId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle<{
        id: string;
        brand_name: string;
        website_url: string | null;
        icp_description: string | null;
        tone_of_voice: Record<string, unknown> | null;
        entity_facts: { claim: string }[] | null;
      }>(),
    supabase
      .from("knowledge_chunks")
      .select("content")
      .eq("brand_id", brandId)
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  if (brandErr || !brand) {
    return { error: "Marca não encontrada nesta conta." };
  }

  const currentTone = brand.tone_of_voice ?? {};
  const abepClass =
    typeof currentTone.abep_class === "string"
      ? (currentTone.abep_class as AbepClass)
      : undefined;

  const study = await generateBrandAudienceStudy({
    brandName: brand.brand_name,
    websiteUrl: brand.website_url,
    icpDescription: brand.icp_description,
    region: region || "Brasil",
    abepClass,
    entityFacts: brand.entity_facts ?? [],
    knowledgeHighlights: (chunks ?? []).map((c: { content: string }) => c.content),
  });

  const nextTone = {
    ...currentTone,
    audience_study: study,
    ...(study.ibge.dominantAbepClasses[0] && !currentTone.abep_class
      ? { abep_class: study.ibge.dominantAbepClasses[0] }
      : {}),
  };

  const { error: updateErr } = await supabase
    .from("brand_profiles")
    .update({ tone_of_voice: nextTone })
    .eq("id", brandId)
    .eq("tenant_id", session.tenantId);

  if (updateErr) {
    return { error: `Não foi possível salvar o estudo: ${updateErr.message}` };
  }

  revalidatePath("/settings/brand");
  revalidatePath("/studio/new");
  revalidatePath("/app");

  return {
    notice: `Estudo gerado com dados demográficos (${study.ibge.regionLabel}) e ${study.personas.length} personas baseadas em evidência.`,
  };
}
