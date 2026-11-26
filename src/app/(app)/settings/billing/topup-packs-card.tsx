"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2, QrCode, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CREDIT_TOPUP_ORDER,
  CREDIT_TOPUP_PACKS,
  formatBRL,
  type CreditTopUpPackId,
} from "@/lib/pricing";

interface PixResponse {
  packId: CreditTopUpPackId;
  credits: number;
  priceCents: number;
  paymentId: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
}

export function TopUpPacksCard({ mpConfigured }: { mpConfigured: boolean }) {
  const [pendingPack, setPendingPack] = useState<CreditTopUpPackId | null>(null);
  const [pix, setPix] = useState<PixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function buyPack(packId: CreditTopUpPackId) {
    setError(null);
    setPix(null);
    setCopied(false);
    setPendingPack(packId);

    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/topup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packId }),
        });
        const data = (await res.json()) as PixResponse & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Não foi possível gerar o Pix para este pacote.");
          return;
        }
        setPix(data);
      } catch {
        setError("Falha de rede ao gerar o Pix. Tente novamente.");
      } finally {
        setPendingPack(null);
      }
    });
  }

  async function copyCode() {
    if (!pix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="size-4 text-brand-signal" aria-hidden="true" />
            Precisa de mais créditos antes da renovação?
          </CardTitle>
          <Badge variant="outline">Liberação automática após Pix</Badge>
        </div>
        <CardDescription>
          Compre pacotes extras avulsos via Pix sempre que seu saldo acabar. Os créditos entram na sua conta assim que o pagamento é confirmado pelo Mercado Pago.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {CREDIT_TOPUP_ORDER.map((packId) => {
            const pack = CREDIT_TOPUP_PACKS[packId];
            const loading = isPending && pendingPack === packId;
            return (
              <div
                key={pack.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{pack.name}</p>
                    {pack.id === "extra_100" ? (
                      <Badge variant="warning" className="text-[10px]">
                        Melhor custo
                      </Badge>
                    ) : null}
                  </div>
                  <p className="font-mono text-xl font-semibold text-foreground">
                    {formatBRL(pack.priceCents)}
                    <span className="ml-1.5 font-sans text-xs font-normal text-muted-foreground">
                      pagamento único (Pix)
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{pack.tagline}</p>
                </div>

                <Button
                  type="button"
                  onClick={() => buyPack(pack.id)}
                  disabled={isPending || !mpConfigured}
                  variant={pack.id === "extra_100" ? "default" : "outline"}
                  className="w-full"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <QrCode className="size-4" aria-hidden="true" />
                  )}
                  Comprar +{pack.credits} créditos por {formatBRL(pack.priceCents)}
                </Button>
              </div>
            );
          })}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {pix ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                Pix gerado: +{pix.credits} créditos ({formatBRL(pix.priceCents)})
              </p>
              <Badge variant="success">Aguardando pagamento</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Escaneie o QR Code ou copie o código Pix abaixo. Assim que o pagamento for confirmado, os +{pix.credits} créditos serão somados automaticamente ao seu saldo.
            </p>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {pix.qrCodeBase64 ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`data:image/png;base64,${pix.qrCodeBase64}`}
                  alt="QR Code Pix para recarga de créditos"
                  className="size-40 rounded-lg border border-border bg-white p-2"
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-2">
                {pix.qrCode ? (
                  <>
                    <p className="break-all rounded-md border border-border bg-background p-2 font-mono text-[11px] text-foreground">
                      {pix.qrCode}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={copyCode}>
                        {copied ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Copy className="size-3.5" aria-hidden="true" />
                        )}
                        {copied ? "Código Pix copiado" : "Copiar código Pix"}
                      </Button>
                      {pix.ticketUrl ? (
                        <Button asChild type="button" size="sm" variant="outline">
                          <a href={pix.ticketUrl} target="_blank" rel="noopener noreferrer">
                            Abrir no Mercado Pago <ExternalLink className="size-3.5" aria-hidden="true" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
