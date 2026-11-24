import type { MetadataRoute } from "next";

const BASE = "https://www.kitefy.com.br";

const PRIVATE_PATHS = [
  "/app",
  "/app/",
  "/studio",
  "/studio/",
  "/campaigns",
  "/campaigns/",
  "/competitors",
  "/competitors/",
  "/telemetry",
  "/telemetry/",
  "/google",
  "/google/",
  "/onboarding",
  "/onboarding/",
  "/settings",
  "/settings/",
  "/admin",
  "/admin/",
  "/api/",
  "/auth/",
  "/login",
  "/reset",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: [
          "Googlebot",
          "Bingbot",
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "PerplexityBot",
          "ClaudeBot",
          "Google-Extended",
        ],
        allow: ["/", "/pricing", "/privacidade", "/termos"],
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
