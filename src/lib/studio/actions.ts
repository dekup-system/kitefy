"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { purgeStudioThread, readStudioRun, resumeStudioRun, runBelongsToTenant } from "@/lib/agent/runner";
import { getStudioGraph } from "@/lib/agent/graph";
import { replaceTextInPayload } from "@/lib/compliance/rewrite";
import { requireSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
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

  const snapshotBefore = !approved ? await readStudioRun(threadId).catch(() => null) : null;

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

  // Em rejeição, limpa os arquivos órfãos do rascunho no Storage e o checkpoint
  // para não acumular lixo nem reter dados descartados (LGPD + limite Storage).
  if (!approved) {
    const pathsToClean = snapshotBefore?.view.visualPaths ?? run.view.visualPaths ?? [];
    if (pathsToClean.length > 0) {
      try {
        const admin = createSupabaseAdminClient();
        const bucket = getServerEnv().SUPABASE_STORAGE_BUCKET;
        await admin.storage.from(bucket).remove(pathsToClean);
      } catch (cleanupError) {
        log.warn("Falha ao limpar visuais de rascunho rejeitado", {
          threadId,
          message: cleanupError instanceof Error ? cleanupError.message : "erro",
        });
      }
    }
    await purgeStudioThread(threadId).catch(() => undefined);
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
      : `/campaigns?rejeitado=1`,
  );
}

const markExportedSchema = z.object({
  assetId: z.string().uuid(),
  threadId: z.string().optional(),
});

export async function markAssetPostedAction(formData: FormData): Promise<void> {
  const session = await requireSessionContext();
  const parsed = markExportedSchema.safeParse({
    assetId: formData.get("assetId"),
    threadId: formData.get("threadId") || undefined,
  });

  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("campaigns_and_assets")
    .update({ status: "exported" })
    .eq("id", parsed.data.assetId)
    .eq("tenant_id", session.tenantId);

  if (parsed.data.threadId) {
    revalidatePath(`/studio/${parsed.data.threadId}`);
  }
  revalidatePath("/campaigns");
  revalidatePath("/app");
}

const complianceFixSchema = z.object({
  threadId: z.string().min(8).max(120),
  assetId: z.string().uuid().optional().or(z.literal("")),
  original: z.string().trim().min(1).max(400),
  replacement: z.string().trim().min(1).max(500),
});

/**
 * Aplica em 1 clique uma sugestão de reescrita CONAR no rascunho ou ativo salvo.
 */
export async function applyComplianceFixAction(formData: FormData): Promise<void> {
  const session = await requireSessionContext();
  const parsed = complianceFixSchema.safeParse({
    threadId: formData.get("threadId"),
    assetId: formData.get("assetId") ?? "",
    original: formData.get("original"),
    replacement: formData.get("replacement"),
  });

  if (!parsed.success) return;
  const { threadId, assetId, original, replacement } = parsed.data;

  const supabase = await createSupabaseServerClient();

  if (assetId) {
    const { data: asset } = await supabase
      .from("campaigns_and_assets")
      .select("id, content_payload")
      .eq("id", assetId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle<{ id: string; content_payload: Record<string, unknown> }>();

    if (asset?.content_payload) {
      const { updated, changed } = replaceTextInPayload(asset.content_payload, original, replacement);
      if (changed) {
        await supabase
          .from("campaigns_and_assets")
          .update({ content_payload: updated })
          .eq("id", asset.id)
          .eq("tenant_id", session.tenantId);
      }
    }
  }

  const owns = await runBelongsToTenant(threadId, session.tenantId).catch(() => false);
  if (owns) {
    const run = await readStudioRun(threadId).catch(() => null);
    if (run?.view.draft) {
      const { updated } = replaceTextInPayload(run.view.draft, original, replacement);
      const nextViolations = (run.view.compliance?.violations ?? []).filter(
        (v) => v.excerpt.trim().toLowerCase() !== original.trim().toLowerCase(),
      );
      const nextCompliance = run.view.compliance
        ? {
            ...run.view.compliance,
            violations: nextViolations,
            approved: nextViolations.every((v) => v.severity !== "blocker"),
          }
        : null;

      await getStudioGraph()
        .updateState(
          { configurable: { thread_id: threadId } },
          {
            draftPayload: updated,
            ...(nextCompliance ? { complianceReport: nextCompliance } : {}),
          },
        )
        .catch(() => undefined);
    }
  }

  revalidatePath(`/studio/${threadId}`);
  revalidatePath("/campaigns");
}
