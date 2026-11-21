import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSerpProvider,
  resetSerpCache,
  searchWithCache,
  searchWithProviderCache,
} from "@/lib/serp/client";
import { resetEnvCache } from "@/lib/env";
import type { SerpProvider, SerpSearchInput } from "@/lib/serp/types";

const ORIGINAL_ENV = {
  SERP_PROVIDER: process.env.SERP_PROVIDER,
  SERPER_API_KEY: process.env.SERPER_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetEnvCache();
  resetSerpCache();
}

function useEnv(provider: string, apiKey?: string): void {
  process.env.SERP_PROVIDER = provider;
  if (apiKey === undefined) {
    delete process.env.SERPER_API_KEY;
  } else {
    process.env.SERPER_API_KEY = apiKey;
  }
  resetEnvCache();
  resetSerpCache();
}

const INPUT: SerpSearchInput = {
  query: "marketing de conteúdo para clínicas",
  locale: "pt-BR",
  num: 10,
};

beforeEach(() => {
  resetEnvCache();
  resetSerpCache();
});

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
});

describe("provider mock", () => {
  it("é determinístico para a mesma query", async () => {
    useEnv("mock");
    const provider = createSerpProvider();

    const first = await provider.search(INPUT);
    const second = await provider.search(INPUT);

    expect(first).toEqual(second);
    expect(first.provider).toBe("mock");
    expect(first.query).toBe(INPUT.query);
    expect(first.people_also_ask).toHaveLength(5);
    expect(first.competitor_gaps).toHaveLength(3);
    expect(first.recent_facts).toHaveLength(3);
    expect(first.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(first.fetched_at).toISOString()).toBe(first.fetched_at);

    for (const gap of first.competitor_gaps) {
      expect(gap.url).toMatch(/^https:\/\//);
      expect(gap.missing_topics.length).toBeGreaterThan(0);
    }
    for (const fact of first.recent_facts) {
      expect(fact.source_url).toMatch(/^https:\/\//);
    }
  });

  it("varia o resultado quando a query muda", async () => {
    useEnv("mock");
    const provider = createSerpProvider();

    const first = await provider.search(INPUT);
    const second = await provider.search({ ...INPUT, query: "otimização para IA" });

    expect(second.query).toBe("otimização para IA");
    expect(first.fetched_at === second.fetched_at && first.people_also_ask[0]?.question === second.people_also_ask[0]?.question).toBe(false);
  });
});

describe("cache", () => {
  it("reutiliza a mesma referência e não repete o fetch", async () => {
    useEnv("mock");
    const base = createSerpProvider();
    let calls = 0;
    const counting: SerpProvider = {
      id: "mock",
      search: async (input) => {
        calls += 1;
        return base.search(input);
      },
    };

    const first = await searchWithProviderCache(counting, INPUT, 60_000);
    const second = await searchWithProviderCache(counting, INPUT, 60_000);

    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  it("não compartilha cache entre queries diferentes", async () => {
    useEnv("mock");
    const base = createSerpProvider();
    let calls = 0;
    const counting: SerpProvider = {
      id: "mock",
      search: async (input) => {
        calls += 1;
        return base.search(input);
      },
    };

    await searchWithProviderCache(counting, INPUT, 60_000);
    await searchWithProviderCache(counting, { ...INPUT, query: "outra query" }, 60_000);

    expect(calls).toBe(2);
  });

  it("searchWithCache reutiliza o provedor padrão configurado", async () => {
    useEnv("mock");

    const first = await searchWithCache(INPUT);
    const second = await searchWithCache(INPUT);

    expect(second).toBe(first);
    expect(second.query).toBe(INPUT.query);
  });
});

describe("provider serper", () => {
  it("lança erro claro sem SERPER_API_KEY e não acessa a rede", async () => {
    useEnv("serper");
    const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));
    vi.stubGlobal("fetch", fetchSpy);

    const provider = createSerpProvider();
    await expect(provider.search(INPUT)).rejects.toThrow(/SERPER_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mapeia organic, peopleAlsoAsk e relatedSearches", async () => {
    useEnv("serper", "test-key-1234567890");

    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
        JSON.stringify({
          organic: [
            {
              title: "Guia de marketing para clínicas",
              link: "https://concorrente-a.com.br/guia",
              snippet: "Um guia de marketing para clínicas odontológicas.",
              position: 1,
            },
            {
              title: "Erros de comunicação",
              link: "https://concorrente-b.com.br/erros",
              snippet: "Erros comuns de comunicação.",
              position: 2,
            },
          ],
          peopleAlsoAsk: [
            { question: "Quanto custa marketing para clínicas?", snippet: "Depende do escopo." },
            { question: "Como medir retorno em clínicas?" },
          ],
          relatedSearches: [{ query: "agência para clínicas" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const provider = createSerpProvider();
    const result = await provider.search({ ...INPUT, num: 5 });

    expect(result.provider).toBe("serper");
    expect(result.query).toBe(INPUT.query);
    expect(result.people_also_ask).toHaveLength(2);
    expect(result.competitor_gaps).toHaveLength(2);
    expect(result.competitor_gaps[0]?.url).toBe("https://concorrente-a.com.br/guia");
    expect(result.competitor_gaps[0]?.missing_topics.length).toBeGreaterThan(0);
    expect(result.recent_facts[0]?.source_url).toBe("https://concorrente-a.com.br/guia");

    const call = fetchSpy.mock.calls[0];
    expect(call).toBeDefined();
    const init: RequestInit | undefined = call?.[1];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["X-API-KEY"]).toBe("test-key-1234567890");
    expect(headers?.["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.q).toBe(INPUT.query);
    expect(body.num).toBe(5);
    expect(body.gl).toBe("br");
    expect(body.hl).toBe("pt");
  });

  it("converte erro HTTP em mensagem acionável sem vazar a chave", async () => {
    useEnv("serper", "test-key-1234567890");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("quota exceeded for test-key-1234567890", { status: 429 }),
      ),
    );

    const provider = createSerpProvider();
    let captured: unknown;
    try {
      await provider.search(INPUT);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(Error);
    const message = captured instanceof Error ? captured.message : "";
    expect(message).toMatch(/HTTP 429/);
    expect(message).toMatch(/SERPER_API_KEY/);
    expect(message).not.toContain("test-key-1234567890");
  });
});

describe("provider gemini_grounding", () => {
  it("exige GOOGLE_GENERATIVE_AI_API_KEY sem chamar a rede", async () => {
    useEnv("gemini_grounding");
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    resetEnvCache();

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const provider = createSerpProvider();
    await expect(provider.search(INPUT)).rejects.toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
