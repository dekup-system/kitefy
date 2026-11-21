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
