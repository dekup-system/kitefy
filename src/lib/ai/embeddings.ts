import { embedMany } from "ai";
import { getServerEnv, isMockMode } from "@/lib/env";
import { getEmbeddingModel } from "@/lib/ai/models";

/**
 * Embeddings com dimensão fixa (default 768, teto 2000 — limite do índice HNSW).
 *
 * Em `LLM_PROVIDER_MODE=mock` usamos feature hashing determinístico: sem rede,
 * mas com similaridade de cosseno semanticamente útil (bag-of-words), o que
 * permite testar busca vetorial, reindexação e o loop de aprendizado offline.
 */

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "ou", "que", "para",
  "com", "sem", "um", "uma", "uns", "umas", "em", "no", "na", "nos", "nas", "por",
  "se", "ao", "aos", "é", "são", "como", "mais", "menos", "muito", "sua", "seu",
  "the", "and", "for", "with", "that", "this", "from", "your", "you",
]);

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/** FNV-1a 32 bits — estável entre execuções e independente de plataforma. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mockEmbedding(text: string, dimension: number): number[] {
  const vector = new Array<number>(dimension).fill(0);
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    // Texto vazio/sem tokens: vetor constante para não gerar NaN no cosseno.
    vector[0] = 1;
    return vector;
  }

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  // Unigramas com tf sublinear.
  for (const [token, count] of counts) {
    const index = fnv1a(token) % dimension;
    const weight = 1 + Math.log(count);
    vector[index] = (vector[index] ?? 0) + weight;
  }

  // Bigramas dão noção de ordem (ex.: "gancho forte" vs "forte gancho").
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    const index = fnv1a(bigram) % dimension;
    vector[index] = (vector[index] ?? 0) + 0.5;
  }

  return l2Normalize(vector);
}

function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimensões incompatíveis: ${a.length} vs ${b.length}.`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function assertEmbeddingDimension(vector: number[]): void {
  const expected = getServerEnv().EMBEDDING_DIMENSION;
  if (vector.length !== expected) {
    throw new Error(
      `Embedding com dimensão ${vector.length}, esperado ${expected}. ` +
        "Ajuste EMBEDDING_DIMENSION e a coluna vector(N) no banco juntos.",
    );
  }
}

/** Gera embeddings para um lote de textos. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const env = getServerEnv();
  const dimension = env.EMBEDDING_DIMENSION;

  if (dimension > 2000) {
    throw new Error("EMBEDDING_DIMENSION acima de 2000 não é compatível com índice HNSW.");
  }

  if (isMockMode()) {
    return texts.map((text) => {
      const vector = mockEmbedding(text, dimension);
      assertEmbeddingDimension(vector);
      return vector;
    });
  }

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values: texts,
    dimensions: dimension,
  });

  for (const embedding of embeddings) {
    assertEmbeddingDimension(embedding as number[]);
  }

  return embeddings as number[][];
}

export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new Error("Falha ao gerar embedding.");
  return vector;
}

/** Converte para o literal aceito pelo pgvector: '[0.1,0.2,...]'. */
export function toPgVector(vector: number[]): string {
  return `[${vector.map((value) => Number(value.toFixed(6))).join(",")}]`;
}
