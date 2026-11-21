-- =============================================================================
-- 0005 — Storage privado, schema langgraph isolado e filas pgmq
-- =============================================================================

-- --- Storage privado ----------------------------------------------------------
-- Bucket privado: acesso apenas por URL assinada gerada no servidor.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'brand-assets',
      'brand-assets',
      false,
      15728640, -- 15 MB por arquivo renderizado
      array['image/png', 'image/jpeg', 'image/webp', 'application/json', 'text/markdown']
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

-- Convenção de caminho: <tenant_id>/<brand_id>/<asset_id>/<arquivo>
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'objects') then
    drop policy if exists brand_assets_read on storage.objects;
    create policy brand_assets_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'brand-assets'
        and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
      );

    drop policy if exists brand_assets_write on storage.objects;
    create policy brand_assets_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'brand-assets'
        and public.current_tenant_role(((storage.foldername(name))[1])::uuid) in ('owner', 'editor')
      );

    drop policy if exists brand_assets_delete on storage.objects;
    create policy brand_assets_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'brand-assets'
        and public.current_tenant_role(((storage.foldername(name))[1])::uuid) in ('owner', 'editor')
      );
  end if;
end
$$;

-- --- Schema langgraph ----------------------------------------------------------
-- Tabelas criadas por scripts/langgraph-setup.ts (checkpointer.setup()).
-- Nunca exposto pelo PostgREST: o schema não está em db.schema do Supabase.
revoke all on schema langgraph from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage, create on schema langgraph to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema langgraph from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema langgraph from anon;
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    alter default privileges in schema langgraph grant all on tables to service_role;
    alter default privileges in schema langgraph grant all on sequences to service_role;
  end if;
end
$$;

comment on schema langgraph is
  'Checkpoints do LangGraph (PostgresSaver). Acesso exclusivo de service_role.';

-- --- Filas internas (pgmq) ----------------------------------------------------
-- Nomes canônicos das filas usadas pelo worker.
--   mp_webhook_events  -> eventos do Mercado Pago após ACK 200
--   telemetry_distiller -> destilação de telemetria (bandit + reindexação)
--   asset_generation   -> gerações longas (geo_article) fora do request
do $$
declare
  v_queue text;
begin
  if exists (select 1 from pg_extension where extname = 'pgmq') then
    foreach v_queue in array array['mp_webhook_events', 'telemetry_distiller', 'asset_generation']
    loop
      begin
        perform pgmq.create(v_queue);
      exception
        when others then
          raise notice 'fila % já existe ou não pôde ser criada: %', v_queue, sqlerrm;
      end;
    end loop;
  else
    raise notice 'pgmq ausente: filas internas não criadas neste ambiente.';
  end if;
end
$$;

-- Wrapper de enfileiramento: usado pelas rotas de webhook/telemetria.
create or replace function public.enqueue_job(p_queue text, p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_queue not in ('mp_webhook_events', 'telemetry_distiller', 'asset_generation') then
    raise exception 'unknown_queue' using errcode = '22023', detail = p_queue;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pgmq') then
    -- Fallback sem pgmq (ambientes de teste): persiste em tabela de jobs.
    insert into private.job_queue (queue_name, payload)
    values (p_queue, p_payload);
    return 0;
  end if;

  return pgmq.send(p_queue, p_payload);
end;
$$;

revoke all on function public.enqueue_job(text, jsonb) from public;
grant execute on function public.enqueue_job(text, jsonb) to service_role;

-- Fila de fallback (usada quando pgmq não existe no ambiente).
create table if not exists private.job_queue (
  id bigserial primary key,
  queue_name text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists job_queue_pending_idx
  on private.job_queue (queue_name, created_at)
  where processed_at is null;

revoke all on private.job_queue from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on private.job_queue to service_role;
    grant all on sequence private.job_queue_id_seq to service_role;
  end if;
end
$$;
