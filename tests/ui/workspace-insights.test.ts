import { describe, expect, it } from "vitest";
import {
  buildPublishChecklist,
  computeBrandCompleteness,
  computeContentScore,
  packageDisplayName,
  resolveNextBestAction,
} from "@/lib/ui/workspace-insights";

describe("workspace-insights", () => {
  it("calcula completude da marca de 0 a 100 com pendências acionáveis", () => {
    const empty = computeBrandCompleteness({ id: "b1", brand_name: "Kitefy" });
    expect(empty.score).toBe(0);
    expect(empty.missing).toHaveLength(7);

    const full = computeBrandCompleteness({
      id: "b1",
      brand_name: "Kitefy",
      website_url: "https://www.kitefy.com.br",
      icp_description: "PMEs brasileiras que produzem conteúdo orgânico",
      tone_of_voice: {
        formality: "direto",
        audience_study: { personas: [{ name: "Decisor Pragmático" }] },
      },
      visual_tokens: { logo_path: "t1/b1/brand/logo.png" },
      entity_facts: [{ claim: "120 créditos", source_url: "https://www.kitefy.com.br/pricing" }],
      google_verification_token: "abc123",
    });
    expect(full.score).toBe(100);
    expect(full.missing).toHaveLength(0);
  });

  it("prioriza próxima melhor ação na ordem correta (marca → aprovação → saldo → primeiro conteúdo)", () => {
    expect(
      resolveNextBestAction({
        brandCount: 0,
        pendingApprovalCount: 0,
        totalAssets: 0,
        telemetryCount: 0,
        creditBalance: 120,
      }).href,
    ).toBe("/onboarding");

    expect(
      resolveNextBestAction({
        brandCount: 1,
        primaryBrandId: "b1",
        pendingApprovalCount: 2,
        firstPendingThreadId: "thr-1",
        totalAssets: 3,
        telemetryCount: 1,
        creditBalance: 100,
      }).href,
    ).toBe("/studio/thr-1");

    expect(
      resolveNextBestAction({
        brandCount: 1,
        primaryBrandId: "b1",
        pendingApprovalCount: 0,
        totalAssets: 5,
        telemetryCount: 2,
        creditBalance: 1,
      }).href,
    ).toBe("/settings/billing");
  });

  it("calcula Content Score determinístico e checklist por formato", () => {
    const score = computeContentScore({
      payload: {
        kind: "typo_carousel",
        slides: [{ index: 1, title: "Teste", body: "Corpo", layout: "cover" }],
        design_notes: ["Padrão de marca"],
        caption: { seo: "Uma legenda completa com mais de quarenta caracteres para leitura.", hashtags: ["#kitefy"] },
      },
      hookCount: 3,
      visualCount: 7,
      compliancePassed: true,
      complianceIssuesCount: 0,
      hasJsonLd: false,
    });
    expect(score.score).toBe(100);
    expect(score.tier).toBe("excelente");

    expect(buildPublishChecklist("geo_article").length).toBeGreaterThanOrEqual(3);
    expect(packageDisplayName("pro")).toBe("Kitefy Lift");
  });
});
