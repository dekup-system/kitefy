import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description:
    "Condições de uso dos pacotes de marketing digital orgânico e geração de conteúdo GEO da Kitefy.",
  alternates: {
    canonical: "https://www.kitefy.com.br/termos",
  },
};

const SECTIONS = [
  {
    title: "1. Objeto",
    body: "A Kitefy é um serviço de pacotes ágeis de marketing digital orgânico. A plataforma gera roteiros, carrosséis, criativos, artigos e copies a partir do contexto da marca informado pelo cliente, entregando os arquivos para exportação.",
  },
  {
    title: "2. O que o serviço não faz",
    body: "Não há publicação automática em redes sociais, não há conexão via OAuth com Meta, Instagram, TikTok, LinkedIn, X ou YouTube, não há armazenamento de tokens sociais, e não há geração de avatar, vídeo falado, síntese ou clonagem de voz. A publicação e a veiculação são responsabilidade do cliente.",
  },
  {
    title: "3. Conta, créditos mensais e pacotes extras",
    body: "Os créditos mensais do plano contratado (Start: 120, Lift: 360, Flow: 800) e os pacotes avulsos de recarga (+50 créditos por R$ 30,00 ou +100 créditos por R$ 50,00) são liberados exclusivamente após a confirmação de pagamento aprovado pelo Mercado Pago. Cada ativo consome créditos conforme a tabela vigente no momento da geração, com estorno 100% automático dos créditos na plataforma apenas em caso de falha técnica comprovada sem entrega do conteúdo. Créditos não são convertidos em dinheiro.",
  },
  {
    title: "4. Assinatura, pagamento e política de cancelamento",
    body: "A cobrança é pré-paga em reais (BRL) via Mercado Pago. A renovação mensal é automática até que o cliente solicite o cancelamento, que pode ser feito a qualquer momento sem multa de fidelidade, interrompendo exclusivamente as cobranças futuras. Não há estorno financeiro de mensalidades já pagas nem reembolso proporcional caso o usuário não utilize integralmente seus créditos dentro do ciclo vigente. Os créditos do ciclo já quitado permanecem disponíveis para uso na plataforma até o encerramento do período.",
  },
  {
    title: "5. Responsabilidade editorial",
    body: "Todo conteúdo gerado exige revisão humana antes da publicação. O cliente é responsável por verificar fatos, adequação regulatória (incluindo CONAR e regras setoriais) e direitos de uso de marcas citadas. O relatório de conformidade do produto é um apoio, não um parecer jurídico.",
  },
  {
    title: "6. Uso aceitável",
    body: "É vedado usar a plataforma para produzir conteúdo com promessa de resultado garantido em saúde ou finanças, discriminação, desinformação ou violação de direitos de terceiros. Contas que insistirem nesse uso podem ser suspensas.",
  },
  {
    title: "7. Propriedade intelectual",
    body: "O cliente é titular do conteúdo gerado a partir do seu contexto de marca. A plataforma mantém a titularidade do software, dos modelos de prompt e da arquitetura. Componentes open-source utilizados são licenciados sob MIT, Apache-2.0, ISC e MPL-2.0.",
  },
  {
    title: "8. Disponibilidade e limitação",
    body: "Buscamos disponibilidade contínua, mas o serviço depende de provedores de infraestrutura e de modelos de linguagem de terceiros. Não há garantia de resultado comercial, de posicionamento em buscadores ou de citação por assistentes de IA.",
  },
  {
    title: "9. Privacidade e LGPD",
    body: "O tratamento de dados pessoais segue a Política de Privacidade e a LGPD. Você pode exportar todos os seus dados em JSON e solicitar exclusão definitiva em Configurações → Privacidade.",
  },
  {
    title: "10. Foro",
    body: "Aplica-se a legislação brasileira. Fica eleito o foro da comarca de domicílio do cliente consumidor, quando aplicável a proteção do Código de Defesa do Consumidor.",
  },
];

export default function TermsPage() {
  return (
    <div data-surface="kitefy-light" className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
        ← Voltar
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Termos de Uso</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última atualização: novembro de 2026.
      </p>

      <div className="mt-8 space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.title} aria-labelledby={section.title}>
            <h2 id={section.title} className="text-lg font-semibold tracking-tight">
              {section.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
