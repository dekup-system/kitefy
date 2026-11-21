import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Kitefy — pacotes ágeis de marketing orgânico",
    template: "%s · Kitefy",
  },
  description:
    "Pacotes ágeis de marketing digital orgânico: roteiros, carrosséis e artigos GEO com padrão de marca, aprendizado por telemetria e exportação sem atrito.",
  applicationName: "Kitefy",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Kitefy — pacotes ágeis de marketing orgânico",
    description:
      "Conteúdo orgânico com padrão de marca, entregue em dias. Pacotes Start, Lift e Flow.",
    locale: "pt_BR",
    type: "website",
    siteName: "Kitefy",
  },
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
