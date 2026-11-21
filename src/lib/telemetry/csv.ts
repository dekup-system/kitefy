import { parse } from "csv-parse/sync";
import { z } from "zod";

import type { TelemetrySourceMode } from "@/types/domain";

/**
 * Importação de telemetria via CSV.
 *
 * O lote nunca aborta por causa de uma linha inválida: cada problema vira um
 * item em `errors` com o número da linha, e as linhas válidas seguem para o
 * insert. Cabeçalhos em português e inglês são aceitos.
 */

export interface NormalizedTelemetryRow {
  asset_id: string | null;
  channel_label: string;
  impressions: number;
  views_3s: number;
  hook_rate: number;
  retention_50_pct: number | null;
  saves_or_clicks: number;
  ai_citations_count: number;
  source_mode: TelemetrySourceMode;
  recorded_at: string;
}

export interface TelemetryCsvError {
  /** Linha do CSV (1 = cabeçalho). `0` quando não foi possível determinar. */
  line: number;
  message: string;
}

export interface TelemetryCsvParseResult {
  rows: NormalizedTelemetryRow[];
  errors: TelemetryCsvError[];
}

export interface PerformanceTelemetryInsert {
  tenant_id: string;
  brand_id: string;
  asset_id: string | null;
  channel_label: string;
  impressions: number;
  views_3s: number;
  hook_rate: number;
  retention_50_pct: number | null;
  saves_or_clicks: number;
  ai_citations_count: number;
  source_mode: TelemetrySourceMode;
  recorded_at: string;
}

// ---------------------------------------------------------------------------
// Cabeçalhos
// ---------------------------------------------------------------------------

type CanonicalField =
  | "asset_id"
  | "channel_label"
  | "impressions"
  | "views_3s"
  | "retention_50_pct"
  | "saves_or_clicks"
  | "ai_citations_count"
  | "recorded_at";

const HEADER_ALIASES: Readonly<Record<string, CanonicalField>> = {
  // ativo
  asset_id: "asset_id",
  ativo_id: "asset_id",
  asset: "asset_id",
  ativo: "asset_id",
  id_do_ativo: "asset_id",
  // canal
  channel_label: "channel_label",
  channel: "channel_label",
  canal: "channel_label",
  canal_rotulo: "channel_label",
  // impressões
  impressions: "impressions",
  impressoes: "impressions",
  impressao: "impressions",
  // views de 3 segundos
  views_3s: "views_3s",
  views_3_segundos: "views_3s",
  views3s: "views_3s",
  visualizacoes_3s: "views_3s",
  visualizacoes_3_segundos: "views_3s",
  visualizacao_3s: "views_3s",
  // retenção de 50%
  retention_50_pct: "retention_50_pct",
  retention_50: "retention_50_pct",
  retencao_50: "retention_50_pct",
  retencao_50_pct: "retention_50_pct",
  retencao_50_porcento: "retention_50_pct",
  // saves/cliques
  saves_or_clicks: "saves_or_clicks",
  saves: "saves_or_clicks",
  cliques: "saves_or_clicks",
  cliques_salvamentos: "saves_or_clicks",
  saves_clicks: "saves_or_clicks",
  salvamentos: "saves_or_clicks",
  // citações em IA
  ai_citations_count: "ai_citations_count",
  ai_citations: "ai_citations_count",
  citacoes_ia: "ai_citations_count",
  citacoes_de_ia: "ai_citations_count",
  citacoes_ia_count: "ai_citations_count",
  // data
  recorded_at: "recorded_at",
  data: "recorded_at",
  date: "recorded_at",
  dt: "recorded_at",
  registrado_em: "recorded_at",
};

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// Números e datas
// ---------------------------------------------------------------------------

interface DecimalResult {
  ok: boolean;
  value: number;
  message: string;
}

interface IntegerResult {
  ok: boolean;
  value: number;
  message: string;
}

function parseDecimal(raw: string, options: { percent?: boolean } = {}): DecimalResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, value: 0, message: "valor vazio" };

  const hasPercentSign = trimmed.includes("%");
  let cleaned = trimmed.replace(/R\$|\s/g, "").replace(/[^\d,.\-]/g, "");
  if (cleaned.length === 0 || cleaned === "-" || cleaned === "." || cleaned === ",") {
    return { ok: false, value: 0, message: `valor numérico inválido: "${raw}"` };
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // Formato pt-BR: ponto é milhar, vírgula é decimal.
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato en-US: vírgula é milhar, ponto é decimal.
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    cleaned = cleaned.replace(",", ".");
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    // Somente pontos em grupos de 3: milhar (ex.: "1.234").
    cleaned = cleaned.replace(/\./g, "");
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return { ok: false, value: 0, message: `valor numérico inválido: "${raw}"` };
  }

  if (hasPercentSign) {
    return { ok: true, value: parsed / 100, message: "" };
  }
  if (options.percent && parsed > 1) {
    return { ok: true, value: parsed / 100, message: "" };
  }
  return { ok: true, value: parsed, message: "" };
}

function parseInteger(raw: string): IntegerResult {
  const decimal = parseDecimal(raw);
  if (!decimal.ok) return { ok: false, value: 0, message: decimal.message };
  if (!Number.isInteger(decimal.value)) {
    return { ok: false, value: 0, message: `deve ser inteiro ("${raw}")` };
  }
  return { ok: true, value: decimal.value, message: "" };
}

/**
 * Normaliza datas aceitas no CSV (ISO, `dd/mm/aaaa` e `aaaa-mm-dd`) para ISO
 * 8601 em UTC. Retorna `null` quando a data é inválida.
 */
export function normalizeRecordedAt(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1]);
    const month = Number(isoDateOnly[2]);
    const day = Number(isoDateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null;
    }
    return date.toISOString();
  }

  const brDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (brDate) {
    const day = Number(brDate[1]);
    const month = Number(brDate[2]);
    const year = Number(brDate[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null;
    }
    return date.toISOString();
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

// ---------------------------------------------------------------------------
// Schema de linha (fonte única de validação)
// ---------------------------------------------------------------------------

const telemetryRowSchema = z
  .object({
    asset_id: z.string().min(1).nullable(),
    channel_label: z.string().min(1, "canal ausente"),
    impressions: z.number().int().min(0, "impressões não pode ser negativo"),
    views_3s: z.number().int().min(0, "views_3s não pode ser negativo"),
    retention_50_pct: z
      .number()
      .min(0, "retenção não pode ser negativa")
      .max(1, "retenção deve estar entre 0 e 1")
      .nullable(),
    saves_or_clicks: z.number().int().min(0, "saves/cliques não pode ser negativo"),
    ai_citations_count: z.number().int().min(0, "citações em IA não pode ser negativo"),
    recorded_at: z.string().min(1, "data ausente"),
  })
  .refine((row) => row.views_3s <= row.impressions, {
    message: "views_3s não pode ser maior que impressions",
    path: ["views_3s"],
  });

/** Campos obrigatórios para considerar o cabeçalho utilizável. */
const REQUIRED_FIELDS: readonly CanonicalField[] = [
  "impressions",
  "views_3s",
  "channel_label",
  "recorded_at",
];

const FIELD_LABELS: Readonly<Record<CanonicalField, string>> = {
  asset_id: "ativo",
  channel_label: "canal",
  impressions: "impressões",
  views_3s: "visualizações de 3s",
  retention_50_pct: "retenção de 50%",
  saves_or_clicks: "saves/cliques",
  ai_citations_count: "citações em IA",
  recorded_at: "data",
};

const csvEnvelopeSchema = z.object({
  record: z.record(z.string(), z.string()),
  info: z.object({
    lines: z.number(),
    columns: z.array(z.unknown()).optional(),
  }),
});

function columnName(column: unknown): string | null {
  if (typeof column === "string" && column.trim().length > 0) return column;
  if (
    typeof column === "object" &&
    column !== null &&
    "name" in column &&
    typeof (column as { name?: unknown }).name === "string"
  ) {
    const name = (column as { name: string }).name;
    return name.trim().length > 0 ? name : null;
  }
  return null;
}

function headerFieldsFromColumns(columns: readonly unknown[] | undefined): Set<CanonicalField> {
  const fields = new Set<CanonicalField>();
  for (const column of columns ?? []) {
    const name = columnName(column);
    if (name === null) continue;
    const canonical = HEADER_ALIASES[normalizeHeader(name)];
    if (canonical !== undefined) fields.add(canonical);
  }
  return fields;
}

interface FieldValues {
  [key: string]: string | undefined;
}

function mapRecord(record: Readonly<Record<string, string>>): FieldValues {
  const mapped: FieldValues = {};
  for (const [header, value] of Object.entries(record)) {
    const canonical = HEADER_ALIASES[normalizeHeader(header)];
    if (canonical !== undefined && mapped[canonical] === undefined) {
      mapped[canonical] = value;
    }
  }
  return mapped;
}

function missingHeaderFields(fields: ReadonlySet<CanonicalField>): CanonicalField[] {
  return REQUIRED_FIELDS.filter((field) => !fields.has(field));
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseTelemetryCsv(csv: string): TelemetryCsvParseResult {
  const rows: NormalizedTelemetryRow[] = [];
  const errors: TelemetryCsvError[] = [];

  if (csv.trim().length === 0) {
    errors.push({ line: 1, message: "CSV vazio: envie o cabeçalho e ao menos uma linha." });
    return { rows, errors };
  }

  const skippedErrors: TelemetryCsvError[] = [];
  let parsed: unknown;
  try {
    parsed = parse(csv, {
      columns: true,
      info: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      skip_records_with_error: true,
      on_skip: (error) => {
        const line = typeof error?.lines === "number" ? error.lines : 0;
        const message = error?.message ?? "linha inválida no CSV";
        skippedErrors.push({ line: line > 0 ? line : 1, message });
        return undefined;
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha ao interpretar o CSV";
    errors.push({ line: 1, message });
    return { rows, errors };
  }

  if (!Array.isArray(parsed)) {
    errors.push({ line: 1, message: "Formato de CSV inesperado." });
    return { rows, errors };
  }

  const envelopes: z.infer<typeof csvEnvelopeSchema>[] = [];
  const parsedRecords: unknown[] = parsed;

  parsedRecords.forEach((raw: unknown, index: number) => {
    const envelope = csvEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      errors.push({ line: index + 2, message: "Linha em formato inesperado." });
      return;
    }
    envelopes.push(envelope.data);
  });

  errors.push(...skippedErrors);

  if (envelopes.length === 0 && errors.length === 0) {
    // Cabeçalho válido sem linhas de dados: lote vazio, não é erro.
    return { rows, errors };
  }

  if (envelopes.length > 0) {
    const firstEnvelope = envelopes[0];
    const headerFields = new Set<CanonicalField>();
    const columns = firstEnvelope?.info.columns;
    if (columns !== undefined && columns.length > 0) {
      for (const field of headerFieldsFromColumns(columns)) {
        headerFields.add(field);
      }
    } else if (firstEnvelope) {
      const mapped = mapRecord(firstEnvelope.record);
      for (const field of REQUIRED_FIELDS) {
        if (mapped[field] !== undefined) headerFields.add(field);
      }
    }

    const missing = missingHeaderFields(headerFields);
    if (missing.length > 0) {
      errors.push({
        line: 1,
        message: `Cabeçalho incompleto: faltam ${missing.map((field) => FIELD_LABELS[field]).join(", ")}.`,
      });
      return { rows, errors };
    }
  }

  for (const envelope of envelopes) {
    const line = envelope.info.lines;
    const fields = mapRecord(envelope.record);
    const problems: string[] = [];

    const readInteger = (field: CanonicalField, defaultValue?: number): number => {
      const raw = fields[field];
      if (raw === undefined || raw.trim().length === 0) {
        if (defaultValue !== undefined) return defaultValue;
        problems.push(`${FIELD_LABELS[field]} ausente`);
        return 0;
      }
      const result = parseInteger(raw);
      if (!result.ok) {
        problems.push(`${FIELD_LABELS[field]}: ${result.message}`);
        return 0;
      }
      return result.value;
    };

    const impressions = readInteger("impressions");
    const views3s = readInteger("views_3s");
    const savesOrClicks = readInteger("saves_or_clicks", 0);
    const aiCitations = readInteger("ai_citations_count", 0);

    let retention: number | null = null;
    const retentionRaw = fields.retention_50_pct;
    if (retentionRaw !== undefined && retentionRaw.trim().length > 0) {
      const parsedRetention = parseDecimal(retentionRaw, { percent: true });
      if (!parsedRetention.ok) {
        problems.push(`${FIELD_LABELS.retention_50_pct}: ${parsedRetention.message}`);
      } else {
        retention = parsedRetention.value;
      }
    }

    const recordedAtRaw = fields.recorded_at;
    let recordedAt = "";
    if (recordedAtRaw === undefined || recordedAtRaw.trim().length === 0) {
      problems.push(`${FIELD_LABELS.recorded_at} ausente`);
    } else {
      const normalizedDate = normalizeRecordedAt(recordedAtRaw);
      if (normalizedDate === null) {
        problems.push(`${FIELD_LABELS.recorded_at}: data inválida ("${recordedAtRaw}")`);
      } else {
        recordedAt = normalizedDate;
      }
    }

    const channelLabel = (fields.channel_label ?? "").trim();
    if (channelLabel.length === 0) {
      problems.push(`${FIELD_LABELS.channel_label} ausente`);
    }

    const assetId = (fields.asset_id ?? "").trim();

    if (problems.length > 0) {
      for (const problem of problems) {
        errors.push({ line, message: problem });
      }
      continue;
    }

    const candidate = {
      asset_id: assetId.length > 0 ? assetId : null,
      channel_label: channelLabel,
      impressions,
      views_3s: views3s,
      retention_50_pct: retention,
      saves_or_clicks: savesOrClicks,
      ai_citations_count: aiCitations,
      recorded_at: recordedAt,
    };

    const validated = telemetryRowSchema.safeParse(candidate);
    if (!validated.success) {
      for (const issue of validated.error.issues) {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        errors.push({ line, message: `${path}${issue.message}` });
      }
      continue;
    }

    const valid = validated.data;
    rows.push({
      ...valid,
      hook_rate: valid.impressions > 0 ? valid.views_3s / valid.impressions : 0,
      source_mode: "csv",
    });
  }

  errors.sort((left, right) => left.line - right.line);
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Payload de insert
// ---------------------------------------------------------------------------

/** Converte linhas normalizadas no payload de `.from("performance_telemetry").insert()`. */
export function toInsertRows(
  tenantId: string,
  brandId: string,
  rows: readonly NormalizedTelemetryRow[],
): PerformanceTelemetryInsert[] {
  if (tenantId.trim().length === 0) {
    throw new Error("toInsertRows: tenantId obrigatório.");
  }
  if (brandId.trim().length === 0) {
    throw new Error("toInsertRows: brandId obrigatório.");
  }

  return rows.map((row) => ({
    tenant_id: tenantId,
    brand_id: brandId,
    asset_id: row.asset_id,
    channel_label: row.channel_label,
    impressions: row.impressions,
    views_3s: row.views_3s,
    hook_rate: row.hook_rate,
    retention_50_pct: row.retention_50_pct,
    saves_or_clicks: row.saves_or_clicks,
    ai_citations_count: row.ai_citations_count,
    source_mode: row.source_mode,
    recorded_at: row.recorded_at,
  }));
}
