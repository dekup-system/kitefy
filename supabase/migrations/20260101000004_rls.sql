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
