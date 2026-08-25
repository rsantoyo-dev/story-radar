import {
  DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  type CreativeProfile,
} from "./creative-content.types";

/**
 * Older brief snapshots predate visual guidance. Keep those drafts usable
 * without silently treating an absent guide as a model instruction.
 */
export function resolveCreativeVisualGuidance(
  profile: Pick<CreativeProfile, "name"> & { visualGuidance?: unknown },
): string {
  return typeof profile.visualGuidance === "string" && profile.visualGuidance.trim()
    ? profile.visualGuidance.trim()
    : DEFAULT_CREATIVE_VISUAL_GUIDANCE;
}
