/**
 * Valida a chave do Google e o modelo de embeddings em modo live.
 *
 * Uso: npm run ai:check-embeddings
 *
 * Confere: chave presente, modelo respondendo, dimensão igual ao banco
 * (EMBEDDING_DIMENSION) e coerência semântica básica (textos parecidos ficam
 * próximos). Não grava nada no banco.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { cosineSimilarity, embedOne, embedTexts } from "../src/lib/ai/embeddings";
import { getServerEnv, isMockMode } from "../src/lib/env";

async function main(): Promise<void> {
  const env = getServerEnv();

  console.log(`modelo .....: ${env.MODEL_EMBEDDING}`);
  console.log(`dimensão ...: ${env.EMBEDDING_DIMENSION}`);
  console.log(`modo .......: ${env.LLM_PROVIDER_MODE}`);

  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(
      [
        "",
        "GOOGLE_GENERATIVE_AI_API_KEY ausente.",
        "",
        "Onde obter:",
        "  1. https://aistudio.google.com/apikey",
        "  2. 'Create API key' > escolha (ou crie) um projeto do Google Cloud",
        "  3. Copie a chave e cole no .env.local:",
        "       GOOGLE_GENERATIVE_AI_API_KEY=AIza...",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  if (isMockMode()) {
    console.warn(
      "\nAviso: LLM_PROVIDER_MODE=mock. O teste abaixo vai usar o mock local e não valida a chave.",
    );
  }

  const started = Date.now();
  let vector: number[];
  try {
    vector = await embedOne("acompanhamento preventivo em três etapas");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nFALHOU ao gerar embedding: ${message}`);
    console.error(
      [
        "Causas comuns:",
        "  • chave inválida ou revogada (401/403)",
        "  • 'Generative Language API' não habilitada no projeto",
        "  • modelo inexistente para a sua conta (ajuste MODEL_EMBEDDING)",
        "  • cota gratuita esgotada",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const ms = Date.now() - started;
  console.log(`\nembedding OK: ${vector.length} dimensões em ${ms} ms`);

  if (vector.length !== env.EMBEDDING_DIMENSION) {
    console.error(
      `Dimensão divergente: recebi ${vector.length}, esperado ${env.EMBEDDING_DIMENSION}. ` +
        "Ajuste EMBEDDING_DIMENSION e a coluna vector(N) juntos.",
    );
    process.exitCode = 1;
    return;
  }

  // Sanidade semântica: frases do mesmo tema devem ficar mais próximas.
  const [a, b, c] = await embedTexts([
    "retenção nos três primeiros segundos do vídeo",
    "o gancho precisa segurar a atenção nos primeiros segundos",
    "tabela de preços do plano de assinatura anual",
  ]);

  const related = cosineSimilarity(a ?? [], b ?? []);
  const unrelated = cosineSimilarity(a ?? [], c ?? []);
  console.log(`similaridade (mesmo tema) ....: ${related.toFixed(3)}`);
  console.log(`similaridade (tema distinto) .: ${unrelated.toFixed(3)}`);

  if (!(related > unrelated)) {
    console.error("\nSuspeita: o modelo não separou temas relacionados de distintos.");
    process.exitCode = 1;
    return;
  }

  console.log("\nChave validada. Pode usar em produção.");
}

main().catch((error: unknown) => {
  console.error("Falha:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
