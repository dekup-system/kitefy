import type { AbepClass } from "@/types/domain";

/**
 * Módulo de Dados Demográficos Brasileiros (IBGE + Critério Brasil ABEP).
 *
 * Combina consulta ao vivo na API pública oficial do IBGE
 * (`servicodados.ibge.gov.br/api/v1/localidades`) com a base consolidada do
 * Censo Demográfico 2022 + PNAD Contínua (rendimento domiciliar per capita)
 * e Critério Brasil (ABEP) para enriquecer personas e argumentos de consumo
 * com realidade econômica verificável — custo US$ 0.
 */

export interface IbgeDemographicSnapshot {
  regionLabel: string;
  uf: string | null;
  population: number;
  perCapitaIncomeBrl: number;
  dominantAbepClasses: AbepClass[];
  source: string;
  fetchedLive: boolean;
}

interface StateStats {
  name: string;
  uf: string;
  population: number; // Censo IBGE 2022
  perCapitaIncomeBrl: number; // PNAD Contínua IBGE (R$/mês)
  dominantAbep: AbepClass[];
}

const BRAZIL_TOTAL: StateStats = {
  name: "Brasil",
  uf: "BR",
  population: 203_080_756,
  perCapitaIncomeBrl: 2069,
  dominantAbep: ["B2", "C1", "C2"],
};

const IBGE_STATES: Record<string, StateStats> = {
  SP: { name: "São Paulo", uf: "SP", population: 44_411_238, perCapitaIncomeBrl: 2662, dominantAbep: ["B1", "B2", "C1"] },
  RJ: { name: "Rio de Janeiro", uf: "RJ", population: 16_055_174, perCapitaIncomeBrl: 2490, dominantAbep: ["B1", "B2", "C1"] },
  MG: { name: "Minas Gerais", uf: "MG", population: 20_539_989, perCapitaIncomeBrl: 2001, dominantAbep: ["B2", "C1", "C2"] },
  PR: { name: "Paraná", uf: "PR", population: 11_444_380, perCapitaIncomeBrl: 2482, dominantAbep: ["B1", "B2", "C1"] },
  SC: { name: "Santa Catarina", uf: "SC", population: 7_610_361, perCapitaIncomeBrl: 2601, dominantAbep: ["B1", "B2", "C1"] },
  RS: { name: "Rio Grande do Sul", uf: "RS", population: 10_882_965, perCapitaIncomeBrl: 2608, dominantAbep: ["B1", "B2", "C1"] },
  DF: { name: "Distrito Federal", uf: "DF", population: 2_817_381, perCapitaIncomeBrl: 3444, dominantAbep: ["A", "B1", "B2"] },
  BA: { name: "Bahia", uf: "BA", population: 14_141_626, perCapitaIncomeBrl: 1366, dominantAbep: ["C1", "C2", "DE"] },
  PE: { name: "Pernambuco", uf: "PE", population: 9_058_931, perCapitaIncomeBrl: 1453, dominantAbep: ["C1", "C2", "DE"] },
  CE: { name: "Ceará", uf: "CE", population: 8_794_957, perCapitaIncomeBrl: 1225, dominantAbep: ["C1", "C2", "DE"] },
  GO: { name: "Goiás", uf: "GO", population: 7_056_495, perCapitaIncomeBrl: 2098, dominantAbep: ["B2", "C1", "C2"] },
  ES: { name: "Espírito Santo", uf: "ES", population: 3_833_712, perCapitaIncomeBrl: 2111, dominantAbep: ["B2", "C1", "C2"] },
  MT: { name: "Mato Grosso", uf: "MT", population: 3_658_649, perCapitaIncomeBrl: 2276, dominantAbep: ["B1", "B2", "C1"] },
  MS: { name: "Mato Grosso do Sul", uf: "MS", population: 2_757_013, perCapitaIncomeBrl: 2169, dominantAbep: ["B2", "C1", "C2"] },
  PA: { name: "Pará", uf: "PA", population: 8_120_131, perCapitaIncomeBrl: 1344, dominantAbep: ["C1", "C2", "DE"] },
  AM: { name: "Amazonas", uf: "AM", population: 3_941_613, perCapitaIncomeBrl: 1238, dominantAbep: ["C1", "C2", "DE"] },
  MA: { name: "Maranhão", uf: "MA", population: 6_776_699, perCapitaIncomeBrl: 1077, dominantAbep: ["C2", "DE"] },
  PB: { name: "Paraíba", uf: "PB", population: 3_974_687, perCapitaIncomeBrl: 1401, dominantAbep: ["C1", "C2", "DE"] },
  RN: { name: "Rio Grande do Norte", uf: "RN", population: 3_302_729, perCapitaIncomeBrl: 1616, dominantAbep: ["C1", "C2", "DE"] },
  AL: { name: "Alagoas", uf: "AL", population: 3_127_683, perCapitaIncomeBrl: 1331, dominantAbep: ["C1", "C2", "DE"] },
  PI: { name: "Piauí", uf: "PI", population: 3_271_199, perCapitaIncomeBrl: 1350, dominantAbep: ["C1", "C2", "DE"] },
  SE: { name: "Sergipe", uf: "SE", population: 2_210_004, perCapitaIncomeBrl: 1473, dominantAbep: ["C1", "C2", "DE"] },
  RO: { name: "Rondônia", uf: "RO", population: 1_581_196, perCapitaIncomeBrl: 1717, dominantAbep: ["B2", "C1", "C2"] },
  TO: { name: "Tocantins", uf: "TO", population: 1_511_460, perCapitaIncomeBrl: 1737, dominantAbep: ["B2", "C1", "C2"] },
  AC: { name: "Acre", uf: "AC", population: 830_018, perCapitaIncomeBrl: 1271, dominantAbep: ["C1", "C2", "DE"] },
  AP: { name: "Amapá", uf: "AP", population: 733_759, perCapitaIncomeBrl: 1514, dominantAbep: ["C1", "C2", "DE"] },
  RR: { name: "Roraima", uf: "RR", population: 636_707, perCapitaIncomeBrl: 1538, dominantAbep: ["C1", "C2", "DE"] },
};

function normalizeRegion(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchStateLocally(query: string): StateStats | null {
  const norm = normalizeRegion(query);
  if (!norm || norm === "brasil" || norm === "nacional" || norm === "todo o brasil") {
    return BRAZIL_TOTAL;
  }

  // Sigla exata ou sufixo ", SP" / "- PR"
  const ufMatch = /\b([a-z]{2})\b/i.exec(norm);
  if (ufMatch?.[1]) {
    const byUf = IBGE_STATES[ufMatch[1].toUpperCase()];
    if (byUf) return byUf;
  }

  for (const state of Object.values(IBGE_STATES)) {
    if (norm.includes(normalizeRegion(state.name))) {
      return state;
    }
  }
  return null;
}

/**
 * Busca dados demográficos reais via API oficial de Localidades do IBGE
 * combinados com Censo 2022 + PNAD Contínua + Critério Brasil (ABEP).
 */
export async function fetchIbgeDemographics(regionQuery?: string | null): Promise<IbgeDemographicSnapshot> {
  const raw = (regionQuery ?? "").trim();
  const localMatch = matchStateLocally(raw);

  // Se o usuário informou cidade/região específica, tenta validar o município na API oficial do IBGE
  if (raw.length >= 3 && normalizeRegion(raw) !== "brasil") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const targetNorm = normalizeRegion(raw.split(/[,-]/)[0] ?? raw);
      const url = localMatch && localMatch.uf !== "BR"
        ? `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${localMatch.uf}/municipios`
        : "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) {
        const list = (await response.json()) as {
          id: number;
          nome: string;
          microrregiao?: { mesorregiao?: { UF?: { sigla?: string; nome?: string } } };
        }[];

        const found = list.find((city) => normalizeRegion(city.nome) === targetNorm);
        if (found) {
          const ufSigla = found.microrregiao?.mesorregiao?.UF?.sigla ?? localMatch?.uf ?? "BR";
          const stateStats = IBGE_STATES[ufSigla] ?? BRAZIL_TOTAL;
          return {
            regionLabel: `${found.nome} (${ufSigla})`,
            uf: ufSigla,
            population: stateStats.population,
            perCapitaIncomeBrl: stateStats.perCapitaIncomeBrl,
            dominantAbepClasses: stateStats.dominantAbep,
            source: `IBGE Localidades (Município #${found.id}) + Censo 2022 / PNAD Contínua (${ufSigla})`,
            fetchedLive: true,
          };
        }
      }
    } catch {
      // Fallback silencioso para tabela consolidada do IBGE
    } finally {
      clearTimeout(timeout);
    }
  }

  const resolved = localMatch ?? BRAZIL_TOTAL;
  return {
    regionLabel: resolved.uf === "BR" ? "Brasil (Nacional)" : `${resolved.name} (${resolved.uf})`,
    uf: resolved.uf,
    population: resolved.population,
    perCapitaIncomeBrl: resolved.perCapitaIncomeBrl,
    dominantAbepClasses: resolved.dominantAbep,
    source: "IBGE Censo 2022 + PNAD Contínua + Critério Brasil (ABEP)",
    fetchedLive: false,
  };
}
