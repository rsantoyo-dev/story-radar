import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  editorialEvaluationRuns,
  stories,
  storyContentEnrichments,
  storyEditorialEvaluations,
  storySources,
  topicSources,
  topicStories,
} from "@/db/schema";

import type { EditorialEvaluationPublicConfig } from "./editorial-evaluation.config";
import type { EditorialProfileFreshnessPolicy } from "./editorial-profile.types";
import { getEditorialProfile } from "./editorial-profile.repository";
import { listStoryPublications } from "./social-publications.repository";
import type { StorySocialPublication } from "./social-publications.types";
import type {
  EditorialDailyUsage,
  EditorialEvaluationCandidate,
  EditorialEvaluatorResult,
} from "./editorial-evaluation.types";
import type { StoryContentStatus } from "./story-candidate.types";

const MAX_CANDIDATE_SCAN = 250;

export type StoredEditorialCandidate = Omit<
  EditorialEvaluationCandidate,
  "inputHash"
>;

export type StoryReviewDecision = "approved" | "rejected";

export type EditorialDashboardStory = {
  storyId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  contentStatus: StoryContentStatus;
  publishedAt?: Date;
  localScore: number;
  evaluationDecision: "reject" | "review" | "shortlist";
  editorialPriority?: number;
  editorialScore: number;
  canadaRelevance: number;
  aiRelevance: number;
  socialPotential: number;
  novelty: number;
  reason: string;
  suggestedAngles: string[];
  riskFlags: string[];
  evaluatedAt: Date;
  reviewedAt?: Date;
  enrichmentStatus?: "pending" | "completed" | "failed" | "blocked";
  enrichmentMethod?: "direct" | "reader";
  enrichmentWordCount?: number;
  enrichmentAttempts?: number;
  enrichmentError?: string;
  enrichedAt?: Date;
  /**
   * Current channel-specific publication tracking. This remains separate from
   * editorial workflow state because a selected story can be published on one
   * platform and still be prepared for another.
   */
  publications: StorySocialPublication[];
};

export type EditorialCollectedStory = {
  storyId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  contentStatus: StoryContentStatus;
  processingStatus:
    | "new"
    | "needs-enrichment"
    | "ready"
    | "selected"
    | "rejected"
    | "published"
    | "failed";
  publishedAt?: Date;
  lastSeenAt: Date;
  localScore: number;
  reviewDecision?: StoryReviewDecision;
  reviewable: boolean;
  evaluationDecision?: "reject" | "review" | "shortlist";
  editorialPriority?: number;
  editorialScore?: number;
  canadaRelevance?: number;
  aiRelevance?: number;
  socialPotential?: number;
  novelty?: number;
  reason?: string;
  suggestedAngles: string[];
  riskFlags: string[];
  evaluatedAt?: Date;
};

export type EditorialDashboardStats = {
  configuration: EditorialEvaluationPublicConfig & {
    /**
     * The candidate policy resolved for this topic. The legacy top-level
     * values remain available for existing dashboard clients.
     */
    effectiveCandidatePolicy: {
      localCandidateMinScore: number;
      freshness: EditorialProfileFreshnessPolicy;
    };
  };
  totalRuns: number;
  totalEvaluations: number;
  decisions: Partial<Record<"reject" | "review" | "shortlist", number>>;
  today: EditorialDailyUsage & {
    maxRuns: number;
    maxStories: number;
    remainingRuns: number;
    remainingStories: number;
  };
  latestRun?: {
    id: string;
    status: "running" | "completed" | "failed";
    model: string;
    modelVersion?: string;
    requestedStories: number;
    evaluatedStories: number;
    cachedStories: number;
    totalTokens: number;
    startedAt: Date;
    finishedAt?: Date;
    error?: string;
  };
  collectedStories: EditorialCollectedStory[];
  shortlist: EditorialDashboardStory[];
  selectedStories: EditorialDashboardStory[];
};

type FindEditorialCandidatesOptions = {
  freshness: EditorialProfileFreshnessPolicy;
  minLocalScore: number;
  maxContentCharacters: number;
  /**
   * Topics without a saved profile must retain the historical source lookup
   * behavior as well as their legacy runtime candidate limits.
   */
  useLegacySourceFallback: boolean;
  now?: Date;
};

type CandidateSource = {
  storyId: string;
  sourceId: string;
  sourceName: string;
  fetchedAt: Date;
  tags: string[];
};

const RESEARCH_SOURCE_TAG_KEYWORDS = ["research", "academic", "journal"];
const LEGACY_CANDIDATE_STATUSES = [
  "new",
  "needs-enrichment",
  "ready",
] as const;
const PROFILE_CANDIDATE_STATUSES = [
  ...LEGACY_CANDIDATE_STATUSES,
  "rejected",
] as const;

type CompleteEditorialRunOptions = {
  topicId: string;
  runId: string;
  provider: string;
  model: string;
  promptVersion: string;
  candidates: readonly EditorialEvaluationCandidate[];
  result: EditorialEvaluatorResult;
  finishedAt?: Date;
};

export async function findEditorialEvaluationCandidates(
  topicId: string,
  {
    freshness,
    minLocalScore,
    maxContentCharacters,
    useLegacySourceFallback,
    now = new Date(),
  }: FindEditorialCandidatesOptions,
): Promise<StoredEditorialCandidate[]> {
  // Scan up to the broadest profile window in SQL, then apply the exact
  // source-specific window once the topic-scoped source tags are available.
  const maxAgeHours = Math.max(
    freshness.newsMaxAgeHours,
    freshness.researchMaxAgeHours,
  );
  const cutoff = new Date(now.getTime() - maxAgeHours * 60 * 60 * 1_000);
  const candidateStatuses = useLegacySourceFallback
    ? LEGACY_CANDIDATE_STATUSES
    : PROFILE_CANDIDATE_STATUSES;
  const effectiveDate = sql<Date>`coalesce(
    ${stories.publishedAt},
    ${topicStories.lastSeenAt}
  )`;
  const storyRows = await db
    .select({
      storyId: topicStories.storyId,
      title: stories.title,
      url: stories.originalUrl,
      contentText: stories.contentText,
      contentStatus: stories.contentStatus,
      language: stories.language,
      region: stories.region,
      tags: stories.tags,
      publishedAt: stories.publishedAt,
      lastSeenAt: topicStories.lastSeenAt,
      localScore: topicStories.relevanceScore,
      relevanceReasons: topicStories.relevanceReasons,
    })
    .from(topicStories)
    .innerJoin(stories, eq(stories.id, topicStories.storyId))
    .where(
      and(
        eq(topicStories.topicId, topicId),
        inArray(topicStories.processingStatus, candidateStatuses),
        // A saved profile may intentionally lower its AI candidate floor below
        // the legacy local review threshold. In that case, recover only
        // automatic rejections: a human rejection remains final.
        ...(useLegacySourceFallback ? [] : [isNull(topicStories.reviewDecision)]),
        gte(topicStories.relevanceScore, minLocalScore),
        gte(effectiveDate, cutoff),
      ),
    )
    .orderBy(desc(topicStories.relevanceScore), desc(effectiveDate))
    .limit(MAX_CANDIDATE_SCAN);

  if (storyRows.length === 0) {
    return [];
  }

  const sourceByStoryId = await findCandidateSources(
    topicId,
    storyRows.map((story) => story.storyId),
    useLegacySourceFallback,
  );

  const profileEligibleRows = useLegacySourceFallback
    ? storyRows
    : storyRows.filter(
        (story) =>
          !story.relevanceReasons.some((reason) =>
            reason.startsWith("hard-reject:"),
          ),
      );

  return profileEligibleRows
    .filter((story) => {
      const source = sourceByStoryId.get(story.storyId);
      const allowedAgeHours = isResearchSource(source?.tags ?? [])
        ? freshness.researchMaxAgeHours
        : freshness.newsMaxAgeHours;
      const effectiveStoryDate = story.publishedAt ?? story.lastSeenAt;
      const sourceCutoff = new Date(
        now.getTime() - allowedAgeHours * 60 * 60 * 1_000,
      );

      return effectiveStoryDate >= sourceCutoff;
    })
    .map((story) => {
      const source = sourceByStoryId.get(story.storyId);
      const contentPreview = createContentPreview(
        story.contentText,
        maxContentCharacters,
      );

      return {
        storyId: story.storyId,
        sourceId: source?.sourceId ?? "unknown",
        sourceName: source?.sourceName ?? "Unknown source",
        title: story.title,
        url: story.url,
        ...(contentPreview ? { contentPreview } : {}),
        contentStatus: story.contentStatus,
        language: story.language,
        region: story.region,
        tags: story.tags,
        ...(story.publishedAt ? { publishedAt: story.publishedAt } : {}),
        localScore: story.localScore,
      };
    });
}

async function findCandidateSources(
  topicId: string,
  storyIds: readonly string[],
  useLegacySourceFallback: boolean,
): Promise<Map<string, CandidateSource>> {
  if (storyIds.length === 0) {
    return new Map();
  }

  const sourceRows: CandidateSource[] = useLegacySourceFallback
    ? (await db
        .select({
          storyId: storySources.storyId,
          sourceId: storySources.sourceId,
          sourceName: storySources.sourceName,
          fetchedAt: storySources.fetchedAt,
        })
        .from(storySources)
        .where(inArray(storySources.storyId, [...storyIds]))
        .orderBy(desc(storySources.fetchedAt)))
        .map((source) => ({ ...source, tags: [] }))
    : await db
        .select({
          storyId: storySources.storyId,
          sourceId: storySources.sourceId,
          sourceName: storySources.sourceName,
          fetchedAt: storySources.fetchedAt,
          tags: topicSources.tags,
        })
        .from(storySources)
        .innerJoin(
          topicSources,
          and(
            eq(topicSources.topicId, topicId),
            // `story_sources.source_id` is text for legacy compatibility.
            // Cast the UUID column to text instead of casting untrusted stored
            // text to UUID, which keeps malformed legacy IDs from breaking the
            // whole candidate query.
            sql`${topicSources.rssSourceId}::text = ${storySources.sourceId}`,
          ),
        )
        .where(inArray(storySources.storyId, [...storyIds]))
        .orderBy(desc(storySources.fetchedAt));

  const sourceByStoryId = new Map<string, CandidateSource>();

  sourceRows.forEach((source) => {
    if (!sourceByStoryId.has(source.storyId)) {
      sourceByStoryId.set(source.storyId, source);
    }
  });

  return sourceByStoryId;
}

function isResearchSource(tags: readonly string[]): boolean {
  return tags.some((tag) => {
    const normalizedTag = tag.trim().toLowerCase();

    return RESEARCH_SOURCE_TAG_KEYWORDS.some((keyword) =>
      normalizedTag.includes(keyword),
    );
  });
}

export async function getCachedEditorialEvaluationKeys(
  topicId: string,
  candidates: readonly EditorialEvaluationCandidate[],
  provider: string,
  model: string,
  promptVersion: string,
): Promise<Set<string>> {
  if (candidates.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({
      storyId: storyEditorialEvaluations.storyId,
      inputHash: storyEditorialEvaluations.inputHash,
    })
    .from(storyEditorialEvaluations)
    .where(
      and(
        eq(storyEditorialEvaluations.topicId, topicId),
        eq(storyEditorialEvaluations.provider, provider),
        eq(storyEditorialEvaluations.model, model),
        eq(storyEditorialEvaluations.promptVersion, promptVersion),
        inArray(
          storyEditorialEvaluations.storyId,
          candidates.map((candidate) => candidate.storyId),
        ),
      ),
    );

  return new Set(
    rows.map((row) => editorialCacheKey(row.storyId, row.inputHash)),
  );
}

export async function getEditorialDailyUsage(
  topicId: string,
  now = new Date(),
): Promise<EditorialDailyUsage> {
  const { start, end } = getUtcDayRange(now);
  const [usage] = await db
    .select({
      runs: count(),
      stories: sql<number>`coalesce(sum(${editorialEvaluationRuns.requestedStories}), 0)::int`,
      evaluatedStories: sql<number>`coalesce(sum(${editorialEvaluationRuns.evaluatedStories}), 0)::int`,
      promptTokens: sql<number>`coalesce(sum(${editorialEvaluationRuns.promptTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${editorialEvaluationRuns.outputTokens}), 0)::int`,
      thoughtsTokens: sql<number>`coalesce(sum(${editorialEvaluationRuns.thoughtsTokens}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${editorialEvaluationRuns.totalTokens}), 0)::int`,
    })
    .from(editorialEvaluationRuns)
    .where(
      and(
        eq(editorialEvaluationRuns.topicId, topicId),
        gte(editorialEvaluationRuns.startedAt, start),
        lt(editorialEvaluationRuns.startedAt, end),
      ),
    );

  return {
    runs: usage?.runs ?? 0,
    stories: usage?.stories ?? 0,
    evaluatedStories: usage?.evaluatedStories ?? 0,
    promptTokens: usage?.promptTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    thoughtsTokens: usage?.thoughtsTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  };
}

export async function createEditorialEvaluationRun(
  topicId: string,
  values: {
    provider: string;
    model: string;
    promptVersion: string;
    requestedStories: number;
    cachedStories: number;
    startedAt?: Date;
  },
): Promise<string> {
  const [run] = await db
    .insert(editorialEvaluationRuns)
    .values({
      topicId,
      provider: values.provider,
      model: values.model,
      promptVersion: values.promptVersion,
      requestedStories: values.requestedStories,
      cachedStories: values.cachedStories,
      startedAt: values.startedAt ?? new Date(),
    })
    .returning({ id: editorialEvaluationRuns.id });

  if (!run) {
    throw new Error("The editorial evaluation run could not be created");
  }

  return run.id;
}

export async function completeEditorialEvaluationRun({
  topicId,
  runId,
  provider,
  model,
  promptVersion,
  candidates,
  result,
  finishedAt = new Date(),
}: CompleteEditorialRunOptions): Promise<void> {
  const candidateByStoryId = new Map(
    candidates.map((candidate) => [candidate.storyId, candidate]),
  );

  await db.batch([
    db
      .insert(storyEditorialEvaluations)
      .values(
        result.evaluations.map((evaluation) => {
          const candidate = candidateByStoryId.get(evaluation.storyId);

          if (!candidate) {
            throw new Error(
              `Missing candidate for editorial evaluation ${evaluation.storyId}`,
            );
          }

          return {
            topicId,
            runId,
            storyId: evaluation.storyId,
            provider,
            model,
            promptVersion,
            inputHash: candidate.inputHash,
            editorialScore: evaluation.editorialScore,
            editorialPriority: evaluation.editorialPriority,
            canadaRelevance: evaluation.canadaRelevance,
            aiRelevance: evaluation.aiRelevance,
            socialPotential: evaluation.socialPotential,
            novelty: evaluation.novelty,
            decision: evaluation.decision,
            reason: evaluation.reason,
            suggestedAngles: evaluation.suggestedAngles,
            riskFlags: evaluation.riskFlags,
            evaluatedAt: finishedAt,
          };
        }),
      )
      .onConflictDoNothing(),
    db
      .update(editorialEvaluationRuns)
      .set({
        status: "completed",
        modelVersion: result.modelVersion ?? null,
        evaluatedStories: result.evaluations.length,
        promptTokens: result.usage.promptTokens,
        outputTokens: result.usage.outputTokens,
        thoughtsTokens: result.usage.thoughtsTokens,
        totalTokens: result.usage.totalTokens,
        finishedAt,
        error: null,
      })
      .where(
        and(
          eq(editorialEvaluationRuns.id, runId),
          eq(editorialEvaluationRuns.topicId, topicId),
        ),
      ),
  ]);
}

export async function failEditorialEvaluationRun(
  topicId: string,
  runId: string,
  error: string,
  finishedAt = new Date(),
): Promise<void> {
  await db
    .update(editorialEvaluationRuns)
    .set({
      status: "failed",
      error: error.slice(0, 1_000),
      finishedAt,
    })
    .where(
      and(
        eq(editorialEvaluationRuns.id, runId),
        eq(editorialEvaluationRuns.topicId, topicId),
      ),
    );
}

export class EditorialStoryReviewConflictError extends Error {}

export async function reviewEditorialShortlist(
  topicId: string,
  storyIds: readonly string[],
  decision: StoryReviewDecision,
  configuration: EditorialEvaluationPublicConfig,
  reviewedAt = new Date(),
): Promise<number> {
  const latestEvaluation = createLatestEditorialEvaluation(
    "review_latest_editorial_evaluation",
    topicId,
    configuration,
  );
  const eligibleRows = await db
    .select({ storyId: topicStories.storyId })
    .from(latestEvaluation)
    .innerJoin(
      topicStories,
      and(
        eq(topicStories.storyId, latestEvaluation.storyId),
        eq(topicStories.topicId, topicId),
      ),
    )
    .where(
      and(
        inArray(topicStories.storyId, [...storyIds]),
        eq(latestEvaluation.decision, "shortlist"),
        isNull(topicStories.reviewDecision),
      ),
    );

  if (eligibleRows.length !== storyIds.length) {
    throw new EditorialStoryReviewConflictError(
      "One or more stories are no longer available for review",
    );
  }

  const reviewedRows = await db
    .update(topicStories)
    .set({
      reviewDecision: decision,
      reviewedAt,
      processingStatus: decision === "approved" ? "selected" : "rejected",
    })
    .where(
      and(
        inArray(
          topicStories.storyId,
          eligibleRows.map((row) => row.storyId),
        ),
        eq(topicStories.topicId, topicId),
        isNull(topicStories.reviewDecision),
      ),
    )
    .returning({ storyId: topicStories.storyId });

  if (reviewedRows.length !== storyIds.length) {
    throw new EditorialStoryReviewConflictError(
      "The shortlist changed while the review was being saved",
    );
  }

  return reviewedRows.length;
}

export async function getEditorialDashboardStats(
  topicId: string,
  configuration: EditorialEvaluationPublicConfig,
  now = new Date(),
): Promise<EditorialDashboardStats> {
  const latestEvaluation = createLatestEditorialEvaluation(
    "latest_editorial_evaluation",
    topicId,
    configuration,
  );
  const latestStoredEvaluation = createLatestEditorialEvaluation(
    "latest_stored_editorial_evaluation",
    topicId,
  );
  const latestSource = createLatestStorySource("latest_story_source");
  const [
    editorialProfile,
    [runCount],
    [evaluationCount],
    decisionRows,
    [latestRun],
    collectedRows,
    shortlistRows,
    selectedRows,
    dailyUsage,
  ] = await Promise.all([
    getEditorialProfile(topicId),
    db
      .select({ value: count() })
      .from(editorialEvaluationRuns)
      .where(eq(editorialEvaluationRuns.topicId, topicId)),
    db
      .select({ value: count() })
      .from(storyEditorialEvaluations)
      .where(eq(storyEditorialEvaluations.topicId, topicId)),
    db
      .select({
        decision: latestEvaluation.decision,
        value: count(),
      })
      .from(latestEvaluation)
      .groupBy(latestEvaluation.decision),
    db
      .select({
        id: editorialEvaluationRuns.id,
        status: editorialEvaluationRuns.status,
        model: editorialEvaluationRuns.model,
        modelVersion: editorialEvaluationRuns.modelVersion,
        requestedStories: editorialEvaluationRuns.requestedStories,
        evaluatedStories: editorialEvaluationRuns.evaluatedStories,
        cachedStories: editorialEvaluationRuns.cachedStories,
        totalTokens: editorialEvaluationRuns.totalTokens,
        startedAt: editorialEvaluationRuns.startedAt,
        finishedAt: editorialEvaluationRuns.finishedAt,
        error: editorialEvaluationRuns.error,
      })
      .from(editorialEvaluationRuns)
      .where(eq(editorialEvaluationRuns.topicId, topicId))
      .orderBy(desc(editorialEvaluationRuns.startedAt))
      .limit(1),
    db
      .select({
        storyId: topicStories.storyId,
        sourceId: latestSource.sourceId,
        sourceName: latestSource.sourceName,
        title: stories.title,
        url: stories.originalUrl,
        contentStatus: stories.contentStatus,
        processingStatus: topicStories.processingStatus,
        publishedAt: stories.publishedAt,
        lastSeenAt: topicStories.lastSeenAt,
        localScore: topicStories.relevanceScore,
        reviewDecision: topicStories.reviewDecision,
        evaluationDecision: latestEvaluation.decision,
        editorialPriority: latestEvaluation.editorialPriority,
        editorialScore: latestEvaluation.editorialScore,
        canadaRelevance: latestEvaluation.canadaRelevance,
        aiRelevance: latestEvaluation.aiRelevance,
        socialPotential: latestEvaluation.socialPotential,
        novelty: latestEvaluation.novelty,
        reason: latestEvaluation.reason,
        suggestedAngles: latestEvaluation.suggestedAngles,
        riskFlags: latestEvaluation.riskFlags,
        evaluatedAt: latestEvaluation.evaluatedAt,
      })
      .from(topicStories)
      .innerJoin(stories, eq(stories.id, topicStories.storyId))
      .leftJoin(latestSource, eq(latestSource.storyId, stories.id))
      .leftJoin(latestEvaluation, eq(latestEvaluation.storyId, stories.id))
      .where(eq(topicStories.topicId, topicId))
      .orderBy(
        desc(
          sql<Date>`coalesce(${stories.publishedAt}, ${topicStories.lastSeenAt})`,
        ),
        desc(topicStories.relevanceScore),
      ),
    db
      .select({
        storyId: topicStories.storyId,
        sourceId: latestSource.sourceId,
        sourceName: latestSource.sourceName,
        title: stories.title,
        url: stories.originalUrl,
        contentStatus: stories.contentStatus,
        publishedAt: stories.publishedAt,
        localScore: topicStories.relevanceScore,
        evaluationDecision: latestEvaluation.decision,
        editorialPriority: latestEvaluation.editorialPriority,
        editorialScore: latestEvaluation.editorialScore,
        canadaRelevance: latestEvaluation.canadaRelevance,
        aiRelevance: latestEvaluation.aiRelevance,
        socialPotential: latestEvaluation.socialPotential,
        novelty: latestEvaluation.novelty,
        reason: latestEvaluation.reason,
        suggestedAngles: latestEvaluation.suggestedAngles,
        riskFlags: latestEvaluation.riskFlags,
        evaluatedAt: latestEvaluation.evaluatedAt,
      })
      .from(latestEvaluation)
      .innerJoin(
        topicStories,
        and(
          eq(topicStories.storyId, latestEvaluation.storyId),
          eq(topicStories.topicId, topicId),
        ),
      )
      .innerJoin(stories, eq(stories.id, latestEvaluation.storyId))
      .leftJoin(latestSource, eq(latestSource.storyId, stories.id))
      .where(
        and(
          eq(latestEvaluation.decision, "shortlist"),
          isNull(topicStories.reviewDecision),
        ),
      )
      .orderBy(
        desc(
          sql<number>`coalesce(${latestEvaluation.editorialPriority}, ${latestEvaluation.editorialScore})`,
        ),
        desc(latestEvaluation.socialPotential),
        desc(latestEvaluation.editorialScore),
        desc(latestEvaluation.evaluatedAt),
      ),
    db
      .select({
        storyId: topicStories.storyId,
        sourceId: latestSource.sourceId,
        sourceName: latestSource.sourceName,
        title: stories.title,
        url: stories.originalUrl,
        contentStatus: stories.contentStatus,
        publishedAt: stories.publishedAt,
        localScore: topicStories.relevanceScore,
        evaluationDecision: latestStoredEvaluation.decision,
        editorialPriority: latestStoredEvaluation.editorialPriority,
        editorialScore: latestStoredEvaluation.editorialScore,
        canadaRelevance: latestStoredEvaluation.canadaRelevance,
        aiRelevance: latestStoredEvaluation.aiRelevance,
        socialPotential: latestStoredEvaluation.socialPotential,
        novelty: latestStoredEvaluation.novelty,
        reason: latestStoredEvaluation.reason,
        suggestedAngles: latestStoredEvaluation.suggestedAngles,
        riskFlags: latestStoredEvaluation.riskFlags,
        evaluatedAt: latestStoredEvaluation.evaluatedAt,
        reviewedAt: topicStories.reviewedAt,
        enrichmentStatus: storyContentEnrichments.status,
        enrichmentMethod: storyContentEnrichments.method,
        enrichmentWordCount: storyContentEnrichments.wordCount,
        enrichmentAttempts: storyContentEnrichments.attempts,
        enrichmentError: storyContentEnrichments.error,
        enrichedAt: storyContentEnrichments.fetchedAt,
      })
      .from(latestStoredEvaluation)
      .innerJoin(
        topicStories,
        and(
          eq(topicStories.storyId, latestStoredEvaluation.storyId),
          eq(topicStories.topicId, topicId),
        ),
      )
      .innerJoin(stories, eq(stories.id, latestStoredEvaluation.storyId))
      .leftJoin(latestSource, eq(latestSource.storyId, stories.id))
      .leftJoin(
        storyContentEnrichments,
        eq(storyContentEnrichments.storyId, stories.id),
      )
      .where(eq(topicStories.reviewDecision, "approved"))
      .orderBy(
        desc(
          sql<number>`coalesce(${latestStoredEvaluation.editorialPriority}, ${latestStoredEvaluation.editorialScore})`,
        ),
        desc(latestStoredEvaluation.socialPotential),
        desc(latestStoredEvaluation.editorialScore),
        desc(topicStories.reviewedAt),
      ),
    getEditorialDailyUsage(topicId, now),
  ]);

  const publicationsByStoryId = new Map<string, StorySocialPublication[]>();
  const selectedPublications = await listStoryPublications(
    topicId,
    selectedRows.map((row) => row.storyId),
  );

  for (const publication of selectedPublications) {
    const publications = publicationsByStoryId.get(publication.storyId) ?? [];
    publications.push(publication);
    publicationsByStoryId.set(publication.storyId, publications);
  }

  return {
    configuration: {
      ...configuration,
      effectiveCandidatePolicy: {
        localCandidateMinScore: editorialProfile.localCandidateMinScore,
        freshness: editorialProfile.freshness,
      },
    },
    totalRuns: runCount?.value ?? 0,
    totalEvaluations: evaluationCount?.value ?? 0,
    decisions: Object.fromEntries(
      decisionRows.map((row) => [row.decision, row.value]),
    ),
    today: {
      ...dailyUsage,
      maxRuns: configuration.maxRunsPerDay,
      maxStories: configuration.maxStoriesPerDay,
      remainingRuns: Math.max(
        0,
        configuration.maxRunsPerDay - dailyUsage.runs,
      ),
      remainingStories: Math.max(
        0,
        configuration.maxStoriesPerDay - dailyUsage.stories,
      ),
    },
    ...(latestRun
      ? {
          latestRun: {
            id: latestRun.id,
            status: latestRun.status,
            model: latestRun.model,
            ...(latestRun.modelVersion
              ? { modelVersion: latestRun.modelVersion }
              : {}),
            requestedStories: latestRun.requestedStories,
            evaluatedStories: latestRun.evaluatedStories,
            cachedStories: latestRun.cachedStories,
            totalTokens: latestRun.totalTokens,
            startedAt: latestRun.startedAt,
            ...(latestRun.finishedAt
              ? { finishedAt: latestRun.finishedAt }
              : {}),
            ...(latestRun.error ? { error: latestRun.error } : {}),
          },
        }
      : {}),
    collectedStories: collectedRows.map((row) => ({
      storyId: row.storyId,
      sourceId: row.sourceId ?? "unknown",
      sourceName: row.sourceName ?? "Unknown source",
      title: row.title,
      url: row.url,
      contentStatus: row.contentStatus,
      processingStatus: row.processingStatus,
      ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
      lastSeenAt: row.lastSeenAt,
      localScore: row.localScore,
      ...(row.reviewDecision
        ? { reviewDecision: row.reviewDecision }
        : {}),
      reviewable:
        row.evaluationDecision === "shortlist" && !row.reviewDecision,
      ...(row.evaluationDecision
        ? { evaluationDecision: row.evaluationDecision }
        : {}),
      ...(row.editorialPriority !== null
        ? { editorialPriority: row.editorialPriority }
        : {}),
      ...(row.editorialScore !== null
        ? { editorialScore: row.editorialScore }
        : {}),
      ...(row.canadaRelevance !== null
        ? { canadaRelevance: row.canadaRelevance }
        : {}),
      ...(row.aiRelevance !== null
        ? { aiRelevance: row.aiRelevance }
        : {}),
      ...(row.socialPotential !== null
        ? { socialPotential: row.socialPotential }
        : {}),
      ...(row.novelty !== null ? { novelty: row.novelty } : {}),
      ...(row.reason ? { reason: row.reason } : {}),
      suggestedAngles: row.suggestedAngles ?? [],
      riskFlags: row.riskFlags ?? [],
      ...(row.evaluatedAt ? { evaluatedAt: row.evaluatedAt } : {}),
    })),
    shortlist: shortlistRows.map((row) => ({
      storyId: row.storyId,
      sourceId: row.sourceId ?? "unknown",
      sourceName: row.sourceName ?? "Unknown source",
      title: row.title,
      url: row.url,
      contentStatus: row.contentStatus,
      ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
      localScore: row.localScore,
      evaluationDecision: row.evaluationDecision,
      ...(row.editorialPriority !== null
        ? { editorialPriority: row.editorialPriority }
        : {}),
      editorialScore: row.editorialScore,
      canadaRelevance: row.canadaRelevance,
      aiRelevance: row.aiRelevance,
      socialPotential: row.socialPotential,
      novelty: row.novelty,
      reason: row.reason,
      suggestedAngles: row.suggestedAngles,
      riskFlags: row.riskFlags,
      evaluatedAt: row.evaluatedAt,
      publications: [],
    })),
    selectedStories: selectedRows.map((row) => ({
      storyId: row.storyId,
      sourceId: row.sourceId ?? "unknown",
      sourceName: row.sourceName ?? "Unknown source",
      title: row.title,
      url: row.url,
      contentStatus: row.contentStatus,
      ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
      localScore: row.localScore,
      evaluationDecision: row.evaluationDecision,
      ...(row.editorialPriority !== null
        ? { editorialPriority: row.editorialPriority }
        : {}),
      editorialScore: row.editorialScore,
      canadaRelevance: row.canadaRelevance,
      aiRelevance: row.aiRelevance,
      socialPotential: row.socialPotential,
      novelty: row.novelty,
      reason: row.reason,
      suggestedAngles: row.suggestedAngles,
      riskFlags: row.riskFlags,
      evaluatedAt: row.evaluatedAt,
      ...(row.reviewedAt ? { reviewedAt: row.reviewedAt } : {}),
      ...(row.enrichmentStatus
        ? { enrichmentStatus: row.enrichmentStatus }
        : {}),
      ...(row.enrichmentMethod
        ? { enrichmentMethod: row.enrichmentMethod }
        : {}),
      ...(row.enrichmentWordCount !== null
        ? { enrichmentWordCount: row.enrichmentWordCount }
        : {}),
      ...(row.enrichmentAttempts !== null
        ? { enrichmentAttempts: row.enrichmentAttempts }
        : {}),
      ...(row.enrichmentError
        ? { enrichmentError: row.enrichmentError }
        : {}),
      ...(row.enrichedAt ? { enrichedAt: row.enrichedAt } : {}),
      publications: publicationsByStoryId.get(row.storyId) ?? [],
    })),
  };
}

function createLatestEditorialEvaluation(
  alias: string,
  topicId: string,
  configuration?: EditorialEvaluationPublicConfig,
) {
  const filters = eq(storyEditorialEvaluations.topicId, topicId);

  /**
   * A configuration identifies the current evaluator contract. It is a
   * preference rather than a filter so stored v1 results remain visible and
   * reviewable until that story receives a v2 result. The cache deliberately
   * remains stricter: only an exact configuration match can skip a new call.
   */
  const currentEvaluatorFirst = configuration
    ? sql<number>`case
        when ${storyEditorialEvaluations.provider} = ${configuration.provider}
          and ${storyEditorialEvaluations.model} = ${configuration.model}
          and ${storyEditorialEvaluations.promptVersion} = ${configuration.promptVersion}
        then 0
        else 1
      end`
    : undefined;

  return db
    .selectDistinctOn([storyEditorialEvaluations.storyId], {
      storyId: storyEditorialEvaluations.storyId,
      editorialPriority: storyEditorialEvaluations.editorialPriority,
      editorialScore: storyEditorialEvaluations.editorialScore,
      canadaRelevance: storyEditorialEvaluations.canadaRelevance,
      aiRelevance: storyEditorialEvaluations.aiRelevance,
      socialPotential: storyEditorialEvaluations.socialPotential,
      novelty: storyEditorialEvaluations.novelty,
      decision: storyEditorialEvaluations.decision,
      reason: storyEditorialEvaluations.reason,
      suggestedAngles: storyEditorialEvaluations.suggestedAngles,
      riskFlags: storyEditorialEvaluations.riskFlags,
      evaluatedAt: storyEditorialEvaluations.evaluatedAt,
    })
    .from(storyEditorialEvaluations)
    .where(filters)
    .orderBy(
      storyEditorialEvaluations.storyId,
      ...(currentEvaluatorFirst ? [currentEvaluatorFirst] : []),
      desc(storyEditorialEvaluations.evaluatedAt),
    )
    .as(alias);
}

function createLatestStorySource(alias: string) {
  return db
    .selectDistinctOn([storySources.storyId], {
      storyId: storySources.storyId,
      sourceId: storySources.sourceId,
      sourceName: storySources.sourceName,
      fetchedAt: storySources.fetchedAt,
    })
    .from(storySources)
    .orderBy(storySources.storyId, desc(storySources.fetchedAt))
    .as(alias);
}

export function editorialCacheKey(storyId: string, inputHash: string): string {
  return `${storyId}:${inputHash}`;
}

function createContentPreview(
  content: string | null,
  maxCharacters: number,
): string | undefined {
  const normalized = content?.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length <= maxCharacters
    ? normalized
    : `${normalized.slice(0, maxCharacters).trimEnd()}…`;
}

function getUtcDayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);

  return { start, end };
}
