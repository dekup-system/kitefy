/**
 * Sugestão automática de reescrita CONAR-compliant + motivo legível por regra.
 *
 * Explica claramente POR QUE o trecho foi sinalizado e gera uma formulação
 * genuinamente diferente e aderente ao CONAR para aplicação em 1 clique.
 */

const RULE_EXPLANATIONS: Record<string, string> = {
  medical_absolute_promise: "Promessa absoluta de cura ou resultado médico sem ressalva.",
  financial_guarantee: "Promessa de ganho ou retorno financeiro garantido/sem risco.",
  absolute_superlative: "Superlativo absoluto ('o melhor do mundo/Brasil') sem fonte verificável.",
  fabricated_urgency: "Senso de urgência/escassez sem data ou condição real comprovada.",
  atypical_testimonial: "Resultado numérico específico sem aviso de que resultados variam.",
  forbidden_synthetic_media: "Menção a recurso proibido (avatar falante, clonagem de voz ou lip-sync).",
  health_disclaimer_missing: "Tema de saúde sem aviso educativo recomendando orientação profissional.",
  finance_disclaimer_missing: "Tema financeiro sem aviso informativo de que não é recomendação garantida.",
  free_without_condition: "Uso de 'grátis/gratuito' sem explicitar a condição ou escopo.",
  deadline_promise: "Promessa de prazo fechado ('em X dias') — o CONAR recomenda faixa estimada.",
  tone_avoid: "Termo presente na lista de palavras a evitar da sua marca.",
  unverified_number: "Dado numérico sem fonte cadastrada nos fatos verificáveis da marca.",
};

export function describeComplianceRule(rule: string): string {
  if (RULE_EXPLANATIONS[rule]) return RULE_EXPLANATIONS[rule];
  const r = rule.toLowerCase();
  if (/num[eé]ric|fonte|dado|estat[ií]stic/.test(r)) {
    return "Dado numérico ou percentual sem fonte verificável cadastrada na marca.";
  }
  if (/promessa|absolut|result|garant/.test(r)) {
    return "Promessa de resultado sem ressalva ou condicionante — o CONAR exige transparência.";
  }
  if (/superlativ|melhor|l[ií]der|[uú]nic/.test(r)) {
    return "Superlativo absoluto ou comparação sem prova objetiva verificável.";
  }
  if (/urg[eê]ncia|escassez|prazo/.test(r)) {
    return "Senso de urgência, escassez ou prazo fechado sem condição real comprovada.";
  }
  if (/sa[uú]de|m[eé]dic|cl[ií]nic|est[eé]tic/.test(r)) {
    return "Tema de saúde/estética que recomenda aviso educativo de orientação profissional.";
  }
  if (/financ|lucro|rendimento|invest/.test(r)) {
    return "Tema financeiro que exige clareza de que resultados não são garantidos.";
  }
  if (/gr[aá]tis|gratuit/.test(r)) {
    return "Menção a gratuidade sem explicitar condições ou escopo da oferta.";
  }
  return "Trecho sinalizado para suavização e maior clareza publicitária (CONAR).";
}

const REWRITE_RULES: [RegExp, string][] = [
  [/\b100%\s*(garantid[oa]s?|comprovad[oa]s?|eficaz(es)?|segur[oa]s?)\b/gi, "com método validado na prática"],
  [/\b100%\b/gi, "com alto rigor"],
  [/\bgarantid[oa]s?\b/gi, "planejado para entregar consistência"],
  [/\bgarante\b/gi, "contribui para"],
  [/\bgarantimos\b/gi, "trabalhamos com foco em"],
  [/\bgarantia\s+total\b/gi, "acompanhamento transparente"],
  [/\bsem\s+risco(s)?\b/gi, "com controle claro de cada etapa"],
  [/\bcura\s+definitiv[ao]\b/gi, "tratamento focado em melhora contínua"],
  [/\bcurar?\b/gi, "auxiliar no cuidado"],
  [/\bmilagros[oa]s?\b/gi, "estruturado"],
  [/\bo\s+melhor\s+do\s+(mundo|mercado|brasil)\b/gi, "uma abordagem de alto padrão"],
  [/\ba\s+melhor\s+do\s+(mundo|mercado|brasil)\b/gi, "uma abordagem de alto padrão"],
  [/\bmelhor(es)?\s+do\s+mercado\b/gi, "de alto padrão no segmento"],
  [/\bn[úu]mero\s*1\s*(do\s+mercado|do\s+brasil)?\b/gi, "referência no atendimento"],
  [/\bl[ií]der\s+absolut[oa]\b/gi, "referência consolidada"],
  [/\b[úu]ltimas?\s+vagas?\b/gi, "vagas conforme disponibilidade da agenda"],
  [/\bs[óo]\s+hoje\b/gi, "condição vigente no período atual"],
  [/\bimperd[íi]vel\b/gi, "oportunidade prática"],
  [/\brevolucion[áa]ri[oa]s?\b/gi, "diferenciado"],
  [/\bdefinitiv[oa]s?\b/gi, "consistente"],
  [/\bimediat[oa]s?\b/gi, "progressivo desde as primeiras etapas"],
  [/\bsempre\b/gi, "com regularidade"],
  [/\bnunca\s+falha\b/gi, "mantém alto padrão de consistência"],
  [/\b[uú]nic[oa]\s+no\s+(mercado|brasil|mundo)\b/gi, "com metodologia própria"],
  [/\balavanque\b/gi, "estruture"],
  [/\bpotencialize\b/gi, "melhore"],
  [/\btransforme\s+sua\s+jornada\b/gi, "organize sua rotina com clareza"],
  [/\bantes\s+e\s+depois\b/gi, "evolução do acompanhamento"],
  [/\bem\s+(apenas\s+)?\d+\s*(dias?|semanas?|meses|horas?)\b/gi, "em prazo estimado conforme avaliação do caso"],
  [/\b\d+\s*x\s+mais\b/gi, "significativamente mais"],
  [/\b\d+\s*h\b/gi, "em ritmo ágil"],
  [/\b\d+[.,]?\d*\s*%/g, "uma parcela relevante"],
  [/\bR\$\s*\d+[\d.,]*/gi, "valor sob consulta conforme escopo"],
];

function classifyRuleKind(rule?: string): string {
  if (!rule) return "";
  if (RULE_EXPLANATIONS[rule]) return rule;
  const r = rule.toLowerCase();
  if (/num[eé]ric|fonte|dado|estat[ií]stic/.test(r)) return "unverified_number";
  if (/sa[uú]de|m[eé]dic|cl[ií]nic|est[eé]tic/.test(r)) return "health_disclaimer_missing";
  if (/financ|lucro|rendimento|invest/.test(r)) return "finance_disclaimer_missing";
  if (/gr[aá]tis|gratuit/.test(r)) return "free_without_condition";
  if (/prazo|dias|semanas/.test(r)) return "deadline_promise";
  if (/urg[eê]ncia|escassez/.test(r)) return "fabricated_urgency";
  if (/superlativ|melhor|l[ií]der/.test(r)) return "absolute_superlative";
  if (/promessa|absolut|result|garant/.test(r)) return "medical_absolute_promise";
  return rule;
}

export function suggestComplianceRewrite(excerpt: string, rule?: string): string {
  const clean = excerpt.trim();
  if (!clean) return "";

  const normalizedRule = classifyRuleKind(rule);
  const trimmedPunct = clean.replace(/[.!?]+$/, "");

  // Regras específicas de recomendação onde o trecho precisa de ressalva explícita
  if (normalizedRule === "health_disclaimer_missing") {
    return `${trimmedPunct} (conteúdo educativo — consulte sempre um profissional habilitado)`;
  }
  if (normalizedRule === "finance_disclaimer_missing") {
    return `${trimmedPunct} (conteúdo informativo — resultados variam conforme seu perfil)`;
  }
  if (normalizedRule === "free_without_condition") {
    return `${trimmedPunct} (sujeito às condições e disponibilidade vigentes)`;
  }
  if (normalizedRule === "deadline_promise") {
    const softened = clean.replace(
      /\bem\s+(apenas\s+)?\d+\s*(dias?|semanas?|meses|horas?)\b/gi,
      "em prazo estimado conforme avaliação do caso",
    );
    return softened.toLowerCase() !== clean.toLowerCase()
      ? softened
      : `${trimmedPunct} — em prazo estimado conforme avaliação do caso`;
  }

  let rewritten = clean;
  for (const [pattern, replacement] of REWRITE_RULES) {
    rewritten = rewritten.replace(pattern, replacement);
  }

  if (normalizedRule === "unverified_number") {
    // Trata números colados a unidades (ex.: "24h", "3x", "10k") e números isolados
    rewritten = rewritten
      .replace(/\b\d+[.,]?\d*\s*(%|x|h|hs|k|mil|milh[õo]es?)\b/gi, "resultados expressivos")
      .replace(/\b\d+[\d.,]*\b/g, "vários");
  }

  rewritten = rewritten.replace(/\s+/g, " ").trim();

  // Garantia absoluta: a sugestão NUNCA pode ser idêntica ao trecho original
  if (rewritten.toLowerCase() === clean.toLowerCase()) {
    if (normalizedRule === "unverified_number") {
      rewritten = `${trimmedPunct} (estimativa observada na prática — consulte os dados completos com nossa equipe)`;
    } else if (normalizedRule === "absolute_superlative") {
      rewritten = `Abordagem de destaque: ${trimmedPunct.charAt(0).toLowerCase()}${trimmedPunct.slice(1)} (com foco em qualidade comprovada)`;
    } else if (normalizedRule === "fabricated_urgency") {
      rewritten = `${trimmedPunct} (conforme disponibilidade atual da agenda)`;
    } else {
      rewritten = `${trimmedPunct} (conforme avaliação prévia e condições aplicáveis)`;
    }
  }

  return rewritten;
}

/**
 * Substitui `original` por `replacement` em todos os campos de texto do payload.
 */
export function replaceTextInPayload<T>(
  payload: T,
  original: string,
  replacement: string,
): { updated: T; changed: boolean } {
  const target = original.trim();
  if (!target || target === replacement.trim()) {
    return { updated: payload, changed: false };
  }

  let changed = false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (regex.test(value)) {
        changed = true;
        regex.lastIndex = 0;
        return value.replace(regex, replacement);
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value && typeof value === "object") {
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        next[k] = walk(v);
      }
      return next;
    }
    return value;
  };

  return { updated: walk(payload) as T, changed };
}
