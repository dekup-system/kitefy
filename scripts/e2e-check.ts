/**
 * Verificação ponta a ponta contra o projeto Supabase REAL.
 *
 * Uso: npx tsx scripts/e2e-check.ts
 *
 * Percorre o fluxo completo do produto sem interface:
 *   signup (trigger) → marca → conhecimento → grafo LangGraph (mock) →
 *   render Satori → Storage privado → aprovação → ativo + ganchos + débito →
 *   download do pacote de exportação.
 *
 * Cria um usuário de teste confirmado. Ao final imprime as credenciais para o
 * time entrar na UI e ver o ativo real (a conta pode ser excluída em
 * Configurações > Privacidade).
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { randomUUID } from "node:crypto";

const RESULTS: { step: string; ok: boolean; detail: string }[] = [];

function record(step: string, ok: boolean, detail: string): void {
  RESULTS.push({ step, ok, detail });
  console.log(`${ok ? "OK  " : "FALHA"} ${step.padEnd(38)} ${detail}`);
}

async function main(): Promise<void> {
  const { createSupabaseAdminClient } = await import("../src/lib/supabase/admin");
  const { getServerEnv } = await import("../src/lib/env");
  const { embedTexts, toPgVector } = await import("../src/lib/ai/embeddings");
  const { startStudioRun, resumeStudioRun } = await import("../src/lib/agent/runner");
  const { buildExportFile } = await import("../src/lib/export/pack");
  const { runTelemetryDistiller } = await import("../src/lib/agent/distiller");

  const env = getServerEnv();
  const admin = createSupabaseAdminClient();

  if (env.LLM_PROVIDER_MODE !== "mock") {
    console.warn("Aviso: LLM_PROVIDER_MODE != mock — este teste faria chamadas reais de LLM.");
  }

  // 1. Usuário de teste confirmado (o trigger cria tenant + membership + bônus)
  const stamp = Date.now();
  const email = `demo+${stamp}@kitefy.test`;
  const password = `Kitefy-${stamp}!`;
  const brandName = "Clínica Aurora (demo)";

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { brand_name: brandName },
  });

  if (created.error || !created.data.user) {
    record("criar usuário de teste", false, created.error?.message ?? "sem usuário");
    return;
  }
  const userId = created.data.user.id;
  record("criar usuário de teste", true, email);

  // 2. Trigger de signup
  const members = await admin
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .maybeSingle<{ tenant_id: string; role: string }>();

  if (!members.data) {
    record("trigger de signup", false, "nenhum tenant_member criado");
    return;
  }
  const tenantId = members.data.tenant_id;

  const tenant = await admin
    .from("tenants")
    .select("plan_tier, credit_balance")
    .eq("id", tenantId)
    .maybeSingle<{ plan_tier: string; credit_balance: number }>();

  record(
    "trigger de signup",
    members.data.role === "owner" && (tenant.data?.credit_balance ?? 0) === 10,
    `tenant ${tenantId.slice(0, 8)}… · role ${members.data.role} · saldo ${tenant.data?.credit_balance}`,
  );

  // 3. Marca + conhecimento
  const brand = await admin
    .from("brand_profiles")
    .insert({
      tenant_id: tenantId,
      brand_name: brandName,
      website_url: "https://aurora.example.com",
      icp_description:
        "Adultos de 30 a 55 anos que buscam acompanhamento preventivo com previsibilidade.",
      tone_of_voice: {
        archetype: "especialista acessível",
        descriptors: ["direto", "cuidadoso"],
        avoid: ["promessa milagrosa"],
      },
      visual_tokens: {
        primary: "#0f3d3e",
        secondary: "#e7f2f1",
        accent: "#1f7a6e",
        background: "#fbfdfc",
        foreground: "#12211f",
        theme: "light",
        radius: 16,
      },
      entity_facts: [
        { claim: "Atende em São Paulo desde 2014", source_url: "https://aurora.example.com/sobre" },
      ],
    })
    .select("id")
    .single<{ id: string }>();

  if (brand.error || !brand.data) {
    record("criar marca", false, brand.error?.message ?? "sem id");
    return;
  }
  const brandId = brand.data.id;
  record("criar marca", true, `${brandName} (${brandId.slice(0, 8)}…)`);

  const chunks = [
    "Retenção nos três primeiros segundos é o indicador mais informativo em vídeo curto orgânico.",
    "Artigo que começa pelo fato direto, seguido de contexto e dado verificável, é citado com mais frequência por assistentes de IA.",
    "Marca que registra telemetria semanal aprende mais rápido do que marca que apenas publica.",
  ];
  const embeddings = await embedTexts(chunks);

  const inserted = await admin.from("knowledge_chunks").insert(
    chunks.map((content, index) => ({
      tenant_id: tenantId,
      brand_id: brandId,
      source_type: "brand_doc" as const,
      content,
      metadata: { seeded: true, index },
      embedding: toPgVector(embeddings[index] ?? []),
      performance_score: 0.6,
    })),
  );

  if (inserted.error) {
    record("indexar conhecimento", false, inserted.error.message);
  } else {
    record("indexar conhecimento", true, `${chunks.length} chunks com embedding 768d`);
  }

  // 4. Grafo completo (brandContext → bandit → geração → guardrail → render → interrupt)
  const threadId = randomUUID();
  const started = await startStudioRun({
    tenantId,
    brandId,
    threadId,
    objective: "Aumentar a retenção do conteúdo orgânico em vídeo curto",
    assetType: "typo_carousel",
    productInput: "acompanhamento preventivo em três etapas",
    researchEnabled: false,
    requestedBy: userId,
  });

  record(
    "pipeline até aprovação",
    started.status === "awaiting_approval" && started.view.draft !== null,
    `status ${started.status} · ${started.view.hooks.length} ganchos · ${started.view.visualPaths.length} imagens`,
  );

  // 5. Aprovação (interrupt → resume) com débito e persistência
  const approved = await resumeStudioRun({
    threadId,
    decision: { approved: true, selected_hook_index: 0 },
  });

  const assetId = approved.view.assetId;
  record(
    "aprovação + persistência",
    approved.status === "approved" && Boolean(assetId),
    `asset ${String(assetId).slice(0, 8)}… · status ${approved.status}`,
  );

  if (!assetId) return;

  // 6. Efeitos colaterais no banco
  const asset = await admin
    .from("campaigns_and_assets")
    .select("title, status, credits_charged, has_ai_imagery, visual_urls, json_ld")
    .eq("id", assetId)
    .maybeSingle<{
      title: string;
      status: string;
      credits_charged: number;
      visual_urls: string[];
      json_ld: unknown;
    }>();

  record(
    "ativo gravado",
    asset.data?.status === "approved",
    `"${asset.data?.title.slice(0, 42)}…" · ${asset.data?.credits_charged} crédito(s) · ${asset.data?.visual_urls.length} arquivo(s)`,
  );

  const hooks = await admin
    .from("hook_variants")
    .select("hook_text, is_selected")
    .eq("asset_id", assetId);

  // Só short_script_kit entrega 3 ganchos A/B; carrossel registra 1 gancho (o
  // título da capa) vinculado ao braço do bandit, e o aprendizado usa _meta.bandit_arm.
  const hookCount = hooks.data?.length ?? 0;
  const selectedCount = hooks.data?.filter((hook) => hook.is_selected).length ?? 0;
  record("ganchos do ativo", hookCount >= 1 && selectedCount === 1, `${hookCount} variante(s) · ${selectedCount} selecionada`);

  const ledger = await admin
    .from("credit_ledger")
    .select("delta, reason")
    .eq("tenant_id", tenantId)
    .eq("reference_id", assetId)
    .maybeSingle<{ delta: number; reason: string }>();

  record(
    "débito de crédito",
    ledger.data?.delta === -1,
    `${ledger.data?.delta} (${ledger.data?.reason})`,
  );

  const afterTenant = await admin
    .from("tenants")
    .select("credit_balance")
    .eq("id", tenantId)
    .maybeSingle<{ credit_balance: number }>();

  record("saldo atualizado", afterTenant.data?.credit_balance === 9, `saldo ${afterTenant.data?.credit_balance}`);

  // 7. Storage privado
  const firstPath = asset.data?.visual_urls[0];
  if (firstPath) {
    const bucket = env.SUPABASE_STORAGE_BUCKET;
    const download = await admin.storage.from(bucket).download(firstPath);
    const bytes = download.data ? (await download.data.arrayBuffer()).byteLength : 0;
    record(
      "Storage privado",
      !download.error && bytes > 10_000,
      `${firstPath.split("/").length} níveis · ${(bytes / 1024).toFixed(0)} KB · bucket ${bucket}`,
    );

    // 8. Pacote de exportação com o visual real
    const visual = download.data
      ? { fileName: firstPath.split("/").pop() ?? "slide.png", data: Buffer.from(await download.data.arrayBuffer()) }
      : null;

    const exported = buildExportFile({
      asset: {
        id: assetId,
        tenant_id: tenantId,
        brand_id: brandId,
        thread_id: threadId,
        asset_type: "typo_carousel",
        status: "approved",
        title: asset.data?.title ?? "Ativo",
        content_payload: (approved.view.draft ?? {}) as never,
        visual_urls: asset.data?.visual_urls ?? [],
        json_ld: null,
        credits_charged: 1,
        has_ai_imagery: false,
        created_at: new Date().toISOString(),
      },
      brandName,
      websiteUrl: "https://aurora.example.com",
      visuals: visual ? [visual] : [],
      format: "zip",
    });

    record(
      "pacote de exportação",
      exported.buffer.length > 50_000 && exported.buffer.subarray(0, 2).toString() === "PK",
      `${exported.fileName} · ${(exported.buffer.length / 1024).toFixed(0)} KB`,
    );
  }

  // 9. Telemetria + aprendizado (bandit + reindexação)
  const telemetry = await admin.from("performance_telemetry").insert({
    tenant_id: tenantId,
    brand_id: brandId,
    asset_id: assetId,
    channel_label: "organic",
    impressions: 1000,
    views_3s: 420,
    source_mode: "manual",
  });

  if (telemetry.error) {
    record("registrar telemetria", false, telemetry.error.message);
  } else {
    const distilled = await runTelemetryDistiller({
      tenantId,
      brandId,
      assetId,
      hookRate: 0.42,
    });

    record(
      "distiller (bandit + reindex)",
      distilled.success && Boolean(distilled.armKey),
      `braço ${distilled.armKey} · reindexado ${distilled.reindexed}`,
    );

    const arm = await admin
      .from("bandit_arm_stats")
      .select("arm_key, alpha, beta, pulls")
      .eq("tenant_id", tenantId)
      .eq("brand_id", brandId)
      .maybeSingle<{ arm_key: string; alpha: number; beta: number; pulls: number }>();

    record(
      "estado do bandit",
      (arm.data?.pulls ?? 0) >= 1,
      `${arm.data?.arm_key} · α ${arm.data?.alpha} β ${arm.data?.beta} · ${arm.data?.pulls} pull(s)`,
    );
  }

  // 10. RLS com o token do próprio usuário (isolamento real)
  const tokenResponse = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  const accessToken = tokenPayload.access_token;
  if (accessToken) {
    const asUser = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/campaigns_and_assets?select=id`, {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const rows = (await asUser.json()) as unknown[];
    record("RLS do próprio tenant", Array.isArray(rows) && rows.length >= 1, `${rows.length} ativo(s) visível(is)`);
  }

  console.log("\n================ RESUMO ================");
  const failures = RESULTS.filter((item) => !item.ok);
  console.log(`Passos: ${RESULTS.length} · falhas: ${failures.length}`);
  for (const failure of failures) console.log(`  FALHA: ${failure.step} — ${failure.detail}`);

  console.log("\n=== ACESSO PARA VALIDAR NA UI ===");
  console.log(`  e-mail: ${email}`);
  console.log(`  senha:  ${password}`);
  console.log(`  tenant: ${tenantId}`);
  console.log(`  ativo:  ${assetId}`);
  console.log("  (exclua em Configurações > Privacidade quando terminar)");

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("\nFalha no e2e:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
