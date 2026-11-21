/**
 * API pública do motor visual programático.
 *
 * Uso típico (server-side):
 *
 * ```ts
 * const assets = await renderCarousel({
 *   slides: payload.slides,
 *   tokens: brand.visual_tokens,
 *   brandName: brand.brand_name,
 *   format: "4:5",
 *   output: "jpeg",
 * });
 * const paths = await uploadRenderedAssets({ tenantId, brandId, assetId, assets });
 * const urls = await createSignedUrls(paths);
 * if (assets.warnings.length > 0) logger.warn("render parcial", { warnings: assets.warnings });
 * ```
 *
 * Tudo é determinístico e server-only (satori/resvg/sharp + leitura das fontes
 * Geist do disco). Não importe este barrel em componentes cliente.
 */

export * from "./tokens";
export * from "./fonts";
export * from "./templates";
export * from "./render";
export * from "./storage";
