import type { NextConfig } from "next";

/**
 * BrandPulse Organic & GEO Studio
 *
 * Observações de plataforma:
 * - `serverExternalPackages` mantém binários nativos (resvg, sharp, pg) fora do bundle
 *   do servidor. Sem isso o Turbopack tenta empacotar `.node` e a rota de render quebra.
 * - `outputFileTracingIncludes` garante que as fontes usadas pelo satori viajam
 *   para a função serverless da rota de renderização visual.
 * - Fluid Compute / maxDuration são configurados por rota em `export const maxDuration`.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pasta pai com lockfile próprio (C:\Users\mtres\package-lock.json):
  // fixa a raiz do Turbopack neste projeto em vez de inferir para cima.
  turbopack: { root: process.cwd() },
  serverExternalPackages: [
    "@resvg/resvg-js",
    "sharp",
    "pg",
    "@langchain/langgraph-checkpoint-postgres",
    "satori",
  ],
  outputFileTracingIncludes: {
    "/api/render/**": ["./src/assets/fonts/**"],
    "/api/studio/**": ["./src/assets/fonts/**"],
  },
  experimental: {
    // Server Actions usados para onboarding, aprovação e LGPD.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
