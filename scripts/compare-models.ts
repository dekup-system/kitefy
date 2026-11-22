/**
 * Compara modelos no MESMO briefing e na mesma marca.
 *
 * Uso: npx tsx scripts/compare-models.ts
 *      npx tsx scripts/compare-models.ts deepseek:deepseek-chat deepseek:deepseek-flash
 *
 * Mede, por modelo: sucesso, tentativas (taxa de retry do schema), latência,
 * tokens e custo estimado. Não toca no banco — usa um perfil de marca fixo.
 *
 * Requer LLM_PROVIDER_MODE=live e a chave do provedor no .env.local.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { generateAssetContent } from "../src/lib/ai/generate";
import { estimateCostUsd } from "../src/lib/ai/usage";
import type { BrandContext } from "../src/types/domain";

const brand: BrandContext = {
  brand_id: "11111111-1111-1111-1111-111111111111",
  brand_name: "Clínica Aurora",
  website_url: "https://aurora.example.com",
  icp_description:
    "Adultos de 30 a 55 anos que buscam acompanhamento preventivo com previsibilidade e sem promessas milagrosas.",
  tone_of_voice: {
    archetype: "especialista acessível",
    descriptors: ["direto", "cuidadoso", "com dado"],
    avoid: ["promessa milagrosa", "antes e depois"],
    reading_level: "ensino médio",
    exemplars: ["Explicamos o porquê antes do como."],
  },
  visual_tokens: { primary: "#0f3d3e", background: "#fbfdfc" },
  entity_facts: [
    { claim: "Atende em São Paulo desde 2014", source_url: "https://aurora.example.com/sobre" },
    { claim: "Protocolo de avaliação em três etapas" },
  ],
  top_chunks: [
    {
      content:
        "Retenção nos três primeiros segundos é o indicador mais informativo em vídeo curto orgânico.",
      source_type: "winning_post",
      similarity: 0.91,
    },
  ],
};

interface Row {
  spec: string;
  ok: boolean;
  attempts: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  detail: string;
}

async function runOne(spec: string): Promise<Row> {
  const started = Date.now();
  try {
    const result = await generateAssetContent({
      node: "compareModels",
      assetType: "short_script_kit",
      brand,
      objective: "Explicar por que consistência editorial vence volume no orgânico",
      productInput: "acompanhamento preventivo em três etapas",
      selectedArm: { angle_type: "vace_pattern_interrupt", framework: "hook_body_payoff" },
      explorationArms: [
        { angle_type: "contrarian_frame", framework: "pas" },
        { angle_type: "outcome_anchored", framework: "aida" },
      ],
      serpInsights: null,
    });

    const usage = result.usage.reduce(
      (acc, entry) => ({
        inputTokens: acc.inputTokens + entry.input_tokens,
        outputTokens: acc.outputTokens + entry.output_tokens,
      }),
      { inputTokens: 0, outputTokens: 0 },
    );

    const costUsd = estimateCostUsd(spec, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      inputTokenDetails: { noCacheTokens: usage.inputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
    } as never);

    const hook = result.payload.kind === "short_script_kit" ? result.payload.hooks[0]?.hook_text : "";
    return {
      spec,
      ok: true,
      attempts: result.attempts,
      ms: Date.now() - started,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
      detail: (hook ?? "").slice(0, 70),
    };
  } catch (error) {
    return {
      spec,
      ok: false,
      attempts: 0,
      ms: Date.now() - started,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      detail: error instanceof Error ? error.message.slice(0, 110) : String(error).slice(0, 110),
    };
  }
}

async function main(): Promise<void> {
  const specs =
    process.argv.slice(2).length > 0
      ? process.argv.slice(2)
      : ["deepseek:deepseek-chat", "deepseek:deepseek-flash"];

  if ((process.env.LLM_PROVIDER_MODE ?? "mock") !== "live") {
    console.warn("Aviso: LLM_PROVIDER_MODE não é 'live' — o resultado será o mock, igual para todos.\n");
  }

  console.log(`Comparando ${specs.length} modelo(s) no mesmo briefing…\n`);

  for (const spec of specs) {
    const row = await runOne(spec);
    const status = row.ok ? "OK  " : "FALHA";
    console.log(`${status} ${spec.padEnd(32)} tentativas=${row.attempts} ${String(row.ms).padStart(6)}ms`);
    console.log(
      `      tokens: ${row.inputTokens} in / ${row.outputTokens} out · custo estimado US$ ${row.costUsd.toFixed(5)}`,
    );
    console.log(`      ${row.detail}\n`);
  }

  console.log("Como ler: 'tentativas=1' significa que o schema foi respeitado na primeira resposta.");
  console.log("Acima de 2 com frequência indica que o prompt precisa de exemplo de saída.");
}

main().catch((error: unknown) => {
  console.error("Falha:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
