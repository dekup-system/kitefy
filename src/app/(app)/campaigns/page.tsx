import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileStack, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTimeBR } from "@/lib/utils";
import type { CampaignAssetRow } from "@/types/domain";

export const metadata: Metadata = { title: "Campanhas" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  awaiting_approval: "Aguardando",
  approved: "Aprovado",
  exported: "Exportado",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline" | "secondary"> = {
  draft: "outline",
  awaiting_approval: "warning",
  approved: "success",
  exported: "secondary",
};

const TYPE_LABEL: Record<string, string> = {
  short_script_kit: "Roteiro",
  typo_carousel: "Carrossel tipográfico",
  hybrid_carousel: "Carrossel híbrido",
  single_creative: "Criativo",
  geo_article: "Artigo GEO",
  lp_copy: "Landing page",
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const SORTABLE = {
    title: "title",
    status: "status",
    type: "asset_type",
    credits: "credits_charged",
    created: "created_at",
  } as const;
  type SortKey = keyof typeof SORTABLE;

  const sortKey: SortKey =
    params.sort && params.sort in SORTABLE ? (params.sort as SortKey) : "created";
  const ascending = params.dir === "asc";

  let query = supabase
    .from("campaigns_and_assets")
    .select("id, title, asset_type, status, created_at, thread_id, credits_charged, has_ai_imagery")
    .eq("tenant_id", session.tenantId)
    .order(SORTABLE[sortKey], { ascending })
    .limit(100);

  if (params.q) {
    query = query.ilike("title", `%${params.q}%`);
  }
  if (params.status && params.status in STATUS_LABEL) {
    query = query.eq("status", params.status);
  }

  const assets = await query;
  const rows = (assets.data ?? []) as Pick<
    CampaignAssetRow,
    "id" | "title" | "asset_type" | "status" | "created_at" | "thread_id" | "credits_charged" | "has_ai_imagery"
  >[];

  const sortHref = (key: SortKey): string => {
    const nextDir = sortKey === key && !ascending ? "desc" : "asc";
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.status) query.set("status", params.status);
    query.set("sort", key);
    query.set("dir", nextDir);
    return `/campaigns?${query.toString()}`;
  };

  const sortLabel = (key: SortKey, label: string): React.ReactNode => (
    <Link
      href={sortHref(key)}
      aria-label={`Ordenar por ${label}${sortKey === key ? (ascending ? " (crescente)" : " (decrescente)") : ""}`}
      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
    >
      {label}
      <span aria-hidden="true" className="text-[10px] text-muted-foreground">
        {sortKey === key ? (ascending ? "▲" : "▼") : "↕"}
      </span>
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas"
        description="Tabela densa, ordenável e filtrável. Todos os ativos ficam aqui até serem exportados."
        actions={
          <Button asChild>
            <Link href="/studio/new">
              <Sparkles className="size-4" aria-hidden="true" />
              Novo ativo
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="py-3">
          <form className="flex flex-col gap-2 sm:flex-row sm:items-center" role="search">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Buscar por título…"
                aria-label="Buscar campanhas por título"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <select
              name="status"
              defaultValue={params.status ?? ""}
              aria-label="Filtrar por status"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm">
              Filtrar
            </Button>
            {params.q || params.status ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/campaigns">Limpar</Link>
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileStack className="size-5" aria-hidden="true" />}
          title="Nenhum ativo encontrado"
          description={
            params.q || params.status
              ? "Ajuste os filtros ou limpe a busca."
              : "Gere o primeiro ativo: um roteiro curto custa 1 crédito e sai em menos de um minuto."
          }
          action={
            <Button asChild size="sm">
              <Link href="/studio/new">Criar ativo</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{sortLabel("title", "Ativo")}</TableHead>
                <TableHead>{sortLabel("status", "Status")}</TableHead>
                <TableHead className="hidden sm:table-cell">{sortLabel("type", "Tipo")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {sortLabel("credits", "Créditos")}
                </TableHead>
                <TableHead className="text-right">{sortLabel("created", "Criado")}</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/studio/${row.thread_id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.title}
                    </Link>
                    {row.has_ai_imagery ? (
                      <Badge variant="warning" className="ml-2 align-middle">
                        IA
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {TYPE_LABEL[row.asset_type] ?? row.asset_type}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-xs md:table-cell">
                    {row.credits_charged}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {formatDateTimeBR(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="icon" aria-label={`Baixar ${row.title}`}>
                      <a href={`/api/assets/${row.id}/export?format=zip`}>
                        <Download className="size-4" aria-hidden="true" />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
