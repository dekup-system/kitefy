import { z } from "zod";

/**
 * Validação de ambiente.
 *
 * Regras:
 *  - NUNCA lançar no import: rotas importam este módulo e o build da Vercel
 *    roda sem todas as chaves. A validação acontece quando `getServerEnv()` é
 *    chamado dentro do handler.
 *  - `LLM_PROVIDER_MODE=mock` permite rodar o produto inteiro (dev/CI) sem
 *    nenhuma chave externa, mantendo o mesmo contrato de dados.
 */

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- Supabase --------------------------------------------------------------
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_DB_URL: z.string().min(10).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("brand-assets"),

  // --- Provedores ------------------------------------------------------------
  LLM_PROVIDER_MODE: z.enum(["mock", "live"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  DEEPSEEK_API_KEY: z.string().min(10).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(10).optional(),
  OPENAI_API_KEY: z.string().min(10).optional(),

  MODEL_ROUTER: z.string().default("deepseek:deepseek-chat"),
  MODEL_QUALITY: z.string().default("deepseek:deepseek-chat"),
  MODEL_GUARDRAIL: z.string().default("deepseek:deepseek-chat"),
  MODEL_EMBEDDING: z.string().default("google:gemini-embedding-2"),
  EMBEDDING_DIMENSION: z.coerce.number().int().min(64).max(2000).default(768),

  // --- SERP ------------------------------------------------------------------
  SERP_PROVIDER: z.enum(["serper", "gemini_grounding", "mock"]).default("mock"),
  SERPER_API_KEY: z.string().min(10).optional(),

  // --- Imagens ---------------------------------------------------------------
  IMAGE_PROVIDER: z.enum(["none", "google_nano_banana", "seedream", "mock"]).default("none"),
  IMAGE_PROVIDER_API_KEY: z.string().min(10).optional(),

  // --- GA4 (telemetria) ------------------------------------------------------
  GA4_WEBHOOK_SECRET: z.string().min(16).optional(),

  // --- Mercado Pago ----------------------------------------------------------
  MP_ACCESS_TOKEN: z.string().min(10).optional(),
  MP_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  NEXT_PUBLIC_MP_PUBLIC_KEY: z.string().min(10).optional(),
  MP_WEBHOOK_SECRET: z.string().min(8).optional(),
  MP_PLAN_ESSENTIAL: z.string().optional(),
  MP_PLAN_PRO: z.string().optional(),
  MP_PLAN_AGENCY: z.string().optional(),

  // --- App -------------------------------------------------------------------
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Remove entradas vazias do ambiente.
 *
 * Painéis de deploy (Vercel, Supabase) e arquivos .env costumam declarar a chave
 * com valor vazio (`SUPABASE_SERVICE_ROLE_KEY=`). Para o zod, "" é uma string
 * inválida — e não "ausente". Aqui vazio vira ausente, então o default do schema
 * (ou a ausência legítima) assume o controle.
 */
export function cleanEnvironment(
  source: Record<string, string | undefined>,
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") continue;
    if (value.trim().length === 0) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(cleanEnvironment(process.env));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Ambiente inválido: ${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Só para testes: limpa o cache entre cenários. */
export function resetEnvCache(): void {
  cached = null;
}

export function isMockMode(): boolean {
  return getServerEnv().LLM_PROVIDER_MODE === "mock";
}

/** Variáveis públicas — seguras para o bundle do cliente. */
export function getPublicEnv() {
  const env = getServerEnv();
  return {
    appUrl: env.NEXT_PUBLIC_APP_URL,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    mpPublicKey: env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? "",
  };
}

/**
 * Falha rápido quando uma integração real é exigida mas falta configuração.
 * Use no início de rotas que dependem de provider externo.
 */
export function requireLiveProvider(provider: "llm" | "serp" | "mp" | "image"): void {
  const env = getServerEnv();

  if (provider === "llm") {
    if (env.LLM_PROVIDER_MODE === "mock") return;
    if (!env.ANTHROPIC_API_KEY && !env.GOOGLE_GENERATIVE_AI_API_KEY && !env.DEEPSEEK_API_KEY) {
      throw new Error(
        "LLM_PROVIDER_MODE=live exige DEEPSEEK_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY ou ANTHROPIC_API_KEY.",
      );
    }
  }

  if (provider === "serp") {
    if (env.SERP_PROVIDER === "mock") return;
    if (env.SERP_PROVIDER === "serper" && !env.SERPER_API_KEY) {
      throw new Error("SERP_PROVIDER=serper exige SERPER_API_KEY.");
    }
  }

  if (provider === "mp") {
    if (!env.MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN ausente.");
    if (!env.MP_WEBHOOK_SECRET) throw new Error("MP_WEBHOOK_SECRET ausente.");
  }

  if (provider === "image") {
    if (env.IMAGE_PROVIDER === "none") return;
    if (env.IMAGE_PROVIDER !== "mock" && !env.IMAGE_PROVIDER_API_KEY) {
      throw new Error(`IMAGE_PROVIDER=${env.IMAGE_PROVIDER} exige IMAGE_PROVIDER_API_KEY.`);
    }
  }
}

/**
 * Chaves públicas do Supabase (URL + chave publicável).
 *
 * Suficiente para: cliente de sessão (RLS), auth, onboarding e leituras.
 * NÃO use para operações administrativas — para isso existe `requireSupabaseAdmin`.
 */
export function requireSupabasePublic(): { url: string; anonKey: string } {
  const env = getServerEnv();
  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    throw new Error(`Supabase não configurado: faltam ${missing.join(", ")}.`);
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

/**
 * Credenciais administrativas (service_role).
 *
 * Exigidas por: estúdio (grafo e Storage), billing, worker e exclusão LGPD.
 * A ausência gera erro explícito — nunca um cliente admin com chave pública.
 */
export function requireSupabaseAdmin(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const publicEnv = requireSupabasePublic();
  const env = getServerEnv();

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente. Gere a secret key em Supabase > Project Settings > " +
        "API Keys > Secret keys e configure-a no servidor (nunca no cliente).",
    );
  }

  return { ...publicEnv, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
}

/** Compatibilidade: alias histórico para o par administrativo. */
export function requireSupabase(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  return requireSupabaseAdmin();
}
