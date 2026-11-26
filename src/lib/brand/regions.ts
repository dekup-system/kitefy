/**
 * Regiões oficiais de atuação no Brasil (Divisão Regional do IBGE + Nacional).
 * Usadas no perfil da marca, estudo de público-alvo (IBGE) e busca de concorrentes diretos.
 */

export interface BrazilRegionOption {
  id: string;
  label: string;
  states: string;
}

export const BRAZIL_REGIONS: readonly BrazilRegionOption[] = [
  { id: "Todo o Brasil", label: "Todo o Brasil", states: "Atuação nacional (27 UFs)" },
  { id: "Norte", label: "Norte", states: "AC, AM, AP, PA, RO, RR, TO" },
  { id: "Nordeste", label: "Nordeste", states: "AL, BA, CE, MA, PB, PE, PI, RN, SE" },
  { id: "Centro-Oeste", label: "Centro-Oeste", states: "DF, GO, MS, MT" },
  { id: "Sudeste", label: "Sudeste", states: "ES, MG, RJ, SP" },
  { id: "Sul", label: "Sul", states: "PR, RS, SC" },
] as const;

export const VALID_REGION_IDS = new Set<string>(BRAZIL_REGIONS.map((r) => r.id));

export function formatTargetRegions(regions?: string[] | null): string {
  if (!regions || regions.length === 0) return "Todo o Brasil";
  if (regions.includes("Todo o Brasil")) return "Todo o Brasil";
  return regions.join(", ");
}
