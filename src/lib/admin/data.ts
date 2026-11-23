import { query } from "@/lib/db/pg";
import { getServerEnv } from "@/lib/env";
import {
  computeArpuCents,
  computeChange,
  computeMarginCents,
  computeMrr,
  summarizeUsage,
  type MrrSummary,
  type UsageSummary,
} from "@/lib/admin/metrics";
import type { PlanTier } from "@/types/domain";

/**
 * Consultas do console administrativo.
 *
 * Rodam no servidor, sem RLS de tenant (admin é cross-tenant por definição) e
 * SEMPRE exigem uma sessão com `app_metadata.is_admin` antes de serem chamadas
 * pelas páginas/actions. Nenhuma dessas queries é exposta ao cliente.
 */

export interface AdminCounts {
  tenants: number;
  members: number;
  brands: number;
  assets: number;
  chunks: number;
  activeCoupons: number;
}

export interface AdminUsageRow {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number;
  calls: number;
}

export interface AdminRevenueTotals {
  last30Cents: number;
  previous30Cents: number;
  allTimeCents: number;
}

export interface AdminOverview {
  counts: AdminCounts;
  mrr: MrrSummary;
  arpuCents: number;
  usage: UsageSummary;
  usageRows: AdminUsageRow[];
  usageCurrentCostUsd: number;
  usagePreviousCostUsd: number;
  usageChange: number | null;
  revenue: AdminRevenueTotals;
  revenueChange: number | null;
  marginCents: number;
  usdBrlRate: number;
  recentTenants: RecentTenantRow[];
  recentUsage: RecentUsageRow[];
}

export interface RecentTenantRow {
  id: string;
  name: string;
  plan_tier: PlanTier;
  credit_balance: number;
  created_at: string;
  owner_email: string | null;
}

export interface RecentUsageRow {
  tenant_name: string;
  provider: string;
  model: string;
  cost_usd: number;
  created_at: string;
}

interface SubscriptionRow {
  tenant_id: string;
  plan_tier: PlanTier;
  amount_cents: number | null;
  status: string;
}

async function loadLatestSubscriptions(): Promise<SubscriptionRow[]> {
  return query<SubscriptionRow>(
    `select distinct on (tenant_id)
            tenant_id, plan_tier, amount_cents, status
       from public.mp_subscriptions
      order by tenant_id, updated_at desc`,
  );
}

export function getAdminUsdBrlRate(): number {
  return getServerEnv().ADMIN_USD_BRL_RATE;
}

async function loadUsageRows(days = 30): Promise<AdminUsageRow[]> {
  return query<AdminUsageRow>(
    `select provider,
            model,
            coalesce(sum(input_tokens), 0)::float8 as input_tokens,
            coalesce(sum(output_tokens), 0)::float8 as output_tokens,
            coalesce(sum(cached_tokens), 0)::float8 as cached_tokens,
            coalesce(sum(cost_usd), 0)::float8 as cost_usd,
            count(*)::int as calls
       from public.api_usage_events
      where created_at >= now() - make_interval(days => $1::int)
      group by provider, model
      order by cost_usd desc`,
    [days],
  );
}

async function loadRevenueTotals(): Promise<AdminRevenueTotals> {
  const rows = await query<{
    last30_cents: number;
    previous30_cents: number;
    all_time_cents: number;
  }>(
    `select coalesce(sum(amount_cents) filter (
              where occurred_at >= now() - interval '30 days'
            ), 0)::float8 as last30_cents,
            coalesce(sum(amount_cents) filter (
              where occurred_at >= now() - interval '60 days'
                and occurred_at < now() - interval '30 days'
            ), 0)::float8 as previous30_cents,
            coalesce(sum(amount_cents), 0)::float8 as all_time_cents
       from public.billing_revenue_events`,
  );

  const row = rows[0];
  return {
    last30Cents: Number(row?.last30_cents ?? 0),
    previous30Cents: Number(row?.previous30_cents ?? 0),
    allTimeCents: Number(row?.all_time_cents ?? 0),
  };
}

async function loadUsageTotals(): Promise<{
  currentCostUsd: number;
  previousCostUsd: number;
  currentCalls: number;
}> {
  const rows = await query<{
    current_cost_usd: number;
    previous_cost_usd: number;
    current_calls: number;
  }>(
    `select coalesce(sum(cost_usd) filter (
              where created_at >= now() - interval '30 days'
            ), 0)::float8 as current_cost_usd,
            coalesce(sum(cost_usd) filter (
              where created_at >= now() - interval '60 days'
                and created_at < now() - interval '30 days'
            ), 0)::float8 as previous_cost_usd,
            (count(*) filter (
              where created_at >= now() - interval '30 days'
            ))::int as current_calls
       from public.api_usage_events
      where created_at >= now() - interval '60 days'`,
  );

  return {
    currentCostUsd: Number(rows[0]?.current_cost_usd ?? 0),
    previousCostUsd: Number(rows[0]?.previous_cost_usd ?? 0),
    currentCalls: Number(rows[0]?.current_calls ?? 0),
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [countRows, subscriptions, usageRows, usageTotals, revenue, recentTenants, recentUsage] =
    await Promise.all([
      query<{
        tenants: number;
        members: number;
        brands: number;
        assets: number;
        chunks: number;
        active_coupons: number;
      }>(
        `select (select count(*) from public.tenants)::int as tenants,
                (select count(*) from public.tenant_members)::int as members,
                (select count(*) from public.brand_profiles)::int as brands,
                (select count(*) from public.campaigns_and_assets)::int as assets,
                (select count(*) from public.knowledge_chunks)::int as chunks,
                (select count(*) from public.discount_coupons where active)::int as active_coupons`,
      ),
      loadLatestSubscriptions(),
      loadUsageRows(30),
      loadUsageTotals(),
      loadRevenueTotals(),
      query<RecentTenantRow>(
        `select t.id, t.name, t.plan_tier, t.credit_balance, t.created_at,
                u.email as owner_email
           from public.tenants t
           left join lateral (
             select tm.user_id
               from public.tenant_members tm
              where tm.tenant_id = t.id and tm.role = 'owner'
              order by tm.created_at
              limit 1
           ) owner_member on true
           left join auth.users u on u.id = owner_member.user_id
          order by t.created_at desc
          limit 8`,
      ),
      query<RecentUsageRow>(
        `select t.name as tenant_name, x.provider, x.model,
                x.cost_usd::float8 as cost_usd, x.created_at
           from public.api_usage_events x
           join public.tenants t on t.id = x.tenant_id
          order by x.created_at desc
          limit 8`,
      ),
    ]);

  const countsRow = countRows[0];
  const counts: AdminCounts = {
    tenants: Number(countsRow?.tenants ?? 0),
    members: Number(countsRow?.members ?? 0),
    brands: Number(countsRow?.brands ?? 0),
    assets: Number(countsRow?.assets ?? 0),
    chunks: Number(countsRow?.chunks ?? 0),
    activeCoupons: Number(countsRow?.active_coupons ?? 0),
  };

  const mrr = computeMrr(subscriptions);
  const usage = summarizeUsage(usageRows);
  const usdBrlRate = getAdminUsdBrlRate();

  return {
    counts,
    mrr,
    arpuCents: computeArpuCents(mrr.totalCents, mrr.activeCount),
    usage,
    usageRows,
    usageCurrentCostUsd: usageTotals.currentCostUsd,
    usagePreviousCostUsd: usageTotals.previousCostUsd,
    usageChange: computeChange(usageTotals.currentCostUsd, usageTotals.previousCostUsd),
    revenue,
    revenueChange: computeChange(revenue.last30Cents, revenue.previous30Cents),
    marginCents: computeMarginCents({
      revenueCents: revenue.last30Cents,
      costUsd: usageTotals.currentCostUsd,
      usdBrlRate,
    }),
    usdBrlRate,
    recentTenants,
    recentUsage,
  };
}

export interface AdminAccountRow {
  id: string;
  name: string;
  slug: string;
  plan_tier: PlanTier;
  credit_balance: number;
  created_at: string;
  owner_email: string | null;
  subscription_status: string | null;
  subscription_plan: PlanTier | null;
  subscription_amount_cents: number | null;
  next_billing_date: string | null;
  brands: number;
  assets: number;
  revenue_cents: number;
  usage_cost_usd: number;
}

export async function getAdminAccounts(search = ""): Promise<AdminAccountRow[]> {
  const term = search.trim().slice(0, 80);

  return query<AdminAccountRow>(
    `select t.id, t.name, t.slug, t.plan_tier, t.credit_balance, t.created_at,
            u.email as owner_email,
            s.status as subscription_status,
            s.plan_tier as subscription_plan,
            s.amount_cents as subscription_amount_cents,
            s.next_billing_date,
            (select count(*) from public.brand_profiles b
              where b.tenant_id = t.id)::int as brands,
            (select count(*) from public.campaigns_and_assets a
              where a.tenant_id = t.id)::int as assets,
            coalesce((select sum(r.amount_cents) from public.billing_revenue_events r
                       where r.tenant_id = t.id), 0)::float8 as revenue_cents,
            coalesce((select sum(x.cost_usd) from public.api_usage_events x
                       where x.tenant_id = t.id
                         and x.created_at >= now() - interval '30 days'), 0)::float8 as usage_cost_usd
       from public.tenants t
       left join lateral (
         select tm.user_id
           from public.tenant_members tm
          where tm.tenant_id = t.id and tm.role = 'owner'
          order by tm.created_at
          limit 1
       ) owner_member on true
       left join auth.users u on u.id = owner_member.user_id
       left join lateral (
         select ms.*
           from public.mp_subscriptions ms
          where ms.tenant_id = t.id
          order by ms.updated_at desc
          limit 1
       ) s on true
      where ($1 = ''
             or t.name ilike '%' || $1 || '%'
             or t.slug ilike '%' || $1 || '%'
             or coalesce(u.email, '') ilike '%' || $1 || '%')
      order by t.created_at desc
      limit 100`,
    [term],
  );
}

export interface AdminTenantDetail {
  account: AdminAccountRow;
  usageRows: AdminUsageRow[];
  usageCostUsd: number;
  revenueLast30Cents: number;
  revenueAllTimeCents: number;
  recentRevenue: {
    source: string;
    external_id: string;
    amount_cents: number;
    plan_tier: PlanTier | null;
    occurred_at: string;
  }[];
  auditLog: {
    action: string;
    admin_email: string | null;
    payload: Record<string, unknown>;
    created_at: string;
  }[];
}

export async function getAdminTenant(tenantId: string): Promise<AdminTenantDetail | null> {
  const accounts = await query<AdminAccountRow>(
    `select t.id, t.name, t.slug, t.plan_tier, t.credit_balance, t.created_at,
            u.email as owner_email,
            s.status as subscription_status,
            s.plan_tier as subscription_plan,
            s.amount_cents as subscription_amount_cents,
            s.next_billing_date,
            (select count(*) from public.brand_profiles b
              where b.tenant_id = t.id)::int as brands,
            (select count(*) from public.campaigns_and_assets a
              where a.tenant_id = t.id)::int as assets,
            coalesce((select sum(r.amount_cents) from public.billing_revenue_events r
                       where r.tenant_id = t.id), 0)::float8 as revenue_cents,
            coalesce((select sum(x.cost_usd) from public.api_usage_events x
                       where x.tenant_id = t.id
                         and x.created_at >= now() - interval '30 days'), 0)::float8 as usage_cost_usd
       from public.tenants t
       left join lateral (
         select tm.user_id
           from public.tenant_members tm
          where tm.tenant_id = t.id and tm.role = 'owner'
          order by tm.created_at
          limit 1
       ) owner_member on true
       left join auth.users u on u.id = owner_member.user_id
       left join lateral (
         select ms.*
           from public.mp_subscriptions ms
          where ms.tenant_id = t.id
          order by ms.updated_at desc
          limit 1
       ) s on true
      where t.id = $1
      limit 1`,
    [tenantId],
  );

  const account = accounts[0];
  if (!account) return null;

  const [usageRows, usageTotals, revenueTotals, recentRevenue, auditLog] = await Promise.all([
    query<AdminUsageRow>(
      `select provider, model,
              coalesce(sum(input_tokens), 0)::float8 as input_tokens,
              coalesce(sum(output_tokens), 0)::float8 as output_tokens,
              coalesce(sum(cached_tokens), 0)::float8 as cached_tokens,
              coalesce(sum(cost_usd), 0)::float8 as cost_usd,
              count(*)::int as calls
         from public.api_usage_events
        where tenant_id = $1
          and created_at >= now() - interval '30 days'
        group by provider, model
        order by cost_usd desc`,
      [tenantId],
    ),
    query<{ cost_usd: number }>(
      `select coalesce(sum(cost_usd), 0)::float8 as cost_usd
         from public.api_usage_events
        where tenant_id = $1 and created_at >= now() - interval '30 days'`,
      [tenantId],
    ),
    query<{ last30_cents: number; all_time_cents: number }>(
      `select coalesce(sum(amount_cents) filter (
                where occurred_at >= now() - interval '30 days'
              ), 0)::float8 as last30_cents,
              coalesce(sum(amount_cents), 0)::float8 as all_time_cents
         from public.billing_revenue_events
        where tenant_id = $1`,
      [tenantId],
    ),
    query<{
      source: string;
      external_id: string;
      amount_cents: number;
      plan_tier: PlanTier | null;
      occurred_at: string;
    }>(
      `select source, external_id, amount_cents, plan_tier, occurred_at
         from public.billing_revenue_events
        where tenant_id = $1
        order by occurred_at desc
        limit 10`,
      [tenantId],
    ),
    query<{
      action: string;
      admin_email: string | null;
      payload: Record<string, unknown>;
      created_at: string;
    }>(
      `select action, admin_email, payload, created_at
         from public.admin_audit_log
        where target_type = 'tenant' and target_id = $1
        order by created_at desc
        limit 10`,
      [tenantId],
    ),
  ]);

  return {
    account,
    usageRows,
    usageCostUsd: Number(usageTotals[0]?.cost_usd ?? 0),
    revenueLast30Cents: Number(revenueTotals[0]?.last30_cents ?? 0),
    revenueAllTimeCents: Number(revenueTotals[0]?.all_time_cents ?? 0),
    recentRevenue,
    auditLog,
  };
}

export interface AdminCouponRow {
  id: string;
  code: string;
  percent_off: number;
  max_redemptions: number;
  times_redeemed: number;
  valid_until: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
  confirmed_redemptions: number;
  redeemed_amount_cents: number;
}

export async function getAdminCoupons(): Promise<AdminCouponRow[]> {
  return query<AdminCouponRow>(
    `select c.id, c.code, c.percent_off, c.max_redemptions, c.times_redeemed,
            c.valid_until, c.active, c.note, c.created_at,
            coalesce(r.confirmed_redemptions, 0)::int as confirmed_redemptions,
            coalesce(r.redeemed_amount_cents, 0)::float8 as redeemed_amount_cents
       from public.discount_coupons c
       left join (
         select coupon_id,
                count(*)::int as confirmed_redemptions,
                coalesce(sum(coalesce(amount_cents, 0)), 0)::float8 as redeemed_amount_cents
           from public.coupon_redemptions
          group by coupon_id
       ) r on r.coupon_id = c.id
      order by c.created_at desc
      limit 200`,
  );
}

export interface AdminRevenuePage {
  mrr: MrrSummary;
  arpuCents: number;
  revenue: AdminRevenueTotals;
  revenueChange: number | null;
  byPlan: {
    plan_tier: PlanTier | null;
    cents_all_time: number;
    cents_last30: number;
    events: number;
  }[];
  monthly: { month: string; cents: number; events: number }[];
  usage: UsageSummary;
  usageRows: AdminUsageRow[];
  usageCurrentCostUsd: number;
  usagePreviousCostUsd: number;
  usageChange: number | null;
  marginCents: number;
  usdBrlRate: number;
  recentRevenue: {
    source: string;
    external_id: string;
    tenant_name: string | null;
    amount_cents: number;
    plan_tier: PlanTier | null;
    occurred_at: string;
  }[];
}

export async function getAdminRevenuePage(): Promise<AdminRevenuePage> {
  const [subscriptions, revenue, byPlan, monthly, usageRows, usageTotals, recentRevenue] =
    await Promise.all([
      loadLatestSubscriptions(),
      loadRevenueTotals(),
      query<{
        plan_tier: PlanTier | null;
        cents_all_time: number;
        cents_last30: number;
        events: number;
      }>(
        `select plan_tier,
                coalesce(sum(amount_cents), 0)::float8 as cents_all_time,
                coalesce(sum(amount_cents) filter (
                  where occurred_at >= now() - interval '30 days'
                ), 0)::float8 as cents_last30,
                count(*)::int as events
           from public.billing_revenue_events
          group by plan_tier
          order by cents_last30 desc`,
      ),
      query<{ month: string; cents: number; events: number }>(
        `select to_char(date_trunc('month', occurred_at), 'YYYY-MM') as month,
                coalesce(sum(amount_cents), 0)::float8 as cents,
                count(*)::int as events
           from public.billing_revenue_events
          where occurred_at >= date_trunc('month', now()) - interval '5 months'
          group by 1
          order by 1`,
      ),
      loadUsageRows(30),
      loadUsageTotals(),
      query<{
        source: string;
        external_id: string;
        tenant_name: string | null;
        amount_cents: number;
        plan_tier: PlanTier | null;
        occurred_at: string;
      }>(
        `select r.source, r.external_id, t.name as tenant_name,
                r.amount_cents, r.plan_tier, r.occurred_at
           from public.billing_revenue_events r
           left join public.tenants t on t.id = r.tenant_id
          order by r.occurred_at desc
          limit 20`,
      ),
    ]);

  const mrr = computeMrr(subscriptions);
  const usage = summarizeUsage(usageRows);
  const usdBrlRate = getAdminUsdBrlRate();

  return {
    mrr,
    arpuCents: computeArpuCents(mrr.totalCents, mrr.activeCount),
    revenue,
    revenueChange: computeChange(revenue.last30Cents, revenue.previous30Cents),
    byPlan,
    monthly,
    usage,
    usageRows,
    usageCurrentCostUsd: usageTotals.currentCostUsd,
    usagePreviousCostUsd: usageTotals.previousCostUsd,
    usageChange: computeChange(usageTotals.currentCostUsd, usageTotals.previousCostUsd),
    marginCents: computeMarginCents({
      revenueCents: revenue.last30Cents,
      costUsd: usageTotals.currentCostUsd,
      usdBrlRate,
    }),
    usdBrlRate,
    recentRevenue,
  };
}
