import type { ToneOfVoice } from "@/types/domain";

/**
 * Compliance determinístico (CONAR + políticas do produto).
 *
 * Nenhuma chamada de rede, nenhum modelo: apenas normalização de texto e regex.
 * Bloqueadores impedem a aprovação; avisos apenas orientam revisão humana.
 */

export type ComplianceSeverity = "blocker" | "warning";

export interface ComplianceViolation {
  rule: string;
  excerpt: string;
  severity: ComplianceSeverity;
  suggestion: string;
}

export interface DeterministicComplianceResult {
  violations: ComplianceViolation[];
  approved: boolean;
}

export interface ComplianceInput {
  text: string;
  assetType: string;
  tone: ToneOfVoice;
}

interface RuleDefinition {
  id: string;
  severity: ComplianceSeverity;
  patterns: readonly RegExp[];
  suggestion: string;
  /** Condição adicional avaliada sobre o texto normalizado completo. */
  applies?: (normalized: string) => boolean;
}

// ---------------------------------------------------------------------------
// Normalização com mapa para preservar o excerto original
// ---------------------------------------------------------------------------

interface NormalizedSource {
  normalized: string;
  /** índice do caractere normalizado -> índice no texto original. */
  map: number[];
}

function normalizeWithMap(source: string): NormalizedSource {
  let normalized = "";
  const map: number[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === undefined) continue;

    for (const unit of char.normalize("NFD").toLowerCase()) {
      const code = unit.charCodeAt(0);
      if (code >= 0x0300 && code <= 0x036f) continue;
      normalized += unit;
      for (let offset = 0; offset < unit.length; offset += 1) {
        map.push(index);
      }
    }
  }

  return { normalized, map };
}

function normalizePlain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function truncateExcerpt(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 159).trimEnd()}…`;
}

function excerptFor(source: string, map: readonly number[], match: RegExpExecArray): string {
  if (match[0].length === 0) return "";
  const startUnit = match.index;
  const endUnit = startUnit + match[0].length - 1;
  const start = map[startUnit] ?? 0;
  const end = (map[endUnit] ?? start) + 1;
  return truncateExcerpt(source.slice(start, end));
}

// ---------------------------------------------------------------------------
// Contextos auxiliares
// ---------------------------------------------------------------------------

const MEDICAL_CONTEXT = /\b(pele|acne|cabelo|corpo|paciente|cirurgia|tratamento|medic\w*|clinica|rosto|celulite|emagrec\w*)\b/;

const SOURCE_MARKERS = /fonte\s*:|https?:\/\/|segundo a anvisa|conforme (a )?anvisa/;

const URGENCY_CONTEXT = [
  /\b\d+\s*(vagas|unidades|pessoas|assinaturas)\b/,
  /\bdata limite\b/,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
  /\bate (o dia )?\d{1,2}\b/,
  /\b(termina|encerra|finaliza) (em|no dia)\b/,
];

const PROOF_MARKERS = /fonte\s*:|segundo\b|pesquisa|estudo|ranking|%|\bdados\b/;

const ATYPICAL_RESULT_DISCLAIMER =
  /resultados? (podem )?variar|resultado nao (e|representa) (o )?(resultado )?tipico|nao representa (o )?resultado (tipico|medio)|resultados variam/;

const HEALTH_DISCLAIMER =
  /consulte (um|seu|a|sua) (medico|medica|profissional)|procure (um|seu|a|sua) (medico|medica|profissional)|nao substitui (a )?(consulta|orientacao|acompanhamento)|informacao (apenas )?educativa|orientacao medica/;

const FINANCE_DISCLAIMER =
  /nao (e|sao) (uma )?recomendacao|consulte (um|seu|a|sua) (especialista|consultor|profissional)|rentabilidade passada nao (e|garante)|informacao (apenas )?educativa/;

const FREE_CONDITION =
  /\bassinatura\b|\bplano\b|\bmediante\b|\ba partir de\b|por tempo limitado|\bfrete\b|condic\w*|sujeito a|\bpor \d+ (dias|meses|horas)\b|para sempre/;

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

const RULES: readonly RuleDefinition[] = [
  // --- Bloqueadores: promessa absoluta de resultado médico ------------------
  {
    id: "medical_absolute_promise",
    severity: "blocker",
    patterns: [
      /\bcura\b/,
      /\belimina (a |o )?(doenca|dor|gordura|celulite|diabetes|ansiedade)\b/,
      /\bgarantid[oa]\b[^.]{0,40}\bemagrec/,
      /\bemagrec\w*\s+\d+\s*kg\s+garantid\w*/,
      /\bgarantia de (emagrecimento|resultado medico)\b/,
    ],
    suggestion:
      "Remova a promessa absoluta de cura/resultado e descreva o benefício com evidência e ressalvas.",
  },

  // --- Bloqueadores: promessa financeira ------------------------------------
  {
    id: "financial_guarantee",
    severity: "blocker",
    patterns: [
      /\blucro garantido\b/,
      /\bretorno garantido\b/,
      /\brendimento garantido\b/,
      /\brentabilidade garantida\b/,
      /\bsem risco\b/,
      /\brisco zero\b/,
    ],
    suggestion:
      "Troque garantias financeiras por cenários condicionais e inclua aviso de risco.",
  },

  // --- Bloqueadores: enriquecimento fácil -----------------------------------
  {
    id: "easy_money",
    severity: "blocker",
    patterns: [
      /\bganhe dinheiro (facil|rapido|de forma simples)\b/,
      /\bdinheiro facil\b/,
      /\brenda (garantida|passiva garantida)\b/,
      /\bfique rico\b/,
      /\benriquec\w* (rapido|facil)\b/,
    ],
    suggestion:
      "Retire a promessa de enriquecimento fácil; ancore a oferta em esforço, método e contexto real.",
  },

  // --- Bloqueadores: antes/depois médico ------------------------------------
  {
    id: "medical_before_after",
    severity: "blocker",
    patterns: [/\bantes e depois\b/, /\bfotos? do antes e depois\b/],
    applies: (text) => MEDICAL_CONTEXT.test(text),
    suggestion:
      "Não use comparação antes/depois de resultado médico; substitua por informação educativa sem alegação de eficácia.",
  },

  // --- Bloqueadores: ANVISA sem fonte ---------------------------------------
  {
    id: "anvisa_unverified",
    severity: "blocker",
    patterns: [/\baprovad[oa] pela anvisa\b/, /\banvisa aprovou\b/],
    applies: (text) => !SOURCE_MARKERS.test(text),
    suggestion:
      "Cite a fonte oficial da aprovação (número de registro/processo e link) ou remova a alegação.",
  },

  // --- Bloqueadores: urgência fabricada -------------------------------------
  {
    id: "fabricated_urgency",
    severity: "blocker",
    patterns: [
      /\bultimas vagas\b/,
      /\bultimas unidades\b/,
      /\bvagas limitadas\b/,
      /\bso hoje\b/,
      /\benquanto durar o estoque\b/,
    ],
    applies: (text) => !URGENCY_CONTEXT.some((pattern) => pattern.test(text)),
    suggestion:
      "Informe a condição real da oferta (quantidade, data limite) ou remova a urgência sem contexto.",
  },

  // --- Bloqueadores: superlativo absoluto sem prova -------------------------
  {
    id: "absolute_superlative",
    severity: "blocker",
    patterns: [
      /\bo melhor (do|de todo o) mundo\b/,
      /\bo melhor (do|de todo o) brasil\b/,
      /\bo maior (do|de todo o) mundo\b/,
      /\bnumero 1 (do|de todo o) (mundo|brasil)\b/,
      /\ba melhor (empresa|marca|plataforma) do mundo\b/,
    ],
    applies: (text) => !PROOF_MARKERS.test(text),
    suggestion:
      "Substitua o superlativo absoluto por um comparativo com fonte, recorte e data.",
  },

  // --- Bloqueadores: testemunho atípico vendido como típico -----------------
  {
    id: "atypical_testimonial",
    severity: "blocker",
    patterns: [
      /\b(perdi|perdeu|emagreci|emagreceu|ganhei|ganhou|faturei|faturou)\s+\d+\s*(kg|quilos|reais|mil)\b/,
    ],
    applies: (text) => !ATYPICAL_RESULT_DISCLAIMER.test(text),
    suggestion:
      "Sinalize que o resultado não é típico e inclua a faixa de resultados esperada com fonte.",
  },

  // --- Bloqueadores: mídia sintética proibida -------------------------------
  {
    id: "forbidden_synthetic_media",
    severity: "blocker",
    patterns: [
      /clonagem de voz/,
      /clone de voz/,
      /clonar (a )?voz/,
      /\bavatar falante\b/,
      /\blip[- ]?sync\b/,
      /sincronia labial/,
      /\bdeep ?fake\b/,
    ],
    suggestion:
      "O produto não permite clonagem de voz, avatar falante ou lip-sync; reescreva o trecho sem esse recurso.",
  },

  // --- Avisos ---------------------------------------------------------------
  {
    id: "health_disclaimer_missing",
    severity: "warning",
    patterns: [
      /\bsaude\b/,
      /\bemagrec\w*/,
      /\bdieta\b/,
      /\bmedic[oa]s?\b/,
      /\bclinica\b/,
      /\bpacientes?\b/,
      /\bsintoma\w*/,
      /\bdoenca\w*/,
      /\btratamento\b/,
      /\bsuplemento\w*/,
    ],
    applies: (text) => !HEALTH_DISCLAIMER.test(text),
    suggestion:
      "Inclua disclaimer de saúde (orientação educativa, sem substituir acompanhamento profissional).",
  },
  {
    id: "finance_disclaimer_missing",
    severity: "warning",
    patterns: [
      /\binvestiment\w*/,
      /\brentabilidade\b/,
      /\bfinanceir\w*/,
      /\bcredito\b/,
      /\bemprestimo\b/,
      /\bacoes\b/,
      /\bcripto\w*/,
    ],
    applies: (text) => !FINANCE_DISCLAIMER.test(text),
    suggestion:
      "Inclua disclaimer financeiro (risco, ausência de recomendação e rentabilidade passada).",
  },
  {
    id: "free_without_condition",
    severity: "warning",
    patterns: [/\bgratis\b/, /\bgratuit[oa]s?\b/],
    applies: (text) => !FREE_CONDITION.test(text),
    suggestion:
      "Explicite a condição da oferta gratuita (prazo, plano, limites e requisitos).",
  },
  {
    id: "deadline_promise",
    severity: "warning",
    patterns: [
      /\bem \d+ (dias|horas|semanas|meses)\b/,
      /\bdentro de \d+ (dias|horas|semanas|meses)\b/,
      /\bem ate \d+ (dias|horas|semanas|meses)\b/,
    ],
    suggestion:
      "Promessas de prazo exigem contexto e evidência; considere uma faixa realista de tempo.",
  },
];

function suggestionFor(assetType: string, suggestion: string): string {
  const label = assetType.replace(/_/g, " ").trim();
  return label.length > 0 ? `Ajuste o ativo ${label}: ${suggestion}` : suggestion;
}

function findFirstMatch(patterns: readonly RegExp[], text: string): RegExpExecArray | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match;
  }
  return null;
}

function toneViolation(
  tone: ToneOfVoice,
  source: string,
  normalized: string,
  map: readonly number[],
): ComplianceViolation | null {
  const avoided = tone.avoid ?? [];
  for (const term of avoided) {
    const needle = normalizePlain(term).trim();
    if (needle.length < 3) continue;
    const index = normalized.indexOf(needle);
    if (index < 0) continue;
    const start = map[index] ?? 0;
    const end = (map[index + needle.length - 1] ?? start) + 1;
    return {
      rule: "tone_avoid_term",
      excerpt: truncateExcerpt(source.slice(start, end)),
      severity: "warning",
      suggestion: `Substitua o termo evitado pelo tom de voz da marca: "${term}".`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function runDeterministicComplianceCheck(
  input: ComplianceInput,
): DeterministicComplianceResult {
  const { normalized, map } = normalizeWithMap(input.text);
  const violations: ComplianceViolation[] = [];

  for (const rule of RULES) {
    const match = findFirstMatch(rule.patterns, normalized);
    if (!match) continue;
    if (rule.applies && !rule.applies(normalized)) continue;

    violations.push({
      rule: rule.id,
      excerpt: excerptFor(input.text, map, match),
      severity: rule.severity,
      suggestion: suggestionFor(input.assetType, rule.suggestion),
    });
  }

  const toneIssue = toneViolation(input.tone, input.text, normalized, map);
  if (toneIssue) {
    violations.push(toneIssue);
  }

  const approved = !violations.some((violation) => violation.severity === "blocker");
  return { violations, approved };
}

/**
 * Rótulo de transparência é obrigatório quando há imagem sintética
 * fotorrealista nos formatos que a exibem como prova visual.
 */
export function requiresTransparencyLabel(input: {
  hasAiImagery: boolean;
  assetType: string;
}): boolean {
  if (!input.hasAiImagery) return false;
  return input.assetType === "single_creative" || input.assetType === "hybrid_carousel";
}
