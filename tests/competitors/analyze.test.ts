import { describe, expect, it } from "vitest";
import {
  buildGapMatrix,
  normalizeTopic,
  topicsMatch,
  type CompetitorSnapshot,
} from "@/lib/competitors/analyze";

/**
 * A matriz de lacunas decide o que a marca vai escrever em seguida. Se o
 * casamento de tópicos for frouxo, o relatório inventa lacuna que não existe;
 * se for rígido, esconde lacuna real. Os casos abaixo cobrem os dois extremos.
 */

function snapshot(name: string, topics: string[], url = `https://${name}.com`): CompetitorSnapshot {
  return {
    url,
    brand_name: name,
    topics,
    description: "",
    json_ld_types: [],
    pages_read: 1,
    blocked_by_robots: false,
  };
}

describe("normalizeTopic", () => {
  it("remove acento, pontuação e stopwords", () => {
    expect(normalizeTopic("Prevenção & Check-up: o que fazer?")).toBe("prevencao check fazer");
  });

  it("trata inglês básico", () => {
    expect(normalizeTopic("The best checkup for you")).toBe("best checkup");
  });
});

describe("topicsMatch", () => {
  it("reconhece o mesmo assunto com palavras diferentes de ligação", () => {
    expect(topicsMatch("check-up preventivo anual", "Checkup preventivo")).toBe(true);
  });

  it("reconhece quando um contém o outro", () => {
    expect(topicsMatch("Protocolo de avaliação em três etapas", "avaliação em três etapas")).toBe(true);
  });

  it("separa assuntos diferentes", () => {
    expect(topicsMatch("check-up preventivo", "tabela de preços do plano anual")).toBe(false);
  });

  it("ignora texto vazio", () => {
    expect(topicsMatch("", "qualquer coisa")).toBe(false);
  });
});

describe("buildGapMatrix", () => {
  const brand = snapshot("Aurora", [
    "Avaliação em três etapas",
    "Atendimento em São Paulo",
  ]);

  it("lista como lacuna o tópico que nenhum concorrente da marca cobre", () => {
    const competitors = [
      snapshot("Concorrente A", ["Avaliação em três etapas", "Exames de imagem"]),
      snapshot("Concorrente B", ["Exames de imagem", "Convênios aceitos"]),
    ];

    const { gaps, shared } = buildGapMatrix(brand, competitors);

    expect(gaps.map((gap) => gap.topic)).toEqual(
      expect.arrayContaining(["Exames de imagem", "Convênios aceitos"]),
    );
    expect(shared).toEqual(expect.arrayContaining(["Avaliação em três etapas"]));
    // "Avaliação em três etapas" é coberto pela marca: não pode virar lacuna.
    expect(gaps.some((gap) => gap.topic.includes("três etapas"))).toBe(false);
  });

  it("agrega quantos concorrentes cobrem o mesmo tópico e ordena por isso", () => {
    const competitors = [
      snapshot("A", ["Exames de imagem"]),
      snapshot("B", ["Exames de imagem"]),
      snapshot("C", ["Convênios aceitos"]),
    ];

    const { gaps } = buildGapMatrix(brand, competitors);

    expect(gaps[0]?.topic).toBe("Exames de imagem");
    expect(gaps[0]?.covered_by).toHaveLength(2);
  });

  it("devolve listas vazias quando a marca cobre tudo", () => {
    const competitors = [snapshot("A", ["Avaliação em três etapas"])];
    const { gaps } = buildGapMatrix(brand, competitors);
    expect(gaps).toHaveLength(0);
  });
});
