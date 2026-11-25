import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost")
      ? process.env.NEXT_PUBLIC_APP_URL
      : "https://www.kitefy.com.br",
  ),
  title: {
    default: "Kitefy — Estúdio de Marketing Orgânico, Carrosséis, Roteiros e Artigos GEO com IA",
    template: "%s · Kitefy",
  },
  description:
    "Pacotes ágeis de marketing digital orgânico para marcas B2B e B2C: roteiros com ganchos A/B, carrosséis prontos, artigos GEO citáveis por buscadores e IAs, padrão de marca e exportação sem OAuth social.",
  keywords: [
    "Kitefy",
    "marketing orgânico",
    "marketing de conteúdo com IA",
    "artigos GEO",
    "Generative Engine Optimization",
    "gerador de carrossel com padrão de marca",
    "roteiros para vídeos curtos A/B",
    "estúdio de conteúdo orgânico Brasil",
    "SEO e GEO para marcas",
    "M3D Multidev",
  ],
  applicationName: "Kitefy",
  authors: [{ name: "M3D Multidev", url: "https://www.m3dmultidev.com.br" }],
  creator: "M3D Multidev",
  publisher: "Kitefy",
  alternates: {
    canonical: "https://www.kitefy.com.br/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Kitefy — Estúdio de Marketing Orgânico, Carrosséis, Roteiros e Artigos GEO",
    description:
      "Conteúdo orgânico com padrão de marca, aprendizado por telemetria e exportação sem atrito. Pacotes Start, Lift e Flow.",
    url: "https://www.kitefy.com.br",
    locale: "pt_BR",
    type: "website",
    siteName: "Kitefy",
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "Kitefy — Marketing Orgânico e GEO Studio",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Kitefy — Estúdio de Marketing Orgânico e Artigos GEO",
    description:
      "Roteiros com 3 ganchos A/B, carrosséis prontos e artigos GEO validados com padrão da sua marca.",
    images: ["/icon.png"],
  },
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const siteSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://www.kitefy.com.br/#website",
      url: "https://www.kitefy.com.br",
      name: "Kitefy",
      alternateName: ["Kitefy Studio", "Kitefy Marketing Orgânico & GEO"],
      inLanguage: "pt-BR",
      publisher: { "@id": "https://www.kitefy.com.br/#organization" },
    },
    {
      "@type": "Organization",
      "@id": "https://www.kitefy.com.br/#organization",
      name: "Kitefy",
      url: "https://www.kitefy.com.br",
      logo: "https://www.kitefy.com.br/icon.png",
      sameAs: ["https://www.m3dmultidev.com.br"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.kitefy.com.br/#software",
      name: "Kitefy",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://www.kitefy.com.br",
      image: "https://www.kitefy.com.br/icon.png",
      description:
        "Estúdio web de marketing digital orgânico e GEO (Generative Engine Optimization): extrai o perfil da marca via URL e entrega roteiros com 3 ganchos A/B, carrosséis prontos, landing pages e artigos GEO com Schema.org validado.",
      featureList: [
        "Diagnóstico de marca em 90 segundos a partir da URL do site",
        "Roteiros graváveis com 3 ganchos A/B selecionados por Thompson Sampling",
        "Carrosséis prontos de 7 a 10 slides com identidade visual da marca",
        "Artigos GEO de 1.500 a 2.500 palavras com JSON-LD Schema.org validado",
        "Pacote Google exportável em ZIP (sitemap.xml, robots.txt para IAs e index.html)",
        "Sem OAuth social e estorno automático de créditos em caso de erro técnico",
      ],
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "BRL",
        lowPrice: "49.90",
        highPrice: "299.90",
        offerCount: 3,
        availability: "https://schema.org/InStock",
        url: "https://www.kitefy.com.br/pricing",
      },
      publisher: { "@id": "https://www.kitefy.com.br/#organization" },
      creator: {
        "@type": "Organization",
        name: "M3D Multidev",
        url: "https://www.m3dmultidev.com.br",
      },
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#181331" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#conteudo"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-navy focus:px-4 focus:py-2 focus:text-white"
          >
            Pular para o conteúdo
          </a>
          <div id="conteudo">{children}</div>
          <Toaster
            position="bottom-right"
            closeButton
            richColors={false}
            toastOptions={{ className: "font-sans" }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
