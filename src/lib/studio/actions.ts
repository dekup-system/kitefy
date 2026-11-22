"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resumeStudioRun, runBelongsToTenant } from "@/lib/agent/runner";
import { requireSessionContext } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

/**
 * Decisão humana sobre um ativo: aprovar (persiste + debita) ou rejeitar
 * (encerra sem débito). A gravação e o débito acontecem no nó finalizeAsset do
 * grafo, em transação no Postgres.
 */

const log = createLogger("studio.actions");

const decisionSchema = z.object({
  threadId: z.string().min(8).max(120),
  approved: z.enum(["true", "false"]).transform((value) => value === "true"),
  selectedHookIndex: z.coerce.number().int().min(0).max(2).optional(),
  title: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

export async function decideStudioRunAction(formData: FormData): Promise<void> {
  const session = await requireSessionContext();

  const parsed = decisionSchema.safeParse({
    threadId: formData.get("threadId"),
    approved: formData.get("approved"),
    selectedHookIndex: formData.get("selectedHookIndex") ?? undefined,
    title: formData.get("title") ?? undefined,
    note: formData.get("note") ?? undefined,
  });

  if (!parsed.success) {
    redirect(`/studio/${String(formData.get("threadId") ?? "")}?error=invalido`);
  }

  const { threadId, approved, selectedHookIndex, title, note } = parsed.data;

  // O thread precisa pertencer ao tenant da sessão (evita cross-tenant).
  const ownsThread = await runBelongsToTenant(threadId, session.tenantId).catch(() => false);
  if (!ownsThread) {
    log.warn("Tentativa de aprovar thread de outro tenant", { threadId, tenantId: session.tenantId });
    redirect(`/studio/${threadId}?erro=${encodeURIComponent("Este rascunho não pertence à sua conta.")}`);
  }

  let run;
  try {
    run = await resumeStudioRun({
      threadId,
      decision: {
        approved,
        selected_hook_index: selectedHookIndex,
        title: title?.trim() || undefined,
        note: note?.trim() || undefined,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao aplicar a decisão.";
    log.error("Falha ao retomar run", { threadId, message });
    redirect(`/studio/${threadId}?erro=${encodeURIComponent(message.slice(0, 240))}`);
  }

  log.info("Decisão registrada", {
    threadId,
    approved,
    tenantId: session.tenantId,
    status: run.status,
  });

  revalidatePath(`/studio/${threadId}`);
  revalidatePath("/campaigns");
  revalidatePath("/app");

  redirect(
    approved && run.view.assetId
      ? `/studio/${threadId}?aprovado=1`
      : `/studio/${threadId}?rejeitado=1`,
  );
}
