import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { emailConfigured } from "@/lib/email/client";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import {
  sendScheduleReminderNowAction,
  unscheduleAssetAction,
  type AssetScheduleMeta,
} from "@/lib/schedule/actions";

export const metadata: Metadata = { title: "Agendamentos" };

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

const TYPE_SHORT: Record<string, string> = {
  short_script_kit: "Roteiro",
  typo_carousel: "Carrossel",
  hybrid_carousel: "Carrossel IA",
  single_creative: "Post único",
  geo_article: "Artigo GEO",
  lp_copy: "Landing Page",
};

interface ScheduledItem {
  id: string;
  thread_id: string;
  title: string;
  asset_type: string;
  brand_name: string;
  dateStr: string;
  timeStr: string;
  schedule: AssetScheduleMeta;
}

function startOfWeekMonday(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const isEmailReady = emailConfigured();

  const params = await searchParams;
  const weekOffset = Number.parseInt(params.week ?? "0", 10) || 0;

  const supabase = await createSupabaseServerClient();
  const [assetsQuery, brandsQuery] = await Promise.all([
    supabase
      .from("campaigns_and_assets")
      .select("id, thread_id, brand_id, title, asset_type, content_payload")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("brand_profiles")
      .select("id, brand_name")
      .eq("tenant_id", session.tenantId),
  ]);

  const brandNames = new Map<string, string>(
    ((brandsQuery.data ?? []) as { id: string; brand_name: string }[]).map((b) => [b.id, b.brand_name]),
  );

  const scheduled: ScheduledItem[] = [];
  for (const row of (assetsQuery.data ?? []) as {
    id: string;
    thread_id: string;
    brand_id: string;
    title: string;
    asset_type: string;
    content_payload: Record<string, unknown> | null;
  }[]) {
    const rawSchedule = row.content_payload?._schedule as AssetScheduleMeta | undefined;
    if (!rawSchedule?.scheduledFor || !rawSchedule.scheduledFor.includes("T")) continue;
    const [dateStr = "", timeStr = "09:00"] = rawSchedule.scheduledFor.split("T");
    scheduled.push({
      id: row.id,
      thread_id: row.thread_id,
      title: row.title,
      asset_type: row.asset_type,
      brand_name: brandNames.get(row.brand_id) ?? "Marca",
      dateStr,
      timeStr: timeStr.slice(0, 5),
      schedule: rawSchedule,
    });
  }

  scheduled.sort((a, b) => a.schedule.scheduledFor.localeCompare(b.schedule.scheduledFor));

  const today = new Date();
  const monday = startOfWeekMonday(today);
  monday.setDate(monday.getDate() + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ymd = toYmd(d);
    return {
      index: i,
      dayName: DAY_NAMES[i] ?? "",
      dayNumber: d.getDate(),
      monthShort: d.toLocaleDateString("pt-BR", { month: "short" }),
      ymd,
      isToday: ymd === toYmd(today),
      items: scheduled.filter((item) => item.dateStr === ymd),
    };
  });

  const weekLabel = `${days[0]!.dayNumber} ${days[0]!.monthShort} – ${days[6]!.dayNumber} ${days[6]!.monthShort}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grade Semanal de Agendamentos"
        description="Organize suas publicações nos 7 dias da semana por horário e receba lembrete automático por e-mail 30 minutos antes."
        actions={
          <Button asChild size="sm">
            <Link href="/studio/new">
              <Plus className="size-4" aria-hidden="true" />
              Criar novo anúncio
            </Link>
          </Button>
        }
      />

      {/* Aviso de lembretes automáticos por e-mail */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50/70 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Mail className="size-4 shrink-0 text-brand-signal" aria-hidden="true" />
          <span>
            <strong className="text-foreground">Lembrete automático por e-mail:</strong> enviamos um aviso{" "}
            <strong className="text-foreground">30 minutos antes</strong> de cada publicação para{" "}
            <strong className="text-foreground">{session.user.email ?? "seu e-mail cadastrado"}</strong> com o link direto para baixar e postar.
          </span>
        </span>
        <Badge variant={isEmailReady ? "success" : "secondary"} className="text-[10px]">
          {isEmailReady ? "Envio de e-mail ativo" : "Aguardando servidor de e-mail (RESEND)"}
        </Badge>
      </div>

      {/* Navegação da semana */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-brand-signal" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Semana: {weekLabel}</h2>
          <Badge variant="outline" className="font-mono text-[11px]">
            {days.reduce((sum, d) => sum + d.items.length, 0)} agendado(s)
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button asChild variant="outline" size="sm">
            <Link href={`/schedule?week=${weekOffset - 1}`}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              Anterior
            </Link>
          </Button>
          {weekOffset !== 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/schedule">Hoje</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={`/schedule?week=${weekOffset + 1}`}>
              Próxima
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Grade semanal 7 dias */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => (
          <Card
            key={day.ymd}
            className={`flex min-h-[260px] flex-col ${
              day.isToday ? "border-brand-signal/60 ring-1 ring-brand-signal/30" : ""
            }`}
          >
            <CardHeader className="border-b border-border/70 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {day.dayName}
                </span>
                <span
                  className={`inline-flex size-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                    day.isToday ? "bg-brand-signal text-white" : "text-foreground"
                  }`}
                >
                  {day.dayNumber}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2.5 p-2.5">
              {day.items.length === 0 ? (
                <p className="my-auto text-center text-[11px] text-muted-foreground/70">
                  Livre
                </p>
              ) : (
                day.items.map((item) => (
                  <div
                    key={item.id}
                    className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-foreground">
                        <Clock className="size-3 text-brand-signal" aria-hidden="true" />
                        {item.timeStr}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {TYPE_SHORT[item.asset_type] ?? "Post"}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 font-medium leading-snug text-foreground">
                      {item.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {item.brand_name} · {item.schedule.channel}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      <a
                        href={`/studio/${item.thread_id}`}
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium hover:bg-accent"
                      >
                        <ExternalLink className="size-2.5" aria-hidden="true" />
                        Abrir
                      </a>
                      {item.schedule.emailReminderSentAt ? (
                        <span
                          className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
                          title="Lembrete já enviado por e-mail"
                        >
                          <CheckCircle2 className="size-2.5" aria-hidden="true" />
                          E-mail enviado
                        </span>
                      ) : isEmailReady ? (
                        <form action={sendScheduleReminderNowAction}>
                          <input type="hidden" name="assetId" value={item.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-950 hover:bg-orange-100"
                            title="Disparar aviso agora para o seu e-mail"
                          >
                            <Mail className="size-2.5 text-brand-signal" aria-hidden="true" />
                            Enviar e-mail
                          </button>
                        </form>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          title="O e-mail será enviado automaticamente 30 minutos antes quando o serviço de e-mail estiver ativo"
                        >
                          <Mail className="size-2.5 text-brand-signal" aria-hidden="true" />
                          E-mail 30m
                        </span>
                      )}
                      <form action={unscheduleAssetAction}>
                        <input type="hidden" name="assetId" value={item.id} />
                        <input type="hidden" name="threadId" value={item.thread_id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-destructive"
                          title="Remover da grade"
                        >
                          <Trash2 className="size-2.5" aria-hidden="true" />
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {scheduled.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Como agendar seus anúncios</CardTitle>
            <CardDescription className="text-xs">
              Gere um conteúdo no Estúdio, clique em <strong>Salvar na biblioteca</strong> e use o
              card <strong>Agendar publicação na grade semanal</strong> que aparece logo na mesma tela.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
