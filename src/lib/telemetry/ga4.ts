import { z } from "zod";

import { normalizeRecordedAt, type NormalizedTelemetryRow } from "./csv";

/**
 * Webhook de eventos GA4.
 *
 * Mapeamento:
 *   page_view       -> impressions
 *   video_progress  -> views_3s (e retenção quando o percentual >= 50%)
 *   scroll          -> retention_50_pct (percentual >= 50%)
 *
 * Eventos irrelevantes ou malformados são descartados e contabilizados em
 * `skipped`, sem interromper o lote.
 */

export interface Ga4ParseResult {
  rows: NormalizedTelemetryRow[];
  skipped: number;
}

const ga4EventSchema = z.object({
  eventName: z.string().min(1),
  eventParams: z.record(z.string(), z.unknown()).optional(),
});

interface NormalizedEvent {
  name: string;
  params: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readParam(params: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = params[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function readString(params: Record<string, unknown>, keys: readonly string[]): string | null {
  const value = readParam(params, keys);
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readPercent(params: Record<string, unknown>): number | null {
  const value = readParam(params, ["percent", "percentage", "video_percent", "scroll_percent", "value"]);
  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string") {
    const cleaned = value.replace("%", "").replace(",", ".").trim();
    numeric = Number(cleaned);
  } else {
    return null;
  }

  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric > 1 ? numeric / 100 : numeric;
}

function readEventDate(params: Record<string, unknown>, fallbackIso: string): string {
  const value = readParam(params, ["recorded_at", "date", "timestamp", "event_timestamp"]);

  if (typeof value === "number" && Number.isFinite(value)) {
    // GA4 costuma enviar microssegundos; aceitamos segundos, ms e µs.
    if (value > 1e15) return new Date(value / 1000).toISOString();
    if (value > 1e12) return new Date(value).toISOString();
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return readEventDate({ timestamp: Number(trimmed) }, fallbackIso);
    }
    const normalized = normalizeRecordedAt(trimmed);
    if (normalized) return normalized;
  }

  return fallbackIso;
}

function extractEvents(payload: unknown): { events: unknown[]; unusable: boolean } {
  if (Array.isArray(payload)) {
    return { events: payload, unusable: false };
  }
  if (isRecord(payload)) {
    if (Array.isArray(payload.events)) {
      return { events: payload.events, unusable: false };
    }
    if (typeof payload.eventName === "string") {
      return { events: [payload], unusable: false };
    }
  }
  return { events: [], unusable: true };
}

interface Bucket {
  asset_id: string | null;
  channel_label: string;
  recorded_at: string;
  impressions: number;
  views_3s: number;
  retention_50_pct: number | null;
}

function isRelevantEvent(name: string): boolean {
  return name === "page_view" || name === "video_progress" || name === "scroll";
}

/** Normaliza o payload do webhook em linhas prontas para `performance_telemetry`. */
export function parseGa4Webhook(payload: unknown): Ga4ParseResult {
  const { events, unusable } = extractEvents(payload);
  if (unusable) {
    return { rows: [], skipped: 1 };
  }

  const nowIso = new Date().toISOString();
  const buckets = new Map<string, Bucket>();
  let skipped = 0;

  for (const raw of events) {
    const parsed = ga4EventSchema.safeParse(raw);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }

    const event: NormalizedEvent = {
      name: parsed.data.eventName.trim().toLowerCase(),
      params: parsed.data.eventParams ?? {},
    };

    if (!isRelevantEvent(event.name)) {
      skipped += 1;
      continue;
    }

    const assetId = readString(event.params, ["asset_id", "ativo_id", "assetId", "asset"]);
    const channel = readString(event.params, ["channel_label", "channel", "canal"]) ?? "ga4";
    const recordedAt = readEventDate(event.params, nowIso);
    // Agrega por dia UTC: eventos do mesmo ativo/canal no mesmo dia viram uma
    // linha, mantendo o timestamp do evento mais antigo do grupo.
    const dayKey = recordedAt.slice(0, 10);
    const key = `${assetId ?? ""}\u0000${channel}\u0000${dayKey}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        asset_id: assetId,
        channel_label: channel,
        recorded_at: recordedAt,
        impressions: 0,
        views_3s: 0,
        retention_50_pct: null,
      };
      buckets.set(key, bucket);
    } else if (recordedAt < bucket.recorded_at) {
      bucket.recorded_at = recordedAt;
    }

    if (event.name === "page_view") {
      bucket.impressions += 1;
      continue;
    }

    if (event.name === "video_progress") {
      bucket.views_3s += 1;
    }

    const percent = readPercent(event.params);
    if (percent !== null && percent >= 0.5) {
      bucket.retention_50_pct = Math.max(bucket.retention_50_pct ?? 0, percent);
    }
  }

  const rows: NormalizedTelemetryRow[] = [...buckets.values()]
    .map((bucket) => {
      // Um evento de vídeo implica impressão mesmo sem page_view no payload.
      const impressions = Math.max(bucket.impressions, bucket.views_3s);
      const views = Math.min(bucket.views_3s, impressions);
      return {
        asset_id: bucket.asset_id,
        channel_label: bucket.channel_label,
        impressions,
        views_3s: views,
        hook_rate: impressions > 0 ? views / impressions : 0,
        retention_50_pct: bucket.retention_50_pct,
        saves_or_clicks: 0,
        ai_citations_count: 0,
        source_mode: "ga4_webhook" as const,
        recorded_at: bucket.recorded_at,
      };
    })
    .sort((left, right) => {
      if (left.recorded_at !== right.recorded_at) {
        return left.recorded_at < right.recorded_at ? -1 : 1;
      }
      if (left.channel_label !== right.channel_label) {
        return left.channel_label < right.channel_label ? -1 : 1;
      }
      return (left.asset_id ?? "").localeCompare(right.asset_id ?? "");
    });

  return { rows, skipped };
}
