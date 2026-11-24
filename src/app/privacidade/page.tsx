import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade (LGPD)",
  description:
    "Como a Kitefy trata e protege dados pessoais e de marca em conformidade com a LGPD, sem OAuth social e sem retenção para treino de modelos.",
  alternates: {
    canonical: "https://www.kitefy.com.br/privacidade",
  },
};

const SECTIONS = [
  {
    title: "1. Quais dados tratamos",
    paragraphs: [
      "Dados de conta: e-mail e nome informados no cadastro, além do identificador do provedor de identidade (Google), quando você escolhe SSO.",
      "Dados da marca: nome, site, descrição do público, tom de voz, cores, fontes e fatos verificáveis que você cadastra ou que são inferidos do texto/URL informados no onboarding.",
      "Conteúdo gerado: ativos, legendas, JSON-LD, imagens renderizadas e o histórico de execução do agente necessário para retomar uma aprovação.",
      "Telemetria: impressões, visualizações de 3 segundos, retenção, salvamentos/cliques e contagem de citações em IA, informados manualmente, por CSV ou por webhook do seu GA4.",
      "Cobrança: identificadores de assinatura e pagamento do Mercado Pago. Não armazenamos número de cartão.",
    ],
  },
  {
    title: "2. O que NÃO tratamos",
    paragraphs: [
      "Não coletamos dados biométricos faciais ou vocais. O produto não oferece avatar digital, lip-sync, síntese de voz ou clonagem de voz.",
      "Não solicitamos nem armazenamos tokens de redes sociais. Não há OAuth de Meta, Instagram, TikTok, LinkedIn, X ou YouTube.",
      "Não usamos seus dados para treinar modelos de linguagem.",
    ],
  },
  {
    title: "3. Bases legais",
    paragraphs: [
      "Execução de contrato (art. 7º, V) para operar o produto e entregar os ativos contratados.",
      "Cumprimento de obrigação legal (art. 7º, II) para registros fiscais e de cobrança.",
      "Legítimo interesse (art. 7º, IX) para segurança, prevenção a fraude e melhoria do serviço, sempre com minimização.",
      "Consentimento (art. 7º, I) quando aplicável, por exemplo para comunicações de marketing — revogável a qualquer momento.",
    ],
  },
  {
    title: "4. Compartilhamento e subprocessadores",
    paragraphs: [
      "Supabase (banco de dados, autenticação e armazenamento de arquivos), Vercel (hospedagem), provedores de modelos de linguagem (Anthropic, Google e/ou OpenAI, conforme configuração do ambiente) e Mercado Pago (pagamentos).",
      "Provedores de LLM são usados exclusivamente para gerar o conteúdo solicitado. Rotas de produção não são configuradas para retenção de dados para treinamento.",
      "Buscas de SERP usam Serper.dev ou grounding do Google, conforme configuração, apenas com o texto da consulta.",
    ],
  },
  {
    title: "5. Retenção e eliminação",
    paragraphs: [
      "Você pode excluir uma marca ou a conta inteira em Configurações → Privacidade. A exclusão remove ativos, vetores de conhecimento, arquivos no armazenamento e o histórico do agente (checkpoints do LangGraph).",
      "Registros fiscais obrigatórios são mantidos de forma anonimizada: permanecem apenas valores e tipos de evento, sem vínculo com pessoa ou organização.",
      "O histórico do agente é apagado por thread com a operação de exclusão dedicada, inclusive para threads já concluídos.",
    ],
  },
  {
    title: "6. Seus direitos (LGPD art. 18)",
    paragraphs: [
      "Acesso e portabilidade: exportação completa em JSON em Configurações → Privacidade.",
      "Correção: edição de marca, tom de voz e fatos diretamente na interface.",
      "Eliminação: exclusão definitiva de marca ou conta, com confirmação explícita.",
      "Informação sobre compartilhamento: listada no item 4 acima.",
    ],
  },
  {
    title: "7. Segurança",
    paragraphs: [
      "Isolamento por organização aplicado no banco via Row Level Security em todas as tabelas de negócio.",
      "Chaves e segredos ficam apenas no servidor, nunca no bundle do cliente nem no histórico do Git.",
      "Webhooks de pagamento são validados por HMAC-SHA256 em tempo constante antes de qualquer escrita.",
      "URLs de arquivos são assinadas e expiram; o bucket é privado.",
    ],
  },
  {
    title: "8. Contato",
    paragraphs: [
      "Para exercer direitos ou tirar dúvidas sobre tratamento de dados, escreva para privacidade@brandpulse.app. Respondemos em até 15 dias.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div data-surface="kitefy-light" className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
        ← Voltar
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última atualização: novembro de 2026. Documento em linguagem direta, alinhado à Lei 13.709/2018
        (LGPD).
      </p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title} aria-labelledby={section.title}>
            <h2 id={section.title} className="text-lg font-semibold tracking-tight">
              {section.title}
            </h2>
            <div className="mt-2 space-y-2">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
