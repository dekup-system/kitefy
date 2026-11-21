import { afterEach, describe, expect, it } from "vitest";
import { cleanEnvironment, getServerEnv, resetEnvCache } from "@/lib/env";

/**
 * Regressão: painéis de deploy e arquivos .env escrevem a chave com valor vazio.
 * Para o zod, "" não é "ausente" — sem tratamento, o boot inteiro falha.
 */
describe("Validação de ambiente", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    resetEnvCache();
  });

  it("trata string vazia como ausente", () => {
    const cleaned = cleanEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: "",
      ANTHROPIC_API_KEY: "   ",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });

    expect(cleaned.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(cleaned.ANTHROPIC_API_KEY).toBeUndefined();
    expect(cleaned.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("sobe em modo mock com chaves vazias (cenário real do painel)", () => {
    process.env = {
      ...original,
      LLM_PROVIDER_MODE: "mock",
      NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_0000000000000000000000",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_DB_URL: "",
      ANTHROPIC_API_KEY: "",
      SERPER_API_KEY: "",
      MP_ACCESS_TOKEN: "",
      GA4_WEBHOOK_SECRET: "",
      EMBEDDING_DIMENSION: "",
    };
    resetEnvCache();

    const env = getServerEnv();
    expect(env.LLM_PROVIDER_MODE).toBe("mock");
    expect(env.EMBEDDING_DIMENSION).toBe(768);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.SUPABASE_STORAGE_BUCKET).toBe("brand-assets");
  });

  it("rejeita dimensão de embedding acima do limite do HNSW", () => {
    process.env = { ...original, EMBEDDING_DIMENSION: "4096" };
    resetEnvCache();

    expect(() => getServerEnv()).toThrow(/Ambiente inválido/);
  });

  it("rejeita URL inválida do Supabase", () => {
    process.env = { ...original, NEXT_PUBLIC_SUPABASE_URL: "nao-e-url" };
    resetEnvCache();

    expect(() => getServerEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
