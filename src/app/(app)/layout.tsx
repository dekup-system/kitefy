import Link from "next/link";
import { redirect } from "next/navigation";
import { Palette, Sparkles } from "lucide-react";
import {
  AppSidebar,
  MobileBottomNav,
  NewAssetLink,
  TopbarSectionTitle,
} from "@/components/app/app-sidebar";
import { CommandMenu } from "@/components/app/command-menu";
import { UserMenu } from "@/components/app/user-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { KitefyLogo } from "@/components/brand/kitefy-logo";
import { KitefyLogoThemeAware } from "@/components/brand/kitefy-logo-theme-aware";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/pricing";

const PACKAGE_DISPLAY_BY_TIER: Record<keyof typeof PLANS, string> = {
  essential: "Kitefy Start",
  pro: "Kitefy Lift",
  agency: "Kitefy Flow",
};

/**
 * Shell da aplicação autenticada (Direção: Editorial de Dados).
 * - Sidebar Navy #181331 como âncora da marca (proporção 60/30/10 no app).
 * - Topbar com título contextual, chip de marca ativa, créditos e busca Ctrl+K.
 * - Mobile com MobileBottomNav dedicado de 4 itens (alvos ≥ 44px).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const [tenantQuery, brandsQuery] = await Promise.all([
    supabase
      .from("tenants")
      .select("name, slug, plan_tier, credit_balance")
      .eq("id", session.tenantId)
      .single<{ name: string; slug: string; plan_tier: keyof typeof PLANS; credit_balance: number }>(),
    supabase
      .from("brand_profiles")
      .select("id, brand_name")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true })
      .limit(10),
  ]);

  const tenant = tenantQuery.data ?? {
    name: "Minha conta",
    slug: "conta",
    plan_tier: "essential" as const,
    credit_balance: 0,
  };

  const plan = PLANS[tenant.plan_tier];
  const packageName = PACKAGE_DISPLAY_BY_TIER[tenant.plan_tier] ?? plan.name;
  const brands = (brandsQuery.data ?? []) as { id: string; brand_name: string }[];
  const primaryBrand = brands[0] ?? null;

  const creditPct = session.isPlatformAdmin
    ? 100
    : Math.min(
        100,
        Math.max(0, Math.round((tenant.credit_balance / Math.max(1, plan.monthlyCredits)) * 100)),
      );
  const lowCredits =
    !session.isPlatformAdmin &&
    tenant.credit_balance <= Math.max(5, Math.round(plan.monthlyCredits * 0.15));

  return (
    <div className="grid min-h-dvh grid-cols-1 overflow-x-hidden lg:grid-cols-[248px_1fr]">
      <aside className="hidden flex-col gap-5 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <div className="flex items-center justify-between gap-2 px-1">
          <Link href="/app" aria-label="Kitefy — início">
            <KitefyLogo variant="onDark" height={45} />
          </Link>
        </div>

        <NewAssetLink />
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <AppSidebar isAdmin={session.isPlatformAdmin} />
        </div>

        <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/45 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-sidebar-muted">Saldo de créditos</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-white">
                {session.isPlatformAdmin ? "∞" : tenant.credit_balance}
              </span>
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={creditPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                session.isPlatformAdmin
                  ? "Saldo de créditos: ilimitado"
                  : `Saldo de créditos: ${tenant.credit_balance} de ${plan.monthlyCredits}`
              }
            >
              <div
                className={lowCredits ? "h-full rounded-full bg-brand-signal" : "h-full rounded-full bg-white/85"}
                style={{ width: `${creditPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-sidebar-muted">
              <span className="truncate">
                {session.isPlatformAdmin ? `${packageName} · Ilimitado` : `${packageName} · ${plan.monthlyCredits}/mês`}
              </span>
              <Link
                href="/settings/billing"
                className="shrink-0 font-medium text-white underline-offset-4 hover:underline"
              >
                Plano
              </Link>
            </div>
          </div>

          <UserMenu
            accountName={tenant.name}
            isAdmin={session.isPlatformAdmin}
            variant="sidebar"
          />

          <a
            href="https://www.m3dmultidev.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl border border-sidebar-border/80 bg-black/25 px-2.5 py-2 transition-colors hover:border-white/25 hover:bg-black/40"
            title="Visitar M3D Multidev"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/m3d-multidev-logo.png"
              alt="M3D Multidev"
              className="size-8 shrink-0 rounded-md object-contain"
            />
            <div className="min-w-0 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-signal">
                Suporte
              </p>
              <p className="truncate text-[11px] font-medium text-white/90">M3D Multidev</p>
              <p className="truncate text-[10px] text-sidebar-muted">suporte@m3dmultidev.com.br</p>
            </div>
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col overflow-x-hidden bg-background">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-card/90 px-3 backdrop-blur sm:gap-3 sm:px-4 lg:px-8">
          <Link href="/app" aria-label="Kitefy — início" className="inline-flex shrink-0 lg:hidden">
            <KitefyLogoThemeAware height={42} />
          </Link>

          <TopbarSectionTitle />

          <div className="ml-auto flex items-center gap-2">
            {primaryBrand ? (
              <Link
                href={`/settings/brand?brand=${primaryBrand.id}`}
                className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface-inset/70 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-foreground/25 md:inline-flex"
                title="Gerenciar perfil da marca"
              >
                <Palette className="size-3.5 text-brand-signal" aria-hidden="true" />
                <span className="max-w-[10rem] truncate">{primaryBrand.brand_name}</span>
                {brands.length > 1 ? (
                  <span className="rounded bg-card px-1 font-mono text-[10px] text-muted-foreground">
                    +{brands.length - 1}
                  </span>
                ) : null}
              </Link>
            ) : null}

            <Link
              href="/settings/billing"
              className="hidden items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground sm:inline-flex"
            >
              <Sparkles className="size-3 text-brand-signal" aria-hidden="true" />
              <span className="font-mono font-medium text-foreground">{tenant.credit_balance}</span>
              <span>cr</span>
            </Link>

            <CommandMenu isAdmin={session.isPlatformAdmin} />
            <ThemeToggle />
            <div className="lg:hidden">
              <UserMenu accountName={tenant.name} isAdmin={session.isPlatformAdmin} />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        <MobileBottomNav isAdmin={session.isPlatformAdmin} />
      </div>
    </div>
  );
}
