/**
 * Leitura do site da marca para o onboarding.
 *
 * Objetivo: o contexto deixa de ser "declarado" e passa a ser *observado* —
 * título, descrição, serviços (headings), tipos de JSON-LD e candidatos a fato
 * verificável, cada um com a URL de origem.
 *
 * Princípios:
 *  - somente HTML estático (sem executar JS, sem navegador);
 *  - respeita robots.txt do domínio;
 *  - limite de páginas, tempo e bytes (não é crawler de indexação);
 *  - bloqueia destinos internos/privados (SSRF): só http(s), porta 80/443,
 *    host público, sem credenciais na URL;
 *  - nunca inventa fato: o que não estiver escrito na página não entra.
 */

const MAX_PAGES = 5;
const MAX_BYTES = 1_500_000;
const PAGE_TIMEOUT_MS = 8_000;
const TOTAL_BUDGET_MS = 20_000;

const USER_AGENT = "KitefyBot/1.0 (+https://kitefy.com.br/bot)";

/** Palavras que indicam páginas úteis para entender a oferta. */
const STRONG_HINTS = [
  "sobre",
  "quem-somos",
  "quem somos",
  "empresa",
  "servico",
  "serviço",
  "solucao",
  "solução",
  "produto",
  "planos",
  "precos",
  "preços",
  "como-funciona",
];

/** Páginas de conteúdo: boas para descobrir assuntos, menos que a oferta. */
const CONTENT_HINTS = ["blog", "artigos", "conteudo", "conteúdo", "faq", "duvidas", "dúvidas", "perguntas", "guias"];

export interface CrawlPage {
  url: string;
  status: number;
  title: string;
  description: string;
  headings: string[];
  jsonLdTypes: string[];
  facts: { claim: string; source_url: string }[];
  links: string[];
}

export interface SiteCrawlResult {
  source_url: string;
  pages: Omit<CrawlPage, "links">[];
  brand_name: string;
  description: string;
  topics: string[];
  facts: { claim: string; source_url: string }[];
  json_ld_types: string[];
  blocked_by_robots: boolean;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Segurança de destino (SSRF)
// ---------------------------------------------------------------------------

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data",
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

/**
 * Valida a URL antes de qualquer requisição. Lança erro com motivo curto.
 */
export function assertSafePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("URL inválida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Apenas http e https são permitidos.");
  }
  if (url.username || url.password) {
    throw new Error("URL com credenciais não é permitida.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Porta não permitida (use 80 ou 443).");
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Destino interno bloqueado.");
  }
  if (isPrivateIpv4(host)) {
    throw new Error("Endereço privado bloqueado.");
  }
  if (host.startsWith("[") || host.includes(":")) {
    // IPv6 literal: bloqueia por precaução (inclui ::1 e faixas privadas).
    throw new Error("IPv6 literal não suportado.");
  }

  return url;
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

export interface RobotsRules {
  disallow: string[];
}

/** Interpreta apenas o grupo do user-agent `*` (suficiente e conservador). */
export function parseRobots(text: string): RobotsRules {
  const disallow: string[] = [];
  let appliesToUs = false;
  let sawSpecificGroup = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;

    const [rawKey, ...rest] = line.split(":");
    const key = (rawKey ?? "").trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      if (agent === "*") {
        appliesToUs = true;
      } else if (agent.length > 0) {
        sawSpecificGroup = true;
        appliesToUs = false;
      }
      continue;
    }

    if (key === "disallow" && appliesToUs) {
      disallow.push(value);
    }
  }

  // Se só existem grupos específicos, não somos bloqueados por eles.
  if (!appliesToUs && sawSpecificGroup) return { disallow: [] };
  return { disallow };
}

export function isAllowedByRobots(pathname: string, rules: RobotsRules): boolean {
  if (rules.disallow.length === 0) return true;
  return !rules.disallow.some((rule) => {
    if (rule === "" || rule === "/") return rule === "/";
    const normalized = rule.endsWith("*") ? rule.slice(0, -1) : rule;
    return pathname.startsWith(normalized);
  });
}

// ---------------------------------------------------------------------------
// Fetch com limites
// ---------------------------------------------------------------------------

const MAX_REDIRECTS = 5;

async function fetchSafeWithRedirects(
  initialUrl: URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let current = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertSafePublicUrl(current.toString());

    const response = await fetch(current, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      current = assertSafePublicUrl(new URL(location, current).toString());
      continue;
    }

    return response;
  }

  throw new Error("Limite de redirecionamentos excedido.");
}

async function fetchLimited(
  url: URL,
  timeoutMs: number,
): Promise<{ status: number; contentType: string; body: string }> {
  const response = await fetchSafeWithRedirects(
    url,
    {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    },
    timeoutMs,
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return { status: response.status, contentType, body: "" };
  }

  const reader = response.body?.getReader();
  if (!reader) return { status: response.status, contentType, body: "" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  await reader.cancel().catch(() => undefined);

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const body = chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("");
  return { status: response.status, contentType, body: body.slice(0, MAX_BYTES) };
}

// ---------------------------------------------------------------------------
// Extração de HTML (sem dependência)
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function firstMatch(html: string, pattern: RegExp): string {
  const match = pattern.exec(html);
  return match?.[1] ? decodeEntities(match[1]).trim() : "";
}

export interface SiteProfile {
  title: string;
  description: string;
  siteName: string;
  headings: string[];
  jsonLdTypes: string[];
  links: string[];
  text: string;
  paragraphs: string[];
}

export function extractSiteProfile(html: string, pageUrl: string): SiteProfile {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  const siteName =
    firstMatch(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i) ||
    firstMatch(html, /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']*)["']/i);

  const headings = [...html.matchAll(/<h([2-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => textOf(match[2] ?? ""))
    .filter((heading) => heading.length > 3 && heading.length < 90);

  const jsonLdTypes: string[] = [];
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1] ?? "";
    for (const type of raw.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
      const value = type[1];
      if (value) jsonLdTypes.push(value);
    }
  }

  const links: string[] = [];
  for (const match of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    const href = match[1];
    if (!href) continue;
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        links.push(resolved.toString());
      }
    } catch {
      // href inválido: ignora
    }
  }

  // Blocos de texto reais: parágrafos e itens de lista. Usar o HTML inteiro
  // mistura rótulos de botão com frases e produz "fatos" sem sentido.
  const paragraphs = [...html.matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => textOf(match[2] ?? ""))
    .filter((paragraph) => paragraph.length >= 30 && paragraph.length <= 600);

  return {
    title,
    description,
    siteName,
    headings: unique(headings).slice(0, 40),
    jsonLdTypes: unique(jsonLdTypes),
    links: unique(links).slice(0, 200),
    text: textOf(html),
    paragraphs: unique(paragraphs).slice(0, 120),
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Evidência concreta: ano, moeda, percentual, milhar, grandeza ou unidade.
 * "Ter número solto" não basta — rótulos de UI têm números ("12 +3 no mês").
 */
const CONCRETE_EVIDENCE =
  /(19\d{2}|20\d{2}|R\$|US\$|\d+\s?%|\b\d{1,3}(\.\d{3})+\b|\bmil\b|\bmilh(ão|ões)\b|\bbilh(ão|ões)\b|\bbillion\b|\bdesde\b|\bhoras?\b|\bdias?\b|\banos?\b|\bmeses\b|\bunidades?\b|\bclientes?\b|\bcolaboradores?\b|\bfuncion[áa]rios?\b|\batletas?\b|\bpacientes?\b|\balunos?\b|\bempresas?\b|\blojas?\b)/i;

/** A frase precisa afirmar algo (sujeito + verbo), não só listar rótulos. */
const ASSERTION_VERB =
  /\b(é|são|foi|foram|tem|temos|têm|somos|atend\w*|atua\w*|realiz\w*|oferec\w*|entreg\w*|som\w*|alcanç\w*|cheg\w*|fundad\w*|criad\w*|possui\w*|cont\w*|usa\w*|utiliz\w*|is|are|was|were|has|have|offers?|serves?|delivers?|handles?|founded|since)\b/i;

/** Ruído de interface/rodapé que nunca é fato de marca. */
const UI_NOISE =
  /(cookies?|pol[ií]tica|termos|clique|login|entrar|assinar|escolher|ver como|começar|aceitar|concordar|todos os direitos)/i;

function looksLikeUiLabel(sentence: string): boolean {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const capitalized = words.filter((word) => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(word)).length;
  return capitalized / words.length > 0.4;
}

/** Candidatos a fato verificável: afirmação com evidência concreta. */
export function extractFactCandidates(
  text: string,
  sourceUrl: string,
  limit = 5,
): { claim: string; source_url: string }[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 180)
    .filter((sentence) => sentence.split(/\s+/).length >= 6)
    .filter((sentence) => CONCRETE_EVIDENCE.test(sentence))
    .filter((sentence) => ASSERTION_VERB.test(sentence))
    .filter((sentence) => !UI_NOISE.test(sentence))
    .filter((sentence) => !looksLikeUiLabel(sentence));

  const seen = new Set<string>();
  const facts: { claim: string; source_url: string }[] = [];
  for (const sentence of sentences) {
    const key = sentence.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ claim: sentence, source_url: sourceUrl });
    if (facts.length >= limit) break;
  }
  return facts;
}

/** Ordena links internos priorizando páginas institucionais. */
export function pickInternalLinks(
  links: string[],
  origin: string,
  limit = 4,
): { url: string; score: number }[] {
  const base = new URL(origin);

  const scored = links
    .map((link) => {
      try {
        const url = new URL(link);
        if (url.hostname !== base.hostname) return null;
        const path = url.pathname.toLowerCase();
        if (path === "/" || path.length === 0) return null;
        if (/\.(pdf|jpg|jpeg|png|webp|svg|zip|mp4|xml)$/i.test(path)) return null;
        // Páginas de conta e legais não descrevem a oferta.
        if (
          /^\/(login|signin|entrar|cadastro|signup|register|checkout|carrinho|cart|conta|account|dashboard|admin)(\/|$)/.test(
            path,
          )
        ) {
          return null;
        }
        if (/^\/(privacidade|privacy|termos|terms|legal|cookies|lgpd)(\/|$)/.test(path)) return null;
        const strong = STRONG_HINTS.filter((hint) => path.includes(hint)).length;
        const content = CONTENT_HINTS.filter((hint) => path.includes(hint)).length;
        const score = strong * 2 + content;
        return { url: url.toString(), score, path };
      } catch {
        return null;
      }
    })
    .filter((item): item is { url: string; score: number; path: string } => item !== null);

  const byPath = new Map<string, { url: string; score: number }>();
  for (const item of scored.sort((a, b) => b.score - a.score)) {
    if (!byPath.has(item.path)) byPath.set(item.path, { url: item.url, score: item.score });
  }

  return [...byPath.values()].slice(0, limit);
}

/** Deriva o nome da marca: og:site_name > título antes do separador > domínio. */
export function deriveBrandName(profile: SiteProfile, url: URL): string {
  if (profile.siteName.length >= 2) return profile.siteName.slice(0, 80);

  const titleLead = profile.title.split(/\s*[|•·—–-]\s*/)[0]?.trim() ?? "";
  if (titleLead.length >= 2 && titleLead.length <= 60) return titleLead;

  const host = url.hostname.replace(/^www\./, "");
  const first = host.split(".")[0] ?? "Marca";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

async function loadRobots(origin: string): Promise<RobotsRules> {
  try {
    const response = await fetchLimited(new URL("/robots.txt", origin), 3_000);
    if (!response.body) return { disallow: [] };
    return parseRobots(response.body);
  } catch {
    return { disallow: [] };
  }
}

export async function crawlBrandSite(
  rawUrl: string,
  options: { budgetMs?: number; maxPages?: number } = {},
): Promise<SiteCrawlResult> {
  const warnings: string[] = [];
  const started = Date.now();
  const budgetMs = Math.max(4_000, options.budgetMs ?? TOTAL_BUDGET_MS);
  const maxPages = Math.min(MAX_PAGES, Math.max(1, options.maxPages ?? MAX_PAGES));
  const entry = assertSafePublicUrl(rawUrl);
  const origin = entry.origin;

  const rules = await loadRobots(origin);
  const blockedByRobots = !isAllowedByRobots(entry.pathname || "/", rules);

  const pages: CrawlPage[] = [];
  let homeProfile: SiteProfile | null = null;

  async function visit(
    target: URL,
    budgetMs: number,
  ): Promise<{ page: CrawlPage; profile: SiteProfile } | null> {
    if (Date.now() - started > budgetMs) {
      warnings.push("Limite de tempo do crawl atingido.");
      return null;
    }
    try {
      const response = await fetchLimited(target, Math.min(PAGE_TIMEOUT_MS, budgetMs));
      if (!response.body) {
        warnings.push(`${target.pathname}: conteúdo não é HTML.`);
        return null;
      }
      const profile = extractSiteProfile(response.body, target.toString());
      return {
        profile,
        page: {
          url: target.toString(),
          status: response.status,
          title: profile.title,
          description: profile.description,
          headings: profile.headings,
          jsonLdTypes: profile.jsonLdTypes,
          facts: extractFactCandidates(
            (profile.paragraphs.length > 0 ? profile.paragraphs : [profile.text]).join(" "),
            target.toString(),
          ),
          links: profile.links,
        },
      };
    } catch (error) {
      warnings.push(
        `${target.pathname}: ${error instanceof Error ? error.message : "falha ao buscar"}`,
      );
      return null;
    }
  }

  // A home é buscada mesmo bloqueada por robots? Não: robots vale para o bot.
  if (!blockedByRobots) {
    const home = await visit(entry, budgetMs);
    if (home) {
      pages.push(home.page);
      homeProfile = home.profile;

      const candidates = pickInternalLinks(home.page.links, origin, maxPages - 1);
      for (const candidate of candidates) {
        if (pages.length >= maxPages) break;
        const url = new URL(candidate.url);
        if (!isAllowedByRobots(url.pathname, rules)) continue;
        const visited = await visit(url, budgetMs);
        if (visited && visited.page.status < 400) pages.push(visited.page);
      }
    }
  } else {
    warnings.push("robots.txt impede a leitura deste site.");
  }

  const home = pages[0];
  const description =
    home?.description ||
    pages.find((page) => page.description.length > 0)?.description ||
    "";

  const topics = unique(
    pages.flatMap((page) => page.headings.filter((heading) => heading.length >= 6)),
  ).slice(0, 8);

  const facts = pages
    .flatMap((page) => page.facts)
    .filter(
      (fact, index, all) =>
        all.findIndex((other) => other.claim.toLowerCase() === fact.claim.toLowerCase()) === index,
    )
    .slice(0, 6);

  if (pages.length === 0 && !blockedByRobots) {
    warnings.push("Nenhuma página pôde ser lida (site fora do ar, bloqueio ou HTML vazio).");
  }

  // Fallback inteligente para perfis de redes sociais (Instagram, TikTok, Facebook,
  // LinkedIn, YouTube): redes sociais frequentemente retornam tela de login em inglês
  // ("Create an account or log in to Instagram...") e <title>Instagram</title>.
  // Nunca usamos esses textos genéricos como nome ou descrição da marca.
  const socialHosts = ["instagram.com", "linkedin.com", "tiktok.com", "youtube.com", "facebook.com", "threads.net"];
  const hostLower = entry.hostname.toLowerCase();
  const isSocialUrl = socialHosts.some((domain) => hostLower === domain || hostLower.endsWith(`.${domain}`));

  const GENERIC_SOCIAL_NAMES = new Set([
    "instagram",
    "tiktok",
    "facebook",
    "linkedin",
    "youtube",
    "threads",
    "log in",
    "login",
    "entrar",
    "sign up",
  ]);
  const SOCIAL_LOGIN_BOILERPLATE =
    /create an account|log in to instagram|sign up to see|entrar no instagram|fa[çc]a login|welcome back to instagram|make your day|log into facebook|join facebook|see photos, videos and more|criar uma conta|connect with friends|cadastre-se para ver/i;

  let derivedBrandName = homeProfile ? deriveBrandName(homeProfile, entry) : "";
  let derivedDescription = description;
  let cleanedTopics = topics;
  let cleanedFacts = facts;

  if (isSocialUrl) {
    // Remove qualquer texto de tela de login das redes sociais
    if (SOCIAL_LOGIN_BOILERPLATE.test(derivedDescription)) {
      derivedDescription = "";
    }
    cleanedTopics = topics.filter((t) => !SOCIAL_LOGIN_BOILERPLATE.test(t) && !GENERIC_SOCIAL_NAMES.has(t.trim().toLowerCase()));
    cleanedFacts = facts.filter((f) => !SOCIAL_LOGIN_BOILERPLATE.test(f.claim));

    // Se o título trouxe "Nome Real (@handle) • Instagram...", extrai apenas o Nome Real
    const rawTitle = homeProfile?.title ?? "";
    const realNameFromTitle = rawTitle
      .replace(/\s*\(@[^)]+\).*$/i, "")
      .replace(/\s*[•|·—–-]\s*(instagram|tiktok|facebook|linkedin|youtube).*$/i, "")
      .trim();

    if (
      realNameFromTitle.length >= 2 &&
      realNameFromTitle.length <= 60 &&
      !GENERIC_SOCIAL_NAMES.has(realNameFromTitle.toLowerCase()) &&
      !SOCIAL_LOGIN_BOILERPLATE.test(realNameFromTitle)
    ) {
      derivedBrandName = realNameFromTitle;
    }

    // Se ainda ficou vazio ou genérico ("Instagram", "TikTok"...), extrai o nome real do @handle na URL
    if (!derivedBrandName || GENERIC_SOCIAL_NAMES.has(derivedBrandName.trim().toLowerCase())) {
      const ignoredSegments = new Set([
        "company",
        "in",
        "channel",
        "c",
        "user",
        "p",
        "reel",
        "reels",
        "stories",
        "explore",
        "accounts",
        "login",
        "pages",
        "profile.php",
        "share",
      ]);
      const segments = entry.pathname
        .split("/")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !ignoredSegments.has(s.toLowerCase()));
      const handle = (segments[0] ?? "").replace(/^@/, "").replace(/[._-]+/g, " ").trim();
      if (handle.length >= 2) {
        derivedBrandName = handle
          .split(" ")
          .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
          .join(" ");
      }
    }

    if (!derivedDescription) {
      warnings.push(
        "Perfis de Instagram/TikTok/Facebook bloqueiam leitura direta sem login; usamos o nome real da conta e dados públicos indexados.",
      );
    }
  }

  return {
    source_url: entry.toString(),
    pages: pages.map(({ links: _links, ...rest }) => rest),
    brand_name: derivedBrandName,
    description: derivedDescription,
    topics: cleanedTopics,
    facts: cleanedFacts,
    json_ld_types: unique(pages.flatMap((page) => page.jsonLdTypes)),
    blocked_by_robots: blockedByRobots,
    warnings,
  };
}
