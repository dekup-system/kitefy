-- =============================================================================
-- 0006 — Busca vetorial para uso interno do agente (service_role)
-- =============================================================================
-- O RPC público match_knowledge_chunks() exige membership (auth.uid()), portanto
-- não serve para o grafo, que roda em contexto de servidor sem JWT de usuário.
-- Aqui expomos a mesma consulta (com hnsw.iterative_scan) para service_role.
--
-- Isolamento: a função recebe tenant_id e brand_id explícitos e o acesso é
-- revogado de public/authenticated/anon. Nenhum cliente PostgREST a alcança.
-- =============================================================================

create or replace function public.match_brand_chunks(
  p_tenant_id uuid,
  p_brand_id uuid,
  query_embedding extensions.vector(768),
  match_count integer default 8,
  match_threshold double precision default 0.0
)
returns table (
  id uuid,
  content text,
  source_type text,
  metadata jsonb,
  performance_score numeric,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Garante que a marca pertence ao tenant informado (defesa em profundidade).
  if not exists (
    select 1 from public.brand_profiles bp
     where bp.id = p_brand_id and bp.tenant_id = p_tenant_id
  ) then
    raise exception 'brand_not_found_for_tenant' using errcode = 'P0002';
  end if;

  begin
    set local hnsw.iterative_scan = relaxed_order;
  exception
    when others then
      null; -- pgvector < 0.8
  end;

  return query
    select kc.id,
           kc.content,
           kc.source_type,
           kc.metadata,
           kc.performance_score,
           1 - (kc.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
      from public.knowledge_chunks kc
     where kc.tenant_id = p_tenant_id
       and kc.brand_id = p_brand_id
       and kc.embedding is not null
       and 1 - (kc.embedding OPERATOR(extensions.<=>) query_embedding) >= match_threshold
     order by kc.embedding OPERATOR(extensions.<=>) query_embedding
     limit greatest(1, least(coalesce(match_count, 8), 64));
end;
$$;

revoke all on function public.match_brand_chunks(uuid, uuid, extensions.vector, integer, double precision) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.match_brand_chunks(uuid, uuid, extensions.vector, integer, double precision) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.match_brand_chunks(uuid, uuid, extensions.vector, integer, double precision) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.match_brand_chunks(uuid, uuid, extensions.vector, integer, double precision) to service_role;
  end if;
end
$$;

comment on function public.match_brand_chunks(uuid, uuid, extensions.vector, integer, double precision) is
  'Top-K da marca para o agente (service_role). A versão para usuário é match_knowledge_chunks().';
