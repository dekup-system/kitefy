type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED_KEYS = new Set([
  "authorization",
  "apikey",
  "cookie",
  "password",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "mp_access_token",
  "service_role_key",
  "x-signature",
]);

function minLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, scope: string, message: string, data?: unknown): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel()]) return;

  const payload = {
    level,
    scope,
    message,
    ts: new Date().toISOString(),
    ...(data === undefined ? {} : { data: redact(data) }),
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Logger estruturado (JSON) com redação de segredos.
 * Nunca loga payload bruto do Mercado Pago, tokens ou chaves.
 */
export function createLogger(scope: string) {
  return {
    debug: (message: string, data?: unknown) => emit("debug", scope, message, data),
    info: (message: string, data?: unknown) => emit("info", scope, message, data),
    warn: (message: string, data?: unknown) => emit("warn", scope, message, data),
    error: (message: string, data?: unknown) => emit("error", scope, message, data),
  };
}

export type Logger = ReturnType<typeof createLogger>;
