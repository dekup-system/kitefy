/**
 * Popula uma marca de demonstração com conhecimento e telemetria.
 *
 * Uso:
 *   npm run db:seed
 *
 * Requer SUPABASE_DB_URL (Postgres) e as extensões das migrations já aplicadas.
 * Idempotente: usa slug fixo e recria a marca demo se ela já existir.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { randomUUID } from "node:crypto";

async function main(): Promise<void> {
  const { getServerEnv } = await import("../src/lib/env");
  const { query, withTransaction, closePgPool } = await import("../src/lib/db/pg");
  const { embedTexts, toPgVector } = await import("../src/lib/ai/embeddings");

  const env = getServerEnv();
  if (!env.SUPABASE_DB_URL) {
    console.error(
      "SUPABASE_DB_URL ausente. Configure o Postgres do Supabase no .env.local e rode novamente.",
    );
    process.exitCode = 1;
    return;
  }

  const slug = "demo-brandpulse";

  const existing = await query<{ id: string }>("select id from public.tenants where slug = $1", [slug]);
  const tenantId = existing[0]?.id ?? randomUUID();

  if (existing.length === 0) {
    await withTransaction(async (client) => {
      await client.query(
        `insert into public.tenants (id, name, slug, plan_tier, credit_balance)
         values ($1, 'Marca Demo', $2, 'pro', 360)`,
        [tenantId, slug],
      );
      await client.query(
        `insert into public.credit_ledger (tenant_id, delta, reason, reference_id)
         values ($1, 360, 'seed_demo', 'seed')`,
        [tenantId],
      );
    });
    console.log(`Tenant demo criado (${tenantId}).`);
  } else {
    console.log(`Tenant demo existente (${tenantId}); recriando marca e dados.`);
  }

  const brandId = randomUUID();
  const chunks = [
    "Retenção nos três primeiros segundos é o indicador mais informativo em vídeo curto orgânico; visualizações totais medem distribuição, não interesse.",
    "Artigos que começam pelo fato direto, seguido de contexto e dado verificável, são citados com mais frequência em respostas de IA.",
    "Marca que registra telemetria semanal aprende mais rápido do que marca que apenas publica com frequência.",
    "Promessa de resultado absoluto em saúde e finanças invalida a peça publicitária e cria passivo jurídico.",
    "Carrossel tipográfico de 7 a 10 slides com título de até 8 palavras tem melhor leitura em feed do que texto corrido.",
  ];
  const embeddings = await embedTexts(chunks);

  await withTransaction(async (client) => {
    await client.query(
      `delete from public.brand_profiles where tenant_id = $1 and brand_name = 'Marca Demo'`,
      [tenantId],
    );

    await client.query(
      `insert into public.brand_profiles
         (id, tenant_id, brand_name, website_url, icp_description, tone_of_voice, visual_tokens, entity_facts)
       values ($1, $2, 'Marca Demo', 'https://demo.brandpulse.app',
               'Gestores de marketing em empresas de 50 a 500 pessoas, cobrados por previsibilidade.',
               $3::jsonb, $4::jsonb, $5::jsonb)`,
      [
        brandId,
        tenantId,
        JSON.stringify({
          archetype: "parceiro técnico",
          descriptors: ["direto", "com dado", "sem hype"],
          avoid: ["promessa garantida", "superlativo vazio"],
          reading_level: "superior",
          exemplars: ["O ganho aparece no fechamento do mês, não no dashboard."],
        }),
        JSON.stringify({
          primary: "#1b1f2a",
          secondary: "#eef1f6",
          accent: "#3f5efb",
          background: "#fbfbfd",
          foreground: "#14161c",
          theme: "light",
          radius: 10,
        }),
        JSON.stringify([
          {
            claim: "Implantação assistida em até 30 dias",
            source_url: "https://demo.brandpulse.app/implantacao",
          },
          {
            claim: "Suporte em português com SLA definido",
            source_url: "https://demo.brandpulse.app/sla",
          },
        ]),
      ],
    );

    for (const [index, text] of chunks.entries()) {
      await client.query(
        `insert into public.knowledge_chunks
           (tenant_id, brand_id, source_type, content, metadata, embedding, performance_score)
         values ($1, $2, 'brand_doc', $3, $4::jsonb, $5::extensions.vector, $6)`,
        [
          tenantId,
          brandId,
          text,
          JSON.stringify({ seeded: true, index }),
          toPgVector(embeddings[index] ?? []),
          0.5 + index * 0.05,
        ],
      );
    }

    for (const [arm, alpha, beta, pulls] of [
      ["vace_pattern_interrupt:pas", 14, 4, 18],
      ["contrarian_frame:hook_body_payoff", 9, 7, 16],
      ["outcome_anchored:aida", 5, 9, 14],
    ] as const) {
      await client.query(
        `insert into public.bandit_arm_stats (tenant_id, brand_id, arm_key, alpha, beta, pulls)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (tenant_id, brand_id, arm_key) do update
           set alpha = excluded.alpha, beta = excluded.beta, pulls = excluded.pulls`,
        [tenantId, brandId, arm, alpha, beta, pulls],
      );
    }

    for (const [impressions, views] of [
      [1200, 480],
      [980, 300],
      [1500, 690],
    ] as const) {
      await client.query(
        `insert into public.performance_telemetry
           (tenant_id, brand_id, channel_label, impressions, views_3s, source_mode)
         values ($1, $2, 'organic', $3, $4, 'manual')`,
        [tenantId, brandId, impressions, views],
      );
    }
  });

  console.log("Marca demo criada:");
  console.log(`  tenant: ${tenantId}`);
  console.log(`  brand:  ${brandId}`);
  console.log(`  ${chunks.length} chunks, 3 braços de bandit, 3 linhas de telemetria.`);
  console.log(
    "\nPara ver na UI, associe este tenant a um usuário:",
  );
  console.log(
    `  insert into public.tenant_members (tenant_id, user_id, role) values ('${tenantId}', '<uuid-do-usuario>', 'owner');`,
  );

  await closePgPool();
}

main().catch((error: unknown) => {
  console.error("Falha no seed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
