import { describe, expect, it } from "vitest";
import {
  GooglePackError,
  buildGooglePack,
  buildIndexHtml,
  buildRobotsTxt,
  buildSitemapXml,
  normalizeSiteUrl,
  parseVerificationToken,
} from "@/lib/export/google-pack";

const GENERATED_AT = new Date("2026-01-15T12:00:00.000Z");

describe("normalizeSiteUrl", () => {
  it("remove barra final e normaliza o host", () => {
    expect(normalizeSiteUrl("https://Example.com/")).toBe("https://example.com");
    expect(normalizeSiteUrl("https://example.com/blog/")).toBe("https://example.com/blog");
  });

  it("descarta query e hash (a base do sitemap é o caminho)", () => {
    expect(normalizeSiteUrl("https://site.com.br/?utm=1#topo")).toBe("https://site.com.br");
  });

  it("recusa URL sem protocolo, protocolo perigoso ou credenciais", () => {
    expect(() => normalizeSiteUrl("site.com.br")).toThrow(GooglePackError);
    expect(() => normalizeSiteUrl("javascript:alert(1)")).toThrow(GooglePackError);
    expect(() => normalizeSiteUrl("https://user:senha@site.com")).toThrow(GooglePackError);
  });

  it("recusa site ausente", () => {
    expect(() => normalizeSiteUrl(null)).toThrow(/Cadastre o site da marca/);
    expect(() => normalizeSiteUrl("   ")).toThrow(/Cadastre o site da marca/);
  });
});

describe("parseVerificationToken", () => {
  it("aceita token puro", () => {
    const parsed = parseVerificationToken("AbC-123_x.y");
    expect(parsed).toEqual({ ok: true, token: "AbC-123_x.y" });
  });

  it("aceita prefixo e meta tag inteira", () => {
    expect(parseVerificationToken("google-site-verification=abc123")).toEqual({
      ok: true,
      token: "abc123",
    });
    expect(
      parseVerificationToken('<meta name="google-site-verification" content="abcDEF_123" />'),
    ).toEqual({ ok: true, token: "abcDEF_123" });
  });

  it("token vazio (ou ausente) significa remover a verificação", () => {
    expect(parseVerificationToken("")).toEqual({ ok: true, token: null });
    expect(parseVerificationToken(null)).toEqual({ ok: true, token: null });
  });

  it("recusa caracteres que quebrariam o meta", () => {
    const parsed = parseVerificationToken('abc" onload="alert(1)');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("Token do Search Console inválido");
  });
});

describe("buildSitemapXml", () => {
  it("inclui homepage e artigos com lastmod", () => {
    const xml = buildSitemapXml({
      siteUrl: "https://site.com.br",
      generatedAt: GENERATED_AT,
      articles: [
        {
          slug: "guia-tratamento",
          title: "Guia",
          updatedAt: "2026-02-01T10:00:00.000Z",
        },
      ],
    });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<loc>https://site.com.br/</loc>");
    expect(xml).toContain("<loc>https://site.com.br/guia-tratamento</loc>");
    expect(xml).toContain("<lastmod>2026-01-15</lastmod>");
    expect(xml).toContain("<lastmod>2026-02-01</lastmod>");
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it("deduplica URLs e ignora slugs perigosos", () => {
    const xml = buildSitemapXml({
      siteUrl: "https://site.com.br",
      generatedAt: GENERATED_AT,
      articles: [
        { slug: "artigo", title: "A" },
        { slug: "/artigo/", title: "A de novo" },
        { slug: "../admin", title: "Traversal" },
        { slug: "   ", title: "Vazio" },
      ],
    });

    expect(xml.match(/artigo<\/loc>/g)).toHaveLength(1);
    expect(xml).not.toContain("../admin");
    expect(xml).not.toContain("Traversal");
  });

  it("escapa & no loc", () => {
    const xml = buildSitemapXml({ siteUrl: "https://site.com/a&b", generatedAt: GENERATED_AT });
    expect(xml).toContain("https://site.com/a&amp;b/");
    expect(xml).not.toContain("a&b/");
  });
});

describe("buildRobotsTxt", () => {
  const robots = buildRobotsTxt("https://site.com.br");

  it.each([
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "ClaudeBot",
    "CCBot",
  ])("libera explicitamente %s", (bot) => {
    expect(robots).toContain(`User-agent: ${bot}`);
  });

  it("aponta o sitemap absoluto", () => {
    expect(robots).toContain("Sitemap: https://site.com.br/sitemap.xml");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
  });
});

describe("buildIndexHtml", () => {
  it("inclui canonical, Open Graph e locale pt-BR", () => {
    const html = buildIndexHtml({
      brand: { name: "Clínica Aurora", websiteUrl: "https://aurora.com.br", description: "Saúde" },
      siteUrl: "https://aurora.com.br",
      generatedAt: GENERATED_AT,
    });

    expect(html).toContain('<link rel="canonical" href="https://aurora.com.br/" />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:locale" content="pt_BR" />');
    expect(html).toContain('<meta property="og:url" content="https://aurora.com.br/" />');
    expect(html).toContain("Clínica Aurora");
  });

  it("inclui JSON-LD com Organization, WebSite e ItemList", () => {
    const html = buildIndexHtml({
      brand: { name: "Aurora", websiteUrl: "https://aurora.com.br" },
      siteUrl: "https://aurora.com.br",
      generatedAt: GENERATED_AT,
      articles: [{ slug: "artigo-1", title: "Artigo 1" }],
    });

    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain("artigo-1");
  });

  it("adiciona o meta de verificação só quando há token", () => {
    const withToken = buildIndexHtml({
      brand: { name: "Aurora", websiteUrl: "https://aurora.com.br" },
      siteUrl: "https://aurora.com.br",
      generatedAt: GENERATED_AT,
      verificationToken: "tok_123-abc",
    });
    expect(withToken).toContain(
      '<meta name="google-site-verification" content="tok_123-abc" />',
    );

    const withoutToken = buildIndexHtml({
      brand: { name: "Aurora", websiteUrl: "https://aurora.com.br" },
      siteUrl: "https://aurora.com.br",
      generatedAt: GENERATED_AT,
    });
    expect(withoutToken).not.toContain("google-site-verification");
  });

  it("escapa o nome da marca e não deixa fechar o script do JSON-LD", () => {
    const html = buildIndexHtml({
      brand: {
        name: 'Aurora </script><script>alert(1)</script>',
        websiteUrl: "https://aurora.com.br",
      },
      siteUrl: "https://aurora.com.br",
      generatedAt: GENERATED_AT,
    });

    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("&lt;/script&gt;");
  });
});

describe("buildGooglePack", () => {
  it("gera ZIP com os quatro arquivos esperados", () => {
    const file = buildGooglePack({
      brand: { name: "Clínica Aurora", websiteUrl: "https://aurora.com.br" },
      generatedAt: GENERATED_AT,
    });

    expect(file.mimeType).toBe("application/zip");
    expect(file.fileName).toBe("pacote-google-clinica-aurora.zip");
    expect(file.buffer.subarray(0, 4).toString("hex")).toBe("504b0304");
    for (const name of ["index.html", "sitemap.xml", "robots.txt", "LEIA-ME.txt"]) {
      expect(file.buffer.includes(Buffer.from(name))).toBe(true);
    }
  });

  it("falha com mensagem acionável quando a marca não tem site", () => {
    expect(() =>
      buildGooglePack({ brand: { name: "Sem site", websiteUrl: null } }),
    ).toThrow(/Cadastre o site da marca/);
  });

  it("recusa token inválido antes de zipar", () => {
    expect(() =>
      buildGooglePack({
        brand: { name: "Aurora", websiteUrl: "https://aurora.com.br" },
        verificationToken: "token inválido",
      }),
    ).toThrow(/Token do Search Console inválido/);
  });
});
