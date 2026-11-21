-- =============================================================================
-- BrandPulse Organic & GEO Studio
-- 0001 — Extensões, schemas e helpers de infraestrutura
-- =============================================================================
-- Idempotente: pode ser aplicada repetidamente sem erro.
-- Ordem de execução definida pelo nome do arquivo (supabase db push / CLI).
-- =============================================================================

-- --- Extensões obrigatórias ---------------------------------------------------
-- Em Supabase o schema `extensions` já existe; garantimos aqui para runs limpos.
create schema if not exists extensions;

-- pgcrypto: gen_random_uuid(), digest() para hashes internos.
create extension if not exists pgcrypto with schema extensions;

-- pgvector (>= 0.8): busca vetorial e hnsw.iterative_scan.
create extension if not exists vector with schema extensions;

-- pg_trgm: busca textual (autocomplete/global search na UI).
create extension if not exists pg_trgm with schema extensions;

-- --- Schemas ------------------------------------------------------------------
-- `langgraph` isolado: tabelas do PostgresSaver NUNCA no schema public,
-- portanto nunca expostas pelo PostgREST.
create schema if not exists langgraph;

-- Schema dedicado a helpers internos que não devem aparecer na API pública.
create schema if not exists private;

-- --- pgmq (filas internas) ----------------------------------------------------
-- pgmq não está disponível em todos os ambientes (ex.: harness de teste local).
-- Criamos de forma best-effort: em produção (Supabase) a extensão existe.
do $$
begin
  create extension if not exists pgmq;
exception
  when others then
    raise notice 'pgmq indisponível neste ambiente (%): filas ficam desativadas.', sqlerrm;
end
$$;

-- --- Helpers de timestamp -----------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'Trigger genérico: mantém updated_at consistente em qualquer tabela que a use.';
