import type { AngleType, BanditArmStatRow, Framework } from "@/types/domain";

/**
 * Thompson Sampling com prior Beta(1,1).
 *
 * Por que Beta: hook_rate é uma proporção no intervalo [0,1], então a
 * conjugada natural é Beta. Amostrar theta ~ Beta(alpha, beta) e escolher o
 * braço de maior theta equilibra exploração e explotação sem heurística mágica.
 *
 * Regra de exploração controlada:
 *  - braço escolhido: maior theta entre os braços que já têm pulls;
 *  - se existirem braços nunca testados, um deles entra obrigatoriamente
 *    (nunca deixamos de descobrir um ângulo novo);
 *  - 2 variantes de exploração: o segundo maior theta + um braço não testado.
 */

export const ALL_ANGLES: readonly AngleType[] = [
  "vace_pattern_interrupt",
  "contrarian_frame",
  "outcome_anchored",
  "negative_constraint",
];

export const ALL_FRAMEWORKS: readonly Framework[] = ["hook_body_payoff", "aida", "pas", "bab"];

export interface Arm {
  angle_type: AngleType;
  framework: Framework;
  key: string;
}

export function armKey(angle: AngleType, framework: Framework): string {
  return `${angle}:${framework}`;
}

export function parseArmKey(key: string): Arm | null {
  const [angle, framework] = key.split(":");
  if (!angle || !framework) return null;
  if (!ALL_ANGLES.includes(angle as AngleType)) return null;
  if (!ALL_FRAMEWORKS.includes(framework as Framework)) return null;
  return { angle_type: angle as AngleType, framework: framework as Framework, key };
}

export function allArms(): Arm[] {
  return ALL_ANGLES.flatMap((angle) =>
    ALL_FRAMEWORKS.map((framework) => ({
      angle_type: angle,
      framework,
      key: armKey(angle, framework),
    })),
  );
}

/** Amostragem Gamma (Marsaglia & Tsang) para compor Beta. */
export function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    // Boost: Gamma(a) = Gamma(a+1) * U^(1/a)
    const u = Math.max(rng(), Number.EPSILON);
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (let attempt = 0; attempt < 64; attempt += 1) {
    let x: number;
    let v: number;
    do {
      // Normal padrão via Box-Muller.
      const u1 = Math.max(rng(), Number.EPSILON);
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }

  // Fallback determinístico (praticamente inalcançável).
  return d;
}

export function sampleBeta(alpha: number, beta: number, rng: () => number = Math.random): number {
  const a = Math.max(alpha, 1e-6);
  const b = Math.max(beta, 1e-6);
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  const total = x + y;
  return total === 0 ? 0.5 : x / total;
}

export interface BanditSelection {
  selected: Arm;
  exploration: Arm[];
  thetas: { arm: Arm; theta: number; pulls: number }[];
}

export interface SelectArmsInput {
  stats: Pick<BanditArmStatRow, "arm_key" | "alpha" | "beta" | "pulls">[];
  rng?: () => number;
  /** Quantas variantes de exploração devolver (default 2). */
  explorationCount?: number;
}

export function selectArms(input: SelectArmsInput): BanditSelection {
  const rng = input.rng ?? Math.random;
  const explorationCount = input.explorationCount ?? 2;
  const statsByKey = new Map(input.stats.map((stat) => [stat.arm_key, stat]));

  const evaluated = allArms().map((arm) => {
    const stat = statsByKey.get(arm.key);
    const alpha = Number(stat?.alpha ?? 1);
    const beta = Number(stat?.beta ?? 1);
    return {
      arm,
      theta: sampleBeta(alpha, beta, rng),
      pulls: Number(stat?.pulls ?? 0),
    };
  });

  const explored = evaluated.filter((item) => item.pulls > 0).sort((a, b) => b.theta - a.theta);
  const unexplored = evaluated.filter((item) => item.pulls === 0).sort((a, b) => b.theta - a.theta);

  // Seleção: melhor explorado; se não houver nenhum, melhor não testado.
  const selected = explored[0]?.arm ?? unexplored[0]?.arm ?? allArms()[0]!;

  const exploration: Arm[] = [];
  // Exploração obrigatória: um braço nunca testado (se existir).
  const freshUntested = unexplored.find((item) => item.arm.key !== selected.key);
  if (freshUntested) exploration.push(freshUntested.arm);
  // Segunda variante: segundo melhor theta diferente do selecionado.
  for (const candidate of [...explored, ...unexplored]) {
    if (exploration.length >= explorationCount) break;
    if (candidate.arm.key === selected.key) continue;
    if (exploration.some((arm) => arm.key === candidate.arm.key)) continue;
    exploration.push(candidate.arm);
  }

  return {
    selected,
    exploration: exploration.slice(0, explorationCount),
    thetas: evaluated,
  };
}

/**
 * Decide se a telemetria conta como sucesso.
 * Regra do produto: hook_rate >= 0.35 OU acima do P75 do tenant.
 */
export function isSuccessPull(hookRate: number, tenantP75: number | null): boolean {
  if (!Number.isFinite(hookRate)) return false;
  if (hookRate >= 0.35) return true;
  if (tenantP75 !== null && Number.isFinite(tenantP75) && hookRate >= tenantP75) return true;
  return false;
}
