/**
 * Gera prévias reais do motor visual (sem rede, sem Supabase).
 *
 * Uso: npx tsx scripts/preview-render.ts
 * Saída: artifacts/preview/*.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { generateMockContent } from "../src/lib/ai/mock-generator";
import { renderCarousel, renderSingleCreative } from "../src/lib/visual/render";
import type { CarouselOutput, SingleCreativeOutput } from "../src/lib/ai/content-schemas";
import type { BrandContext } from "../src/types/domain";

const brand: BrandContext = {
  brand_id: "11111111-1111-1111-1111-111111111111",
  brand_name: "Clínica Vitalis",
  website_url: "https://vitalis.example.com",
  icp_description: "Adultos de 30 a 50 anos em acompanhamento preventivo",
  tone_of_voice: {
    archetype: "especialista acessível",
    descriptors: ["direto", "cuidadoso"],
    avoid: ["promessa milagrosa"],
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
  entity_facts: [
    { claim: "Atende em São Paulo desde 2014", source_url: "https://vitalis.example.com/sobre" },
  ],
  top_chunks: [],
};

async function main(): Promise<void> {
  const outDir = join(process.cwd(), "artifacts", "preview");
  mkdirSync(outDir, { recursive: true });

  const carousel = generateMockContent({
    assetType: "typo_carousel",
    brand,
    objective: "Aumentar a retenção de conteúdo orgânico",
    productInput: "acompanhamento preventivo",
    selectedArm: { angle_type: "vace_pattern_interrupt", framework: "hook_body_payoff" },
    explorationArms: [
      { angle_type: "contrarian_frame", framework: "pas" },
      { angle_type: "outcome_anchored", framework: "aida" },
    ],
    serpInsights: null,
  }) as CarouselOutput;

  const single = generateMockContent({
    assetType: "single_creative",
    brand,
    objective: "Explicar o valor da avaliação preventiva",
    productInput: "avaliação preventiva em três etapas",
    selectedArm: { angle_type: "outcome_anchored", framework: "aida" },
    explorationArms: [],
    serpInsights: null,
  }) as SingleCreativeOutput;

  const carouselResult = await renderCarousel({
    slides: carousel.slides.slice(0, 3),
    brandName: brand.brand_name,
    tokens: brand.visual_tokens,
    format: "4:5",
    output: "png",
  });

  for (const [index, asset] of [...carouselResult].entries()) {
    const file = join(outDir, `carrossel-${index + 1}.png`);
    writeFileSync(file, asset.buffer);
    console.log(`${file} (${asset.width}x${asset.height}, ${asset.buffer.length} bytes)`);
  }

  const singleResult = await renderSingleCreative({
    headline: single.headline,
    subheadline: single.subheadline,
    body: single.body,
    cta: single.cta,
    brandName: brand.brand_name,
    tokens: brand.visual_tokens,
    format: "4:5",
    output: "png",
    hasAiImagery: true,
  });

  for (const [index, asset] of [...singleResult].entries()) {
    const file = join(outDir, `criativo-unico-${index + 1}.png`);
    writeFileSync(file, asset.buffer);
    console.log(`${file} (${asset.width}x${asset.height}, ${asset.buffer.length} bytes)`);
  }

  const storyResult = await renderCarousel({
    slides: carousel.slides.slice(0, 1),
    brandName: brand.brand_name,
    tokens: brand.visual_tokens,
    format: "9:16",
    output: "jpeg",
    quality: 92,
  });

  for (const asset of storyResult) {
    const file = join(outDir, "story-9x16.jpg");
    writeFileSync(file, asset.buffer);
    console.log(`${file} (${asset.width}x${asset.height}, ${asset.buffer.length} bytes)`);
  }

  if (carouselResult.warnings.length > 0) {
    console.warn("Avisos do render:", carouselResult.warnings);
  }

}

main().catch((error: unknown) => {
  console.error("Falha ao renderizar prévias:", error);
  process.exitCode = 1;
});
