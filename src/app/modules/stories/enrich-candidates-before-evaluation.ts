import "server-only";

import { createLogger } from "../observability/logger";
import type { EditorialEvaluationCandidate } from "./editorial-evaluation.types";
import { candidatesToEnrich, runEnrichment } from "./enrich-candidates-before-evaluation.core";
import { prepareStoryContent } from "./prepare-selected-story-content";
import { storyContentEnrichmentAttempts } from "./story-content.repository";

const log = createLogger("editorial-enrichment");

/**
 * The full article before the judgment: a candidate with only its feed
 * excerpt is fetched from its publisher (a Google News link resolved first),
 * so the evaluator reads the story and not its title. What gains content is
 * evaluated anew, its input hash having changed.
 */
export async function enrichCandidatesBeforeEvaluation(
  topicId: string,
  candidates: readonly EditorialEvaluationCandidate[],
  { now = new Date(), budgetMs }: { now?: Date; budgetMs: number },
): Promise<{ attempted: number; prepared: number; failed: number }> {
  if (budgetMs <= 0 || !candidates.length) return { attempted: 0, prepared: 0, failed: 0 };
  const attempts = await storyContentEnrichmentAttempts(candidates.map((candidate) => candidate.storyId));
  const picked = candidatesToEnrich(candidates, attempts, { now });
  if (!picked.length) return { attempted: 0, prepared: 0, failed: 0 };
  const begin = Date.now();
  const counts = await runEnrichment(picked, (storyId) => prepareStoryContent(topicId, storyId), { budgetMs });
  log.info("Articles fetched before the evaluation", { topicId, excerpts: picked.length, ...counts, durationMs: Date.now() - begin });
  return counts;
}
