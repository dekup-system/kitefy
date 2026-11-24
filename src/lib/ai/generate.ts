import { generateObject, generateText, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { getServerEnv, isMockMode } from "@/lib/env";
import { getLanguageModel, supportsPromptCaching, supportsStructuredOutputs } from "@/lib/ai/models";
import { buildUsageEntry } from "@/lib/ai/usage";
import {
  SCHEMA_BY_ASSET,
  normalizeGeoWordCount,
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
 * Dois caminhos de saída estruturada, escolhidos por capacidade do provedor:
 *
 *  1. `generateObject` (Anthropic/Google/OpenAI): o provedor é obrigado a
 *     respeitar o JSON Schema — a estrutura vem garantida.
 *  2. `generateText` + parse + zod (DeepSeek e afins): o provedor só garante
 *     "é JSON", não "é este JSON". Então extraímos o objeto, validamos contra o
 *     schema do tipo de ativo e retentamos com os erros no prompt.
 *
 * Em ambos os casos o contrato final é o mesmo (`parseContentPayload`), então a
 * UI, o render e a exportação nunca recebem payload fora de forma.
 */

const MAX_ATTEMPTS = 3; // 1 tentativa + 2 retentativas

export interface GenerateAssetInput
  extends Omit<MockGenerationInput, "selectedArm" | "explorationArms"> {
  node: string;
  selectedArm: { angle_type: AngleType; framework: Framework };
  explorationArms: { angle_type: AngleType; framework: Framework }[];
  /** Apontamentos do guardrail da tentativa anterior para orientar a regeneração. */
  complianceFeedback?: string[];
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
 *  - artigos GEO e Landing Pages -> modelo de qualidade;
 *  - kits e carrosséis -> modelo econômico.
 */
export function modelSpecForAsset(assetType: AssetType): string {
  const env = getServerEnv();
  return assetType === "geo_article" || assetType === "lp_copy"
    ? env.MODEL_QUALITY
    : env.MODEL_ROUTER;
}

/**
 * Contrato textual para provedores sem JSON Schema nativo (ex.: DeepSeek).
 *
 * Sem isso o modelo inventa nomes de campo ("titulo" em vez de "title") e a
 * validação reprova. O JSON Schema sai do MESMO zod que valida a resposta,
 * então contrato e validação nunca divergem.
 */
export function buildJsonContractFor(assetType: AssetType): string {
  const schema = schemaFor(assetType);

  let jsonSchema: string;
  try {
    jsonSchema = JSON.stringify(z.toJSONSchema(schema as z.ZodType), null, 2);
  } catch {
    return [
      "## CONTRATO DE SAÍDA",
      "Responda apenas com um objeto JSON válido, sem markdown e sem texto fora do JSON.",
      "Use exatamente as chaves descritas no formato solicitado.",
    ].join("\n");
  }

  return [
    "## CONTRATO DE SAÍDA (obrigatório)",
    "Responda APENAS com um objeto JSON que valide este JSON Schema.",
    "Não renomeie campos, não crie campos novos e não use markdown.",
    "```json",
    jsonSchema,
    "```",
  ].join("\n");
}

/**
 * Fecha o payload: recalcula campos que o modelo não sabe medir.
 * Hoje apenas `word_count` do artigo GEO — o número declarado é descartado e
 * substituído pela contagem real do texto.
 */
function finalizePayload(
  assetType: AssetType,
  payload: ContentGenerationOutput,
): ContentGenerationOutput {
  if (assetType === "geo_article" && payload.kind === "geo_article") {
    return { ...payload, word_count: normalizeGeoWordCount(payload) };
  }
  return payload;
}

function schemaFor(assetType: AssetType): z.ZodType<unknown> {
  const schema = SCHEMA_BY_ASSET[assetType];
  if (!schema) throw new Error(`Sem schema de conteúdo para ${assetType}.`);
  return schema as z.ZodType<unknown>;
}

/**
 * Extrai o primeiro objeto JSON de um texto de modelo.
 *
 * Tolera o que aparece na prática: bloco ```json, texto antes/depois e chaves
 * aninhadas. Lança erro com mensagem curta para alimentar a retentativa.
 */
export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Resposta vazia do modelo.");

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0) {
    throw new Error("A resposta não contém um objeto JSON.");
  }
  if (end <= start) {
    // Caso clássico de resposta cortada por limite de tokens: o texto para o
    // modelo é acionável ("fecha o objeto"), então vale a mensagem específica.
    throw new Error("Objeto JSON incompleto (resposta truncada).");
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON inválido";
    throw new Error(`JSON inválido: ${message}`);
  }
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
    const validated = finalizePayload(input.assetType, parseContentPayload(input.assetType, payload));
    return {
      payload: validated,
      usage: [],
      modelSpec: "mock:deterministic-v1",
      attempts: 1,
      mode: "mock",
    };
  }

  const model = getLanguageModel(modelSpec);
  const brandBlock = buildBrandContextBlock(input.brand);
  const systemPrompt = buildSystemPrompt(input.assetType);
  const cacheable = supportsPromptCaching(modelSpec);
  const structured = supportsStructuredOutputs(modelSpec);

  const promptInput: GenerationPromptInput = {
    assetType: input.assetType,
    objective: input.objective,
    productInput: input.productInput,
    selectedArm: input.selectedArm,
    explorationArms: input.explorationArms,
    serpInsights: input.serpInsights ?? null,
    brand: input.brand,
  };

  const previousErrors: string[] = [...(input.complianceFeedback ?? [])];
  let lastError: Error | null = null;
  const usageEntries: TokenUsageEntry[] = [];

  // Provedor sem JSON Schema nativo recebe o contrato textual no system prompt.
  const systemContent = structured
    ? `${brandBlock}\n\n${systemPrompt}`
    : `${brandBlock}\n\n${systemPrompt}\n\n${buildJsonContractFor(input.assetType)}`;

  const messages = (userContent: string) => [
    {
      role: "system" as const,
      content: systemContent,
      ...(cacheable
        ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } } } }
        : {}),
    },
    { role: "user" as const, content: userContent },
  ];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const userPrompt = buildUserPrompt({ ...promptInput, previousErrors });
    const attemptMessages = messages(userPrompt);
    const maxOutputTokens = input.assetType === "geo_article" ? 8000 : 2600;
    const temperature = input.assetType === "geo_article" ? 0.4 : 0.7;

    try {
      if (structured) {
        const result = await generateObject({
          model,
          schema: schemaFor(input.assetType),
          messages: attemptMessages,
          allowSystemInMessages: true,
          temperature,
          maxOutputTokens,
          maxRetries: 0,
        });

        usageEntries.push(
          buildUsageEntry({
            node: input.node,
            spec: modelSpec,
            usage: result.usage as LanguageModelUsage,
          }),
        );

        const payload = finalizePayload(
      input.assetType,
      parseContentPayload(input.assetType, result.object),
    );
        return { payload, usage: usageEntries, modelSpec, attempts: attempt, mode: "live" };
      }

      // Provedor sem JSON Schema nativo (ex.: DeepSeek): prompt + parse + zod.
      const result = await generateText({
        model,
        messages: attemptMessages,
        allowSystemInMessages: true,
        temperature,
        maxOutputTokens,
        maxRetries: 0,
      });

      usageEntries.push(
        buildUsageEntry({
          node: input.node,
          spec: modelSpec,
          usage: result.usage as LanguageModelUsage,
        }),
      );

      const payload = finalizePayload(
      input.assetType,
      parseContentPayload(input.assetType, parseJsonObject(result.text)),
    );
      return { payload, usage: usageEntries, modelSpec, attempts: attempt, mode: "live" };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      previousErrors.length = 0;
      if (input.complianceFeedback && input.complianceFeedback.length > 0) {
        previousErrors.push(...input.complianceFeedback);
      }
      previousErrors.push(
        ...lastError.message
          .replace(/^Payload inválido para \w+: /, "")
          .split(" | ")
          .slice(0, 6),
      );
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

interface GuardrailOutput {
  violations: { rule: string; excerpt: string; severity: "blocker" | "warning" }[];
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
  const spec = env.MODEL_GUARDRAIL;
  const model = getLanguageModel(spec);
  const structured = supportsStructuredOutputs(spec);

  const system =
    "Você é um revisor de conformidade publicitária (CONAR). Seja objetivo e conservador. Responda apenas o JSON do schema.";
  const user = buildGuardrailPrompt(input);

  let output: GuardrailOutput;
  let usage: LanguageModelUsage;

  if (structured) {
    const result = await generateObject({
      model,
      schema: guardrailSchema,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      allowSystemInMessages: true,
      temperature: 0,
      maxOutputTokens: 700,
      maxRetries: 0,
    });
    output = result.object;
    usage = result.usage as LanguageModelUsage;
  } else {
    const result = await generateText({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      allowSystemInMessages: true,
      temperature: 0,
      maxOutputTokens: 700,
      maxRetries: 0,
    });
    usage = result.usage as LanguageModelUsage;

    const parsed = guardrailSchema.safeParse(parseJsonObject(result.text));
    // Guardrail com resposta fora de forma não pode virar "aprovado": sem
    // violações declaradas, o determinístico continua sendo a única barreira.
    output = parsed.success ? parsed.data : { violations: [] };
  }

  return {
    violations: output.violations,
    usage: [buildUsageEntry({ node: "complianceGuardrail", spec, usage })],
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
