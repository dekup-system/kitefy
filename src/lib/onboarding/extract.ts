import type { EntityFact, ToneOfVoice, VisualTokens } from "@/types/domain";
import { inferBrandSeed } from "@/lib/ai/mock-generator";
import { searchWithCache } from "@/lib/serp/client";
import { crawlBrandSite, type SiteCrawlResult } from "@/lib/crawl/site";
import { createLogger } from "@/lib/logger";

/**
 * Onboarding em menos de 90 segundos, sem blank canvas.
 *
 * Entrada permitida: uma URL do site OU uma descrição livre do produto.
 * Saída: rascunho de marca pronto para revisar + primeiro ativo demonstrativo.
 *
 * Nunca faz crawl pesado nem exige configuração: o que não for inferível
 * fica como "a revisar" e a UI mostra isso explicitamente.
 */

const log = createLogger("onboarding.extract");

export interface BrandDraft {
  brand_name: string;
  website_url: string | null;
  icp_description: string;
  tone_of_voice: ToneOfVoice;
  visual_tokens: VisualTokens;
  entity_facts: EntityFact[];
  niche: string;
  confidence: "baixa" | "média" | "alta";
  needs_review: string[];
  /** Resultado da leitura do site (quando havia URL). */
  site_analysis: {
    pages_read: number;
    topics: string[];
    json_ld_types: string[];
    blocked_by_robots: boolean;
  } | null;
}

export interface NicheTemplate {
  id: string;
  label: string;
  description: string;
  example_input: string;
  tone: ToneOfVoice;
  visual_tokens: VisualTokens;
  icp_description: string;
  seed_facts: string[];
}

/** Seis templates clicáveis exibidos no onboarding para pequenos negócios e empresas. */
export const NICHE_TEMPLATES: NicheTemplate[] = [
  {
    id: "saude",
    label: "Saúde e bem-estar",
    description: "Clínicas, consultórios, médicos, dentistas e fisio.",
    example_input: "Clínica de fisioterapia esportiva em São Paulo",
    tone: {
      archetype: "especialista acessível",
      descriptors: ["cuidadoso", "direto", "sem alarmismo"],
      avoid: ["promessa de cura", "linguagem técnica sem explicação", "antes e depois"],
      reading_level: "ensino médio",
      exemplars: ["Explicamos o porquê antes do como."],
    },
    visual_tokens: {
      primary: "#0f3d3e",
      secondary: "#e7f2f1",
      accent: "#1f7a6e",
      background: "#fbfdfc",
      foreground: "#12211f",
      theme: "light",
      radius: 16,
    },
    icp_description:
      "Adultos de 30 a 55 anos que buscam prevenção e melhora de desempenho, com pouco tempo e alta desconfiança de promessas.",
    seed_facts: [
      "Equipe multidisciplinar com atendimento presencial e teleorientação",
      "Protocolo próprio de avaliação em três etapas",
    ],
  },
  {
    id: "beleza",
    label: "Beleza e estética",
    description: "Salões, clínicas de estética, barbearias e estúdios.",
    example_input: "Estúdio de estética facial e limpeza de pele em Curitiba",
    tone: {
      archetype: "anfitrião especialista",
      descriptors: ["acolhedor", "claro", "orientado a autocuidado"],
      avoid: ["promessa milagrosa", "antes e depois", "exagero"],
      reading_level: "ensino médio",
      exemplars: ["Cuidado constante aparece na saúde da pele o ano inteiro."],
    },
    visual_tokens: {
      primary: "#4a2535",
      secondary: "#f8eff3",
      accent: "#9c4a6b",
      background: "#fffcfd",
      foreground: "#23121a",
      theme: "light",
      radius: 16,
    },
    icp_description:
      "Pessoas de 25 a 50 anos que buscam atendimento com hora marcada, produtos seguros e orientação prática de rotina.",
    seed_facts: [
      "Atendimento com hora marcada e avaliação individualizada",
      "Produtos dermatologicamente testados com protocolo personalizado",
    ],
  },
  {
    id: "ecommerce",
    label: "Loja e produto físico",
    description: "Moda, casa, cosméticos, acessórios e varejo.",
    example_input: "Marca de tênis minimalistas feitos no Brasil",
    tone: {
      archetype: "curador confiável",
      descriptors: ["visual", "concreto", "sem hype"],
      avoid: ["superlativo vazio", "urgência fabricada", "promessa de transformação"],
      reading_level: "ensino médio",
      exemplars: ["Material, costura e prazo: o que muda no uso diário."],
    },
    visual_tokens: {
      primary: "#1a1a1a",
      secondary: "#f2efe9",
      accent: "#b08968",
      background: "#fdfcfb",
      foreground: "#171310",
      theme: "light",
      radius: 8,
    },
    icp_description:
      "Pessoas de 25 a 40 anos que compram menos e melhor, comparam material e durabilidade antes do preço.",
    seed_facts: [
      "Produção nacional com fornecedores auditados",
      "Troca gratuita em 30 dias",
    ],
  },
  {
    id: "gastronomia",
    label: "Gastronomia e alimentação",
    description: "Restaurantes, cafeterias, confeitarias e delivery.",
    example_input: "Padaria artesanal de fermentação natural em Belo Horizonte",
    tone: {
      archetype: "artesão próximo",
      descriptors: ["sensorial", "direto", "autêntico"],
      avoid: ["clichê publicitário", "superlativo sem prova"],
      reading_level: "ensino médio",
      exemplars: ["Fornada fresca todos os dias às 8h e às 16h."],
    },
    visual_tokens: {
      primary: "#5c2c16",
      secondary: "#f7EFEA",
      accent: "#c85a28",
      background: "#fffdf9",
      foreground: "#26130a",
      theme: "light",
      radius: 12,
    },
    icp_description:
      "Moradores e trabalhadores da região que valorizam ingrediente de verdade, preparo fresco e pedido rápido.",
    seed_facts: [
      "Ingredientes selecionados com preparo diário na própria cozinha",
      "Atendimento no salão e entrega própria na região",
    ],
  },
  {
    id: "servicos",
    label: "Serviços e profissionais",
    description: "Advocacia, contabilidade, arquitetura, oficinas e aulas.",
    example_input: "Escritório de arquitetura residencial e reformas rápidas",
    tone: {
      archetype: "consultor prático",
      descriptors: ["didático", "organizado", "transparente"],
      avoid: ["jargão difícil", "promessa de prazo irreal"],
      reading_level: "ensino médio",
      exemplars: ["Planejamento claro evita surpresa no orçamento."],
    },
    visual_tokens: {
      primary: "#1e293b",
      secondary: "#f1f5f9",
      accent: "#0284c7",
      background: "#fcfcfd",
      foreground: "#0f172a",
      theme: "light",
      radius: 10,
    },
    icp_description:
      "Clientes que precisam resolver um problema técnico com segurança, orçamento previsível e acompanhamento próximo.",
    seed_facts: [
      "Orçamento detalhado por etapa antes de iniciar o serviço",
      "Acompanhamento direto com cronograma semanal",
    ],
  },
  {
    id: "b2b",
    label: "B2B, Tecnologia e SaaS",
    description: "Software, consultorias corporativas e serviços para empresas.",
    example_input: "Plataforma de gestão de frotas para transportadoras",
    tone: {
      archetype: "parceiro técnico",
      descriptors: ["preciso", "pragmático", "com dado"],
      avoid: ["jargão de marketing", "promessa de ROI garantido", "case genérico"],
      reading_level: "superior",
      exemplars: ["O ganho aparece no fechamento do mês, não no dashboard."],
    },
    visual_tokens: {
      primary: "#1b1f2a",
      secondary: "#eef1f6",
      accent: "#3f5efb",
      background: "#fbfbfd",
      foreground: "#14161c",
      theme: "light",
      radius: 10,
    },
    icp_description:
      "Gestores de operações e marketing em empresas de 50 a 500 pessoas, cobrados por eficiência e previsibilidade.",
    seed_facts: [
      "Implantação assistida em até 30 dias",
      "Suporte em português com SLA definido",
    ],
  },
];

/**
 * Gera o rascunho da marca a partir do input do onboarding.
 * Tenta enriquecer com SERP (perguntas do público) — se falhar, segue adiante.
 */
export async function extractBrandDraft(
  input: string,
  templateId?: string,
): Promise<BrandDraft> {
  const seed = inferBrandSeed(input);
  const template = NICHE_TEMPLATES.find((item) => item.id === templateId);

  const needsReview: string[] = [];
  let icp = template?.icp_description ?? seed.icp_description;
  const facts: EntityFact[] = [];
  let confidence: BrandDraft["confidence"] = "média";

  if (template) {
    confidence = "alta";
    for (const claim of template.seed_facts) {
      facts.push({ claim, source_url: seed.website_url ?? undefined });
    }
  }

  // Enriquecimento opcional: perguntas reais do público (PAA).
  try {
    const insights = await searchWithCache({
      query: `${seed.brand_name} ${template?.label ?? ""} ${input}`.trim().slice(0, 180),
      locale: "pt-BR",
      num: 5,
    });

    const questions = insights.people_also_ask.slice(0, 3).map((item) => item.question);
    if (questions.length > 0) {
      icp = `${icp} Perguntas recorrentes do público: ${questions.join("; ")}.`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("Enriquecimento SERP indisponível no onboarding", { message });
    needsReview.push("Não foi possível consultar a busca agora; o público foi inferido do texto.");
  }

  // Leitura do site: transforma contexto declarado em contexto observado.
  let siteAnalysis: BrandDraft["site_analysis"] = null;
  let site: SiteCrawlResult | null = null;
  let brandName = seed.brand_name;

  if (seed.website_url) {
    try {
      site = await crawlBrandSite(seed.website_url, { budgetMs: 12_000 });
      siteAnalysis = {
        pages_read: site.pages.length,
        topics: site.topics.slice(0, 6),
        json_ld_types: site.json_ld_types,
        blocked_by_robots: site.blocked_by_robots,
      };

      if (site.brand_name) brandName = site.brand_name;

      // Se for rede social sem descrição legível (login wall), busca contexto público via SERP pelo nome da conta
      const isSocial = /instagram\.com|tiktok\.com|facebook\.com|linkedin\.com|youtube\.com/i.test(
        seed.website_url,
      );
      if (isSocial && site.description.length <= 40 && brandName) {
        try {
          const socialSerp = await searchWithCache({
            query: `"${brandName}" ${new URL(seed.website_url).hostname.replace(/^www\./, "")}`,
            locale: "pt-BR",
            num: 5,
          });
          const snippets = socialSerp.competitor_gaps
            .map((g) => g.title)
            .filter(
              (t) =>
                t.length > 15 &&
                !/create an account|log in to instagram|sign up|entrar no instagram/i.test(t),
            )
            .slice(0, 2);
          if (snippets.length > 0) {
            icp = `Público interessado em ${brandName} (${snippets.join(" · ")}).`;
          } else {
            icp = `Seguidores e potenciais clientes de ${brandName} que acompanham o perfil e buscam soluções práticas da marca.`;
          }
        } catch {
          icp = `Seguidores e potenciais clientes de ${brandName} que acompanham o perfil e buscam soluções práticas da marca.`;
        }
      } else if (site.description.length > 40) {
        icp = template
          ? `${site.description} ${template.icp_description}`
          : site.description;
      }

      if (site.facts.length > 0) {
        facts.length = 0;
        for (const fact of site.facts.slice(0, 5)) {
          facts.push({ claim: fact.claim, source_url: fact.source_url });
        }
        needsReview.push(
          `${facts.length} fato(s) extraído(s) do site — confirme cada afirmação antes de publicar.`,
        );
      }

      if (site.pages.length >= 2) confidence = "alta";
      if (site.blocked_by_robots) {
        needsReview.push("O robots.txt do site impede leitura automática; revise o contexto manualmente.");
      }
      for (const warning of site.warnings.slice(0, 2)) needsReview.push(warning);
    } catch (error) {
      needsReview.push(
        `Não foi possível ler o site (${error instanceof Error ? error.message : "falha"}). Contexto inferido do texto.`,
      );
    }
  }

  if (!seed.website_url) {
    needsReview.push("Quando quiser, adicione o site ou link do seu negócio em Configurações.");
  }
  if (facts.length === 0) {
    needsReview.push("Adicione diferenciais reais do seu negócio em Configurações para enriquecer seus posts.");
  }
  if (confidence !== "alta") {
    needsReview.push("Estilo de voz configurado automaticamente. Você pode personalizar cores e fatos quando quiser.");
  }

  return {
    brand_name: brandName,
    website_url: seed.website_url,
    icp_description: icp,
    tone_of_voice: template?.tone ?? {
      archetype: "especialista acessível",
      descriptors: ["direto", "concreto"],
      avoid: ["promessa absoluta", "superlativo sem prova"],
      reading_level: "ensino médio",
      exemplars: [],
    },
    visual_tokens: template?.visual_tokens ?? {
      primary: "#1f1f23",
      secondary: "#f2f2f4",
      accent: "#3f3f46",
      background: "#fdfdfd",
      foreground: "#17171a",
      theme: "light",
      radius: 12,
    },
    entity_facts: facts,
    niche: template?.id ?? seed.niche,
    confidence,
    needs_review: needsReview,
    site_analysis: siteAnalysis,
  };
}

/** Sugestão de primeiro ativo para o onboarding (zero blank canvas). */
export function firstAssetSuggestion(niche: string): {
  assetType: "short_script_kit" | "typo_carousel" | "geo_article";
  objective: string;
  productInput: string;
  rationale: string;
} {
  switch (niche) {
    case "saude":
      return {
        assetType: "short_script_kit",
        objective: "Explicar o valor da avaliação preventiva em 45 segundos",
        productInput: "avaliação preventiva em três etapas",
        rationale: "Roteiro de vídeo curto mostra seu estilo de voz e já sai pronto para gravar no celular.",
      };
    case "beleza":
      return {
        assetType: "typo_carousel",
        objective: "Mostrar 5 cuidados essenciais que mantêm o resultado do procedimento por mais tempo",
        productInput: "atendimento com avaliação personalizada",
        rationale: "Carrossel educativo gera salvamentos no Instagram e já sai com todas as imagens prontas.",
      };
    case "ecommerce":
      return {
        assetType: "typo_carousel",
        objective: "Mostrar o que realmente diferencia o produto no uso diário",
        productInput: "produto principal da marca",
        rationale: "Carrossel de imagens sai diagramado em segundos e custa 1 crédito.",
      };
    case "gastronomia":
      return {
        assetType: "typo_carousel",
        objective: "Mostrar os bastidores do preparo fresco e os itens mais pedidos da casa",
        productInput: "cardápio artesanal feito no dia",
        rationale: "Carrossel com passo a passo abre o apetite e já entrega a legenda pronta para postar.",
      };
    case "servicos":
      return {
        assetType: "typo_carousel",
        objective: "Responder as 5 dúvidas mais comuns antes de contratar o serviço",
        productInput: "diagnóstico e orçamento planejado",
        rationale: "Tirar dúvidas em carrossel passa autoridade imediata e atrai clientes mais qualificados.",
      };
    case "b2b":
      return {
        assetType: "geo_article",
        objective: "Responder a pergunta que o comprador faz antes da reunião comercial",
        productInput: "principal dor operacional do cliente",
        rationale: "Artigo completo posiciona sua empresa no Google e em respostas de inteligência artificial.",
      };
    default:
      return {
        assetType: "typo_carousel",
        objective: "Explicar os 5 maiores benefícios do nosso trabalho para o cliente",
        productInput: "principal serviço ou produto da marca",
        rationale: "Carrossel de imagens já sai diagramado nas cores da marca com legenda pronta.",
      };
  }
}

/**
 * Gera até 6 ideias práticas e personalizadas de campanha a partir do estudo da
 * marca (ICP, diferenciais/fatos cadastrados e trechos extraídos do site),
 * cruzando formatos de topo, meio e fundo de funil (custo US$ 0 de LLM).
 */
export function buildWeeklyIdeas(brand: {
  brand_name: string;
  icp_description?: string | null;
  entity_facts?: { claim: string }[];
  knowledge_highlights?: string[];
}): {
  id: string;
  badge: string;
  title: string;
  assetType: "typo_carousel" | "short_script_kit" | "single_creative" | "hybrid_carousel" | "geo_article" | "lp_copy";
  objective: string;
  productInput: string;
}[] {
  const cleanSnippet = (value: string | null | undefined, maxLen = 110): string | null => {
    if (!value) return null;
    const compact = value.replace(/\s+/g, " ").trim();
    if (compact.length < 8) return null;
    return compact.length > maxLen ? `${compact.slice(0, maxLen - 1).trimEnd()}…` : compact;
  };

  const facts = (brand.entity_facts ?? [])
    .map((f) => cleanSnippet(f.claim, 120))
    .filter((f): f is string => Boolean(f));
  const highlights = (brand.knowledge_highlights ?? [])
    .map((h) => cleanSnippet(h, 120))
    .filter((h): h is string => Boolean(h));

  const icp = cleanSnippet(brand.icp_description, 95);
  const icpLabel = icp ?? `clientes ideais da ${brand.brand_name}`;
  const fact1 = facts[0] ?? highlights[0] ?? `principal diferencial da ${brand.brand_name}`;
  const fact2 = facts[1] ?? highlights[1] ?? fact1;
  const fact3 = facts[2] ?? highlights[2] ?? `diagnóstico ou atendimento consultivo da ${brand.brand_name}`;

  return [
    {
      id: "erro-icp-carrossel",
      badge: "Topo de funil · Carrossel (1 cr)",
      title: `O erro silencioso que trava ${icp ? "seu público" : brand.brand_name}`,
      assetType: "typo_carousel",
      objective: `Expor o erro mais caro que ${icpLabel} cometem antes de conhecer ${brand.brand_name} e mostrar o passo a passo prático para corrigir`,
      productInput: fact1,
    },
    {
      id: "duvida-whatsapp-reels",
      badge: "Alcance orgânico · Reels 45s (1 cr)",
      title: `Objeção nº 1 de quem pesquisa ${brand.brand_name}`,
      assetType: "short_script_kit",
      objective: `Responder em 45 segundos, com fala natural e exemplos reais, a principal dúvida que ${icpLabel} têm antes de fechar`,
      productInput: fact2,
    },
    {
      id: "oferta-direta-feed",
      badge: "Fundo de funil · Post único (2 cr)",
      title: `Convite direto destacando ${fact1.slice(0, 42)}${fact1.length > 42 ? "…" : ""}`,
      assetType: "single_creative",
      objective: `Apresentar com clareza o ganho concreto de contratar ${brand.brand_name} para ${icpLabel}, quebrando ceticismo e chamando para ação direta`,
      productInput: fact1,
    },
    {
      id: "bastidores-metodo-hibrido",
      badge: "Autoridade visual · Carrossel ilustrado (3 cr)",
      title: `Como funciona na prática o método da ${brand.brand_name}`,
      assetType: "hybrid_carousel",
      objective: `Mostrar em 7 a 10 slides o mecanismo prático e os critérios de qualidade que diferenciam ${brand.brand_name} das opções genéricas`,
      productInput: fact3,
    },
    {
      id: "guia-google-geo",
      badge: "Google & IAs · Artigo GEO (5 cr)",
      title: `Guia definitivo de decisão para ${icp ? "seu cliente ideal" : brand.brand_name}`,
      assetType: "geo_article",
      objective: `Responder de forma estruturada e citável (E-E-A-T/GEO) como ${icpLabel} devem avaliar e escolher a melhor solução do segmento`,
      productInput: fact2,
    },
    {
      id: "pagina-conversao-lp",
      badge: "Conversão · Página de vendas (3 cr)",
      title: `Copy completa de oferta para ${brand.brand_name}`,
      assetType: "lp_copy",
      objective: `Estruturar página de vendas focada em ${icpLabel}, conectando dor real, mecanismo exclusivo, provas verificáveis e FAQ de objeções`,
      productInput: fact1,
    },
  ];
}
