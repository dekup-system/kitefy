import type { SerpInsights } from "@/types/domain";

/** Provedores de SERP suportados pelo produto. */
export type SerpProviderId = "serper" | "gemini_grounding" | "mock";

export interface SerpSearchInput {
  query: string;
  /** Locale BCP-47, por exemplo `pt-BR`. */
  locale: string;
  /** Quantidade máxima de resultados orgânicos desejada. */
  num: number;
}

/**
 * Contrato único de busca SERP. Implementações devem ser substituíveis sem
 * alterar o chamador: o grafo de conteúdo só depende de `SerpInsights`.
 */
export interface SerpProvider {
  readonly id: SerpProviderId;
  search(input: SerpSearchInput): Promise<SerpInsights>;
}
