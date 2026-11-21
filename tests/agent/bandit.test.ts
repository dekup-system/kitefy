import { describe, expect, it } from "vitest";
import {
  allArms,
  armKey,
  isSuccessPull,
  parseArmKey,
  sampleBeta,
  selectArms,
} from "@/lib/agent/bandit";

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Thompson Sampling (bandit)", () => {
  it("gera 16 braços (4 ângulos x 4 frameworks) com chaves estáveis", () => {
    const arms = allArms();
    expect(arms).toHaveLength(16);
    const parsed = parseArmKey(armKey("vace_pattern_interrupt", "pas"));
    expect(parsed).toEqual({
      angle_type: "vace_pattern_interrupt",
      framework: "pas",
      key: "vace_pattern_interrupt:pas",
    });
  });

  it("rejeita chaves fora do domínio", () => {
    expect(parseArmKey("metodo_secreto:pas")).toBeNull();
    expect(parseArmKey("vace_pattern_interrupt:inventado")).toBeNull();
    expect(parseArmKey("sem-separador")).toBeNull();
  });

  it("amostra Beta sempre no intervalo (0,1)", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 200; i += 1) {
      const value = sampleBeta(1 + (i % 5), 1 + (i % 3), rng);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("Beta(50,2) concentra-se acima de Beta(2,50)", () => {
    const rng = seededRng(7);
    let wins = 0;
    for (let i = 0; i < 100; i += 1) {
      const strong = sampleBeta(50, 2, rng);
      const weak = sampleBeta(2, 50, rng);
      if (strong > weak) wins += 1;
    }
    expect(wins).toBeGreaterThan(95);
  });

  it("sem histórico, escolhe um braço e força exploração de não testados", () => {
    const selection = selectArms({ stats: [], rng: seededRng(1) });
    expect(selection.selected).toBeDefined();
    expect(selection.exploration).toHaveLength(2);
    const keys = [selection.selected.key, ...selection.exploration.map((arm) => arm.key)];
    expect(new Set(keys).size).toBe(3);
  });

  it("prefere o braço com histórico vencedor", () => {
    const winner = armKey("outcome_anchored", "aida");
    const loser = armKey("contrarian_frame", "bab");
    const stats = [
      { arm_key: winner, alpha: 40, beta: 2, pulls: 40 },
      { arm_key: loser, alpha: 2, beta: 40, pulls: 40 },
      // Marca todos os outros como testados para garantir comparação justa.
      ...allArms()
        .filter((arm) => arm.key !== winner && arm.key !== loser)
        .map((arm) => ({ arm_key: arm.key, alpha: 5, beta: 5, pulls: 3 })),
    ];

    const selection = selectArms({ stats, rng: seededRng(3) });
    expect(selection.selected.key).toBe(winner);
    expect(selection.exploration.map((arm) => arm.key)).not.toContain(winner);
  });

  it("sempre inclui um braço não testado na exploração quando existe", () => {
    const tested = allArms().slice(0, 15);
    const stats = tested.map((arm) => ({ arm_key: arm.key, alpha: 5, beta: 3, pulls: 6 }));
    const selection = selectArms({ stats, rng: seededRng(11) });
    const untestedKey = allArms()[15]!.key;
    expect(selection.exploration.map((arm) => arm.key)).toContain(untestedKey);
  });

  it("aplica a regra de sucesso do produto (>= 0.35 ou acima do P75)", () => {
    expect(isSuccessPull(0.4, null)).toBe(true);
    expect(isSuccessPull(0.35, null)).toBe(true);
    expect(isSuccessPull(0.2, 0.18)).toBe(true);
    expect(isSuccessPull(0.2, 0.25)).toBe(false);
    expect(isSuccessPull(Number.NaN, null)).toBe(false);
  });
});
