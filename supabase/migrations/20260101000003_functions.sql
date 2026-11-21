-- =============================================================================
-- 0003 — Funções transacionais, RPC de busca vetorial e bootstrap de tenant
-- =============================================================================
-- Regras de ouro:
--  * toda função SECURITY DEFINER fixa search_path (evita hijack de search_path);
--  * nenhuma função aceita tenant_id do cliente sem validar membership;
--  * consumo de crédito é serializado por linha (FOR UPDATE) — sem saldo negativo.
-- =============================================================================

-- --- Membership ---------------------------------------------------------------
-- SECURITY DEFINER para poder ser usada em políticas RLS de tenant_members
-- sem recursão infinita (a política de tenant_members consulta esta função).
create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.tenant_members tm
     where tm.tenant_id = p_tenant_id
       and tm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_tenant_member(uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated, service_role;

create or replace function public.current_tenant_role(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select tm.role
    from public.tenant_members tm
   where tm.tenant_id = p_tenant_id
     and tm.user_id = auth.uid()
   limit 1;
$$;

revoke all on function public.current_tenant_role(uuid) from public;
grant execute on function public.current_tenant_role(uuid) to authenticated, service_role;

-- --- Créditos: débito/crédito atômico ----------------------------------------
create or replace function public.consume_credits(
  p_tenant_id uuid,
  p_delta integer,
  p_reason text,
  p_reference_id text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if p_delta = 0 then
    raise exception 'delta_zero' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Serializa concorrência na linha do tenant.
  select t.credit_balance
    into v_balance
    from public.tenants t
   where t.id = p_tenant_id
   for update;

  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;

  if v_balance + p_delta < 0 then
    raise exception 'insufficient_credits'
      using errcode = 'P0001',
            detail = format('saldo=%s, solicitado=%s', v_balance, p_delta);
  end if;

  update public.tenants
     set credit_balance = v_balance + p_delta
   where id = p_tenant_id;

  insert into public.credit_ledger (tenant_id, delta, reason, reference_id)
  values (p_tenant_id, p_delta, p_reason, p_reference_id);

  return v_balance + p_delta;
end;
$$;

revoke all on function public.consume_credits(uuid, integer, text, text) from public;
grant execute on function public.consume_credits(uuid, integer, text, text) to service_role;

comment on function public.consume_credits(uuid, integer, text, text) is
  'Débito (delta < 0) ou estorno (delta > 0) atômico. Somente service_role.';

-- Alias semântico usado pelo estorno automático em falha técnica.
create or replace function public.refund_credits(
  p_tenant_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_id text default null
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.consume_credits(p_tenant_id, abs(p_amount), p_reason, p_reference_id);
$$;

revoke all on function public.refund_credits(uuid, integer, text, text) from public;
grant execute on function public.refund_credits(uuid, integer, text, text) to service_role;

-- --- Busca vetorial (RPC) -----------------------------------------------------
-- SET LOCAL hnsw.iterative_scan = relaxed_order preserva recall quando há
-- filtros combinados (tenant/brand) que descartam candidatos do HNSW.
-- Em ambientes com pgvector < 0.8 o ajuste não existe: ignoramos apenas esse caso.
create or replace function public.match_knowledge_chunks(
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
security invoker
set search_path = ''
as $$
begin
  -- Isolamento obrigatório: a chamada só enxerga a marca do próprio tenant.
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    set local hnsw.iterative_scan = relaxed_order;
  exception
    when others then
      -- pgvector < 0.8: parâmetro inexistente, seguimos sem relaxação.
      null;
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

revoke all on function public.match_knowledge_chunks(uuid, uuid, extensions.vector, integer, double precision) from public;
grant execute on function public.match_knowledge_chunks(uuid, uuid, extensions.vector, integer, double precision)
  to authenticated, service_role;

comment on function public.match_knowledge_chunks(uuid, uuid, extensions.vector, integer, double precision) is
  'Top-K chunks da marca via cosseno + HNSW iterative_scan; exige membership no tenant.';

-- --- Thompson Sampling: atualização de braço ---------------------------------
-- alpha += 1 em sucesso (hook_rate >= 0.35 ou acima do P75 do tenant), senão beta += 1.
create or replace function public.update_bandit_arm(
  p_tenant_id uuid,
  p_brand_id uuid,
  p_arm_key text,
  p_success boolean
)
returns public.bandit_arm_stats
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.bandit_arm_stats;
begin
  insert into public.bandit_arm_stats (tenant_id, brand_id, arm_key, alpha, beta, pulls)
  values (
    p_tenant_id,
    p_brand_id,
    p_arm_key,
    case when p_success then 2.0 else 1.0 end,
    case when p_success then 1.0 else 2.0 end,
    1
  )
  on conflict (tenant_id, brand_id, arm_key) do update
    set alpha = public.bandit_arm_stats.alpha + case when p_success then 1 else 0 end,
        beta  = public.bandit_arm_stats.beta  + case when p_success then 0 else 1 end,
        pulls = public.bandit_arm_stats.pulls + 1
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_bandit_arm(uuid, uuid, text, boolean) from public;
grant execute on function public.update_bandit_arm(uuid, uuid, text, boolean) to service_role;

-- Limiar de sucesso por tenant: P75 do hook_rate observado.
create or replace function public.tenant_hook_rate_p75(p_tenant_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select percentile_cont(0.75) within group (order by pt.hook_rate)
    from public.performance_telemetry pt
   where pt.tenant_id = p_tenant_id
     and pt.impressions > 0;
$$;

revoke all on function public.tenant_hook_rate_p75(uuid) from public;
grant execute on function public.tenant_hook_rate_p75(uuid) to service_role;

-- --- Bootstrap de tenant no cadastro -----------------------------------------
-- SECURITY DEFINER: roda no contexto do Auth (trigger em auth.users).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 0;
begin
  v_base_slug := regexp_replace(
    lower(coalesce(new.raw_user_meta_data ->> 'brand_name', split_part(new.email, '@', 1))),
    '[^a-z0-9]+', '-', 'g'
  );
  v_base_slug := trim(both '-' from v_base_slug);
  if length(v_base_slug) < 2 then
    v_base_slug := 'marca';
  end if;
  v_base_slug := left(v_base_slug, 48);

  v_slug := v_base_slug;
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  end loop;

  insert into public.tenants (name, slug, plan_tier, credit_balance)
  values (
    coalesce(new.raw_user_meta_data ->> 'brand_name', split_part(new.email, '@', 1)),
    v_slug,
    'essential',
    10 -- créditos de boas-vindas para o primeiro ativo demonstrativo
  )
  returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, new.id, 'owner');

  insert into public.credit_ledger (tenant_id, delta, reason, reference_id)
  values (v_tenant_id, 10, 'welcome_bonus', 'signup');

  return new;
end;
$$;

-- Trigger em auth.users é instalado apenas onde a tabela existe (Supabase).
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'auth' and table_name = 'users'
  ) then
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end
$$;

-- --- Telemetria: filtro de seleção de gancho ---------------------------------
create or replace function public.select_hook_variant(p_asset_id uuid, p_hook_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select ca.tenant_id into v_tenant_id
    from public.campaigns_and_assets ca
   where ca.id = p_asset_id;

  if v_tenant_id is null then
    raise exception 'asset_not_found' using errcode = 'P0002';
  end if;
  if not public.is_tenant_member(v_tenant_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.hook_variants
     set is_selected = false
   where asset_id = p_asset_id
     and tenant_id = v_tenant_id;

  update public.hook_variants
     set is_selected = true
   where id = p_hook_id
     and asset_id = p_asset_id
     and tenant_id = v_tenant_id;
end;
$$;

revoke all on function public.select_hook_variant(uuid, uuid) from public;
grant execute on function public.select_hook_variant(uuid, uuid) to authenticated, service_role;
