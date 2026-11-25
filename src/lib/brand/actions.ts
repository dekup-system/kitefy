"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, requireSessionContext } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { extractBrandDraft } from "@/lib/onboarding/extract";
import { PLANS } from "@/lib/pricing";
import { createLogger } from "@/lib/logger";
import { MAX_BRAND_LOGO_BYTES, validateBrandLogo } from "./logo";
import { extractLogoPalettes } from "./logo-colors";
import {
  MAX_BRAND_LOGO_DIMENSION,
  removeBrandLogo,
  uploadBrandLogo,
} from "./logo-storage";
import type { VisualTokens } from "@/types/domain";

/**
 * Perfis de marca: criar, editar (em `lib/onboarding/actions.ts`) e logomarca.
 *
 * O limite de marcas vem do plano (`PLANS[tier].maxBrands`) e é conferido no
 * servidor — desabilitar o botão na UI não é controle de acesso.
 */

const log = createLogger("brand.actions");

export interface BrandCreateState {
  error?: string;
  notice?: string;
  brandId?: string;
}

export interface BrandLogoState {
  error?: string;
  notice?: string;
}

const HTTP_URL = /^https?:\/\//i;

const createBrandSchema = z.object({
  brandName: z
    .string()
    .trim()
    .min(1, "Informe o nome da marca.")
    .max(160, "O nome da marca pode ter no máximo 160 caracteres."),
  websiteUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .refine((value) => !value || HTTP_URL.test(value), {
      message: "Informe uma URL começando com http:// ou https://.",
    }),
  icpDescription: z
    .string()
    .trim()
    .max(1200, "A descrição do cliente ideal pode ter no máximo 1.200 caracteres.")
    .optional(),
});

const brandIdSchema = z.string().uuid("Marca inválida.");

function isEditor(role: string): boolean {
  return role === "owner" || role === "editor";
}

export async function createBrandAction(
  _prev: BrandCreateState,
  formData: FormData,
): Promise<BrandCreateState> {
  const session = await requireSessionContext();

  if (!isEditor(session.role)) {
    return { error: "Seu perfil não tem permissão para criar marcas." };
  }

  const parsed = createBrandSchema.safeParse({
    brandName: formData.get("brandName"),
    websiteUrl: formData.get("websiteUrl") || undefined,
    icpDescription: formData.get("icpDescription") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const plan = PLANS[session.planTier];

  const countQuery = await supabase
    .from("brand_profiles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", session.tenantId);

  if (countQuery.error) {
    return { error: "Não foi possível conferir o limite de marcas agora. Tente novamente." };
  }
  if ((countQuery.count ?? 0) >= plan.maxBrands) {
    return {
      error: `Seu plano ${plan.name} permite ${plan.maxBrands} marca(s). Faça upgrade para criar mais.`,
    };
  }

  // Extrai automaticamente contexto inicial (site, ICP, tom de voz, cores e fatos)
  // sempre que o usuário informa um site ou descrição ao criar nova marca.
  let extractedIcp: string | null = parsed.data.icpDescription || null;
  let extractedTone: Record<string, unknown> = {};
  let extractedTokens: Record<string, unknown> = {};
  let extractedFacts: { claim: string; source_url?: string }[] = [];

  try {
    const seedInput = parsed.data.websiteUrl || parsed.data.icpDescription || parsed.data.brandName;
    const draft = await extractBrandDraft(seedInput);
    extractedIcp = parsed.data.icpDescription || draft.icp_description || null;
    extractedTone = (draft.tone_of_voice ?? {}) as Record<string, unknown>;
    extractedTokens = (draft.visual_tokens ?? {}) as Record<string, unknown>;
    extractedFacts = Array.isArray(draft.entity_facts) ? draft.entity_facts : [];
  } catch (err) {
    log.warn("Falha ao extrair dados automáticos da nova marca; seguindo com cadastro básico", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const inserted = await supabase
    .from("brand_profiles")
    .insert({
      tenant_id: session.tenantId,
      brand_name: parsed.data.brandName,
      website_url: parsed.data.websiteUrl || null,
      icp_description: extractedIcp,
      tone_of_voice: extractedTone,
      visual_tokens: extractedTokens,
      entity_facts: extractedFacts,
    })
    .select("id")
    .single<{ id: string }>();

  if (inserted.error || !inserted.data) {
    log.error("Falha ao criar marca pelo painel", { message: inserted.error?.message });
    return { error: "Não foi possível criar a marca agora. Tente novamente." };
  }

  revalidatePath("/settings/brand");
  revalidatePath("/studio/new");
  revalidatePath("/app");

  return {
    brandId: inserted.data.id,
    notice: parsed.data.websiteUrl
      ? "Marca criada e preenchida automaticamente com os dados lidos do site! Confira abaixo."
      : "Marca criada com perfil inicial preenchido. Você já pode ajustar os detalhes e enviar a logomarca.",
  };
}

async function loadBrandTokens(input: {
  tenantId: string;
  brandId: string;
}): Promise<
  | { ok: true; visualTokens: VisualTokens }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const query = await supabase
    .from("brand_profiles")
    .select("id, visual_tokens")
    .eq("id", input.brandId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle<{ id: string; visual_tokens: VisualTokens | null }>();

  if (query.error) {
    return { ok: false, error: "Não foi possível carregar a marca agora. Tente novamente." };
  }
  if (!query.data) {
    return { ok: false, error: "Marca não encontrada nesta conta." };
  }

  return { ok: true, visualTokens: query.data.visual_tokens ?? {} };
}

export async function uploadBrandLogoAction(
  _prev: BrandLogoState,
  formData: FormData,
): Promise<BrandLogoState> {
  const session = await requireSessionContext();

  if (!isEditor(session.role)) {
    return { error: "Seu perfil não tem permissão para alterar a marca." };
  }

  const parsedBrand = brandIdSchema.safeParse(formData.get("brandId"));
  if (!parsedBrand.success) {
    return { error: "Marca inválida." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Escolha um arquivo de imagem para enviar." };
  }
  if (file.size > MAX_BRAND_LOGO_BYTES) {
    return { error: "A logomarca deve ter no máximo 2 MB." };
  }

  const brand = await loadBrandTokens({
    tenantId: session.tenantId,
    brandId: parsedBrand.data,
  });
  if (!brand.ok) return { error: brand.error };

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateBrandLogo({ buffer });
  if (!validation.ok) {
    return { error: validation.error };
  }

  try {
    const { path, meta } = await uploadBrandLogo({
      tenantId: session.tenantId,
      brandId: parsedBrand.data,
      buffer,
    });

    const logoPalettes = await extractLogoPalettes(buffer);
    const firstLogoPalette = logoPalettes[0];

    const previous =
      typeof brand.visualTokens.logo_path === "string" ? brand.visualTokens.logo_path : null;

    const nextVisualTokens: VisualTokens = {
      ...brand.visualTokens,
      logo_path: path,
      ...(logoPalettes.length > 0 ? { logo_palettes: logoPalettes } : {}),
      // Se a marca ainda não definiu cor própria, aplica automaticamente a paleta principal da logo
      ...(!brand.visualTokens.primary && firstLogoPalette
        ? {
            primary: firstLogoPalette.primary,
            background: firstLogoPalette.background,
            accent: firstLogoPalette.accent,
          }
        : {}),
    };

    const update = await (await createSupabaseServerClient())
      .from("brand_profiles")
      .update({ visual_tokens: nextVisualTokens })
      .eq("id", parsedBrand.data)
      .eq("tenant_id", session.tenantId)
      .select("id");

    if (update.error) {
      // Não deixa arquivo novo órfão se o banco recusou o vínculo.
      await removeBrandLogo(path);
      log.warn("Falha ao vincular logomarca à marca", { message: update.error.message });
      return { error: "Não foi possível salvar a logomarca agora. Tente novamente." };
    }

    if (previous && previous !== path) {
      await removeBrandLogo(previous);
    }

    revalidatePath("/settings/brand");
    revalidatePath("/app");
    return {
      notice: `Logomarca atualizada (${meta.width}×${meta.height}px, otimizada para ${MAX_BRAND_LOGO_DIMENSION}px).`,
    };
  } catch (error) {
    log.warn("Falha no upload da logomarca", {
      message: error instanceof Error ? error.message : "erro",
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a logomarca agora. Tente novamente.",
    };
  }
}

export async function removeBrandLogoAction(
  _prev: BrandLogoState,
  formData: FormData,
): Promise<BrandLogoState> {
  const session = await requireSessionContext();

  if (!isEditor(session.role)) {
    return { error: "Seu perfil não tem permissão para alterar a marca." };
  }

  const parsedBrand = brandIdSchema.safeParse(formData.get("brandId"));
  if (!parsedBrand.success) {
    return { error: "Marca inválida." };
  }

  const brand = await loadBrandTokens({
    tenantId: session.tenantId,
    brandId: parsedBrand.data,
  });
  if (!brand.ok) return { error: brand.error };

  const path =
    typeof brand.visualTokens.logo_path === "string" ? brand.visualTokens.logo_path : null;
  if (!path) {
    return { notice: "Esta marca ainda não tem logomarca." };
  }

  const nextTokens: VisualTokens = { ...brand.visualTokens };
  delete nextTokens.logo_path;

  const update = await (await createSupabaseServerClient())
    .from("brand_profiles")
    .update({ visual_tokens: nextTokens })
    .eq("id", parsedBrand.data)
    .eq("tenant_id", session.tenantId)
    .select("id");

  if (update.error) {
    log.warn("Falha ao desvincular logomarca", { message: update.error.message });
    return { error: "Não foi possível remover a logomarca agora. Tente novamente." };
  }

  await removeBrandLogo(path);

  revalidatePath("/settings/brand");
  revalidatePath("/app");
  return { notice: "Logomarca removida." };
}

export interface BrandDeleteState {
  error?: string;
  deleted?: boolean;
}

/**
 * Exclui definitivamente uma marca e TODO o histórico vinculado:
 *  - campaigns_and_assets + hook_variants (ON DELETE CASCADE)
 *  - knowledge_chunks, performance_telemetry, bandit_arm_stats (ON DELETE CASCADE)
 *  - logomarca e imagens renderizadas no Storage privado (best-effort)
 */
export async function deleteBrandAction(
  _prev: BrandDeleteState,
  formData: FormData,
): Promise<BrandDeleteState> {
  const session = await requireSessionContext();

  if (!isEditor(session.role)) {
    return { error: "Seu perfil não tem permissão para excluir marcas." };
  }

  const parsedBrand = brandIdSchema.safeParse(formData.get("brandId"));
  if (!parsedBrand.success) {
    return { error: "Marca inválida." };
  }

  const brandId = parsedBrand.data;
  const supabase = await createSupabaseServerClient();

  const [brandQuery, assetsQuery] = await Promise.all([
    supabase
      .from("brand_profiles")
      .select("id, visual_tokens")
      .eq("id", brandId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle<{ id: string; visual_tokens: VisualTokens | null }>(),
    supabase
      .from("campaigns_and_assets")
      .select("visual_urls")
      .eq("brand_id", brandId)
      .eq("tenant_id", session.tenantId),
  ]);

  if (brandQuery.error || !brandQuery.data) {
    return { error: "Marca não encontrada nesta conta." };
  }

  const storagePathsToDelete: string[] = [];
  const logoPath = brandQuery.data.visual_tokens?.logo_path;
  if (typeof logoPath === "string" && logoPath.trim().length > 0) {
    storagePathsToDelete.push(logoPath.trim());
  }
  for (const row of (assetsQuery.data ?? []) as { visual_urls?: string[] | null }[]) {
    for (const p of row.visual_urls ?? []) {
      if (typeof p === "string" && p.trim().length > 0) {
        storagePathsToDelete.push(p.trim());
      }
    }
  }

  const del = await supabase
    .from("brand_profiles")
    .delete()
    .eq("id", brandId)
    .eq("tenant_id", session.tenantId);

  if (del.error) {
    log.error("Falha ao excluir marca", { brandId, message: del.error.message });
    return { error: `Não foi possível excluir a marca agora: ${del.error.message}` };
  }

  // Limpeza best-effort no Storage privado (não bloqueia exclusão se o arquivo já não existir).
  if (storagePathsToDelete.length > 0) {
    try {
      const admin = createSupabaseAdminClient();
      const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
      await admin.storage.from(bucket).remove(storagePathsToDelete);
    } catch (err) {
      log.warn("Falha na limpeza de arquivos do Storage após exclusão da marca", {
        brandId,
        count: storagePathsToDelete.length,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  revalidatePath("/settings/brand");
  revalidatePath("/app");
  revalidatePath("/campaigns");
  revalidatePath("/studio/new");
  revalidatePath("/telemetry");
  revalidatePath("/google");

  return { deleted: true };
}
