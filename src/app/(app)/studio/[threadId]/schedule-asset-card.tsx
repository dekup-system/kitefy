"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  scheduleAssetAction,
  type AssetScheduleMeta,
  type ScheduleActionState,
} from "@/lib/schedule/actions";

const initialState: ScheduleActionState = {};

function defaultTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ScheduleAssetCard({
  assetId,
  threadId,
  existingSchedule,
}: {
  assetId: string;
  threadId: string;
  existingSchedule?: AssetScheduleMeta | null;
}) {
  const [state, action, pending] = useActionState(scheduleAssetAction, initialState);
  const [existingDate = defaultTomorrowDate(), existingTime = "10:00"] =
    existingSchedule?.scheduledFor?.split("T") ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarDays className="size-4 text-brand-signal" aria-hidden="true" />
            Agendar publicação na grade semanal
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href="/schedule">Ver grade semanal →</Link>
          </Button>
        </div>
        <CardDescription className="text-xs">
          Defina dia, horário e canal para organizar este anúncio nos 7 dias da semana com lembrete automático por e-mail 30 minutos antes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="threadId" value={threadId} />

          <Field htmlFor="schedDate" label="Data">
            <Input
              id="schedDate"
              name="date"
              type="date"
              defaultValue={existingDate}
              required
              disabled={pending}
            />
          </Field>

          <Field htmlFor="schedTime" label="Horário">
            <Input
              id="schedTime"
              name="time"
              type="time"
              defaultValue={existingTime.slice(0, 5)}
              required
              disabled={pending}
            />
          </Field>

          <Field htmlFor="schedChannel" label="Canal">
            <select
              id="schedChannel"
              name="channel"
              defaultValue={existingSchedule?.channel ?? "Instagram Feed"}
              disabled={pending}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
            >
              <option value="Instagram Feed">Instagram Feed</option>
              <option value="Instagram Reels">Instagram Reels</option>
              <option value="Instagram Stories">Instagram Stories</option>
              <option value="TikTok">TikTok</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="YouTube Shorts">YouTube Shorts</option>
              <option value="Blog / Site">Blog / Site</option>
            </select>
          </Field>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarDays className="size-4" aria-hidden="true" />
            )}
            {existingSchedule ? "Atualizar horário" : "Agendar"}
          </Button>
        </form>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.notice ? (
          <Alert variant="success">
            <AlertDescription>{state.notice}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
