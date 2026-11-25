/**
 * Sugestão automática de reescrita CONAR-compliant e substituição segura no payload.
 *
 * Transforma trechos marcados como Recomendação ou Proibição em formulações
 * naturais, objetivas e sem promessas absolutas em PT-BR (custo US$ 0).
 */

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

export function suggestComplianceRewrite(excerpt: string, _rule?: string): string {
  const clean = excerpt.trim();
  if (!clean) return "";

  let rewritten = clean;
  for (const [pattern, replacement] of REWRITE_RULES) {
    rewritten = rewritten.replace(pattern, replacement);
  }

  // Normaliza espaços duplos e capitalização inicial
  rewritten = rewritten.replace(/\s+/g, " ").trim();
  if (rewritten.toLowerCase() === clean.toLowerCase()) {
    // Fallback objetivo quando a regra apontou tom/estilo sem palavra-chave fixa
    const trimmedPunct = clean.replace(/[.!?]+$/, "");
    rewritten = `Na prática, ${trimmedPunct.charAt(0).toLowerCase()}${trimmedPunct.slice(1)} (sujeito à avaliação do seu caso).`;
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
