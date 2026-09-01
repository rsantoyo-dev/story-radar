import type { CreativeUnit } from "./creative-content.types";
import { appendCreativeBrandContract } from "./creative-brand-overlay";
import { appendCreativeCarouselChromeContract } from "./creative-carousel-chrome";

/** Copy rendered by the image provider. Carousel navigation is added later. */
export function creativeImageModelVisibleText(
  unit: Pick<
    CreativeUnit,
    "headline" | "subheadline" | "body" | "ctaQuestion"
  >,
): string {
  return [
    unit.headline.trim(),
    unit.subheadline?.trim(),
    unit.body?.trim(),
    unit.ctaQuestion?.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Keeps both deterministic overlays unique and non-contradictory. The
 * logo-aware carousel contract is deliberately last because it reserves the
 * compact pagination badge while preserving the logo cutout.
 */
export function appendCreativeImageSpatialContracts({
  prompt,
  brandContract,
  carouselContract,
}: {
  prompt: string;
  brandContract?: string;
  carouselContract?: string;
}): string {
  return appendCreativeCarouselChromeContract(
    appendCreativeBrandContract(prompt, brandContract),
    carouselContract,
  );
}
