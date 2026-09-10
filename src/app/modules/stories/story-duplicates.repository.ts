import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { stories, storySocialPublications, topicStories } from "@/db/schema";

import {
  getStoryEmbeddingConfig,
  type StoryEmbeddingConfig,
} from "./story-embedding.config";
import {
  buildStoryEmbeddingText,
  embedStoryTexts,
  StoryEmbeddingProviderError,
} from "./story-embedding";
import {
  findDuplicateEvent,
  type DuplicateCandidate,
  type DuplicatePrior,
  type DuplicateTier,
} from "./story-duplicate-detection";

const CANDIDATE_STATUSES = new Set(["new", "needs-enrichment", "ready"]);

type StoryRow = {
  topicStoryId: string;
  storyId: string;
  title: string;
  contentText: string | null;
  embedding: number[] | null;
  embeddingModel: string | null;
  effectiveDate: Date;
  relevanceScore: number;
  processingStatus: string;
  reviewDecision: string | null;
  duplicateOfStoryId: string | null;
  duplicateOverriddenAt: Date | null;
  tier: DuplicateTier;
};

export type DetectTopicDuplicatesResult = {
  marked: number;
  pairs: { candidateStoryId: string; winnerStoryId: string; similarity: number }[];
};

/**
 * Marks each pending topic story that reports the same news event as a
 * higher-ranked / earlier / already-selected / already-published sibling. Never
 * touches a selected, published, or human-reviewed row.
 */
export async function detectTopicDuplicates(
  topicId: string,
  options: { now?: Date; config?: StoryEmbeddingConfig } = {},
): Promise<DetectTopicDuplicatesResult> {
  const now = options.now ?? new Date();
  const config = options.config ?? getStoryEmbeddingConfig();
  const windowMs = config.windowDays * 24 * 60 * 60 * 1_000;
  const cutoff = new Date(now.getTime() - windowMs);

  const rows = await loadTopicStoryRows(topicId, cutoff);
  if (rows.length === 0) return { marked: 0, pairs: [] };

  await ensureStoryEmbeddings(rows, config);

  const candidates = rows
    .filter(
      (row) =>
        row.tier === "pending" &&
        row.reviewDecision === null &&
        row.duplicateOfStoryId === null &&
        row.duplicateOverriddenAt === null &&
        CANDIDATE_STATUSES.has(row.processingStatus),
    )
    .sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore ||
        a.effectiveDate.getTime() - b.effectiveDate.getTime(),
    );
  if (candidates.length === 0) return { marked: 0, pairs: [] };

  const priors: DuplicatePrior[] = rows
    .filter((row) => row.tier !== "pending")
    .map(toPrior);
  const pairs: DetectTopicDuplicatesResult["pairs"] = [];

  for (const row of candidates) {
    const candidate: DuplicateCandidate = {
      storyId: row.storyId,
      title: row.title,
      embedding: row.embedding,
      effectiveDate: row.effectiveDate,
    };
    const match = findDuplicateEvent({
      candidate,
      priors,
      cosineThreshold: config.cosineThreshold,
      lexicalThreshold: config.lexicalThreshold,
      windowMs,
    });
    if (!match) {
      // A "winner" — it can anchor later, weaker candidates in this pass.
      priors.push(toPrior(row));
      continue;
    }
    pairs.push({
      candidateStoryId: row.storyId,
      winnerStoryId: match.storyId,
      similarity: match.similarity,
    });
    await db
      .update(topicStories)
      .set({
        duplicateOfStoryId: match.storyId,
        duplicateDetectedAt: now,
        duplicateSimilarity: Math.round(
          Math.max(0, Math.min(1, match.similarity)) * 100,
        ),
      })
      .where(
        and(
          eq(topicStories.id, row.topicStoryId),
          isNull(topicStories.reviewDecision),
          isNull(topicStories.duplicateOfStoryId),
          isNull(topicStories.duplicateOverriddenAt),
        ),
      );
  }

  return { marked: pairs.length, pairs };
}

export class DuplicateFlagClearConflictError extends Error {}

/**
 * Human override for a false-positive "same news event" match. Detection
 * compares title text, so adjacent sections of one source document that
 * share a breadcrumb/heading structure (e.g. "Pregnancy > ... > Alcohol" vs
 * "Pregnancy > ... > Tobacco") can score as duplicates even though they cover
 * distinct topics.
 *
 * Detection is deterministic: with the same title/embedding and the same
 * priors, merely clearing `duplicateOfStoryId` would just have the very next
 * detection pass re-flag the identical pair before AI evaluation ever runs.
 * `duplicateOverriddenAt` makes the override sticky by permanently excluding
 * this story from future duplicate scans (see the candidate filter in
 * `detectTopicDuplicates`). It cannot undo a story that already has a human
 * review decision.
 */
export async function clearTopicStoryDuplicateFlag(
  topicId: string,
  storyId: string,
  overriddenAt = new Date(),
): Promise<void> {
  const [cleared] = await db
    .update(topicStories)
    .set({
      duplicateOfStoryId: null,
      duplicateDetectedAt: null,
      duplicateSimilarity: null,
      duplicateOverriddenAt: overriddenAt,
    })
    .where(
      and(
        eq(topicStories.topicId, topicId),
        eq(topicStories.storyId, storyId),
        isNotNull(topicStories.duplicateOfStoryId),
        isNull(topicStories.reviewDecision),
      ),
    )
    .returning({ storyId: topicStories.storyId });

  if (!cleared) {
    throw new DuplicateFlagClearConflictError(
      "This story is no longer flagged as a duplicate",
    );
  }
}

/**
 * For the publish guard: is this topic story a duplicate of a sibling that is
 * already approved or has a scheduled/published post?
 */
export async function findPublicationDuplicateConflict(
  topicId: string,
  storyId: string,
): Promise<{ storyId: string; title: string } | null> {
  const [row] = await db
    .select({ duplicateOfStoryId: topicStories.duplicateOfStoryId })
    .from(topicStories)
    .where(
      and(eq(topicStories.topicId, topicId), eq(topicStories.storyId, storyId)),
    )
    .limit(1);
  const siblingId = row?.duplicateOfStoryId;
  if (!siblingId) return null;

  const [sibling] = await db
    .select({
      title: stories.title,
      reviewDecision: topicStories.reviewDecision,
      processingStatus: topicStories.processingStatus,
      publicationStatus: storySocialPublications.status,
    })
    .from(topicStories)
    .innerJoin(stories, eq(stories.id, topicStories.storyId))
    .leftJoin(
      storySocialPublications,
      and(
        eq(storySocialPublications.topicId, topicId),
        eq(storySocialPublications.storyId, topicStories.storyId),
        inArray(storySocialPublications.status, ["scheduled", "published"]),
      ),
    )
    .where(
      and(eq(topicStories.topicId, topicId), eq(topicStories.storyId, siblingId)),
    )
    .limit(1);

  if (!sibling) return null;
  const blocked =
    sibling.reviewDecision === "approved" ||
    sibling.processingStatus === "selected" ||
    sibling.processingStatus === "published" ||
    sibling.publicationStatus === "scheduled" ||
    sibling.publicationStatus === "published";
  return blocked ? { storyId: siblingId, title: sibling.title } : null;
}

async function loadTopicStoryRows(
  topicId: string,
  cutoff: Date,
): Promise<StoryRow[]> {
  const rows = await db
    .select({
      topicStoryId: topicStories.id,
      storyId: topicStories.storyId,
      title: stories.title,
      contentText: stories.contentText,
      embedding: stories.titleEmbedding,
      embeddingModel: stories.titleEmbeddingModel,
      publishedAt: stories.publishedAt,
      lastSeenAt: topicStories.lastSeenAt,
      relevanceScore: topicStories.relevanceScore,
      processingStatus: topicStories.processingStatus,
      reviewDecision: topicStories.reviewDecision,
      duplicateOfStoryId: topicStories.duplicateOfStoryId,
      duplicateOverriddenAt: topicStories.duplicateOverriddenAt,
      publicationStatus: storySocialPublications.status,
    })
    .from(topicStories)
    .innerJoin(stories, eq(stories.id, topicStories.storyId))
    .leftJoin(
      storySocialPublications,
      and(
        eq(storySocialPublications.topicId, topicId),
        eq(storySocialPublications.storyId, topicStories.storyId),
        inArray(storySocialPublications.status, ["scheduled", "published"]),
      ),
    )
    .where(
      and(
        eq(topicStories.topicId, topicId),
        gte(topicStories.lastSeenAt, cutoff),
      ),
    )
    .orderBy(desc(topicStories.relevanceScore));

  return rows.map((row) => ({
    topicStoryId: row.topicStoryId,
    storyId: row.storyId,
    title: row.title,
    contentText: row.contentText,
    embedding: Array.isArray(row.embedding) ? (row.embedding as number[]) : null,
    embeddingModel: row.embeddingModel,
    effectiveDate: row.publishedAt ?? row.lastSeenAt,
    relevanceScore: row.relevanceScore,
    processingStatus: row.processingStatus,
    reviewDecision: row.reviewDecision,
    duplicateOfStoryId: row.duplicateOfStoryId,
    duplicateOverriddenAt: row.duplicateOverriddenAt,
    tier: resolveTier(row),
  }));
}

function resolveTier(row: {
  processingStatus: string;
  reviewDecision: string | null;
  publicationStatus: string | null;
}): DuplicateTier {
  if (row.publicationStatus === "published" || row.processingStatus === "published") {
    return "published";
  }
  if (
    row.publicationStatus === "scheduled" ||
    row.reviewDecision === "approved" ||
    row.processingStatus === "selected"
  ) {
    return "selected";
  }
  return "pending";
}

function toPrior(row: StoryRow): DuplicatePrior {
  return {
    storyId: row.storyId,
    title: row.title,
    embedding: row.embedding,
    effectiveDate: row.effectiveDate,
    tier: row.tier,
  };
}

/**
 * Computes and stores the title embedding for any story missing one (or
 * embedded with a different model). Best-effort: a provider failure is logged
 * and swallowed so collection never breaks. Mutates the passed rows in place
 * with the fresh vectors.
 */
export async function ensureStoryEmbeddings(
  rows: readonly {
    storyId: string;
    title: string;
    contentText: string | null;
    embedding: number[] | null;
    embeddingModel: string | null;
  }[],
  config: StoryEmbeddingConfig = getStoryEmbeddingConfig(),
): Promise<void> {
  const pending = new Map<string, string>();
  for (const row of rows) {
    if (
      (!row.embedding || row.embeddingModel !== config.model) &&
      !pending.has(row.storyId)
    ) {
      pending.set(row.storyId, buildStoryEmbeddingText(row.title, row.contentText));
    }
  }
  if (pending.size === 0) return;

  const items = [...pending.entries()].map(([storyId, text]) => ({ storyId, text }));

  let vectors: number[][];
  try {
    vectors = await embedStoryTexts(items.map((item) => item.text));
  } catch (error) {
    if (error instanceof StoryEmbeddingProviderError) {
      console.error(
        "Story embedding failed; duplicate detection falls back to lexical",
        error.message,
      );
      return;
    }
    throw error;
  }

  await Promise.all(
    items.map((item, index) => {
      const vector = vectors[index];
      if (!vector) return Promise.resolve();
      for (const row of rows) {
        if (row.storyId === item.storyId) {
          (row as { embedding: number[] | null }).embedding = vector;
          (row as { embeddingModel: string | null }).embeddingModel = config.model;
        }
      }
      return db
        .update(stories)
        .set({ titleEmbedding: vector, titleEmbeddingModel: config.model })
        .where(eq(stories.id, item.storyId));
    }),
  );
}
