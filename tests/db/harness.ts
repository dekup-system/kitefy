/**
 * Harness de banco para testes de integração sem Docker.
 *
 * Estratégia: PGlite (Postgres em WASM) + pgvector 0.8.x + pg_trgm + pgcrypto.
 * As migrations reais de `supabase/migrations` são aplicadas na ordem, sem
 * versões adaptadas — o que é testado é exatamente o SQL que vai para produção.
 *
 * O que é stubado (somente no teste):
 *  - schema `auth` com `users` e `auth.uid()` (Supabase Auth);
 *  - roles `anon`, `authenticated`, `service_role` (com BYPASSRLS);
 *  - ausência de `storage` e `pgmq` (as migrations tratam isso com DO blocks).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const AUTH_STUB = /* sql */ `
-- ===== Stub mínimo do Supabase Auth (apenas testes) =====
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant select on auth.users to service_role;
`;

const ROLES_STUB = /* sql */ `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
`;

export type Db = PGlite;
export type QueryResult<T> = { rows: T[] };

export class TestDatabase {
  readonly db: Db;

  private constructor(db: Db) {
    this.db = db;
  }

  static async create(): Promise<TestDatabase> {
    const db = await PGlite.create({
      extensions: { vector, pgcrypto, pg_trgm },
      // Estruturas grandes (HNSW) precisam de mais memória no WASM.
      wasmModule: undefined,
    });
    const instance = new TestDatabase(db);
    await instance.bootstrap();
    return instance;
  }

  private async bootstrap(): Promise<void> {
    await this.db.exec(ROLES_STUB);
    await this.db.exec(AUTH_STUB);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      throw new Error(`Nenhuma migration encontrada em ${MIGRATIONS_DIR}`);
    }

    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      try {
        await this.db.exec(sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Falha ao aplicar migration ${file}: ${message}`);
      }
    }
  }

  /** Executa como superusuário (ignora RLS) — use para semear dados. */
  async asSuperuser<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    await this.db.exec("reset role;");
    return (await this.db.query<T>(sql, params)).rows;
  }

  /** Executa como service_role (ignora RLS, como nas rotas de servidor). */
  async asService<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    await this.db.exec("set role service_role;");
    return (await this.db.query<T>(sql, params)).rows;
  }

  /** Executa como usuário autenticado específico (RLS ativa). */
  async asUser<T = Record<string, unknown>>(
    userId: string,
    sql: string,
    params: unknown[] = [],
  ) {
    await this.db.exec("reset role;");
    await this.db.exec("set role authenticated;");
    await this.db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await this.db.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
    return (await this.db.query<T>(sql, params)).rows;
  }

  /** Executa como anônimo (RLS ativa, sem JWT). */
  async asAnon<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    await this.db.exec("reset role;");
    await this.db.exec("set role anon;");
    return (await this.db.query<T>(sql, params)).rows;
  }

  /**
   * Espera que a query falhe; devolve a mensagem de erro.
   * Falha o teste se a query passar (violação de isolamento!).
   */
  async expectFailure(run: () => Promise<unknown>): Promise<string> {
    try {
      await run();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("Esperava falha de permissão/violação, mas a query foi executada.");
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/** Cria um usuário no stub do Auth e devolve o tenant gerado pelo trigger. */
export async function createUserWithTenant(
  db: TestDatabase,
  email: string,
  brandName?: string,
): Promise<{ userId: string; tenantId: string }> {
  const rows = await db.asSuperuser<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('brand_name', $2::text))
     returning id`,
    [email, brandName ?? null],
  );
  const userId = rows[0]!.id;
  await db.db.exec("reset role;");
  const tenantRows = await db.db.query<{ tenant_id: string }>(
    "select tenant_id from public.tenant_members where user_id = $1",
    [userId],
  );
  return { userId, tenantId: tenantRows.rows[0]!.tenant_id };
}
