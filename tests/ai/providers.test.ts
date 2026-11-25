import { describe, expect, it } from "vitest";
import { buildJsonContractFor, parseJsonObject } from "@/lib/ai/generate";
import { parseModelSpec, supportsStructuredOutputs, supportsPromptCaching } from "@/lib/ai/models";
import { estimateCostUsd } from "@/lib/ai/usage";
import type { LanguageModelUsage } from "ai";

/**
 * Configuração "B": texto na DeepSeek, embeddings no Google.
 *
 * A DeepSeek não garante o schema, então o caminho de geração usa parse manual +
 * validação zod. Estes testes cobrem as peças puras desse caminho e o roteamento
 * de modelos por string `provider:modelo`.
 */

function usage(partial: Partial<LanguageModelUsage>): LanguageModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    ...partial,
  } as LanguageModelUsage;
}

describe("parseModelSpec", () => {
  it("aceita deepseek e google", () => {
    expect(parseModelSpec("deepseek:deepseek-chat")).toEqual({
      provider: "deepseek",
      modelId: "deepseek-chat",
      raw: "deepseek:deepseek-chat",
    });
    expect(parseModelSpec("google:gemini-embedding-2").provider).toBe("google");
  });

  it("recusa provider desconhecido e spec sem separador", () => {
    expect(() => parseModelSpec("acme:modelo")).toThrow(/Provider desconhecido/);
    expect(() => parseModelSpec("deepseek")).toThrow(/MODEL spec inválida/);
  });
});

describe("capacidades por provedor", () => {
  it("DeepSeek não garante JSON Schema; Google/Anthropic garantem", () => {
    expect(supportsStructuredOutputs("deepseek:deepseek-chat")).toBe(false);
    expect(supportsStructuredOutputs("google:gemini-3-flash-preview")).toBe(true);
    expect(supportsStructuredOutputs("anthropic:claude-sonnet-5-5")).toBe(true);
  });

  it("só Anthropic usa cacheControl explícito", () => {
    expect(supportsPromptCaching("anthropic:claude-sonnet-5-5")).toBe(true);
    expect(supportsPromptCaching("deepseek:deepseek-chat")).toBe(false);
    expect(supportsPromptCaching("google:gemini-3-flash-preview")).toBe(false);
  });
});

describe("contrato JSON para provedores sem schema nativo", () => {
  it("inclui o schema do tipo de ativo e as chaves obrigatórias", () => {
    const contract = buildJsonContractFor("short_script_kit");
    expect(contract).toContain("CONTRATO DE SAÍDA");
    expect(contract).toContain('"kind"');
    expect(contract).toContain('"hooks"');
    expect(contract).toContain("short_script_kit");
  });

  it("carrega os limites de palavra que o refine não expõe no JSON Schema", () => {
    const contract = buildJsonContractFor("short_script_kit");
    expect(contract).toMatch(/entre 8 e 15 palavras/);
  });

  it("carrega o limite de slides do carrossel", () => {
    const contract = buildJsonContractFor("typo_carousel");
    expect(contract).toContain('"minItems": 5');
    expect(contract).toContain('"maxItems": 10');
  });
});

describe("parseJsonObject", () => {
  it("lê JSON puro", () => {
    expect(parseJsonObject('{"kind":"x","n":1}')).toEqual({ kind: "x", n: 1 });
  });

  it("remove cerca de código markdown", () => {
    const text = '```json\n{"kind":"short_script_kit"}\n```';
    expect(parseJsonObject(text)).toEqual({ kind: "short_script_kit" });
  });

  it("ignora texto antes e depois do objeto", () => {
    const text = 'Aqui está o ativo:\n{"a":{"b":[1,2]}}\nEspero que ajude.';
    expect(parseJsonObject(text)).toEqual({ a: { b: [1, 2] } });
  });

  it("falha com mensagem curta quando não há objeto", () => {
    expect(() => parseJsonObject("desculpe, não consigo")).toThrow(/não contém um objeto JSON/);
  });

  it("falha em JSON truncado", () => {
    expect(() => parseJsonObject('{"a": 1, "b":')).toThrow(/incompleto/);
  });

  it("falha em resposta vazia", () => {
    expect(() => parseJsonObject("   ")).toThrow(/vazia/);
  });
});

describe("custo estimado por provedor", () => {
  it("DeepSeek é mais barato que Claude para o mesmo volume", () => {
    const u = usage({ inputTokens: 20_000, outputTokens: 4_000 });
    const deepseek = estimateCostUsd("deepseek:deepseek-chat", u);
    const claude = estimateCostUsd("anthropic:claude-sonnet-5-5", u);
    expect(deepseek).toBeLessThan(claude);
    // 20k entrada * 0.27 + 4k saída * 1.10 = 0.0054 + 0.0044 = 0.0098
    expect(deepseek).toBeCloseTo(0.0098, 4);
  });

  it("cache hit da DeepSeek reduz o custo de entrada", () => {
    const semCache = estimateCostUsd("deepseek:deepseek-chat", usage({ inputTokens: 100_000 }));
    const comCache = estimateCostUsd(
      "deepseek:deepseek-chat",
      usage({
        inputTokens: 100_000,
        inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 100_000, cacheWriteTokens: 0 },
      }),
    );
    expect(comCache).toBeLessThan(semCache);
    expect(comCache).toBeCloseTo(0.007, 5);
  });
});
