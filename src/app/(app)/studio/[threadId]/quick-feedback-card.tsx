"use client";

import { useActionState } from "react";
import { CheckCircle2, Flame, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  recordQuickFeedbackAction,
  type QuickFeedbackRating,
  type QuickFeedbackState,
} from "@/lib/telemetry/actions";

const RATING_LABELS: Record<QuickFeedbackRating, string> = {
  great: "Bombou (Muito engajamento)",
  average: "Foi bem (Na média)",
  weak: "Fraco (Evitar este estilo)",
};

export function QuickFeedbackCard({
  assetId,
  brandId,
  threadId,
  brandName,
  initialRating,
}: {
  assetId: string;
  brandId: string;
  threadId: string;
  brandName: string;
  initialRating: QuickFeedbackRating | null;
}) {
  const [state, action, pending] = useActionState<QuickFeedbackState, FormData>(
    recordQuickFeedbackAction,
    { rating: initialRating ?? undefined },
  );

  const activeRating = state.rating ?? initialRating;

  return (
    <Card className="bg-muted/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">Já publicou? Conte em 1 clique como esse post foi</CardTitle>
          {activeRating ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Registrado: {RATING_LABELS[activeRating]}
            </span>
          ) : null}
        </div>
        <CardDescription>
          Sua avaliação alimenta diretamente a memória do agente interno: o que <strong>Bombou</strong> é
          replicado e o que foi <strong>Fraco</strong> é evitado nos próximos anúncios da {brandName}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="threadId" value={threadId} />

          <Button
            type="submit"
            name="rating"
            value="great"
            variant={activeRating === "great" ? "default" : "outline"}
            size="sm"
            disabled={pending}
            className={
              activeRating === "great"
                ? "bg-orange-600 text-white hover:bg-orange-700"
                : "border-orange-200 hover:bg-orange-50 dark:border-orange-800/70 dark:hover:bg-orange-950/50"
            }
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Flame className="size-3.5 text-orange-500" aria-hidden="true" />
            )}
            Bombou (Muito engajamento)
          </Button>

          <Button
            type="submit"
            name="rating"
            value="average"
            variant={activeRating === "average" ? "secondary" : "outline"}
            size="sm"
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ThumbsUp className="size-3.5" aria-hidden="true" />
            )}
            Foi bem (Na média)
          </Button>

          <Button
            type="submit"
            name="rating"
            value="weak"
            variant={activeRating === "weak" ? "destructive" : "ghost"}
            size="sm"
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ThumbsDown className="size-3.5" aria-hidden="true" />
            )}
            Fraco (Tentar outro estilo no próximo)
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
