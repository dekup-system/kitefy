"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";
import { extractBrandDraft } from "@/lib/onboarding/extract";
import { PLANS } from "@/lib/pricing";
import { createLogger } from "@/lib/logger";
import type { PlanTier } from "@/types/domain";

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

  const update = await supabase
    .from("brand_profiles")
    .update({
      brand_name: parsed.data.brandName,
      website_url: parsed.data.websiteUrl || null,
      icp_description: parsed.data.icpDescription ?? null,
      tone_of_voice: {
        ...(existing.data?.tone_of_voice ?? {}),
        ...(descriptors.length > 0 ? { descriptors } : {}),
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
