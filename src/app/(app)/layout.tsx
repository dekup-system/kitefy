import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AppSidebar, NewAssetLink } from "@/components/app/app-sidebar";
import { CommandMenu } from "@/components/app/command-menu";
import { UserMenu } from "@/components/app/user-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/pricing";

/**
 * Shell da aplicação autenticada.
 * Densidade informacional alta, navegação por teclado (Cmd/Ctrl+K) e créditos
 * sempre visíveis — sem sidebar de marketing.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const tenantQuery = await supabase
    .from("tenants")
    .select("name, slug, plan_tier, credit_balance")
    .eq("id", session.tenantId)
    .single<{ name: string; slug: string; plan_tier: keyof typeof PLANS; credit_balance: number }>();

  const tenant = tenantQuery.data ?? {
    name: "Minha conta",
    slug: "conta",
    plan_tier: "essential" as const,
    credit_balance: 0,
  };

  const plan = PLANS[tenant.plan_tier];

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[232px_1fr]">
      <aside className="hidden flex-col gap-6 border-r border-border bg-sidebar p-4 lg:flex">
        <div className="flex items-center justify-between gap-2">
          <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-foreground" />
            BrandPulse
          </Link>
          <ThemeToggle />
        </div>

        <NewAssetLink />
        <AppSidebar />

        <div className="mt-auto space-y-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Créditos</span>
              <Badge variant="outline" className="font-mono">
                {tenant.credit_balance}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Plano {plan.name} · {plan.monthlyCredits}/mês
            </p>
            <Link
              href="/settings/billing"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              Gerenciar plano
            </Link>
          </div>
          <UserMenu accountName={tenant.name} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-8">
          <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold lg:hidden">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-foreground" />
            BrandPulse
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground sm:inline-flex">
              <span className="font-mono">{tenant.credit_balance}</span> créditos
            </span>
            <CommandMenu />
            <div className="lg:hidden">
              <ThemeToggle />
            </div>
            <div className="lg:hidden">
              <UserMenu accountName={tenant.name} />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        <nav
          aria-label="Navegação inferior"
          className="sticky bottom-0 flex items-center justify-around border-t border-border bg-background/95 px-2 py-1.5 backdrop-blur lg:hidden"
        >
          <AppSidebar />
        </nav>
      </div>
    </div>
  );
}
