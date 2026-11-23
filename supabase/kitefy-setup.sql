-- =============================================================================
-- Kitefy — setup completo do banco (idempotente)
--
-- COMO USAR (sem Docker, sem CLI):
--   1. Supabase Dashboard > SQL Editor > New query
--   2. Cole TODO este arquivo e clique em Run
--   3. Verifique em Table Editor: 11 tabelas em public + schema langgraph
--
-- O que este script faz:
--   * extensões: pgcrypto, vector (pgvector), pg_trgm, pgmq (best-effort)
--   * 11 tabelas com CHECK constraints, índices B-tree e HNSW
--   * funções: consume_credits (FOR UPDATE), match_knowledge_chunks (RPC),
--     match_brand_chunks (service_role), update_bandit_arm, bootstrap de tenant
--   * Row Level Security + grants em todas as tabelas
--   * bucket privado brand-assets + policies de Storage
--   * filas pgmq e fallback private.job_queue
--
-- É seguro rodar mais de uma vez: tudo usa IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS.
--
-- DEPOIS deste script:
--   * Storage > bucket "brand-assets" deve existir (criado na migration 5)
--   * Authentication > Providers > Google: habilite e informe as credenciais
--   * Checkpoints do LangGraph exigem a connection string:
--       SUPABASE_DB_URL=postgresql://... npm run db:langgraph-setup
-- =============================================================================

-- ###########################################################################
-- # 20260101000001_extensions.sql
-- ###########################################################################

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


-- ###########################################################################
-- # 20260101000002_core_schema.sql
-- ###########################################################################

-- =============================================================================
-- 0002 — Núcleo do schema (11 tabelas) + índices
-- =============================================================================
-- Todas as tabelas declaram tenant_id e são protegidas por RLS em 0004.
-- Enums são implementados como text + CHECK (mais fácil de evoluir sem lock).
-- =============================================================================

-- 1. tenants -------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$'),
  plan_tier text not null default 'essential'
    check (plan_tier in ('essential', 'pro', 'agency')),
  credit_balance integer not null default 0 check (credit_balance >= 0),
  created_at timestamptz not null default now(),
  constraint tenants_slug_unique unique (slug)
);

comment on table public.tenants is 'Organização cliente (1 tenant = 1 conta de cobrança).';
comment on column public.tenants.credit_balance is
  'Saldo materializado. Toda mutação passa por consume_credits()/grant_credits() com FOR UPDATE.';

-- 2. tenant_members ------------------------------------------------------------
create table if not exists public.tenant_members (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  constraint tenant_members_unique unique (tenant_id, user_id)
);

create index if not exists tenant_members_user_idx
  on public.tenant_members (user_id);
create index if not exists tenant_members_tenant_idx
  on public.tenant_members (tenant_id);

-- 3. brand_profiles ------------------------------------------------------------
create table if not exists public.brand_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  brand_name text not null check (char_length(trim(brand_name)) between 1 and 160),
  website_url text,
  icp_description text,
  tone_of_voice jsonb not null default '{}'::jsonb,
  visual_tokens jsonb not null default '{}'::jsonb,
  entity_facts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_profiles_visual_tokens_is_object check (jsonb_typeof(visual_tokens) = 'object'),
  constraint brand_profiles_entity_facts_is_array check (jsonb_typeof(entity_facts) = 'array')
);

create index if not exists brand_profiles_tenant_idx
  on public.brand_profiles (tenant_id, created_at desc);

drop trigger if exists brand_profiles_set_updated_at on public.brand_profiles;
create trigger brand_profiles_set_updated_at
  before update on public.brand_profiles
  for each row execute function private.set_updated_at();

comment on column public.brand_profiles.visual_tokens is
  'Cores (hex/oklch), fontes e logo_path usados pelo renderizador Satori.';
comment on column public.brand_profiles.entity_facts is
  'Fatos verificáveis (fonte + claim) usados para reforçar GEO/SEO.';

-- 4. knowledge_chunks ----------------------------------------------------------
-- Dimensão do embedding: 768 (fixa, <= 2000 para caber em índice HNSW).
-- Para trocar a dimensão: alter table ... alter column embedding type vector(N)
-- + recriar o índice HNSW + reindexar os chunks (ver docs/OPERACAO.md).
create table if not exists public.knowledge_chunks (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  brand_id uuid not null references public.brand_profiles (id) on delete cascade,
  source_type text not null
    check (source_type in ('brand_doc', 'winning_post', 'serp_insight')),
  content text not null check (char_length(content) > 0),
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(768),
  performance_score numeric(6, 4),
  created_at timestamptz not null default now()
);

-- B-tree obrigatório: filtro por tenant + marca em toda busca.
create index if not exists knowledge_chunks_tenant_brand_idx
  on public.knowledge_chunks (tenant_id, brand_id);

-- HNSW para similaridade de cosseno (recall alto com filtros combinados).
create index if not exists knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Apoio a full-text/trigram na UI de conhecimento.
create index if not exists knowledge_chunks_content_trgm_idx
  on public.knowledge_chunks using gin (content extensions.gin_trgm_ops);

-- 5. campaigns_and_assets ------------------------------------------------------
create table if not exists public.campaigns_and_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  brand_id uuid not null references public.brand_profiles (id) on delete cascade,
  thread_id text not null,
  asset_type text not null
    check (asset_type in ('short_script_kit', 'typo_carousel', 'hybrid_carousel',
                          'single_creative', 'geo_article', 'lp_copy')),
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_approval', 'approved', 'exported')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  content_payload jsonb not null default '{}'::jsonb,
  visual_urls text[] not null default '{}'::text[],
  json_ld jsonb,
  credits_charged integer not null default 0 check (credits_charged >= 0),
  has_ai_imagery boolean not null default false,
  created_at timestamptz not null default now(),
  constraint campaigns_and_assets_thread_not_blank check (char_length(trim(thread_id)) > 0)
);

create index if not exists campaigns_assets_tenant_status_idx
  on public.campaigns_and_assets (tenant_id, status, created_at desc);
create index if not exists campaigns_assets_brand_idx
  on public.campaigns_and_assets (tenant_id, brand_id, created_at desc);
create index if not exists campaigns_assets_thread_idx
  on public.campaigns_and_assets (thread_id);

comment on column public.campaigns_and_assets.thread_id is
  'thread_id do LangGraph; usado em deleteThread() na exclusão LGPD.';

-- 6. hook_variants -------------------------------------------------------------
create table if not exists public.hook_variants (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  asset_id uuid not null references public.campaigns_and_assets (id) on delete cascade,
  angle_type text not null
    check (angle_type in ('vace_pattern_interrupt', 'contrarian_frame',
                          'outcome_anchored', 'negative_constraint')),
  framework text not null
    check (framework in ('hook_body_payoff', 'aida', 'pas', 'bab')),
  hook_text text not null check (char_length(trim(hook_text)) > 0),
  is_selected boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists hook_variants_asset_idx
  on public.hook_variants (tenant_id, asset_id);
create unique index if not exists hook_variants_one_selected_idx
  on public.hook_variants (asset_id) where is_selected;

-- 7. performance_telemetry -----------------------------------------------------
create table if not exists public.performance_telemetry (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  brand_id uuid not null references public.brand_profiles (id) on delete cascade,
  asset_id uuid references public.campaigns_and_assets (id) on delete set null,
  channel_label text not null default 'organic',
  impressions integer not null default 0 check (impressions >= 0),
  views_3s integer not null default 0 check (views_3s >= 0),
  hook_rate numeric(6, 4) generated always as (
    case when impressions > 0
      then round((views_3s::numeric / impressions::numeric), 4)
      else 0::numeric
    end
  ) stored,
  retention_50_pct numeric(6, 4) check (retention_50_pct >= 0 and retention_50_pct <= 1),
  saves_or_clicks integer not null default 0 check (saves_or_clicks >= 0),
  ai_citations_count integer not null default 0 check (ai_citations_count >= 0),
  source_mode text not null default 'manual'
    check (source_mode in ('manual', 'csv', 'ga4_webhook')),
  recorded_at timestamptz not null default now()
);

create index if not exists performance_telemetry_tenant_idx
  on public.performance_telemetry (tenant_id, brand_id, recorded_at desc);
create index if not exists performance_telemetry_asset_idx
  on public.performance_telemetry (asset_id);

-- 8. bandit_arm_stats ----------------------------------------------------------
create table if not exists public.bandit_arm_stats (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  brand_id uuid not null references public.brand_profiles (id) on delete cascade,
  arm_key text not null check (char_length(trim(arm_key)) > 0),
  alpha numeric(12, 4) not null default 1.0 check (alpha > 0),
  beta numeric(12, 4) not null default 1.0 check (beta > 0),
  pulls integer not null default 0 check (pulls >= 0),
  updated_at timestamptz not null default now(),
  constraint bandit_arm_stats_unique unique (tenant_id, brand_id, arm_key)
);

create index if not exists bandit_arm_stats_lookup_idx
  on public.bandit_arm_stats (tenant_id, brand_id);

drop trigger if exists bandit_arm_stats_set_updated_at on public.bandit_arm_stats;
create trigger bandit_arm_stats_set_updated_at
  before update on public.bandit_arm_stats
  for each row execute function private.set_updated_at();

comment on column public.bandit_arm_stats.arm_key is
  'Combinação angle_type + framework (ex.: vace_pattern_interrupt:pas).';

-- 9. credit_ledger -------------------------------------------------------------
create table if not exists public.credit_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (char_length(trim(reason)) > 0),
  reference_id text,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_tenant_idx
  on public.credit_ledger (tenant_id, created_at desc);
create index if not exists credit_ledger_reference_idx
  on public.credit_ledger (reference_id);

-- 10. mp_subscriptions ---------------------------------------------------------
create table if not exists public.mp_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  mp_preapproval_id text not null,
  payment_method text not null
    check (payment_method in ('card_preapproval', 'pix_automatico')),
  plan_tier text not null check (plan_tier in ('essential', 'pro', 'agency')),
  status text not null,
  next_billing_date timestamptz,
  updated_at timestamptz not null default now(),
  constraint mp_subscriptions_preapproval_unique unique (mp_preapproval_id)
);

create index if not exists mp_subscriptions_tenant_idx
  on public.mp_subscriptions (tenant_id, updated_at desc);

drop trigger if exists mp_subscriptions_set_updated_at on public.mp_subscriptions;
create trigger mp_subscriptions_set_updated_at
  before update on public.mp_subscriptions
  for each row execute function private.set_updated_at();

-- 11. mp_webhook_events --------------------------------------------------------
create table if not exists public.mp_webhook_events (
  id uuid primary key default extensions.gen_random_uuid(),
  mp_event_id text not null,
  topic text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mp_webhook_events_event_unique unique (mp_event_id)
);

create index if not exists mp_webhook_events_unprocessed_idx
  on public.mp_webhook_events (created_at desc)
  where processed_at is null;


-- ###########################################################################
-- # 20260101000003_functions.sql
-- ###########################################################################

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


-- ###########################################################################
-- # 20260101000004_rls.sql
-- ###########################################################################

-- =============================================================================
-- 0004 — Row Level Security: isolamento estrito entre tenants
-- =============================================================================
-- Regras:
--  * RLS habilitada em TODAS as 11 tabelas;
--  * nenhuma política concede acesso sem membership (EXISTS em tenant_members,
--    encapsulado em public.is_tenant_member() para evitar recursão);
--  * credit_ledger / mp_subscriptions / mp_webhook_events não aceitam escrita
--    pelo role authenticated — somente service_role (rotas de servidor/webhooks);
--  * operações destrutivas de tenant exigem role owner.
-- =============================================================================

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.campaigns_and_assets enable row level security;
alter table public.hook_variants enable row level security;
alter table public.performance_telemetry enable row level security;
alter table public.bandit_arm_stats enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.mp_subscriptions enable row level security;
alter table public.mp_webhook_events enable row level security;

-- --- tenants ------------------------------------------------------------------
drop policy if exists tenants_select_member on public.tenants;
create policy tenants_select_member on public.tenants
  for select to authenticated
  using (public.is_tenant_member(id));

drop policy if exists tenants_update_owner on public.tenants;
create policy tenants_update_owner on public.tenants
  for update to authenticated
  using (public.current_tenant_role(id) = 'owner')
  with check (public.current_tenant_role(id) = 'owner');

-- Inserção direta de tenant é exclusiva do bootstrap (SECURITY DEFINER) e do
-- service_role; o cliente nunca cria tenant sem membership correspondente.
drop policy if exists tenants_insert_service on public.tenants;
create policy tenants_insert_service on public.tenants
  for insert to service_role
  with check (true);

drop policy if exists tenants_delete_owner on public.tenants;
create policy tenants_delete_owner on public.tenants
  for delete to authenticated
  using (public.current_tenant_role(id) = 'owner');

-- --- tenant_members -----------------------------------------------------------
drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_members_insert_owner on public.tenant_members;
create policy tenant_members_insert_owner on public.tenant_members
  for insert to authenticated
  with check (public.current_tenant_role(tenant_id) = 'owner');

drop policy if exists tenant_members_update_owner on public.tenant_members;
create policy tenant_members_update_owner on public.tenant_members
  for update to authenticated
  using (public.current_tenant_role(tenant_id) = 'owner')
  with check (public.current_tenant_role(tenant_id) = 'owner');

drop policy if exists tenant_members_delete_owner on public.tenant_members;
create policy tenant_members_delete_owner on public.tenant_members
  for delete to authenticated
  using (public.current_tenant_role(tenant_id) = 'owner');

-- --- brand_profiles -----------------------------------------------------------
drop policy if exists brand_profiles_select on public.brand_profiles;
create policy brand_profiles_select on public.brand_profiles
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists brand_profiles_insert on public.brand_profiles;
create policy brand_profiles_insert on public.brand_profiles
  for insert to authenticated
  with check (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

drop policy if exists brand_profiles_update on public.brand_profiles;
create policy brand_profiles_update on public.brand_profiles
  for update to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'))
  with check (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

drop policy if exists brand_profiles_delete on public.brand_profiles;
create policy brand_profiles_delete on public.brand_profiles
  for delete to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

-- --- knowledge_chunks ---------------------------------------------------------
drop policy if exists knowledge_chunks_select on public.knowledge_chunks;
create policy knowledge_chunks_select on public.knowledge_chunks
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists knowledge_chunks_insert on public.knowledge_chunks;
create policy knowledge_chunks_insert on public.knowledge_chunks
  for insert to authenticated
  with check (
    public.current_tenant_role(tenant_id) in ('owner', 'editor')
    and exists (
      select 1 from public.brand_profiles bp
       where bp.id = brand_id and bp.tenant_id = knowledge_chunks.tenant_id
    )
  );

drop policy if exists knowledge_chunks_update on public.knowledge_chunks;
create policy knowledge_chunks_update on public.knowledge_chunks
  for update to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'))
  with check (
    public.current_tenant_role(tenant_id) in ('owner', 'editor')
    and exists (
      select 1 from public.brand_profiles bp
       where bp.id = brand_id and bp.tenant_id = knowledge_chunks.tenant_id
    )
  );

drop policy if exists knowledge_chunks_delete on public.knowledge_chunks;
create policy knowledge_chunks_delete on public.knowledge_chunks
  for delete to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

-- --- campaigns_and_assets -----------------------------------------------------
drop policy if exists campaigns_assets_select on public.campaigns_and_assets;
create policy campaigns_assets_select on public.campaigns_and_assets
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists campaigns_assets_insert on public.campaigns_and_assets;
create policy campaigns_assets_insert on public.campaigns_and_assets
  for insert to authenticated
  with check (
    public.current_tenant_role(tenant_id) in ('owner', 'editor')
    and exists (
      select 1 from public.brand_profiles bp
       where bp.id = brand_id and bp.tenant_id = campaigns_and_assets.tenant_id
    )
  );

drop policy if exists campaigns_assets_update on public.campaigns_and_assets;
create policy campaigns_assets_update on public.campaigns_and_assets
  for update to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'))
  with check (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

drop policy if exists campaigns_assets_delete on public.campaigns_and_assets;
create policy campaigns_assets_delete on public.campaigns_and_assets
  for delete to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

-- --- hook_variants ------------------------------------------------------------
drop policy if exists hook_variants_select on public.hook_variants;
create policy hook_variants_select on public.hook_variants
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists hook_variants_insert on public.hook_variants;
create policy hook_variants_insert on public.hook_variants
  for insert to authenticated
  with check (
    public.current_tenant_role(tenant_id) in ('owner', 'editor')
    and exists (
      select 1 from public.campaigns_and_assets ca
       where ca.id = asset_id and ca.tenant_id = hook_variants.tenant_id
    )
  );

drop policy if exists hook_variants_update on public.hook_variants;
create policy hook_variants_update on public.hook_variants
  for update to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'))
  with check (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

drop policy if exists hook_variants_delete on public.hook_variants;
create policy hook_variants_delete on public.hook_variants
  for delete to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

-- --- performance_telemetry ----------------------------------------------------
drop policy if exists performance_telemetry_select on public.performance_telemetry;
create policy performance_telemetry_select on public.performance_telemetry
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists performance_telemetry_insert on public.performance_telemetry;
create policy performance_telemetry_insert on public.performance_telemetry
  for insert to authenticated
  with check (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

drop policy if exists performance_telemetry_update on public.performance_telemetry;
create policy performance_telemetry_update on public.performance_telemetry
  for update to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'))
  with check (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

drop policy if exists performance_telemetry_delete on public.performance_telemetry;
create policy performance_telemetry_delete on public.performance_telemetry
  for delete to authenticated
  using (public.current_tenant_role(tenant_id) in ('owner', 'editor'));

-- --- bandit_arm_stats ---------------------------------------------------------
-- Escrita ocorre via update_bandit_arm() (service_role) no grafo de telemetria.
drop policy if exists bandit_arm_stats_select on public.bandit_arm_stats;
create policy bandit_arm_stats_select on public.bandit_arm_stats
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- --- credit_ledger (somente leitura) -----------------------------------------
drop policy if exists credit_ledger_select on public.credit_ledger;
create policy credit_ledger_select on public.credit_ledger
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- --- mp_subscriptions (somente leitura) --------------------------------------
drop policy if exists mp_subscriptions_select on public.mp_subscriptions;
create policy mp_subscriptions_select on public.mp_subscriptions
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- --- mp_webhook_events (sem tenant_id: nenhum acesso ao cliente) -------------
-- Eventos brutos do Mercado Pago contêm payloads de terceiros e não pertencem a
-- um tenant específico. Nenhuma política para `authenticated`: apenas service_role
-- (que ignora RLS) lê/escreve aqui.
drop policy if exists mp_webhook_events_select on public.mp_webhook_events;

-- =============================================================================
-- Grants: o RLS é a última linha de defesa; a primeira é o privilégio de tabela.
-- =============================================================================
grant usage on schema public to authenticated, service_role;
-- Necessário porque a assinatura de match_knowledge_chunks expõe extensions.vector
-- e a RPC é chamada pelo role authenticated.
grant usage on schema extensions to authenticated, service_role;

grant select, insert, update, delete on public.tenants to authenticated;
grant select, insert, update, delete on public.tenant_members to authenticated;
grant select, insert, update, delete on public.brand_profiles to authenticated;
grant select, insert, update, delete on public.knowledge_chunks to authenticated;
grant select, insert, update, delete on public.campaigns_and_assets to authenticated;
grant select, insert, update, delete on public.hook_variants to authenticated;
grant select, insert, update, delete on public.performance_telemetry to authenticated;
grant select on public.bandit_arm_stats to authenticated;
grant select on public.credit_ledger to authenticated;
grant select on public.mp_subscriptions to authenticated;
grant select on public.mp_webhook_events to authenticated;

revoke insert, update, delete on public.credit_ledger from authenticated;
revoke insert, update, delete on public.mp_subscriptions from authenticated;
revoke insert, update, delete on public.mp_webhook_events from authenticated;
revoke insert, update, delete on public.bandit_arm_stats from authenticated;

grant all on public.tenants to service_role;
grant all on public.tenant_members to service_role;
grant all on public.brand_profiles to service_role;
grant all on public.knowledge_chunks to service_role;
grant all on public.campaigns_and_assets to service_role;
grant all on public.hook_variants to service_role;
grant all on public.performance_telemetry to service_role;
grant all on public.bandit_arm_stats to service_role;
grant all on public.credit_ledger to service_role;
grant all on public.mp_subscriptions to service_role;
grant all on public.mp_webhook_events to service_role;


-- ###########################################################################
-- # 20260101000005_storage_langgraph_pgmq.sql
-- ###########################################################################

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


-- ###########################################################################
-- # 20260101000006_agent_vector_search.sql
-- ###########################################################################

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


-- ###########################################################################
-- # 20260101000007_brand_google_setup.sql
-- ###########################################################################

-- =============================================================================
-- 0007 — Pacote Google: token de verificação do Search Console por marca
-- =============================================================================
-- O token é público por natureza (vai no <meta> do index.html), mas pertence a
-- UMA marca: por isso fica em brand_profiles, sob a mesma RLS das demais colunas.
-- Aceita valor nulo (marca sem verificação) e limita a 200 caracteres.
-- =============================================================================

alter table public.brand_profiles
  add column if not exists google_verification_token text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.brand_profiles'::regclass
       and conname = 'brand_profiles_google_token_length'
  ) then
    alter table public.brand_profiles
      add constraint brand_profiles_google_token_length
      check (
        google_verification_token is null
        or char_length(trim(google_verification_token)) between 1 and 200
      );
  end if;
end
$$;

comment on column public.brand_profiles.google_verification_token is
  'Token do Search Console (meta google-site-verification) usado no Pacote Google.';

-- =============================================================================
-- Fim. Confira rapidamente:
--   select count(*) from information_schema.tables where table_schema = 'public';
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- =============================================================================
