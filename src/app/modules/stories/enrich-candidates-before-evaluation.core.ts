import type { EditorialEvaluationCandidate } from "./editorial-evaluation.types";

/** A failed or blocked fetch is tried again after this long; the publisher may have changed, the paywall may not have. */
export const ENRICHMENT_RETRY_DAYS = 7;
/** Articles fetched at once: a few publishers in parallel, none hammered. */
export const ENRICHMENT_CONCURRENCY = 4;
/** Stories fetched per evaluation run: the backlog of excerpts drains over the day's runs, the strongest local signal first. */
export const ENRICHMENT_MAX_STORIES = 20;
/** One story's fetch (the Google link's resolution, the page, the reader fallback) within this; a slower one is left to finish on its own. */
export const ENRICHMENT_STORY_TIMEOUT_MS = 25_000;

export type EnrichmentAttempt = { status: "pending" | "completed" | "failed" | "blocked"; updatedAt: Date };
export type EnrichmentCandidate = Pick<EditorialEvaluationCandidate, "storyId" | "contentStatus" | "localScore" | "publishedAt">;

/**
 * The candidates whose article is worth fetching before the evaluation: only
 * an excerpt or nothing stored, no attempt within the retry window (a pending
 * one is taken over once it is stale), the strongest local signal first.
 */
export function candidatesToEnrich<C extends EnrichmentCandidate>(
  candidates: readonly C[],
  attempts: ReadonlyMap<string, EnrichmentAttempt>,
  { now, maxStories = ENRICHMENT_MAX_STORIES, retryDays = ENRICHMENT_RETRY_DAYS }: { now: Date; maxStories?: number; retryDays?: number },
): C[] {
  const retryBefore = now.getTime() - retryDays * 86_400_000;
  const staleBefore = now.getTime() - ENRICHMENT_STORY_TIMEOUT_MS * 4;
  return candidates
    .filter((candidate) => candidate.contentStatus === "excerpt" || candidate.contentStatus === "missing")
    .filter((candidate) => {
      const attempt = attempts.get(candidate.storyId);
      if (!attempt) return true;
      return attempt.status === "pending" ? attempt.updatedAt.getTime() < staleBefore : attempt.updatedAt.getTime() < retryBefore;
    })
    .sort((left, right) => right.localScore - left.localScore || (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0))
    .slice(0, maxStories);
}

/**
 * Fetches the picked stories' articles a few at a time within a time budget.
 * Every outcome is stored by the preparation itself; a failure here only
 * means the evaluation reads what is stored. Returns how many were tried and
 * how many gained content.
 */
export async function runEnrichment<C extends { storyId: string }>(
  picked: readonly C[],
  prepare: (storyId: string) => Promise<{ outcome: "prepared" | "already-ready" }>,
  { budgetMs, concurrency = ENRICHMENT_CONCURRENCY, storyTimeoutMs = ENRICHMENT_STORY_TIMEOUT_MS, now = () => Date.now() }: { budgetMs: number; concurrency?: number; storyTimeoutMs?: number; now?: () => number },
): Promise<{ attempted: number; prepared: number; failed: number }> {
  const deadline = now() + budgetMs;
  const counts = { attempted: 0, prepared: 0, failed: 0 };
  let index = 0;
  const worker = async () => {
    while (index < picked.length && now() < deadline) {
      const candidate = picked[index++];
      counts.attempted += 1;
      try {
        const result = await withinTime(prepare(candidate.storyId), storyTimeoutMs);
        if (result.outcome === "prepared") counts.prepared += 1;
      } catch {
        counts.failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(0, Math.min(concurrency, picked.length)) }, worker));
  return counts;
}

function withinTime<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`The article was not ready within ${Math.round(ms / 1000)} s`)), ms); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
