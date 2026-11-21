import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download, Fingerprint, ShieldCheck } from "lucide-react";
import { EraseForms } from "./erase-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Privacidade e dados" };

const INVENTORY = [
  { item: "Perfil da marca", detail: "nome, site, ICP, tom de voz, cores, fatos verificáveis" },
  { item: "Conhecimento indexado", detail: "trechos de documentos e posts vencedores (vetores)" },
  { item: "Ativos gerados", detail: "roteiros, carrosséis, artigos, legendas e JSON-LD" },
  { item: "Telemetria", detail: "impressões, views de 3s, retenção, saves, citações em IA" },
  { item: "Créditos", detail: "extrato de débitos e estornos (mantido anonimizado após exclusão)" },
  { item: "Histórico do agente", detail: "checkpoints do LangGraph, apagados via deleteThread" },
];

export default async function PrivacyPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const brands = await supabase
    .from("brand_profiles")
    .select("id, brand_name")
    .eq("tenant_id", session.tenantId)
    .order("created_at");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Privacidade e seus dados"
        description="LGPD Art. 18: acesso, correção e eliminação. Sem letras miúdas — exportação e exclusão funcionam de verdade."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Download className="size-4" aria-hidden="true" />
            Exportar tudo (JSON)
          </CardTitle>
          <CardDescription>
            Inclui marca, conhecimento (sem vetores), ativos, telemetria, extrato de créditos e
            assinatura. Payloads de webhook de pagamento não entram: contêm dados de terceiros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/api/privacy/export" download>
              Baixar meus dados
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Fingerprint className="size-4" aria-hidden="true" />
            O que armazenamos
          </CardTitle>
          <CardDescription>
            Minimização de dados: nada de biometria, nada de token social, nada de áudio de voz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            {INVENTORY.map((row) => (
              <div key={row.item} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 sm:flex-row sm:justify-between">
                <dt className="text-sm font-medium">{row.item}</dt>
                <dd className="text-sm text-muted-foreground sm:text-right">{row.detail}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Garantias do produto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Não coletamos imagem facial nem amostra de voz. Não há avatar digital, lip-sync, TTS ou
            clonagem de voz em nenhuma rota.
          </p>
          <p>
            Não conectamos Instagram, TikTok, LinkedIn, X ou YouTube. Nenhum token social é
            solicitado ou armazenado.
          </p>
          <p>
            Não usamos seus dados para treinar modelos. Chaves de API são lidas apenas no servidor e
            nunca vão para o bundle do cliente.
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-sm">Excluir dados</CardTitle>
          <CardDescription>
            Exclusão definitiva. Antes de executar, a exportação acima é a sua cópia de segurança.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EraseForms
            brands={(brands.data ?? []) as { id: string; brand_name: string }[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
