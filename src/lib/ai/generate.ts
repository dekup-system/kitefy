import { generateObject, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { getServerEnv, isMockMode } from "@/lib/env";
import { getLanguageModel, supportsPromptCaching } from "@/lib/ai/models";
import { buildUsageEntry } from "@/lib/ai/usage";
import {
  SCHEMA_BY_ASSET,
  parseContentPayload,
  type ContentGenerationOutput,
} from "@/lib/ai/content-schemas";
import { generateMockContent, type MockGenerationInput } from "@/lib/ai/mock-generator";
import {
  buildBrandContextBlock,
  buildGuardrailPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  type GenerationPromptInput,
} from "@/lib/ai/prompts";
import type { AngleType, AssetType, Framework, TokenUsageEntry } from "@/types/domain";

/**
 * Camada única de geração de conteúdo.
 *
 * Responsabilidades:
 *  - escolher o modelo (economia x qualidade) por tipo de ativo;
 *  - aplicar Prompt Caching no contexto de marca quando o provider suporta;
 *  - validar a saída com zod e retentar (máx. 2) com os erros no prompt;
 *  - registrar uso de tokens por nó;
 *  - cair para o mock determinístico quando LLM_PROVIDER_MODE=mock.
 */

const MAX_ATTEMPTS = 3; // 1 tentativa + 2 retentativas

export interface GenerateAssetInput extends Omit<MockGenerationInput, "selectedArm" | "explorationArms"> {
  node: string;
  selectedArm: { angle_type: AngleType; framework: Framework };
  explorationArms: { angle_type: AngleType; framework: Framework }[];
}

export interface GenerateAssetResult {
  payload: ContentGenerationOutput;
  usage: TokenUsageEntry[];
  modelSpec: string;
  attempts: number;
  mode: "mock" | "live";
}

/**
 * Roteamento por tipo de ativo:
 *  - artigos GEO e Landing Pages -> modelo de qualidade (Sonnet);
 *  - kits e carrosséis -> modelo econômico (Gemini Flash / Haiku).
 */
export function modelSpecForAsset(assetType: AssetType): string {
  const env = getServerEnv();
  return assetType === "geo_article" || assetType === "lp_copy"
    ? env.MODEL_QUALITY
    : env.MODEL_ROUTER;
}

function schemaFor(assetType: AssetType): z.ZodType<unknown> {
  const schema = SCHEMA_BY_ASSET[assetType];
  if (!schema) throw new Error(`Sem schema de conteúdo para ${assetType}.`);
  return schema as z.ZodType<unknown>;
}

export async function generateAssetContent(input: GenerateAssetInput): Promise<GenerateAssetResult> {
  const modelSpec = modelSpecForAsset(input.assetType);

  if (isMockMode()) {
    const payload = generateMockContent({
      assetType: input.assetType,
      brand: input.brand,
      objective: input.objective,
      productInput: input.productInput,
      selectedArm: input.selectedArm,
      explorationArms: input.explorationArms,
      serpInsights: input.serpInsights ?? null,
    });
    // Revalida o mock com o mesmo schema do LLM: paridade de contrato.
    const validated = parseContentPayload(input.assetType, payload);
    return { payload: validated, usage: [], modelSpec: "mock:deterministic-v1", attempts: 1, mode: "mock" };
  }

  const model = getLanguageModel(modelSpec);
  const brandBlock = buildBrandContextBlock(input.brand);
  const systemPrompt = buildSystemPrompt(input.assetType);
  const cacheable = supportsPromptCaching(modelSpec);

  const promptInput: GenerationPromptInput = {
    assetType: input.assetType,
    objective: input.objective,
    productInput: input.productInput,
    selectedArm: input.selectedArm,
    explorationArms: input.explorationArms,
    serpInsights: input.serpInsights ?? null,
  };

  const previousErrors: string[] = [];
  let lastError: Error | null = null;
  const usageEntries: TokenUsageEntry[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const userPrompt = buildUserPrompt({ ...promptInput, previousErrors });

    const result = await generateObject({
      model,
      schema: schemaFor(input.assetType),
      messages: [
        {
          role: "system",
          content: `${brandBlock}\n\n${systemPrompt}`,
          ...(cacheable
            ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } } } }
            : {}),
        },
        { role: "user", content: userPrompt },
      ],
      temperature: input.assetType === "geo_article" ? 0.4 : 0.7,
      maxOutputTokens: input.assetType === "geo_article" ? 8000 : 2600,
      maxRetries: 0,
    });

    usageEntries.push(
      buildUsageEntry({ node: input.node, spec: modelSpec, usage: result.usage as LanguageModelUsage }),
    );

    try {
      const payload = parseContentPayload(input.assetType, result.object);
      return {
        payload,
        usage: usageEntries,
        modelSpec,
        attempts: attempt,
        mode: "live",
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = lastError.message;
      // Alimenta a próxima tentativa com o motivo objetivo da rejeição.
      previousErrors.length = 0;
      previousErrors.push(...message.replace(/^Payload inválido para \w+: /, "").split(" | ").slice(0, 6));
    }
  }

  throw new Error(
    `Geração reprovada após ${MAX_ATTEMPTS} tentativas (${input.assetType}): ${lastError?.message ?? "erro desconhecido"}`,
  );
}

// --- Guardrail LLM leve -------------------------------------------------------

const guardrailSchema = z.object({
  violations: z
    .array(
      z.object({
        rule: z.string().min(3).max(120),
        excerpt: z.string().min(1).max(240),
        severity: z.enum(["blocker", "warning"]),
      }),
    )
    .max(12),
});

export interface GuardrailReview {
  violations: { rule: string; excerpt: string; severity: "blocker" | "warning" }[];
  usage: TokenUsageEntry[];
}

/**
 * Revisão LLM leve. Em modo mock devolve lista vazia — o guardrail determinístico
 * (src/lib/compliance/rules.ts) continua sendo a barreira obrigatória.
 */
export async function reviewWithGuardrailModel(input: {
  text: string;
  assetType: AssetType;
}): Promise<GuardrailReview> {
  if (isMockMode()) {
    return { violations: [], usage: [] };
  }

  const env = getServerEnv();
  const model = getLanguageModel(env.MODEL_GUARDRAIL);

  const result = await generateObject({
    model,
    schema: guardrailSchema,
    messages: [
      {
        role: "system",
        content:
          "Você é um revisor de conformidade publicitária (CONAR). Seja objetivo e conservador. Responda apenas o JSON do schema.",
      },
      { role: "user", content: buildGuardrailPrompt(input) },
    ],
    temperature: 0,
    maxOutputTokens: 700,
    maxRetries: 0,
  });

  return {
    violations: result.object.violations,
    usage: [
      buildUsageEntry({
        node: "complianceGuardrail",
        spec: env.MODEL_GUARDRAIL,
        usage: result.usage as LanguageModelUsage,
      }),
    ],
  };
}

/** Serializa o payload inteiro para o guardrail (texto puro). */
export function flattenPayloadText(payload: ContentGenerationOutput): string {
  const parts: string[] = [];

  const walk = (value: unknown, key?: string): void => {
    if (typeof value === "string") {
      parts.push(key ? `${key}: ${value}` : value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        walk(childValue, childKey);
      }
    }
  };

  walk(payload);
  return parts.join("\n");
}
