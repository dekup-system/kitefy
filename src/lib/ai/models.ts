import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel } from "ai";
import { getServerEnv } from "@/lib/env";

/**
 * Roteamento de modelos por especificação "provider:model-id".
 *
 * Economia + qualidade:
 *  - roteamento, classificação, guardrails e kits rápidos -> Gemini Flash ou Haiku;
 *  - artigos SEO/GEO e Landing Pages -> Sonnet com Prompt Caching;
 *  - embeddings -> Gemini Embedding com dimensão fixa (<= 2000).
 */

export type ProviderId = "anthropic" | "google" | "openai" | "deepseek";

export interface ModelSpec {
  provider: ProviderId;
  modelId: string;
  raw: string;
}

const KNOWN_PROVIDERS: readonly ProviderId[] = ["anthropic", "google", "openai", "deepseek"];

/**
 * Base URL de provedores compatíveis com a API da OpenAI.
 * A DeepSeek expõe `/v1` no mesmo formato de chat completions.
 */
const OPENAI_COMPATIBLE_BASE_URL: Partial<Record<ProviderId, string>> = {
  deepseek: "https://api.deepseek.com/v1",
};

export function parseModelSpec(raw: string): ModelSpec {
  const trimmed = raw.trim();
  const separator = trimmed.indexOf(":");
  if (separator <= 0 || separator === trimmed.length - 1) {
    throw new Error(`MODEL spec inválida: "${raw}". Use o formato provider:model-id.`);
  }

  const provider = trimmed.slice(0, separator);
  const modelId = trimmed.slice(separator + 1);

  if (!KNOWN_PROVIDERS.includes(provider as ProviderId)) {
    throw new Error(`Provider desconhecido em "${raw}". Aceitos: ${KNOWN_PROVIDERS.join(", ")}.`);
  }

  return { provider: provider as ProviderId, modelId, raw: trimmed };
}

type AnyProvider = ReturnType<typeof createAnthropic>;

/**
 * Os providers do AI SDK têm interfaces estruturais distintas
 * (Anthropic tem `messages`, Google tem `embedding`, etc.), mas todos são
 * chamáveis com um model id. Normalizamos para esta forma estreita.
 */
type CallableProvider = ((modelId: string) => LanguageModel) & {
  embedding?: (modelId: string) => unknown;
};

const providerCache = new Map<ProviderId, CallableProvider>();

function providerInstance(id: ProviderId): CallableProvider {
  const cached = providerCache.get(id);
  if (cached) return cached;

  const env = getServerEnv();

  let instance: AnyProvider;
  switch (id) {
    case "anthropic": {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY ausente para o provider anthropic.");
      }
      instance = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
      break;
    }
    case "google": {
      if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error("GOOGLE_GENERATIVE_AI_API_KEY ausente para o provider google.");
      }
      instance = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }) as unknown as AnyProvider;
      break;
    }
    case "openai": {
      if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY ausente para o provider openai.");
      }
      instance = createOpenAI({ apiKey: env.OPENAI_API_KEY }) as unknown as AnyProvider;
      break;
    }
    case "deepseek": {
      if (!env.DEEPSEEK_API_KEY) {
        throw new Error(
          "DEEPSEEK_API_KEY ausente para o provider deepseek. Gere a chave em platform.deepseek.com.",
        );
      }
      // DeepSeek é compatível com a API de chat da OpenAI. Usamos .chat() porque
      // a Responses API da OpenAI não existe neste provedor.
      const deepseek = createOpenAI({
        apiKey: env.DEEPSEEK_API_KEY,
        baseURL: OPENAI_COMPATIBLE_BASE_URL.deepseek,
        name: "deepseek",
      });
      instance = ((modelId: string) => deepseek.chat(modelId)) as unknown as AnyProvider;
      break;
    }
  }

  const callable = instance as unknown as CallableProvider;
  providerCache.set(id, callable);
  return callable;
}

/** Instância de LanguageModel pronta para streamText/generateObject. */
export function getLanguageModel(spec: string): LanguageModel {
  const parsed = parseModelSpec(spec);
  const provider = providerInstance(parsed.provider);
  return provider(parsed.modelId) as LanguageModel;
}

/** Modelo de embedding com dimensão fixa configurada por ambiente. */
export function getEmbeddingModel(): EmbeddingModel {
  const env = getServerEnv();
  const parsed = parseModelSpec(env.MODEL_EMBEDDING);

  if (parsed.provider !== "google") {
    throw new Error(
      `MODEL_EMBEDDING deve usar o provider google (recebido: ${parsed.provider}).`,
    );
  }

  const provider = providerInstance("google");
  if (typeof provider.embedding !== "function") {
    throw new Error("O provider google não expôs o método embedding().");
  }

  return provider.embedding(parsed.modelId) as EmbeddingModel;
}

/** Somente para testes. */
export function resetProviderCache(): void {
  providerCache.clear();
}

/**
 * O provedor garante JSON Schema nativo (saída estruturada "de verdade")?
 *
 * A DeepSeek só garante "é JSON", não "é este JSON" — para ela usamos prompt +
 * parse + validação zod com retentativa (src/lib/ai/generate.ts).
 */
export function supportsStructuredOutputs(spec: string): boolean {
  try {
    return parseModelSpec(spec).provider !== "deepseek";
  } catch {
    return false;
  }
}

/**
 * Capacidade de prompt caching: só modelos Anthropic suportam cacheControl.
 * Usado para decidir se o contexto de marca vai como bloco cacheado.
 * (A DeepSeek tem cache automático de prefixo, sem cabeçalho, e por isso não
 * precisa de nenhum código aqui.)
 */
export function supportsPromptCaching(spec: string): boolean {
  try {
    return parseModelSpec(spec).provider === "anthropic";
  } catch {
    return false;
  }
}
