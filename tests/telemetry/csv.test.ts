import { describe, expect, it } from "vitest";

import { parseTelemetryCsv, toInsertRows } from "@/lib/telemetry/csv";

const PT_CSV = [
  "ativo_id,canal,impressoes,visualizacoes_3s,retencao_50,saves,citacoes_ia,data",
  'ativo-1,instagram,"1.234",45,"45,5%",12,3,15/01/2026',
].join("\n");

const EN_CSV = [
  "asset_id,channel_label,impressions,views_3s,retention_50_pct,saves_or_clicks,ai_citations_count,recorded_at",
  "asset-2,tiktok,1000,320,45%,40,12,2026-02-01T10:00:00Z",
].join("\n");

describe("parseTelemetryCsv — cabeçalhos em português", () => {
  it("normaliza números, percentual e data brasileira", () => {
    const { rows, errors } = parseTelemetryCsv(PT_CSV);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    expect(row.asset_id).toBe("ativo-1");
    expect(row.channel_label).toBe("instagram");
    expect(row.impressions).toBe(1234);
    expect(row.views_3s).toBe(45);
    expect(row.retention_50_pct).toBeCloseTo(0.455, 6);
    expect(row.saves_or_clicks).toBe(12);
    expect(row.ai_citations_count).toBe(3);
    expect(row.recorded_at).toBe("2026-01-15T00:00:00.000Z");
    expect(row.hook_rate).toBeCloseTo(45 / 1234, 8);
    expect(row.source_mode).toBe("csv");
  });
});

describe("parseTelemetryCsv — cabeçalhos em inglês", () => {
  it("aceita percentual e data ISO", () => {
    const { rows, errors } = parseTelemetryCsv(EN_CSV);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    expect(row.asset_id).toBe("asset-2");
    expect(row.channel_label).toBe("tiktok");
    expect(row.impressions).toBe(1000);
    expect(row.views_3s).toBe(320);
    expect(row.retention_50_pct).toBeCloseTo(0.45, 6);
    expect(row.recorded_at).toBe("2026-02-01T10:00:00.000Z");
  });

  it("aceita vírgula decimal em campo numérico", () => {
    const csv = [
      "impressoes,visualizacoes_3s,retencao_50,data,canal",
      '1000,250,"0,45",2026-03-01,linkedin',
    ].join("\n");

    const { rows, errors } = parseTelemetryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]?.retention_50_pct).toBeCloseTo(0.45, 6);
  });
});

describe("parseTelemetryCsv — erros por linha", () => {
  it("rejeita views_3s maior que impressions sem abortar o lote", () => {
    const csv = [
      "impressoes,visualizacoes_3s,retencao_50,saves,citacoes_ia,data,canal",
      "100,40,0.4,10,2,2026-01-01,instagram",
      "200,300,0.4,10,2,2026-01-02,instagram",
      "abc,10,0.4,10,2,2026-01-03,instagram",
    ].join("\n");

    const { rows, errors } = parseTelemetryCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.impressions).toBe(100);
    expect(errors).toHaveLength(2);
    expect(errors.some((error) => /views_3s/.test(error.message))).toBe(true);
    expect(errors.some((error) => error.line === 3)).toBe(true);
    expect(errors.some((error) => error.line === 4)).toBe(true);
  });

  it("reporta linha inválida e mantém as linhas seguintes", () => {
    const csv = [
      "impressoes,visualizacoes_3s,retencao_50,data,canal",
      "sem-numero,10,0.4,2026-01-01,instagram",
      "500,120,0.3,2026-01-02,youtube",
    ].join("\n");

    const { rows, errors } = parseTelemetryCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel_label).toBe("youtube");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toMatch(/impressões/);
  });

  it("recusa cabeçalho sem as colunas obrigatórias", () => {
    const { rows, errors } = parseTelemetryCsv("canal,data\ninstagram,2026-01-01");

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(1);
    expect(errors[0]?.message).toMatch(/Cabeçalho incompleto/);
  });

  it("não confunde linha curta com cabeçalho incompleto", () => {
    const csv = [
      "impressoes,visualizacoes_3s,retencao_50,data,canal",
      "100,40,0.4,2026-01-01",
      "200,80,0.5,2026-01-02,instagram",
    ].join("\n");

    const { rows, errors } = parseTelemetryCsv(csv);

    expect(rows).toHaveLength(1);
    expect(errors.some((error) => /canal ausente/.test(error.message))).toBe(true);
    expect(errors.some((error) => /Cabeçalho incompleto/.test(error.message))).toBe(false);
  });

  it("aceita CSV vazio como erro explícito", () => {
    const { rows, errors } = parseTelemetryCsv("   ");
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toMatch(/vazio/i);
  });
});

describe("toInsertRows", () => {
  it("monta o payload de insert com tenant e brand", () => {
    const { rows } = parseTelemetryCsv(EN_CSV);
    const insert = toInsertRows("tenant-1", "brand-1", rows);

    expect(insert).toHaveLength(1);
    expect(insert[0]).toMatchObject({
      tenant_id: "tenant-1",
      brand_id: "brand-1",
      asset_id: "asset-2",
      source_mode: "csv",
    });
  });

  it("exige tenant e brand", () => {
    expect(() => toInsertRows("", "brand-1", [])).toThrow(/tenantId/);
    expect(() => toInsertRows("tenant-1", " ", [])).toThrow(/brandId/);
  });
});
