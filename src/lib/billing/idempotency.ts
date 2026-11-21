import { randomUUID } from "node:crypto";

/**
 * Idempotência de curta duração para chamadas de cobrança.
 *
 * Objetivo: um duplo clique / retry automático do navegador no mesmo request não
 * gera duas cobranças no Mercado Pago. A memoização é feita em memória do
 * processo (Map) e expira após 10 minutos.
 *
 * Limitação consciente: em deploy multi-instância (serverless) cada instância
 * tem seu próprio cache. A garantia forte continua sendo a `idempotencyKey`
 * enviada ao Mercado Pago (`requestOptions.idempotencyKey`) — esta camada é a
 * primeira linha, não a única.
 */

/** TTL das entradas memoizadas: 10 minutos. */
export const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  readonly createdAt: number;
  readonly promise: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();

/** Gera uma chave de idempotência nova (UUID v4). */
export function newIdempotencyKey(): string {
  return randomUUID();
}

/** Remove entradas expiradas. Chamado a cada acesso (o cache é pequeno). */
function pruneExpired(now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) {
      cache.delete(key);
    }
  }
}

/**
 * Executa `fn` no máximo uma vez por `key` enquanto a entrada estiver viva.
 *
 * - Chamadas concorrentes com a mesma chave compartilham a MESMA promise, então
 *   nem uma corrida entre dois requests dispara duas cobranças;
 * - Se `fn` rejeitar, a entrada é removida imediatamente: um retry legítimo
 *   (depois de corrigir o problema) pode tentar de novo;
 * - O valor resolvido é memoizado por 10 minutos.
 */
export async function withIdempotency<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const normalizedKey = key.trim();
  if (normalizedKey.length === 0) {
    throw new Error("Chave de idempotência vazia: informe uma chave estável para o request.");
  }

  const now = Date.now();
  pruneExpired(now);

  const cached = cache.get(normalizedKey);
  if (cached) {
    return cached.promise as Promise<T>;
  }

  const promise = fn().catch((error: unknown) => {
    cache.delete(normalizedKey);
    throw error;
  });

  cache.set(normalizedKey, { createdAt: now, promise });

  return promise;
}

/** Somente para testes: zera o cache entre cenários. */
export function clearIdempotencyCache(): void {
  cache.clear();
}
