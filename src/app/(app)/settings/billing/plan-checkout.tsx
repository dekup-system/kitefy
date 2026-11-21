"use client";

import { useState } from "react";
import { Loader2, QrCode, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PlanTier } from "@/types/domain";

/**
 * Assinatura recorrente.
 *
 * Pix Automático: mandato autorizado no app do banco (recomendado pela menor
 * taxa e menor atrito de renovação) — redireciona para o `init_point`.
 *
 * Cartão: exige o Payment Brick no navegador para tokenizar o cartão; sem a
 * chave pública configurada não inventamos um fluxo — avisamos e mantemos o
 * caminho do Pix disponível.
 */
export function PlanCheckout({
  planTier,
  planName,
  priceLabel,
  recommended,
  mpPublicKeyConfigured,
}: {
  planTier: PlanTier;
  planName: string;
  priceLabel: string;
  recommended?: boolean;
  mpPublicKeyConfigured: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribeWithPix() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/billing/preapproval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "pix_automatico", planTier }),
      });
      const payload = (await response.json()) as {
        initPoint?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Não foi possível iniciar a assinatura.");
        return;
      }
      if (payload.initPoint) {
        toast.info("Abrindo o Mercado Pago para autorizar o Pix Automático…");
        window.location.href = payload.initPoint;
        return;
      }
      setError("O Mercado Pago não retornou o link de autorização. Tente novamente.");
    } catch {
      setError("Falha de rede ao iniciar a assinatura.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {recommended ? (
        <Button onClick={subscribeWithPix} disabled={loading} className="w-full">
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <QrCode className="size-4" aria-hidden="true" />
          )}
          Assinar {planName} com Pix Automático · {priceLabel}
        </Button>
      ) : (
        <Button onClick={subscribeWithPix} disabled={loading} variant="outline" className="w-full">
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          Assinar {planName} · {priceLabel}
        </Button>
      )}

      {!mpPublicKeyConfigured ? (
        <p className="text-xs text-muted-foreground">
          Cartão recorrente exige NEXT_PUBLIC_MP_PUBLIC_KEY e o Payment Brick no navegador. Pix
          Automático funciona sem essa chave.
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
