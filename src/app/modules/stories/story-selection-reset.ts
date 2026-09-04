import type { StoryContentStatus } from "./story-candidate.types";

/**
 * Restores the safest collection state after a human removes an approval.
 * Full article content is immediately usable; an excerpt or missing article
 * remains explicitly queued for enrichment rather than being mislabelled ready.
 */
export function processingStatusAfterUnselect(
  contentStatus: StoryContentStatus,
): "ready" | "needs-enrichment" {
  return contentStatus === "full" || contentStatus === "likely-full"
    ? "ready"
    : "needs-enrichment";
}
