import {
  DEFAULT_CREATIVE_BRAND_PALETTE,
  DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  type CreativeBrandPaletteColor,
  type CreativeProfile,
} from "./creative-content.types";

/**
 * Older brief snapshots predate visual guidance. Keep those drafts usable
 * without silently treating an absent guide as a model instruction.
 */
export function resolveCreativeVisualGuidance(
  profile: Pick<CreativeProfile, "name"> & {
    visualGuidance?: unknown;
    brandPalette?: unknown;
  },
): string {
  const guidance =
    typeof profile.visualGuidance === "string" && profile.visualGuidance.trim()
    ? profile.visualGuidance.trim()
    : DEFAULT_CREATIVE_VISUAL_GUIDANCE;
  const palette = normalizePalette(profile.brandPalette);
  return `${guidance}\n\nApproved brand palette: ${palette
    .map((entry) => `${entry.name} ${entry.color}`)
    .join("; ")}. Use these colours as the visual system unless the brief explicitly requires a factual chart colour.`;
}

function normalizePalette(value: unknown): CreativeBrandPaletteColor[] {
  if (!Array.isArray(value)) return DEFAULT_CREATIVE_BRAND_PALETTE.map((entry) => ({ ...entry }));
  const palette = value.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as { name?: unknown }).name !== "string" ||
      typeof (entry as { color?: unknown }).color !== "string" ||
      !/^#[0-9a-f]{6}$/iu.test((entry as { color: string }).color)
    ) {
      return [];
    }
    return [{
      name: (entry as { name: string }).name.trim(),
      color: (entry as { color: string }).color.toUpperCase(),
    }];
  });
  return palette.length >= 3 ? palette : DEFAULT_CREATIVE_BRAND_PALETTE.map((entry) => ({ ...entry }));
}
