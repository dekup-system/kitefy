import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BrandPulse — Organic & GEO Studio",
    template: "%s · BrandPulse",
  },
  description:
    "Estúdio de conteúdo orgânico para marcas: roteiros, carrosséis, artigos GEO com citações em IA e um loop de aprendizado por Thompson Sampling.",
  applicationName: "BrandPulse",
  robots: { index: false, follow: false },
  openGraph: {
    title: "BrandPulse — Organic & GEO Studio",
    description:
      "Conteúdo orgânico com padrão de marca, aprendizado contínuo e exportação sem atrito.",
    locale: "pt_BR",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfdfd" },
    { media: "(prefers-color-scheme: dark)", color: "#131315" },
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#conteudo"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
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
