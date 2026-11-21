/**
 * Roda uma única vez no boot do servidor (Next.js instrumentation hook).
 * Aqui apenas definimos variáveis de processo que precisam existir ANTES de
 * qualquer import de LangGraph e validamos o ambiente de forma não fatal.
 */
export async function register(): Promise<void> {
  // Serialização estrita do msgpack evita corrupção silenciosa de checkpoint.
  process.env.LANGGRAPH_STRICT_MSGPACK ??= "true";

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Import dinâmico: não puxa dependências de servidor para o runtime edge.
    const { getServerEnv } = await import("@/lib/env");
    try {
      const env = getServerEnv();
      const mode = env.LLM_PROVIDER_MODE;
      const supabase = env.NEXT_PUBLIC_SUPABASE_URL ? "configurado" : "ausente";
      // Log único e sem segredos.
      console.info(
        JSON.stringify({
          level: "info",
          scope: "boot",
          message: "BrandPulse inicializado",
          llm_mode: mode,
          supabase,
          serp: env.SERP_PROVIDER,
          image: env.IMAGE_PROVIDER,
          embedding_dimension: env.EMBEDDING_DIMENSION,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        JSON.stringify({
          level: "warn",
          scope: "boot",
          message: `Ambiente incompleto: ${message}`,
        }),
      );
    }
  }
}
