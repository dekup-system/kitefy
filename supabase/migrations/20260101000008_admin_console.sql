-- =============================================================================
-- 0008 — Console administrativo: receita, custos de API, cupons e auditoria
-- =============================================================================
-- Regras:
--  * nenhuma tabela nova é acessível pelo cliente: RLS habilitada e SEM policy
--    para `authenticated` (apenas service_role, usado pelas rotas /admin);
--  * `mp_subscriptions.amount_cents` guarda o valor recorrente REAL autorizado
--    no Mercado Pago (com desconto de cupom, quando houver);
--  * `billing_revenue_events` é o extrato financeiro idempotente por cobrança;
--  * `api_usage_events` é o custo estimado por nó/modelo de IA;
--  * cupons são resgatados por RPC transacional (lock + contador atômico).
-- =============================================================================

-- --- Valor recorrente real da assinatura --------------------------------------
alter table public.mp_subscriptions
  add column if not exists amount_cents integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mp_subscriptions'::regclass
       and conname = 'mp_subscriptions_amount_cents_nonnegative'
  ) then
    alter table public.mp_subscriptions
      add constraint mp_subscriptions_amount_cents_nonnegative
      check (amount_cents is null or amount_cents >= 0);
  end if;
end
$$;

comment on column public.mp_subscriptions.amount_cents is
  'Valor recorrente autorizado (centavos BRL), já com desconto de cupom quando aplicável.';

-- --- Cupons de desconto -------------------------------------------------------
create table if not exists public.discount_coupons (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null,
  percent_off integer not null check (percent_off between 1 and 90),
  max_redemptions integer not null default 1
    check (max_redemptions between 1 and 100000),
  times_redeemed integer not null default 0 check (times_redeemed >= 0),
  valid_until timestamptz,
  active boolean not null default true,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint discount_coupons_code_unique unique (code),
  constraint discount_coupons_code_format
    check (code ~ '^[A-Z0-9][A-Z0-9-]{3,31}$'),
  constraint discount_coupons_usage
    check (times_redeemed <= max_redemptions)
);

create index if not exists discount_coupons_active_idx
  on public.discount_coupons (active, valid_until, created_at desc);
create index if not exists discount_coupons_code_idx
  on public.discount_coupons (code);

comment on table public.discount_coupons is
  'Cupons percentuais criados no /admin. O desconto vale para a assinatura recorrente inteira.';

create table if not exists public.coupon_redemptions (
  id uuid primary key default extensions.gen_random_uuid(),
  coupon_id uuid not null references public.discount_coupons (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  preapproval_id text not null,
  percent_off integer not null check (percent_off between 1 and 90),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  created_at timestamptz not null default now(),
  constraint coupon_redemptions_preapproval_unique unique (preapproval_id)
);

create index if not exists coupon_redemptions_coupon_idx
  on public.coupon_redemptions (coupon_id, created_at desc);
create index if not exists coupon_redemptions_tenant_idx
  on public.coupon_redemptions (tenant_id, created_at desc);

comment on table public.coupon_redemptions is
  'Uma linha por assinatura que usou o cupom; preapproval_id garante idempotência.';

-- --- Extrato financeiro (receita realizada) ----------------------------------
create table if not exists public.billing_revenue_events (
  id uuid primary key default extensions.gen_random_uuid(),
  source text not null check (source in ('subscription', 'payment')),
  external_id text not null,
  tenant_id uuid references public.tenants (id) on delete set null,
  plan_tier text check (plan_tier is null or plan_tier in ('essential', 'pro', 'agency')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL' check (char_length(currency) = 3),
  coupon_id uuid references public.discount_coupons (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint billing_revenue_events_external_unique unique (source, external_id)
);

create index if not exists billing_revenue_events_occurred_idx
  on public.billing_revenue_events (occurred_at desc);
create index if not exists billing_revenue_events_tenant_idx
  on public.billing_revenue_events (tenant_id, occurred_at desc);
create index if not exists billing_revenue_events_plan_idx
  on public.billing_revenue_events (plan_tier, occurred_at desc);

comment on table public.billing_revenue_events is
  'Receita confirmada na API do Mercado Pago (idempotente por source+external_id).';

-- --- Custos de API por execução do agente ------------------------------------
create table if not exists public.api_usage_events (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  thread_id text not null,
  asset_type text,
  node text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  sequence integer not null check (sequence >= 0),
  created_at timestamptz not null default now(),
  constraint api_usage_events_thread_sequence_unique unique (thread_id, sequence)
);

create index if not exists api_usage_events_tenant_idx
  on public.api_usage_events (tenant_id, created_at desc);
create index if not exists api_usage_events_created_idx
  on public.api_usage_events (created_at desc);
create index if not exists api_usage_events_model_idx
  on public.api_usage_events (provider, model, created_at desc);

comment on table public.api_usage_events is
  'Custo estimado de LLM por nó do grafo. sequence+thread_id torna o registro idempotente.';

-- --- Auditoria de ações administrativas --------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  admin_email text,
  action text not null check (char_length(trim(action)) > 0),
  target_type text,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id, created_at desc);

comment on table public.admin_audit_log is
  'Trilha de quem fez o quê no console administrativo (plano, créditos, cupons).';

-- --- Resgate de cupom: atômico e idempotente ---------------------------------
create or replace function public.confirm_coupon_redemption(
  p_code text,
  p_tenant_id uuid,
  p_preapproval_id text,
  p_amount_cents integer default null
)
returns table (
  coupon_id uuid,
  percent_off integer,
  times_redeemed integer,
  max_redemptions integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coupon public.discount_coupons;
  v_inserted integer := 0;
begin
  if p_code is null or btrim(p_code) = '' then
    raise exception 'coupon_code_required' using errcode = '22023';
  end if;

  -- FOR UPDATE serializa duas confirmações simultâneas do mesmo cupom.
  select *
    into v_coupon
    from public.discount_coupons
   where code = upper(btrim(p_code))
   for update;

  if not found then
    raise exception 'coupon_not_found' using errcode = 'P0002';
  end if;
  if not v_coupon.active then
    raise exception 'coupon_inactive' using errcode = '22023';
  end if;
  if v_coupon.valid_until is not null and v_coupon.valid_until < now() then
    raise exception 'coupon_expired' using errcode = '22023';
  end if;

  insert into public.coupon_redemptions
    (coupon_id, tenant_id, preapproval_id, percent_off, amount_cents)
  values
    (v_coupon.id, p_tenant_id, p_preapproval_id, v_coupon.percent_off, p_amount_cents)
  on conflict (preapproval_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    if v_coupon.times_redeemed >= v_coupon.max_redemptions then
      -- Exceção desfaz o INSERT acima: o contador nunca passa do limite.
      raise exception 'coupon_exhausted' using errcode = '22023';
    end if;

    update public.discount_coupons d
       set times_redeemed = d.times_redeemed + 1
     where d.id = v_coupon.id
     returning * into v_coupon;
  end if;

  return query
    select v_coupon.id, v_coupon.percent_off, v_coupon.times_redeemed, v_coupon.max_redemptions;
end;
$$;

revoke all on function public.confirm_coupon_redemption(text, uuid, text, integer) from public;
grant execute on function public.confirm_coupon_redemption(text, uuid, text, integer)
  to service_role;

-- --- RLS: interno, somente service_role --------------------------------------
alter table public.discount_coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.billing_revenue_events enable row level security;
alter table public.api_usage_events enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.discount_coupons from public, anon, authenticated;
revoke all on public.coupon_redemptions from public, anon, authenticated;
revoke all on public.billing_revenue_events from public, anon, authenticated;
revoke all on public.api_usage_events from public, anon, authenticated;
revoke all on public.admin_audit_log from public, anon, authenticated;

grant all on public.discount_coupons to service_role;
grant all on public.coupon_redemptions to service_role;
grant all on public.billing_revenue_events to service_role;
grant all on public.api_usage_events to service_role;
grant all on public.admin_audit_log to service_role;
