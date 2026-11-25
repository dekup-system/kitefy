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
  return RULE_EXPLANATIONS[rule] ?? "Trecho sinalizado para suavização e maior clareza publicitária.";
}

const REWRITE_RULES: [RegExp, string][] = [
  [/\b100%\s*(garantid[oa]s?|comprovad[oa]s?|eficaz(es)?|segur[oa]s?)\b/gi, "com método validado na prática"],
  [/\b100%\b/gi, "com alto rigor"],
  [/\bgarantid[oa]s?\b/gi, "planejado para entregar consistência"],
  [/\bgarantia\s+total\b/gi, "acompanhamento transparente"],
  [/\bsem\s+risco(s)?\b/gi, "com controle claro de cada etapa"],
  [/\bcura\s+definitiv[ao]\b/gi, "tratamento focado em melhora contínua"],
  [/\bcurar?\b/gi, "auxiliar no cuidado"],
  [/\bmilagros[oa]s?\b/gi, "estruturado"],
  [/\bo\s+melhor\s+do\s+(mundo|mercado|brasil)\b/gi, "uma abordagem de alto padrão"],
  [/\bn[úu]mero\s*1\s*(do\s+mercado|do\s+brasil)?\b/gi, "referência no atendimento"],
  [/\b[úu]ltimas?\s+vagas?\b/gi, "vagas conforme disponibilidade da agenda"],
  [/\bs[óo]\s+hoje\b/gi, "condição vigente no período atual"],
  [/\bimperd[íi]vel\b/gi, "oportunidade prática"],
  [/\brevolucion[áa]ri[oa]s?\b/gi, "diferenciado"],
  [/\bdefinitiv[oa]s?\b/gi, "consistente"],
  [/\balavanque\b/gi, "estruture"],
  [/\bpotencialize\b/gi, "melhore"],
  [/\btransforme\s+sua\s+jornada\b/gi, "organize sua rotina com clareza"],
  [/\bantes\s+e\s+depois\b/gi, "evolução do acompanhamento"],
];

export function suggestComplianceRewrite(excerpt: string, rule?: string): string {
  const clean = excerpt.trim();
  if (!clean) return "";

  // Regras específicas de recomendação onde o trecho é curto (1-3 palavras)
  if (rule === "health_disclaimer_missing") {
    return `${clean} (conteúdo educativo — consulte sempre um profissional habilitado)`;
  }
  if (rule === "finance_disclaimer_missing") {
    return `${clean} (conteúdo informativo — avalie conforme seu perfil)`;
  }
  if (rule === "free_without_condition") {
    return `${clean} (sujeito às condições e disponibilidade vigentes)`;
  }
  if (rule === "deadline_promise") {
    return "em prazo estimado conforme avaliação do caso";
  }
  if (rule === "unverified_number") {
    return clean.replace(/\b\d+[.,]?\d*\s*%/g, "uma parcela relevante").replace(/\b\d+\b/g, "vários");
  }

  let rewritten = clean;
  for (const [pattern, replacement] of REWRITE_RULES) {
    rewritten = rewritten.replace(pattern, replacement);
  }

  rewritten = rewritten.replace(/\s+/g, " ").trim();
  if (rewritten.toLowerCase() === clean.toLowerCase()) {
    const trimmedPunct = clean.replace(/[.!?]+$/, "");
    rewritten = `${trimmedPunct} (conforme avaliação e condições aplicáveis)`;
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
