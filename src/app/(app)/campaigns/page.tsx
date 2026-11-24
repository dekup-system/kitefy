import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Download,
  FileStack,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  List,
  Search,
  Sparkles,
  Type,
} from "lucide-react";
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
import { signVisualPaths } from "@/lib/agent/visual-adapter";
import { formatDateTimeBR } from "@/lib/utils";
import type { AssetType, CampaignAssetRow } from "@/types/domain";

export const metadata: Metadata = { title: "Biblioteca" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  awaiting_approval: "Aguardando aprovação",
  approved: "Pronto para postar",
  exported: "Publicado",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline" | "secondary"> = {
  draft: "outline",
  awaiting_approval: "warning",
  approved: "success",
  exported: "secondary",
};

const TYPE_LABEL: Record<AssetType, string> = {
  short_script_kit: "Roteiro de vídeo",
  typo_carousel: "Carrossel Instagram",
  hybrid_carousel: "Carrossel ilustrado",
  single_creative: "Post único",
  geo_article: "Artigo GEO",
  lp_copy: "Página de vendas",
};

const TYPE_ICON: Record<AssetType, typeof FileText> = {
  short_script_kit: Type,
  typo_carousel: Layers,
  hybrid_carousel: ImageIcon,
  single_creative: Sparkles,
  geo_article: FileText,
  lp_copy: FileText,
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    brand?: string;
    view?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const params = await searchParams;
  const viewMode: "grid" | "list" = params.view === "list" ? "list" : "grid";
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
    .select("id, brand_id, title, asset_type, status, created_at, thread_id, credits_charged, has_ai_imagery, visual_urls")
    .eq("tenant_id", session.tenantId)
    .order(SORTABLE[sortKey], { ascending })
    .limit(100);

  if (params.q) {
    query = query.ilike("title", `%${params.q}%`);
  }
  if (params.status && params.status in STATUS_LABEL) {
    query = query.eq("status", params.status);
  }
  if (params.type && params.type in TYPE_LABEL) {
    query = query.eq("asset_type", params.type);
  }
  if (params.brand) {
    query = query.eq("brand_id", params.brand);
  }

  const [assets, brandsQuery] = await Promise.all([
    query,
    supabase
      .from("brand_profiles")
      .select("id, brand_name")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
  ]);

  const brands = (brandsQuery.data ?? []) as { id: string; brand_name: string }[];
  const brandById = new Map(brands.map((b) => [b.id, b.brand_name]));

  const rows = (assets.data ?? []) as Pick<
    CampaignAssetRow,
    | "id"
    | "brand_id"
    | "title"
    | "asset_type"
    | "status"
    | "created_at"
    | "thread_id"
    | "credits_charged"
    | "has_ai_imagery"
    | "visual_urls"
  >[];

  // Assina em lote apenas a primeira capa de cada conteúdo para a grade visual.
  const firstPaths: string[] = [];
  const pathIndexByAsset = new Map<string, number>();
  if (viewMode === "grid") {
    for (const row of rows) {
      const first = Array.isArray(row.visual_urls) ? row.visual_urls[0] : undefined;
      if (first) {
        pathIndexByAsset.set(row.id, firstPaths.length);
        firstPaths.push(first);
      }
    }
  }
  const signedThumbs =
    firstPaths.length > 0 ? await signVisualPaths(firstPaths).catch(() => []) : [];

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      q: params.q,
      status: params.status,
      type: params.type,
      brand: params.brand,
      view: viewMode,
      sort: params.sort,
      dir: params.dir,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) next.set(k, v);
    }
    return `/campaigns?${next.toString()}`;
  };

  const sortLabel = (key: SortKey, label: string): React.ReactNode => {
    const nextDir = sortKey === key && !ascending ? "desc" : "asc";
    return (
      <Link
        href={buildHref({ sort: key, dir: nextDir })}
        aria-label={`Ordenar por ${label}${sortKey === key ? (ascending ? " (crescente)" : " (decrescente)") : ""}`}
        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
      >
        {label}
        <span aria-hidden="true" className="text-[10px] text-muted-foreground">
          {sortKey === key ? (ascending ? "▲" : "▼") : "↕"}
        </span>
      </Link>
    );
  };

  const hasFilters = Boolean(params.q || params.status || params.type || params.brand);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Biblioteca"
        description="Seus carrosséis, roteiros e artigos prontos para revisar, copiar e exportar."
        actions={
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="Modo de visualização"
              className="inline-flex rounded-lg border border-border bg-card p-0.5"
            >
              <Link
                href={buildHref({ view: "grid" })}
                aria-current={viewMode === "grid" ? "page" : undefined}
                aria-label="Visualização em grade"
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="size-3.5" aria-hidden="true" />
                Grade
              </Link>
              <Link
                href={buildHref({ view: "list" })}
                aria-current={viewMode === "list" ? "page" : undefined}
                aria-label="Visualização em lista"
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="size-3.5" aria-hidden="true" />
                Lista
              </Link>
            </div>
            <Button asChild size="sm">
              <Link href="/studio/new">
                <Sparkles className="size-4" aria-hidden="true" />
                Criar conteúdo
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="py-3">
          <form className="flex flex-col gap-2 md:flex-row md:items-center" role="search">
            <input type="hidden" name="view" value={viewMode} />
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Buscar na biblioteca…"
                aria-label="Buscar na biblioteca por título"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <select
              name="type"
              defaultValue={params.type ?? ""}
              aria-label="Filtrar por formato"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            >
              <option value="">Todos os formatos</option>
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              name="status"
              defaultValue={params.status ?? ""}
              aria-label="Filtrar por status"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            {brands.length > 1 ? (
              <select
                name="brand"
                defaultValue={params.brand ?? ""}
                aria-label="Filtrar por marca"
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="">Todas as marcas</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.brand_name}
                  </option>
                ))}
              </select>
            ) : null}

            <div className="flex items-center gap-1.5">
              <Button type="submit" variant="secondary" size="sm">
                Filtrar
              </Button>
              {hasFilters ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/campaigns?view=${viewMode}`}>Limpar</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileStack className="size-5" aria-hidden="true" />}
          title="Nenhum conteúdo encontrado"
          description={
            hasFilters
              ? "Ajuste os filtros ou limpe a busca para ver toda a biblioteca."
              : "Crie seu primeiro conteúdo: roteiro ou carrossel custa 1 crédito."
          }
          action={
            <Button asChild size="sm">
              <Link href="/studio/new">Criar conteúdo</Link>
            </Button>
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const Icon = TYPE_ICON[row.asset_type] ?? FileText;
            const thumbIdx = pathIndexByAsset.get(row.id);
            const thumbUrl = typeof thumbIdx === "number" ? signedThumbs[thumbIdx] : undefined;
            const brandName = brandById.get(row.brand_id);

            return (
              <article
                key={row.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all hover:border-foreground/25"
              >
                <Link
                  href={`/studio/${row.thread_id}`}
                  className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden border-b border-border bg-surface-inset/70"
                >
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica do Supabase Storage
                    <img
                      src={thumbUrl}
                      alt={`Prévia de ${row.title}`}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-4 text-center">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-navy text-white">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {TYPE_LABEL[row.asset_type] ?? row.asset_type}
                      </span>
                    </div>
                  )}
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                    <Badge variant={STATUS_VARIANT[row.status] ?? "outline"} className="bg-card/95 text-xs backdrop-blur-xs">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {row.has_ai_imagery ? (
                      <Badge variant="warning" className="text-[11px]">
                        Imagem IA
                      </Badge>
                    ) : null}
                  </div>
                </Link>

                <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Icon className="size-3.5" aria-hidden="true" />
                        {TYPE_LABEL[row.asset_type] ?? row.asset_type}
                      </span>
                      {brandName ? (
                        <span className="truncate font-medium text-foreground/80">{brandName}</span>
                      ) : null}
                    </div>
                    <Link
                      href={`/studio/${row.thread_id}`}
                      className="line-clamp-2 block text-sm font-semibold leading-snug text-foreground underline-offset-4 hover:underline"
                    >
                      {row.title}
                    </Link>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {formatDateTimeBR(row.created_at)} · {row.credits_charged} cr
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/studio/${row.thread_id}`}
                        className="font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        Abrir
                      </Link>
                      <a
                        href={`/api/assets/${row.id}/export?format=zip`}
                        aria-label={`Baixar ZIP de ${row.title}`}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{sortLabel("title", "Conteúdo")}</TableHead>
                <TableHead>{sortLabel("status", "Status")}</TableHead>
                <TableHead className="hidden sm:table-cell">{sortLabel("type", "Formato")}</TableHead>
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
                    {brandById.get(row.brand_id) ? (
                      <span className="block text-xs text-muted-foreground">
                        {brandById.get(row.brand_id)}
                      </span>
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
