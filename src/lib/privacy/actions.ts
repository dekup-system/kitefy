"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSessionContext } from "@/lib/supabase/server";
import { eraseBrand, eraseTenant } from "@/lib/privacy/erase";
import { createLogger } from "@/lib/logger";

/**
 * Ações de LGPD acionadas em /settings/privacy.
 * Exigem digitar a palavra de confirmação — exclusão é irreversível.
 */

const log = createLogger("privacy.actions");

export interface PrivacyActionState {
  error?: string;
  notice?: string;
}

const eraseSchema = z.object({
  scope: z.enum(["brand", "account"]),
  brandId: z.string().uuid().optional(),
  confirmation: z.string().trim(),
});

const CONFIRM_WORD = "EXCLUIR";

export async function eraseDataAction(
  _prev: PrivacyActionState,
  formData: FormData,
): Promise<PrivacyActionState> {
  const session = await requireSessionContext();

  const parsed = eraseSchema.safeParse({
    scope: formData.get("scope"),
    brandId: formData.get("brandId") || undefined,
    confirmation: formData.get("confirmation"),
  });

  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  if (parsed.data.confirmation.toUpperCase() !== CONFIRM_WORD) {
    return { error: `Digite ${CONFIRM_WORD} em maiúsculas para confirmar.` };
  }

  try {
    if (parsed.data.scope === "brand") {
      if (!parsed.data.brandId) return { error: "Selecione a marca a excluir." };
      const result = await eraseBrand({
        tenantId: session.tenantId,
        brandId: parsed.data.brandId,
      });
      log.info("Exclusão de marca concluída", { tenantId: session.tenantId, ...result.deleted });
      return {
        notice: `Marca excluída: ${result.deleted.assets} ativo(s), ${result.deleted.knowledgeChunks} vetor(es), ${result.deleted.storageObjects} arquivo(s).${
          result.warnings.length > 0 ? ` Avisos: ${result.warnings.join(" ")}` : ""
        }`,
      };
    }

    const result = await eraseTenant({
      tenantId: session.tenantId,
      deleteAuthUser: true,
      userId: session.user.id,
    });

    log.info("Exclusão de conta concluída", { ...result.deleted });

    // Sessão deixa de existir; manda para a home pública.
    redirect("/?conta_excluida=1");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Falha na exclusão LGPD", { message });
    return {
      error: `Não foi possível concluir a exclusão: ${message}. Nada foi apagado parcialmente sem registro; tente novamente ou contate o suporte.`,
    };
  }
}
