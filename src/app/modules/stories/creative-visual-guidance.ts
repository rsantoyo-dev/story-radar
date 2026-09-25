import {
  DEFAULT_CREATIVE_BRAND_PALETTE,
  DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  isCreativeBrandUiRole,
  type CreativeBrandPaletteColor,
  type CreativeProfile,
} from "./creative-content.types";

/**
 * Cap for the visual guide when it feeds an *editorial text* prompt (brief and
 * draft generation). The full guide can be up to
 * CREATIVE_VISUAL_GUIDANCE_MAX_LENGTH (12k) chars, which is art direction the
 * text steps do not need and which crowds out their output-token budget — long
 * guides were pushing draft JSON past Gemini's limit and cascading through the
 * provider fallbacks. Image prompts still get the full guide (that is where
 * per-slide art direction is actually consumed).
 */
export const CREATIVE_VISUAL_GUIDANCE_TEXT_PROMPT_MAX_CHARS = 1_400;

/**
 * Older brief snapshots predate visual guidance. Keep those drafts usable
 * without silently treating an absent guide as a model instruction.
 *
 * Pass `maxChars` to trim the free-text guide (not the appended palette line)
 * at a word boundary for prompts that only need the gist.
 */
export function resolveCreativeVisualGuidance(
  profile: Pick<CreativeProfile, "name"> & {
    visualGuidance?: unknown;
    brandPalette?: unknown;
  },
  options: { maxChars?: number } = {},
): string {
  const raw =
    typeof profile.visualGuidance === "string" && profile.visualGuidance.trim()
    ? profile.visualGuidance.trim()
    : DEFAULT_CREATIVE_VISUAL_GUIDANCE;
  const guidance =
    options.maxChars !== undefined && raw.length > options.maxChars
      ? `${raw.slice(0, options.maxChars).replace(/\s+\S*$/u, "").trimEnd()} […]`
      : raw;
  const palette = normalizePalette(profile.brandPalette);
  return `${guidance}\n\nApproved brand palette: ${palette
    .map((entry) => `${entry.role ? `${entry.role}: ` : ""}${entry.name} ${entry.color}${describeUsage(entry)}`)
    .join("; ")}. Use these colours as the visual system unless the brief explicitly requires a factual chart colour.${describeUsageSplit(palette)}`;
}

/** " (10%, titles and accents)" — only for colours the editor annotated. */
function describeUsage(entry: CreativeBrandPaletteColor): string {
  const parts = [
    ...(entry.share !== undefined ? [`${entry.share}%`] : []),
    ...(entry.usage ? [entry.usage] : []),
  ];
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** One sentence with the intended proportions, dominant first; empty without shares. */
function describeUsageSplit(palette: CreativeBrandPaletteColor[]): string {
  const shared = palette
    .filter((entry): entry is CreativeBrandPaletteColor & { share: number } => entry.share !== undefined)
    .sort((a, b) => b.share - a.share);
  if (shared.length === 0) return "";
  const total = shared.reduce((sum, entry) => sum + entry.share, 0);
  const rest = 100 - total;
  return ` Intended usage split: ${shared
    .map((entry) => `${entry.share}% ${entry.name}`)
    .join(", ")}${rest > 0 ? `; the remaining ${rest}% is free for the other approved colours` : ""}.`;
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
    const role = (entry as { role?: unknown }).role;
    const usage = (entry as { usage?: unknown }).usage;
    const share = (entry as { share?: unknown }).share;
    return [{
      name: (entry as { name: string }).name.trim(),
      color: (entry as { color: string }).color.toUpperCase(),
      ...(isCreativeBrandUiRole(role) ? { role } : {}),
      ...(typeof usage === "string" && usage.trim() ? { usage: usage.trim() } : {}),
      ...(typeof share === "number" && Number.isInteger(share) && share >= 1 && share <= 100
        ? { share }
        : {}),
    }];
  });
  return palette.length >= 3 ? palette : DEFAULT_CREATIVE_BRAND_PALETTE.map((entry) => ({ ...entry }));
}
