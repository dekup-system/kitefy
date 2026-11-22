import { describe, expect, it } from "vitest";
import {
  assertSafePublicUrl,
  decodeEntities,
  deriveBrandName,
  extractFactCandidates,
  extractSiteProfile,
  isAllowedByRobots,
  parseRobots,
  pickInternalLinks,
} from "@/lib/crawl/site";

/**
 * O crawler é a primeira peça do produto que busca uma URL arbitrária fornecida
 * pelo usuário. Duas classes de risco são testadas aqui: SSRF (destino interno)
 * e leitura indevida (robots.txt). O resto é extração de HTML.
 */

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <title>Clínica Aurora | Fisioterapia esportiva em São Paulo</title>
  <meta name="description" content="Avaliação e reabilitação esportiva com protocolo próprio, desde 2014." />
  <meta property="og:site_name" content="Clínica Aurora" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"MedicalClinic","name":"Aurora"}</script>
  <script type="application/ld+json">{"@type":"FAQPage"}</script>
  <style>.x{color:#fff}</style>
</head>
<body>
  <h1>Reabilitação esportiva de verdade</h1>
  <h2>Protocolo de avaliação em três etapas</h2>
  <h2>Atendimento em São Paulo desde 2014</h2>
  <h3>Teleorientação para todo o Brasil</h3>
  <p>Mais de 1.200 atletas atendidos em 11 anos de operação clínica.</p>
  <p>Política de cookies</p>
  <a href="/sobre">Sobre</a>
  <a href="/servicos/fisioterapia">Serviços</a>
  <a href="/blog/post">Blog</a>
  <a href="https://outro-site.com/x">Parceiro</a>
  <a href="/arquivo.pdf">PDF</a>
  <script>var x = 1 < 2;</script>
</body>
</html>`;

describe("assertSafePublicUrl (SSRF)", () => {
  it("aceita URL pública https", () => {
    expect(assertSafePublicUrl("https://clinica-aurora.com.br/sobre").hostname).toBe(
      "clinica-aurora.com.br",
    );
  });

  it("recusa destinos internos e loops", () => {
    for (const url of [
      "http://localhost:3000",
      "http://127.0.0.1",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://[::1]/",
      "http://metadata.google.internal/",
    ]) {
      expect(() => assertSafePublicUrl(url), url).toThrow(/bloquead|permitid|IPv6/i);
    }
  });

  it("recusa esquemas e portas não usuais", () => {
    expect(() => assertSafePublicUrl("file:///etc/passwd")).toThrow(/http/i);
    expect(() => assertSafePublicUrl("ftp://exemplo.com")).toThrow(/http/i);
    expect(() => assertSafePublicUrl("https://exemplo.com:8080")).toThrow(/Porta/);
    expect(() => assertSafePublicUrl("https://user:pass@exemplo.com")).toThrow(/credenciais/i);
  });
});

describe("robots.txt", () => {
  it("lê Disallow do grupo *", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /admin\nDisallow: /checkout\n");
    expect(isAllowedByRobots("/sobre", rules)).toBe(true);
    expect(isAllowedByRobots("/admin/usuarios", rules)).toBe(false);
  });

  it("ignora grupos de outros agentes", () => {
    const rules = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n");
    expect(isAllowedByRobots("/sobre", rules)).toBe(true);
    expect(isAllowedByRobots("/admin/x", rules)).toBe(false);
  });

  it("Disallow: / bloqueia tudo", () => {
    expect(isAllowedByRobots("/qualquer", parseRobots("User-agent: *\nDisallow: /"))).toBe(false);
  });

  it("sem robots, tudo liberado", () => {
    expect(isAllowedByRobots("/sobre", parseRobots(""))).toBe(true);
  });
});

describe("extractSiteProfile", () => {
  const profile = extractSiteProfile(HTML, "https://clinica-aurora.com.br/");

  it("extrai título, descrição e site name", () => {
    expect(profile.title).toContain("Clínica Aurora");
    expect(profile.description).toContain("protocolo próprio");
    expect(profile.siteName).toBe("Clínica Aurora");
  });

  it("extrai headings de h2/h3 sem h1", () => {
    expect(profile.headings).toContain("Protocolo de avaliação em três etapas");
    expect(profile.headings).toContain("Teleorientação para todo o Brasil");
    expect(profile.headings.some((heading) => heading.includes("Reabilitação esportiva de verdade"))).toBe(
      false,
    );
  });

  it("extrai tipos de JSON-LD", () => {
    expect(profile.jsonLdTypes).toEqual(expect.arrayContaining(["MedicalClinic", "FAQPage"]));
  });

  it("remove script e style do texto", () => {
    expect(profile.text).toContain("1.200 atletas atendidos");
    expect(profile.text).not.toContain("color:#fff");
    expect(profile.text).not.toContain("var x");
  });

  it("coleta links http(s)", () => {
    expect(profile.links).toContain("https://clinica-aurora.com.br/sobre");
    expect(profile.links).toContain("https://outro-site.com/x");
  });
});

describe("extractFactCandidates", () => {
  it("pega frases com número em contexto de afirmação", () => {
    const text =
      "Mais de 1.200 atletas atendidos em 11 anos de operação clínica. Fundada em 2014 na zona sul. "
      + "Atendemos com carinho no dia a dia. Política de cookies.";
    const facts = extractFactCandidates(text, "https://clinica-aurora.com.br/sobre");

    expect(facts.some((fact) => fact.claim.includes("1.200"))).toBe(true);
    expect(facts.every((fact) => fact.source_url === "https://clinica-aurora.com.br/sobre")).toBe(true);
    expect(facts.some((fact) => fact.claim.startsWith("Política de cookies"))).toBe(false);
  });

  it("descarta rótulos de interface e frases sem afirmação", () => {
    const text =
      "Escolher meu pacote Ver como funciona Sem fidelidade. "
      + "Citações em respostas de IA 12 +3 no mês. "
      + "A clínica atendeu mais de 1.200 atletas em 11 anos de operação.";
    const facts = extractFactCandidates(text, "https://x.com");

    expect(facts).toHaveLength(1);
    expect(facts[0]?.claim).toContain("1.200");
  });

  it("exige evidência concreta (ano, moeda, percentual, milhar)", () => {
    const text =
      "Nosso time é muito atencioso com cada pessoa. "
      + "Fundada em 2014, a operação soma 3 unidades em São Paulo.";
    const facts = extractFactCandidates(text, "https://x.com");

    expect(facts).toHaveLength(1);
    expect(facts[0]?.claim).toContain("2014");
  });

  it("respeita o limite e deduplica", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Temos ${i + 3} unidades ativas na cidade.`).join(" ");
    const facts = extractFactCandidates(text, "https://x.com", 3);
    expect(facts).toHaveLength(3);
  });
});

describe("pickInternalLinks", () => {
  it("prioriza institucional e ignora externos/arquivos", () => {
    const links = [
      "https://site.com/blog/post",
      "https://site.com/sobre",
      "https://outro.com/sobre",
      "https://site.com/servicos/fisio",
      "https://site.com/arquivo.pdf",
      "https://site.com/",
    ];
    const picked = pickInternalLinks(links, "https://site.com/", 3);
    const urls = picked.map((item) => item.url);

    expect(urls[0]).toBe("https://site.com/sobre");
    expect(urls).toContain("https://site.com/servicos/fisio");
    expect(urls.some((url) => url.includes("outro.com"))).toBe(false);
    expect(urls.some((url) => url.endsWith(".pdf"))).toBe(false);
    expect(urls).not.toContain("https://site.com/");
  });
});

describe("deriveBrandName", () => {
  const url = new URL("https://clinica-aurora.com.br/");

  it("prefere og:site_name", () => {
    const profile = extractSiteProfile(HTML, url.toString());
    expect(deriveBrandName(profile, url)).toBe("Clínica Aurora");
  });

  it("cai para o título antes do separador", () => {
    const profile = extractSiteProfile("<title>Aurora Fisio — reabilitação</title>", url.toString());
    expect(deriveBrandName(profile, url)).toBe("Aurora Fisio");
  });

  it("cai para o domínio capitalizado", () => {
    const profile = extractSiteProfile("<title></title>", url.toString());
    expect(deriveBrandName(profile, new URL("https://aurora-fisio.com.br/"))).toBe("Aurora-fisio");
  });
});

describe("decodeEntities", () => {
  it("decodifica entidades comuns", () => {
    expect(decodeEntities("Saúde &amp; Movimento &#39;pro&#39;")).toBe("Saúde & Movimento 'pro'");
  });
});
