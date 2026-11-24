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
    title: "3. Conta e créditos",
    body: "Cada ativo consome créditos conforme a tabela vigente. O débito ocorre somente após a aprovação do ativo, e falhas técnicas geram estorno automático. Créditos não são convertidos em dinheiro e expiram conforme o ciclo do plano contratado.",
  },
  {
    title: "4. Assinatura e pagamento",
    body: "A cobrança é feita em BRL pelo Mercado Pago, em assinatura mensal recorrente. A renovação é automática até o cancelamento, que pode ser solicitado a qualquer momento e passa a valer no fim do ciclo vigente.",
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
