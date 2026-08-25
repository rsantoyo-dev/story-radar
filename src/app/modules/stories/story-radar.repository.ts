import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  collectionRuns,
  collectionSourceRuns,
  creativeAiRuns,
  editorialEvaluationRuns,
  stories,
  storyCreativeBriefs,
  storySocialPublications,
  storySources,
  topicStories,
} from "@/db/schema";

import { canonicalizeStoryUrl } from "./deduplicate-story-candidates";
import {
  calculateTitleSimilarity,
  DEFAULT_SIMILAR_TITLE_THRESHOLD,
  DEFAULT_SIMILAR_TITLE_WINDOW_DAYS,
} from "./deduplicate-similar-stories";
import type {
  StoryCandidate,
  StoryRadarResult,
} from "./story-candidate.types";

export const DEFAULT_STALE_STORY_RETENTION_DAYS = 7;
export const DEFAULT_COLLECTION_RUN_RETENTION_DAYS = 30;

const DELETABLE_PROCESSING_STATUSES = [
  "new",
  "needs-enrichment",
  "rejected",
  "failed",
] as const;

export type StoryRadarRetentionOptions = {
  now?: Date;
  staleStoryRetentionDays?: number;
  collectionRunRetentionDays?: number;
};

export type StoryRadarRetentionResult = {
  deletedStories: number;
  deletedCollectionRuns: number;
  deletedEditorialEvaluationRuns: number;
  staleStoryCutoff: Date;
  collectionRunCutoff: Date;
};

export type PersistStoryRadarResult = {
  collectionRunId: string;
  persistedStories: number;
  markedStoredDuplicates: number;
  retention: StoryRadarRetentionResult;
};

export type StoryRadarDatabaseStats = {
  stories: number;
  storySources: number;
  collectionRuns: number;
  collectionSourceRuns: number;
  storiesByStatus: Partial<Record<string, number>>;
  latestCollectionRun?: {
    id: string;
    status: "completed" | "partial" | "failed";
    startedAt: Date;
    finishedAt: Date;
    includedItems: number;
    fetchedItems: number;
    filteredOutItems: number;
    duplicatesRemoved: number;
    exactDuplicatesRemoved: number;
    similarDuplicatesRemoved: number;
    readyItems: number;
    needsEnrichmentItems: number;
    reviewItems: number;
    rejectedItems: number;
    failedSources: number;
  };
};

export type ClearStoryRadarResult = {
  deletedStories: number;
  deletedCollectionRuns: number;
  deletedEditorialEvaluationRuns: number;
  deletedCreativeAiRuns: number;
  deletedCreativeBriefs: number;
  deletedSocialPublications: number;
};

export async function persistStoryRadarResult(
  topicId: string,
  result: StoryRadarResult,
  retentionOptions: StoryRadarRetentionOptions = {},
): Promise<PersistStoryRadarResult> {
  const finishedAt = retentionOptions.now ?? new Date();
  const recentStories = await getRecentStoredStories(topicId, finishedAt);
  const activeCanonicalUrls = new Set<string>();

  for (const candidate of result.items) {
    const canonicalUrl = resolveStoredCanonicalUrl(candidate, recentStories);

    await upsertStoryCandidate(topicId, candidate, canonicalUrl);
    updateRecentStoredStories(recentStories, candidate, canonicalUrl);
    activeCanonicalUrls.add(canonicalUrl);
  }

  const markedStoredDuplicates = await markStoredSimilarDuplicates(
    topicId,
    result.items,
    activeCanonicalUrls,
    finishedAt,
  );

  const [collectionRun] = await db
    .insert(collectionRuns)
    .values({
      topicId,
      status: resolveCollectionRunStatus(result),
      startedAt: result.generatedAt,
      finishedAt,
      requestedSources: result.sources.requested,
      successfulSources: result.sources.successful,
      failedSources: result.sources.failed,
      fetchedItems: result.counts.fetched,
      includedItems: result.counts.included,
      filteredOutItems: result.counts.filteredOut,
      duplicatesRemoved: result.counts.duplicatesRemoved,
      exactDuplicatesRemoved: result.counts.exactDuplicatesRemoved,
      similarDuplicatesRemoved: result.counts.similarDuplicatesRemoved,
      readyItems: result.counts.relevance.ready,
      needsEnrichmentItems: result.counts.relevance.needsEnrichment,
      reviewItems: result.counts.relevance.review,
      rejectedItems: result.counts.relevance.rejected,
    })
    .returning({ id: collectionRuns.id });

  if (!collectionRun) {
    throw new Error("The collection run could not be persisted");
  }

  if (result.sources.details.length > 0) {
    await db.insert(collectionSourceRuns).values(
      result.sources.details.map((source) => ({
        collectionRunId: collectionRun.id,
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        status: source.status,
        fetchedItems: source.fetchedItems,
        includedItems: source.includedItems,
        filteredOutItems: source.filteredOutItems,
        duplicatesRemoved: source.duplicatesRemoved,
        error: source.error ?? null,
      })),
    );
  }

  const retention = await pruneStoryRadarData(topicId, {
    ...retentionOptions,
    now: finishedAt,
  });

  return {
    collectionRunId: collectionRun.id,
    persistedStories: result.items.length,
    markedStoredDuplicates,
    retention,
  };
}

export async function pruneStoryRadarData(
  topicId: string,
  options: StoryRadarRetentionOptions = {},
): Promise<StoryRadarRetentionResult> {
  const now = options.now ?? new Date();
  const staleStoryRetentionDays = validateRetentionDays(
    options.staleStoryRetentionDays ?? DEFAULT_STALE_STORY_RETENTION_DAYS,
    "staleStoryRetentionDays",
  );
  const collectionRunRetentionDays = validateRetentionDays(
    options.collectionRunRetentionDays ??
      DEFAULT_COLLECTION_RUN_RETENTION_DAYS,
    "collectionRunRetentionDays",
  );
  const staleStoryCutoff = subtractDays(now, staleStoryRetentionDays);
  const collectionRunCutoff = subtractDays(now, collectionRunRetentionDays);

  const deletedStories = await db
    .delete(topicStories)
    .where(
      and(
        eq(topicStories.topicId, topicId),
        inArray(topicStories.processingStatus, [
          ...DELETABLE_PROCESSING_STATUSES,
        ]),
        lt(topicStories.lastSeenAt, staleStoryCutoff),
      ),
    )
    .returning({ id: topicStories.id });

  const deletedCollectionRuns = await db
    .delete(collectionRuns)
    .where(
      and(
        eq(collectionRuns.topicId, topicId),
        lt(collectionRuns.startedAt, collectionRunCutoff),
      ),
    )
    .returning({ id: collectionRuns.id });
  const deletedEditorialEvaluationRuns = await db
    .delete(editorialEvaluationRuns)
    .where(
      and(
        eq(editorialEvaluationRuns.topicId, topicId),
        lt(editorialEvaluationRuns.startedAt, collectionRunCutoff),
      ),
    )
    .returning({ id: editorialEvaluationRuns.id });

  return {
    deletedStories: deletedStories.length,
    deletedCollectionRuns: deletedCollectionRuns.length,
    deletedEditorialEvaluationRuns:
      deletedEditorialEvaluationRuns.length,
    staleStoryCutoff,
    collectionRunCutoff,
  };
}

export async function getStoryRadarDatabaseStats(
  topicId: string,
): Promise<StoryRadarDatabaseStats> {
  const [
    [storyCount],
    [storySourceCount],
    [collectionRunCount],
    [collectionSourceRunCount],
    storiesByStatusRows,
    [latestCollectionRun],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(topicStories)
      .where(eq(topicStories.topicId, topicId)),
    db
      .select({ value: count() })
      .from(storySources)
      .innerJoin(topicStories, eq(topicStories.storyId, storySources.storyId))
      .where(eq(topicStories.topicId, topicId)),
    db
      .select({ value: count() })
      .from(collectionRuns)
      .where(eq(collectionRuns.topicId, topicId)),
    db
      .select({ value: count() })
      .from(collectionSourceRuns)
      .innerJoin(
        collectionRuns,
        eq(collectionRuns.id, collectionSourceRuns.collectionRunId),
      )
      .where(eq(collectionRuns.topicId, topicId)),
    db
      .select({
        status: topicStories.processingStatus,
        value: count(),
      })
      .from(topicStories)
      .where(eq(topicStories.topicId, topicId))
      .groupBy(topicStories.processingStatus),
    db
      .select({
        id: collectionRuns.id,
        status: collectionRuns.status,
        startedAt: collectionRuns.startedAt,
        finishedAt: collectionRuns.finishedAt,
        includedItems: collectionRuns.includedItems,
        fetchedItems: collectionRuns.fetchedItems,
        filteredOutItems: collectionRuns.filteredOutItems,
        duplicatesRemoved: collectionRuns.duplicatesRemoved,
        exactDuplicatesRemoved: collectionRuns.exactDuplicatesRemoved,
        similarDuplicatesRemoved: collectionRuns.similarDuplicatesRemoved,
        readyItems: collectionRuns.readyItems,
        needsEnrichmentItems: collectionRuns.needsEnrichmentItems,
        reviewItems: collectionRuns.reviewItems,
        rejectedItems: collectionRuns.rejectedItems,
        failedSources: collectionRuns.failedSources,
      })
      .from(collectionRuns)
      .where(eq(collectionRuns.topicId, topicId))
      .orderBy(desc(collectionRuns.startedAt))
      .limit(1),
  ]);

  return {
    stories: storyCount?.value ?? 0,
    storySources: storySourceCount?.value ?? 0,
    collectionRuns: collectionRunCount?.value ?? 0,
    collectionSourceRuns: collectionSourceRunCount?.value ?? 0,
    storiesByStatus: Object.fromEntries(
      storiesByStatusRows.map((row) => [row.status, row.value]),
    ),
    ...(latestCollectionRun ? { latestCollectionRun } : {}),
  };
}

export async function clearStoryRadarData(
  topicId: string,
): Promise<ClearStoryRadarResult> {
  const [
    deletedCreativeAiRuns,
    deletedCreativeBriefs,
    deletedEditorialEvaluationRuns,
    deletedSocialPublications,
    deletedStories,
    deletedCollectionRuns,
  ] = await db.batch([
    // topic_stories only owns editorial state. Creative artifacts reference the
    // canonical story, so they would survive this topic-scoped clear unless
    // explicitly removed. Deleting briefs cascades to drafts, units, batches,
    // and generated assets; the profile remains as topic configuration.
    db
      .delete(creativeAiRuns)
      .where(eq(creativeAiRuns.topicId, topicId))
      .returning({ id: creativeAiRuns.id }),
    db
      .delete(storyCreativeBriefs)
      .where(eq(storyCreativeBriefs.topicId, topicId))
      .returning({ id: storyCreativeBriefs.id }),
    db
      .delete(editorialEvaluationRuns)
      .where(eq(editorialEvaluationRuns.topicId, topicId))
      .returning({ id: editorialEvaluationRuns.id }),
    // Publication marks are topic/story workflow data too. Keep them out of
    // a fresh radar run so an old selected story cannot leave a stale social
    // status behind after its topic-scoped story row is removed.
    db
      .delete(storySocialPublications)
      .where(eq(storySocialPublications.topicId, topicId))
      .returning({ id: storySocialPublications.id }),
    db
      .delete(topicStories)
      .where(eq(topicStories.topicId, topicId))
      .returning({ id: topicStories.id }),
    db
      .delete(collectionRuns)
      .where(eq(collectionRuns.topicId, topicId))
      .returning({ id: collectionRuns.id }),
  ]);

  return {
    deletedStories: deletedStories.length,
    deletedCollectionRuns: deletedCollectionRuns.length,
    deletedEditorialEvaluationRuns:
      deletedEditorialEvaluationRuns.length,
    deletedCreativeAiRuns: deletedCreativeAiRuns.length,
    deletedCreativeBriefs: deletedCreativeBriefs.length,
    deletedSocialPublications: deletedSocialPublications.length,
  };
}

type RecentStoredStory = {
  canonicalUrl: string;
  title: string;
  effectiveDate: Date;
};

async function getRecentStoredStories(
  topicId: string,
  now: Date,
): Promise<RecentStoredStory[]> {
  const cutoff = subtractDays(now, DEFAULT_SIMILAR_TITLE_WINDOW_DAYS);
  const rows = await db
    .select({
      canonicalUrl: stories.canonicalUrl,
      title: stories.title,
      publishedAt: stories.publishedAt,
      lastSeenAt: topicStories.lastSeenAt,
    })
    .from(topicStories)
    .innerJoin(stories, eq(stories.id, topicStories.storyId))
    .where(
      and(
        eq(topicStories.topicId, topicId),
        gte(topicStories.lastSeenAt, cutoff),
      ),
    )
    .orderBy(desc(topicStories.lastSeenAt));

  return rows.map((row) => ({
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    effectiveDate: row.publishedAt ?? row.lastSeenAt,
  }));
}

function resolveStoredCanonicalUrl(
  candidate: StoryCandidate,
  recentStories: readonly RecentStoredStory[],
): string {
  const candidateCanonicalUrl = canonicalizeStoryUrl(candidate.url);
  const exactMatch = recentStories.find(
    (story) => story.canonicalUrl === candidateCanonicalUrl,
  );

  if (exactMatch) {
    return exactMatch.canonicalUrl;
  }

  const candidateDate = candidate.publishedAt ?? candidate.fetchedAt;
  const windowMilliseconds =
    DEFAULT_SIMILAR_TITLE_WINDOW_DAYS * 24 * 60 * 60 * 1_000;
  const similarMatch = recentStories.find(
    (story) =>
      Math.abs(story.effectiveDate.getTime() - candidateDate.getTime()) <=
        windowMilliseconds &&
      calculateTitleSimilarity(story.title, candidate.title) >=
        DEFAULT_SIMILAR_TITLE_THRESHOLD,
  );

  return similarMatch?.canonicalUrl ?? candidateCanonicalUrl;
}

function updateRecentStoredStories(
  recentStories: RecentStoredStory[],
  candidate: StoryCandidate,
  canonicalUrl: string,
): void {
  const nextStory = {
    canonicalUrl,
    title: candidate.title,
    effectiveDate: candidate.publishedAt ?? candidate.fetchedAt,
  };
  const existingIndex = recentStories.findIndex(
    (story) => story.canonicalUrl === canonicalUrl,
  );

  if (existingIndex === -1) {
    recentStories.push(nextStory);
    return;
  }

  recentStories[existingIndex] = nextStory;
}

async function markStoredSimilarDuplicates(
  topicId: string,
  candidates: readonly StoryCandidate[],
  activeCanonicalUrls: ReadonlySet<string>,
  now: Date,
): Promise<number> {
  const cutoff = subtractDays(now, DEFAULT_SIMILAR_TITLE_WINDOW_DAYS);
  const storedCandidates = await db
    .select({
      id: topicStories.id,
      canonicalUrl: stories.canonicalUrl,
      title: stories.title,
      publishedAt: stories.publishedAt,
      lastSeenAt: topicStories.lastSeenAt,
    })
    .from(topicStories)
    .innerJoin(stories, eq(stories.id, topicStories.storyId))
    .where(
      and(
        eq(topicStories.topicId, topicId),
        gte(topicStories.lastSeenAt, cutoff),
        notInArray(topicStories.processingStatus, ["selected", "published"]),
      ),
    );
  const windowMilliseconds =
    DEFAULT_SIMILAR_TITLE_WINDOW_DAYS * 24 * 60 * 60 * 1_000;
  let markedDuplicates = 0;

  for (const storedCandidate of storedCandidates) {
    if (activeCanonicalUrls.has(storedCandidate.canonicalUrl)) {
      continue;
    }

    const storedDate =
      storedCandidate.publishedAt ?? storedCandidate.lastSeenAt;
    const matchingCandidate = candidates.find((candidate) => {
      const candidateDate = candidate.publishedAt ?? candidate.fetchedAt;

      return (
        Math.abs(storedDate.getTime() - candidateDate.getTime()) <=
          windowMilliseconds &&
        calculateTitleSimilarity(storedCandidate.title, candidate.title) >=
          DEFAULT_SIMILAR_TITLE_THRESHOLD
      );
    });

    if (!matchingCandidate) {
      continue;
    }

    await db
      .update(topicStories)
      .set({
        relevanceScore: 0,
        relevanceReasons: [
          `near-duplicate of: ${canonicalizeStoryUrl(matchingCandidate.url)}`,
        ],
        processingStatus: "rejected",
      })
      .where(eq(topicStories.id, storedCandidate.id));

    markedDuplicates += 1;
  }

  return markedDuplicates;
}

async function upsertStoryCandidate(
  topicId: string,
  candidate: StoryCandidate,
  canonicalUrl: string,
): Promise<void> {
  const incomingContentText = sql.raw(
    `excluded.${stories.contentText.name}`,
  );
  const incomingContentStatus = sql.raw(
    `excluded.${stories.contentStatus.name}`,
  );
  const incomingTags = sql.raw(`excluded.${stories.tags.name}`);
  const incomingPublishedAt = sql.raw(
    `excluded.${stories.publishedAt.name}`,
  );
  const incomingLastSeenAt = sql.raw(
    `excluded.${stories.lastSeenAt.name}`,
  );
  const incomingContentIsBetter = sql`(
    ${contentStatusRank(incomingContentStatus)} >
      ${contentStatusRank(stories.contentStatus)}
    OR (
      ${contentStatusRank(incomingContentStatus)} =
        ${contentStatusRank(stories.contentStatus)}
      AND char_length(coalesce(${incomingContentText}, '')) >
        char_length(coalesce(${stories.contentText}, ''))
    )
  )`;

  const [storedStory] = await db
    .insert(stories)
    .values({
      canonicalUrl,
      originalUrl: candidate.url,
      title: candidate.title,
      contentText: candidate.content.text ?? null,
      contentStatus: candidate.content.status,
      language: candidate.language,
      region: candidate.region,
      tags: candidate.tags,
      publishedAt: candidate.publishedAt ?? null,
      firstSeenAt: candidate.fetchedAt,
      lastSeenAt: candidate.fetchedAt,
      relevanceScore: candidate.relevance.score,
      relevanceReasons: candidate.relevance.reasons,
      processingStatus: candidate.relevance.decision,
    })
    .onConflictDoUpdate({
      target: stories.canonicalUrl,
      set: {
        originalUrl: candidate.url,
        title: candidate.title,
        contentText: sql`CASE
          WHEN ${incomingContentIsBetter} THEN ${incomingContentText}
          ELSE ${stories.contentText}
        END`,
        contentStatus: sql`CASE
          WHEN ${incomingContentIsBetter} THEN ${incomingContentStatus}
          ELSE ${stories.contentStatus}
        END`,
        language: candidate.language,
        region: candidate.region,
        tags: sql`ARRAY(
          SELECT DISTINCT tag
          FROM unnest(${stories.tags} || ${incomingTags}) AS tag
          ORDER BY tag
        )`,
        publishedAt: sql`CASE
          WHEN ${stories.publishedAt} IS NULL THEN ${incomingPublishedAt}
          WHEN ${incomingPublishedAt} IS NULL THEN ${stories.publishedAt}
          ELSE LEAST(${stories.publishedAt}, ${incomingPublishedAt})
        END`,
        lastSeenAt: sql`GREATEST(
          ${stories.lastSeenAt},
          ${incomingLastSeenAt}
        )`,
        // Relevance and workflow state moved to topic_stories. The legacy
        // columns remain populated for backwards-compatible migrations only.
      },
    })
    .returning({ id: stories.id });

  if (!storedStory) {
    throw new Error(`Story could not be persisted: ${candidate.url}`);
  }

  await upsertTopicStory(topicId, storedStory.id, candidate);

  await db
    .insert(storySources)
    .values({
      storyId: storedStory.id,
      sourceId: candidate.sourceId,
      sourceName: candidate.sourceName,
      externalId: candidate.externalId,
      sourceUrl: candidate.url,
      fetchedAt: candidate.fetchedAt,
    })
    .onConflictDoUpdate({
      target: [storySources.sourceId, storySources.externalId],
      set: {
        storyId: storedStory.id,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.url,
        fetchedAt: candidate.fetchedAt,
      },
    });
}

async function upsertTopicStory(
  topicId: string,
  storyId: string,
  candidate: StoryCandidate,
): Promise<void> {
  const incomingLastSeenAt = sql.raw(
    `excluded.${topicStories.lastSeenAt.name}`,
  );
  const incomingProcessingStatus = sql.raw(
    `excluded.${topicStories.processingStatus.name}`,
  );

  await db
    .insert(topicStories)
    .values({
      topicId,
      storyId,
      relevanceScore: candidate.relevance.score,
      relevanceReasons: candidate.relevance.reasons,
      processingStatus: candidate.relevance.decision,
      firstSeenAt: candidate.fetchedAt,
      lastSeenAt: candidate.fetchedAt,
    })
    .onConflictDoUpdate({
      target: [topicStories.topicId, topicStories.storyId],
      set: {
        relevanceScore: candidate.relevance.score,
        relevanceReasons: candidate.relevance.reasons,
        lastSeenAt: sql`GREATEST(
          ${topicStories.lastSeenAt},
          ${incomingLastSeenAt}
        )`,
        processingStatus: sql`CASE
          WHEN ${topicStories.processingStatus} IN ('selected', 'published')
            THEN ${topicStories.processingStatus}
          WHEN ${topicStories.reviewDecision} = 'rejected'
            THEN 'rejected'::story_processing_status
          ELSE ${incomingProcessingStatus}
        END`,
      },
    });
}

function contentStatusRank(
  status: SQL | typeof stories.contentStatus,
): SQL<number> {
  return sql`CASE ${status}
    WHEN 'full' THEN 3
    WHEN 'likely-full' THEN 2
    WHEN 'excerpt' THEN 1
    ELSE 0
  END`;
}

function resolveCollectionRunStatus(
  result: StoryRadarResult,
): "completed" | "partial" | "failed" {
  if (result.sources.failed === 0) {
    return "completed";
  }

  return result.sources.successful === 0 ? "failed" : "partial";
}

function validateRetentionDays(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1_000);
}
