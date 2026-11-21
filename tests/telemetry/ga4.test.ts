import { describe, expect, it } from "vitest";

import { parseGa4Webhook } from "@/lib/telemetry/ga4";

const RECORDED_AT = "2026-02-01T10:00:00.000Z";

function event(
  eventName: string,
  eventParams: Record<string, unknown> = {},
): Record<string, unknown> {
  return { eventName, eventParams };
}

describe("parseGa4Webhook — mapeamento", () => {
  it("mapeia page_view, video_progress e scroll para a linha normalizada", () => {
    const payload = [
      event("page_view", {
        asset_id: "asset-1",
        channel_label: "youtube",
        recorded_at: RECORDED_AT,
      }),
      event("video_progress", {
        asset_id: "asset-1",
        channel_label: "youtube",
        percent: 50,
        recorded_at: RECORDED_AT,
      }),
      event("scroll", {
        asset_id: "asset-1",
        channel_label: "youtube",
        percent: "75",
        recorded_at: RECORDED_AT,
      }),
    ];

    const { rows, skipped } = parseGa4Webhook(payload);

    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    expect(row.asset_id).toBe("asset-1");
    expect(row.channel_label).toBe("youtube");
    expect(row.impressions).toBe(1);
    expect(row.views_3s).toBe(1);
    expect(row.retention_50_pct).toBeCloseTo(0.75, 6);
    expect(row.hook_rate).toBe(1);
    expect(row.source_mode).toBe("ga4_webhook");
    expect(row.recorded_at).toBe(RECORDED_AT);
  });

  it("aceita envelope { events } e cria impressão a partir de vídeo sem page_view", () => {
    const payload = {
      events: [
        event("video_progress", {
          asset_id: "asset-2",
          channel: "instagram",
          percent: 25,
          timestamp: Date.parse(RECORDED_AT),
        }),
      ],
    };

    const { rows, skipped } = parseGa4Webhook(payload);

    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.impressions).toBe(1);
    expect(rows[0]?.views_3s).toBe(1);
    expect(rows[0]?.retention_50_pct).toBeNull();
    expect(rows[0]?.channel_label).toBe("instagram");
    expect(rows[0]?.recorded_at).toBe(RECORDED_AT);
  });

  it("agrega eventos por ativo, canal e dia", () => {
    const payload = [
      event("page_view", { asset_id: "a", channel_label: "tiktok", recorded_at: RECORDED_AT }),
      event("page_view", {
        asset_id: "a",
        channel_label: "tiktok",
        recorded_at: "2026-02-01T23:30:00.000Z",
      }),
      event("page_view", { asset_id: "b", channel_label: "tiktok", recorded_at: RECORDED_AT }),
    ];

    const { rows } = parseGa4Webhook(payload);

    expect(rows).toHaveLength(2);
    const assetA = rows.find((row) => row.asset_id === "a");
    expect(assetA?.impressions).toBe(2);
    expect(assetA?.recorded_at).toBe(RECORDED_AT);
    expect(rows.find((row) => row.asset_id === "b")?.impressions).toBe(1);
  });
});

describe("parseGa4Webhook — descarte", () => {
  it("descarta eventos irrelevantes e malformados sem abortar", () => {
    const payload = [
      event("page_view", { asset_id: "asset-1", channel_label: "youtube", recorded_at: RECORDED_AT }),
      event("purchase", { asset_id: "asset-1", recorded_at: RECORDED_AT }),
      { eventName: "", eventParams: {} },
      { foo: "bar" },
      event("video_progress", {
        asset_id: "asset-1",
        channel_label: "youtube",
        recorded_at: RECORDED_AT,
      }),
    ];

    const { rows, skipped } = parseGa4Webhook(payload);

    expect(skipped).toBe(3);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.impressions).toBe(1);
    expect(rows[0]?.views_3s).toBe(1);
  });

  it("descarta payload não reconhecido", () => {
    expect(parseGa4Webhook("payload-invalido")).toEqual({ rows: [], skipped: 1 });
    expect(parseGa4Webhook(null)).toEqual({ rows: [], skipped: 1 });
    expect(parseGa4Webhook(42)).toEqual({ rows: [], skipped: 1 });
  });
});
