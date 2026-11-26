import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, CheckCircle2, Download, Globe, SearchCheck, TriangleAlert } from "lucide-react";
import { GoogleTokenForm } from "./google-token-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeSiteUrl } from "@/lib/export/google-pack";
import { markGooglePackInstalledAction } from "@/lib/brand/actions";

export const metadata: Metadata = { title: "Pacote Google" };

interface BrandOption {
  id: string;
  brand_name: string;
  website_url: string | null;
  google_verification_token: string | null;
}

const FILES = [
  {
    name: "sitemap.xml",
    detail: "Homepage + artigos GEO aprovados/exportados, com lastmod e prioridade.",
  },
  {
    name: "robots.txt",
    detail: "Libera GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot e Google-Extended.",
  },
  {
    name: "index.html",
    detail: "Canonical, Open Graph, Twitter Card, JSON-LD e meta do Search Console.",
  },
  {
    name: "LEIA-ME.txt",
    detail: "Passo a passo de instalação e de verificação da propriedade no Google.",
  },
] as const;

export default async function GooglePackPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; erro?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const brandsQuery = await supabase
    .from("brand_profiles")
    .select("id, brand_name, website_url, google_verification_token")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true });

  if (brandsQuery.error) {
    throw new Error(`Falha ao carregar marcas: ${brandsQuery.error.message}`);
  }

  const brands = (brandsQuery.data ?? []) as BrandOption[];
  const selected = brands.find((brand) => brand.id === params.brand) ?? brands[0];

  let siteUrl: string | null = null;
  let siteError: string | null = null;
  if (selected?.website_url) {
    try {
      siteUrl = normalizeSiteUrl(selected.website_url);
    } catch (error) {
      siteError = error instanceof Error ? error.message : "Site inválido.";
    }
  }

  let articleCount = 0;
  let latestArticles: { title: string }[] = [];
  if (selected) {
    const [countQuery, latestQuery] = await Promise.all([
      supabase
        .from("campaigns_and_assets")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", session.tenantId)
        .eq("brand_id", selected.id)
        .eq("asset_type", "geo_article")
        .in("status", ["approved", "exported"]),
      supabase
        .from("campaigns_and_assets")
        .select("title")
        .eq("tenant_id", session.tenantId)
        .eq("brand_id", selected.id)
        .eq("asset_type", "geo_article")
        .in("status", ["approved", "exported"])
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    articleCount = countQuery.count ?? 0;
    latestArticles = (latestQuery.data ?? []) as { title: string }[];
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Pacote Google"
        description="Um ZIP para colocar no seu site: sitemap, robots liberando assistentes de IA e uma index.html com canonical, Open Graph e JSON-LD."
        actions={
          selected ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/settings/brand?brand=${selected.id}`}>Editar marca</Link>
            </Button>
          ) : null
        }
      />

      {params.erro ? (
        <Alert variant="destructive">
          <AlertDescription>{params.erro}</AlertDescription>
        </Alert>
      ) : null}

      {brands.length === 0 ? (
        <EmptyState
          icon={<Globe className="size-5" aria-hidden="true" />}
          title="Nenhuma marca para empacotar"
          description="O Pacote Google é gerado a partir do site e dos artigos de uma marca. Crie a primeira marca para começar."
          action={
            <Button asChild size="sm">
              <Link href="/settings/brand">Criar marca</Link>
            </Button>
          }
        />
      ) : (
        <>
          {brands.length > 1 ? (
            <nav aria-label="Selecionar marca" className="flex flex-wrap gap-2">
              {brands.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/google?brand=${brand.id}`}
                  aria-current={brand.id === selected?.id ? "page" : undefined}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-sm ${
                    brand.id === selected?.id
                      ? "border-foreground/40 bg-accent font-medium"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  {brand.brand_name}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Globe className="size-4" aria-hidden="true" />
                  Pacote de {selected?.brand_name}
                </CardTitle>
                <CardDescription>
                  {siteUrl ? (
                    <>
                      Site base <code className="font-mono">{siteUrl}</code> · {articleCount} artigo(s)
                      aprovado(s) no sitemap.
                    </>
                  ) : (
                    "Esta marca ainda não tem um site válido cadastrado."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5 text-sm">
                  {FILES.map((file) => (
                    <li key={file.name} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                      <span>
                        <code className="font-mono text-xs font-medium">{file.name}</code>
                        <span className="block text-muted-foreground">{file.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {siteError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{siteError}</AlertDescription>
                  </Alert>
                ) : null}

                {siteUrl ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Button asChild size="lg" className="w-full sm:w-auto">
                        {/* O download vem do Content-Disposition da rota; sem o atributo
                            `download`, um redirecionamento de erro navega para o aviso. */}
                        <a href={`/api/brands/${selected?.id}/google-pack`}>
                          <Download className="size-4" aria-hidden="true" />
                          Baixar pacote ZIP
                        </a>
                      </Button>

                      {selected ? (
                        <form action={markGooglePackInstalledAction}>
                          <input type="hidden" name="brandId" value={selected.id} />
                          <Button
                            type="submit"
                            size="lg"
                            variant="outline"
                            className="w-full border-orange-300 bg-orange-100/90 font-medium text-orange-950 hover:bg-orange-200/90 sm:w-auto dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200"
                          >
                            <CheckCircle2 className="size-4 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                            {selected.google_verification_token
                              ? "Pacote Instalado ✓"
                              : "Pacote Instalado"}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Após enviar os arquivos para seu site, clique em <strong>Pacote Instalado</strong> para concluir este item na Saúde da Marca.
                    </p>
                  </div>
                ) : (
                  <Alert variant="warning">
                    <AlertDescription>
                      Para gerar o pacote, cadastre o site da marca em{" "}
                      <Link
                        href={`/settings/brand?brand=${selected?.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        Marca e voz
                      </Link>
                      . O sitemap e o canonical dependem do domínio final.
                    </AlertDescription>
                  </Alert>
                )}

                {latestArticles.length > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Incluídos no sitemap
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {latestArticles.map((article) => (
                        <li key={article.title} className="truncate">
                          {article.title}
                        </li>
                      ))}
                    </ul>
                    {articleCount > latestArticles.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        + {articleCount - latestArticles.length} artigo(s)
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ainda não há artigos GEO aprovados. O sitemap terá a homepage; os próximos artigos
                    entram automaticamente quando forem aprovados.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <SearchCheck className="size-4" aria-hidden="true" />
                    Verificação do Google Search Console
                  </CardTitle>
                  <CardDescription>
                    Opcional. Se seu domínio já foi verificado via DNS no Search Console, você pode
                    deixar em branco e apenas baixar o ZIP.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selected ? (
                    <GoogleTokenForm
                      brandId={selected.id}
                      token={selected.google_verification_token}
                    />
                  ) : null}
                  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                    <p className="font-semibold text-foreground">Onde encontrar no Search Console:</p>
                    <ol className="list-decimal space-y-1.5 pl-4">
                      <li>
                        Ao adicionar sua propriedade, escolha{" "}
                        <strong className="text-foreground">Prefixo do URL</strong> (ex.:{" "}
                        <code className="font-mono">https://www.seusite.com.br</code>).{" "}
                        <em>(A opção &ldquo;Domínio&rdquo; só mostra registro TXT DNS.)</em>
                      </li>
                      <li>
                        <strong className="text-foreground">Opção mais fácil (Arquivo HTML):</strong>{" "}
                        copie apenas o nome do arquivo sugerido pelo Google (ex.:{" "}
                        <code className="font-mono">google5dda….html</code>) e cole acima — o Kitefy
                        já inclui esse arquivo pronto dentro do ZIP.
                      </li>
                      <li>
                        <strong className="text-foreground">Alternativa (Tag HTML):</strong> abra{" "}
                        <em>Outros métodos de verificação → Tag HTML</em> e cole a tag{" "}
                        <code className="font-mono">&lt;meta … /&gt;</code> inteira — ela entra
                        automaticamente no <code className="font-mono">index.html</code>.
                      </li>
                    </ol>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TriangleAlert className="size-4" aria-hidden="true" />
                    Antes de publicar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <p>
                    Envie <code className="font-mono">sitemap.xml</code> e{" "}
                    <code className="font-mono">robots.txt</code> para a raiz do domínio.
                  </p>
                  <p>
                    Se o site já tem uma home, copie para ela as tags do{" "}
                    <code className="font-mono">&lt;head&gt;</code> do index.html em vez de substituir a
                    página inteira.
                  </p>
                  <p>
                    A imagem de Open Graph aponta para{" "}
                    <code className="font-mono">/logo.png</code> no seu domínio. Envie uma logomarca
                    pública nesse caminho — o Storage do Kitefy é privado.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
