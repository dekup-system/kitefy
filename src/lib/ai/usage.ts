import type { TokenUsageEntry } from "@/types/domain";
import type { LanguageModelUsage } from "ai";

/**
 * Estimativa de custo por 1M de tokens (USD), usada apenas para observabilidade
 * e para o painel de uso. NÃO é cobrança: a cobrança real é do provedor.
 * Valores conservadores — ajuste aqui se a tabela de preços mudar.
 */
const PRICE_PER_MILLION: Record<string, { input: number; output: number; cachedInput: number }> = {
  "anthropic:claude-sonnet-5-5": { input: 3, output: 15, cachedInput: 0.3 },
  "anthropic:claude-haiku-5-5": { input: 0.8, output: 4, cachedInput: 0.08 },
  "google:gemini-3-flash-preview": { input: 0.3, output: 2.5, cachedInput: 0.075 },
  "google:gemini-embedding-2": { input: 0.15, output: 0, cachedInput: 0.15 },
  // DeepSeek: cache miss ~0.27, cache hit ~0.07, saída ~1.10 (USD/1M tokens).
  "deepseek:deepseek-chat": { input: 0.27, output: 1.1, cachedInput: 0.07 },
  "deepseek:deepseek-reasoner": { input: 0.55, output: 2.19, cachedInput: 0.14 },
  "openai:gpt-5-mini": { input: 0.25, output: 2, cachedInput: 0.025 },
};

const FALLBACK_PRICE = { input: 1, output: 5, cachedInput: 0.1 };

export function estimateCostUsd(spec: string, usage: LanguageModelUsage): number {
  const price = PRICE_PER_MILLION[spec] ?? FALLBACK_PRICE;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const uncachedInput = Math.max(0, inputTokens - cachedTokens);

  const cost =
    (uncachedInput / 1_000_000) * price.input +
    (cachedTokens / 1_000_000) * price.cachedInput +
    (outputTokens / 1_000_000) * price.output;

  // Arredonda para 6 casas para não poluir o JSONB.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function buildUsageEntry(input: {
  node: string;
  spec: string;
  usage: LanguageModelUsage;
}): TokenUsageEntry {
  const [provider = "unknown", model = input.spec] = input.spec.split(":");
  const usage = input.usage;

  return {
    node: input.node,
    provider,
    model,
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    cached_tokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cost_usd: estimateCostUsd(input.spec, usage),
  };
}

export function sumUsage(entries: TokenUsageEntry[]): {
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number;
} {
  return entries.reduce(
    (acc, entry) => ({
      input_tokens: acc.input_tokens + entry.input_tokens,
      output_tokens: acc.output_tokens + entry.output_tokens,
      cached_tokens: acc.cached_tokens + entry.cached_tokens,
      cost_usd: Math.round((acc.cost_usd + entry.cost_usd) * 1_000_000) / 1_000_000,
    }),
    { input_tokens: 0, output_tokens: 0, cached_tokens: 0, cost_usd: 0 },
  );
}
