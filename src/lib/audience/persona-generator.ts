import { generateText } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/models";
import { parseJsonObject } from "@/lib/ai/generate";
import { getServerEnv, isMockMode } from "@/lib/env";
import { ABEP_PROFILES } from "@/lib/ai/marketing-knowledge";
import { fetchIbgeDemographics, type IbgeDemographicSnapshot } from "@/lib/audience/ibge-demographics";
import type { AbepClass, BrandAudienceStudy, AudiencePersona } from "@/types/domain";

/**
 * Gerador de Estudo de Público-Alvo, Personas Baseadas em Evidência (JTBD + VoC)
 * e Análise de Consumo com Dados Demográficos Reais do IBGE + Critério Brasil (ABEP).
 */

const personaSchema = z.object({
  name: z.string().min(2).max(80),
  archetype: z.string().min(3).max(120),
  ageRange: z.string().min(3).max(40),
  abepClass: z.enum(["A", "B1", "B2", "C1", "C2", "DE", "misto"]),
  jtbdFunctional: z.string().min(8).max(260),
  jtbdEmotional: z.string().min(8).max(260),
  jtbdSocial: z.string().min(8).max(260),
  triedAndFailed: z.string().min(8).max(260),
  hiddenObjections: z.array(z.string().min(4).max(160)).min(2).max(4),
  buyingTrigger: z.string().min(8).max(220),
  vocPhrases: z.array(z.string().min(6).max(180)).min(2).max(4),
});

const audienceStudyOutputSchema = z.object({
  consumptionAnalysis: z.object({
    decisionCycle: z.string().min(8).max(220),
    priceSensitivity: z.string().min(8).max(220),
    mainChannels: z.array(z.string().min(2).max(60)).min(2).max(5),
    buyingTriggers: z.array(z.string().min(6).max(180)).min(2).max(4),
    marketFriction: z.string().min(8).max(260),
  }),
  personas: z.array(personaSchema).min(2).max(3),
});

export interface GenerateAudienceStudyInput {
  brandName: string;
  websiteUrl?: string | null;
  icpDescription?: string | null;
  region?: string | null;
  abepClass?: AbepClass;
  entityFacts?: { claim: string }[];
  knowledgeHighlights?: string[];
}

function buildDeterministicStudy(
  input: GenerateAudienceStudyInput,
  ibge: IbgeDemographicSnapshot,
): BrandAudienceStudy {
  const icp = input.icpDescription?.trim() || `clientes interessados em ${input.brandName}`;
  const mainFact = input.entityFacts?.[0]?.claim ?? `solução principal de ${input.brandName}`;
  const abep: AbepClass = input.abepClass && input.abepClass !== "misto"
    ? input.abepClass
    : (ibge.dominantAbepClasses[0] ?? "B2");
  const abepInfo = ABEP_PROFILES[abep];

  const personas: AudiencePersona[] = [
    {
      name: "Decisor Pragmático",
      archetype: `Comprador objetivo de ${ibge.regionLabel} buscando resultado previsível`,
      ageRange: "30 a 48 anos",
      abepClass: abep,
      jtbdFunctional: `Resolver com segurança a demanda ligada a ${mainFact.slice(0, 110)} sem desperdiçar tempo nem orçamento.`,
      jtbdEmotional: "Sentir tranquilidade e controle ao contratar alguém confiável e transparente.",
      jtbdSocial: "Ser reconhecido por tomar decisões inteligentes e bem fundamentadas.",
      triedAndFailed: "Já pesquisou opções genéricas ou baratas demais que entregaram pouca clareza e retrabalho.",
      hiddenObjections: [
        "Será que realmente funciona para o meu caso específico?",
        "Tenho receio de pagar e não ver diferença prática no dia a dia.",
      ],
      buyingTrigger: "Quando percebe um método claro, provas concretas e facilidade para dar o primeiro passo.",
      vocPhrases: [
        "Não quero promessa bonita, quero saber como funciona na prática.",
        "Já perdi tempo tentando resolver sozinho e não saiu do lugar.",
      ],
    },
    {
      name: "Explorador Cauteloso",
      archetype: `Público em fase de comparação (${icp.slice(0, 70)})`,
      ageRange: "24 a 38 anos",
      abepClass: ibge.dominantAbepClasses[1] ?? abep,
      jtbdFunctional: `Entender critérios objetivos antes de escolher entre ${input.brandName} e alternativas do mercado.`,
      jtbdEmotional: "Evitar o arrependimento de fazer uma escolha errada por falta de informação.",
      jtbdSocial: "Compartilhar referências úteis e bem embasadas com colegas ou familiares.",
      triedAndFailed: "Consumiu conteúdos superficiais nas redes que repetiam clichês sem responder às dúvidas reais.",
      hiddenObjections: [
        "Não sei se é o momento certo ou se consigo adaptar à minha rotina.",
        "Os concorrentes parecem falar todos a mesma coisa.",
      ],
      buyingTrigger: "Um conteúdo educativo que nomeia exatamente o problema que estava sentindo e mostra o caminho.",
      vocPhrases: [
        "Qual é a diferença real entre fazer do jeito comum e contratar um especialista?",
        "Preciso de algo que caiba na minha rotina sem complicação.",
      ],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    region: ibge.regionLabel,
    ibge,
    consumptionAnalysis: {
      decisionCycle: "Decisão consultiva de curto a médio prazo (pesquisa no Instagram/Google antes de chamar no WhatsApp).",
      priceSensitivity: `${abepInfo.label} (renda per capita estadual IBGE R$ ${ibge.perCapitaIncomeBrl.toLocaleString("pt-BR")}/mês): ${abepInfo.valueFraming}`,
      mainChannels: ["Instagram (Carrosséis e Reels)", "Google Search / AI Overviews", "WhatsApp"],
      buyingTriggers: [
        "Clareza imediata de como o serviço/produto funciona na prática",
        "Identificação com um erro comum que está custando tempo ou dinheiro",
        "Prova verificável sem promessas exageradas",
      ],
      marketFriction: "Excesso de anúncios genéricos com cara de IA e promessas milagrosas gera desconfiança imediata.",
    },
    personas,
  };
}

export async function generateBrandAudienceStudy(
  input: GenerateAudienceStudyInput,
): Promise<BrandAudienceStudy> {
  const ibge = await fetchIbgeDemographics(input.region);

  if (isMockMode()) {
    return buildDeterministicStudy(input, ibge);
  }

  try {
    const env = getServerEnv();
    const model = getLanguageModel(env.MODEL_ROUTER);
    const abepNote = ABEP_PROFILES[input.abepClass ?? "misto"];

    const prompt = [
      "Você é um estrategista sênior de pesquisa de mercado, comportamento do consumidor e demografia brasileira.",
      "Gere um estudo estruturado de consumo e 2 a 3 personas baseadas em evidência (Jobs-to-be-Done + Voz do Cliente + IBGE + Critério Brasil ABEP).",
      "PROIBIDO criar personas rasas/clichês ('João, 35 anos, gosta de tecnologia'). Foque em dores reais, fricções, objeções ocultas e frases literais que o brasileiro realmente fala.",
      "",
      `Marca: ${input.brandName}`,
      `Site: ${input.websiteUrl ?? "não informado"}`,
      `ICP informado: ${input.icpDescription ?? "não informado"}`,
      `Região / Dados reais IBGE: ${ibge.regionLabel} — População da UF: ${ibge.population.toLocaleString("pt-BR")}, Renda domiciliar per capita IBGE: R$ ${ibge.perCapitaIncomeBrl.toLocaleString("pt-BR")}/mês, Classes ABEP predominantes: ${ibge.dominantAbepClasses.join(", ")}.`,
      `Perfil ABEP selecionado: ${abepNote.label} (${abepNote.valueFraming})`,
      `Diferenciais/Fatos da marca: ${(input.entityFacts ?? []).map((f) => f.claim).join(" | ") || "não informados"}`,
      `Trechos do site: ${(input.knowledgeHighlights ?? []).slice(0, 3).join(" | ") || "não disponíveis"}`,
      "",
      "Responda APENAS com um único objeto JSON válido seguindo exatamente esta estrutura:",
      JSON.stringify(
        {
          consumptionAnalysis: {
            decisionCycle: "string",
            priceSensitivity: "string",
            mainChannels: ["string", "string"],
            buyingTriggers: ["string", "string"],
            marketFriction: "string",
          },
          personas: [
            {
              name: "Nome descritivo do arquétipo",
              archetype: "Resumo realista do perfil",
              ageRange: "Ex.: 30 a 48 anos",
              abepClass: "B1",
              jtbdFunctional: "Tarefa prática que quer resolver",
              jtbdEmotional: "Como quer se sentir / alívio buscado",
              jtbdSocial: "Como quer ser percebido pelos pares",
              triedAndFailed: "O que já tentou antes e frustrou",
              hiddenObjections: ["Objeção 1", "Objeção 2"],
              buyingTrigger: "Evento que dispara a compra",
              vocPhrases: ["Frase literal 1 que o cliente fala", "Frase literal 2"],
            },
          ],
        },
        null,
        2,
      ),
    ].join("\n");

    const result = await generateText({
      model,
      prompt,
      temperature: 0.4,
      maxOutputTokens: 2000,
      maxRetries: 0,
    });

    const parsed = audienceStudyOutputSchema.safeParse(parseJsonObject(result.text));
    if (!parsed.success) {
      return buildDeterministicStudy(input, ibge);
    }

    return {
      generatedAt: new Date().toISOString(),
      region: ibge.regionLabel,
      ibge,
      consumptionAnalysis: parsed.data.consumptionAnalysis,
      personas: parsed.data.personas,
    };
  } catch {
    return buildDeterministicStudy(input, ibge);
  }
}
