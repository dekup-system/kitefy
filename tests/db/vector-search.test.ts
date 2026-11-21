import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDatabase, createUserWithTenant } from "./harness";

const DIM = 768;

/** Constrói um vetor unitário determinístico a partir de um "one-hot" suave. */
function embedding(seed: number): string {
  const values = Array.from({ length: DIM }, (_, i) => {
    const base = Math.cos((i + 1) * (seed + 1) * 0.001) * 0.01;
    return seed === 0 ? base : base + (i % 7 === seed ? 0.9 : 0);
  });
  return `[${values.map((v) => v.toFixed(6)).join(",")}]`;
}

describe("RPC match_knowledge_chunks (pgvector + HNSW + isolamento)", () => {
  let t: TestDatabase;
  let tenantA: { userId: string; tenantId: string };
  let tenantB: { userId: string; tenantId: string };
  let brandA: string;
  let brandB: string;

  beforeAll(async () => {
    t = await TestDatabase.create();
    tenantA = await createUserWithTenant(t, "vec-a@search.test", "Vetor A");
    tenantB = await createUserWithTenant(t, "vec-b@search.test", "Vetor B");

    const bA = await t.asSuperuser<{ id: string }>(
      "insert into public.brand_profiles (tenant_id, brand_name) values ($1, 'Vetor A') returning id",
      [tenantA.tenantId],
    );
    const bB = await t.asSuperuser<{ id: string }>(
      "insert into public.brand_profiles (tenant_id, brand_name) values ($1, 'Vetor B') returning id",
      [tenantB.tenantId],
    );
    brandA = bA[0]!.id;
    brandB = bB[0]!.id;

    await t.asSuperuser(
      `insert into public.knowledge_chunks (tenant_id, brand_id, source_type, content, embedding, performance_score)
       values
         ($1, $2, 'winning_post', 'Post campeão sobre retenção', $3::extensions.vector, 0.91),
         ($1, $2, 'brand_doc', 'Documento de marca', $4::extensions.vector, 0.40),
         ($1, $2, 'serp_insight', 'Insight de SERP', $5::extensions.vector, 0.70)`,
      [tenantA.tenantId, brandA, embedding(1), embedding(2), embedding(3)],
    );
    await t.asSuperuser(
      `insert into public.knowledge_chunks (tenant_id, brand_id, source_type, content, embedding)
       values ($1, $2, 'winning_post', 'Segredo do concorrente', $3::extensions.vector)`,
      [tenantB.tenantId, brandB, embedding(1)],
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it("retorna apenas chunks da marca pedida", async () => {
    const rows = await t.asUser<{ content: string; similarity: number }>(
      tenantA.userId,
      "select * from public.match_knowledge_chunks($1, $2, $3::extensions.vector, 10, 0)",
      [tenantA.tenantId, brandA, embedding(1)],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.content.includes("concorrente"))).toBe(true);
  });

  it("ordena por similaridade decrescente e respeita match_count", async () => {
    const rows = await t.asUser<{ similarity: number }>(
      tenantA.userId,
      "select * from public.match_knowledge_chunks($1, $2, $3::extensions.vector, 2, 0)",
      [tenantA.tenantId, brandA, embedding(1)],
    );
    expect(rows).toHaveLength(2);
    const sims = rows.map((r) => Number(r.similarity));
    expect(sims[0]!).toBeGreaterThanOrEqual(sims[1]!);
  });

  it("aplica match_threshold", async () => {
    const rows = await t.asUser<{ content: string }>(
      tenantA.userId,
      "select * from public.match_knowledge_chunks($1, $2, $3::extensions.vector, 10, 0.99)",
      [tenantA.tenantId, brandA, embedding(1)],
    );
    // Apenas o chunk idêntico ao vetor consultado deve passar do limiar alto.
    expect(rows.length).toBeLessThanOrEqual(1);
  });

  it("bloqueia consulta em tenant do qual o usuário não é membro", async () => {
    const message = await t.expectFailure(() =>
      t.asUser(
        tenantA.userId,
        "select * from public.match_knowledge_chunks($1, $2, $3::extensions.vector, 5, 0)",
        [tenantB.tenantId, brandB, embedding(1)],
      ),
    );
    expect(message).toMatch(/forbidden/i);
  });

  it("anônimo não executa a RPC", async () => {
    const message = await t.expectFailure(() =>
      t.asAnon("select * from public.match_knowledge_chunks($1, $2, $3::extensions.vector, 5, 0)", [
        tenantA.tenantId,
        brandA,
        embedding(1),
      ]),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("a função usa hnsw.iterative_scan = relaxed_order quando disponível", async () => {
    const rows = await t.asSuperuser<{ prosrc: string }>(
      "select prosrc from pg_proc where proname = 'match_knowledge_chunks'",
    );
    expect(rows[0]!.prosrc).toContain("hnsw.iterative_scan");
    expect(rows[0]!.prosrc).toContain("relaxed_order");
    expect(rows[0]!.prosrc).toContain("OPERATOR(extensions.<=>)");
  });
});
