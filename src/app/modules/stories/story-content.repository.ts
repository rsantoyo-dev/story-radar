import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  stories,
  storyContentEnrichments,
  topicStories,
} from "@/db/schema";

import type { StoryContentStatus } from "./story-candidate.types";

export type StoryContentEnrichmentStatus =
  | "pending"
  | "completed"
  | "failed"
  | "blocked";

export type StoryContentEnrichmentMethod = "direct" | "reader";

export type SelectedStoryContentRecord = {
  storyId: string;
  title: string;
  url: string;
  text?: string;
  contentStatus: StoryContentStatus;
  source: "rss" | "article";
  enrichment?: {
    status: StoryContentEnrichmentStatus;
    method: StoryContentEnrichmentMethod;
    wordCount?: number;
    resolvedUrl?: string;
    articleTitle?: string;
    byline?: string;
    attempts: number;
    error?: string;
    fetchedAt?: Date;
    updatedAt: Date;
  };
};

export type SelectedStoryForEnrichment = {
  storyId: string;
  title: string;
  url: string;
  contentText?: string;
  contentStatus: StoryContentStatus;
};

export type CompleteStoryContentEnrichmentInput = {
  storyId: string;
  resolvedUrl: string;
  articleTitle?: string;
  byline?: string;
  contentText: string;
  contentHash: string;
  contentStatus: Extract<StoryContentStatus, "excerpt" | "likely-full">;
  method: StoryContentEnrichmentMethod;
  wordCount: number;
  fetchedAt?: Date;
};

export class SelectedStoryContentNotFoundError extends Error {}

/**
 * Content preparation is useful before a human selects a story: it lets the
 * editorial evaluator reassess a complete article instead of an RSS excerpt.
 * A human-rejected story remains final and cannot be revived through this
 * helper.
 */
export async function findStoryForEnrichment(
  topicId: string,
  storyId: string,
): Promise<SelectedStoryForEnrichment> {
  const [story] = await db
    .select({
      storyId: stories.id,
      title: stories.title,
      url: stories.originalUrl,
      contentText: stories.contentText,
      contentStatus: stories.contentStatus,
      reviewDecision: topicStories.reviewDecision,
    })
    .from(topicStories)
    .innerJoin(stories, eq(stories.id, topicStories.storyId))
    .where(
      and(
        eq(topicStories.topicId, topicId),
        eq(topicStories.storyId, storyId),
      ),
    )
    .limit(1);

  if (!story) {
    throw new SelectedStoryContentNotFoundError("The story was not found");
  }

  if (story.reviewDecision === "rejected") {
    throw new SelectedStoryContentNotFoundError(
      "A human-rejected story cannot be prepared",
    );
  }

  return {
    storyId: story.storyId,
    title: story.title,
    url: story.url,
    ...(story.contentText ? { contentText: story.contentText } : {}),
    contentStatus: story.contentStatus,
  };
}

/** Read the stored RSS/article content for any story in the active topic. */
export async function getStoryContent(
  topicId: string,
  storyId: string,
): Promise<SelectedStoryContentRecord> {
  return getStoryContentRecord(topicId, storyId, false);
}

/**
 * Compatibility helper for flows (such as Creative Studio) that still need a
 * human-approved story. The content route intentionally uses getStoryContent
 * so a Review row can be verified before selection.
 */
export async function getSelectedStoryContent(
  topicId: string,
  storyId: string,
): Promise<SelectedStoryContentRecord> {
  return getStoryContentRecord(topicId, storyId, true);
}

async function getStoryContentRecord(
  topicId: string,
  storyId: string,
  requireApproved: boolean,
): Promise<SelectedStoryContentRecord> {
  const [row] = await db
    .select({
      storyId: stories.id,
      title: stories.title,
      url: stories.originalUrl,
      text: stories.contentText,
      contentStatus: stories.contentStatus,
      reviewDecision: topicStories.reviewDecision,
      enrichmentStatus: storyContentEnrichments.status,
      enrichmentMethod: storyContentEnrichments.method,
      enrichmentText: storyContentEnrichments.contentText,
      enrichmentWordCount: storyContentEnrichments.wordCount,
      resolvedUrl: storyContentEnrichments.resolvedUrl,
      articleTitle: storyContentEnrichments.articleTitle,
      byline: storyContentEnrichments.byline,
      attempts: storyContentEnrichments.attempts,
      error: storyContentEnrichments.error,
      fetchedAt: storyContentEnrichments.fetchedAt,
      updatedAt: storyContentEnrichments.updatedAt,
    })
    .from(topicStories)
    .innerJoin(stories, eq(stories.id, topicStories.storyId))
    .leftJoin(
      storyContentEnrichments,
      eq(storyContentEnrichments.storyId, stories.id),
    )
    .where(
      and(
        eq(topicStories.topicId, topicId),
        eq(topicStories.storyId, storyId),
      ),
    )
    .limit(1);

  if (!row || (requireApproved && row.reviewDecision !== "approved")) {
    throw new SelectedStoryContentNotFoundError(
      requireApproved
        ? "The selected story was not found"
        : "The story was not found",
    );
  }

  const isCurrentArticleContent =
    row.enrichmentStatus === "completed" &&
    Boolean(row.enrichmentText) &&
    row.enrichmentText === row.text;

  return {
    storyId: row.storyId,
    title: row.title,
    url: row.url,
    ...(row.text ? { text: row.text } : {}),
    contentStatus: row.contentStatus,
    source: isCurrentArticleContent ? "article" : "rss",
    ...(row.enrichmentStatus &&
    row.enrichmentMethod &&
    row.attempts !== null &&
    row.updatedAt
      ? {
          enrichment: {
            status: row.enrichmentStatus,
            method: row.enrichmentMethod,
            ...(row.enrichmentWordCount !== null
              ? { wordCount: row.enrichmentWordCount }
              : {}),
            ...(row.resolvedUrl ? { resolvedUrl: row.resolvedUrl } : {}),
            ...(row.articleTitle ? { articleTitle: row.articleTitle } : {}),
            ...(row.byline ? { byline: row.byline } : {}),
            attempts: row.attempts,
            ...(row.error ? { error: row.error } : {}),
            ...(row.fetchedAt ? { fetchedAt: row.fetchedAt } : {}),
            updatedAt: row.updatedAt,
          },
        }
      : {}),
  };
}

export async function beginStoryContentEnrichment(
  storyId: string,
  sourceUrl: string,
  startedAt = new Date(),
): Promise<void> {
  await db
    .insert(storyContentEnrichments)
    .values({
      storyId,
      status: "pending",
      method: "direct",
      sourceUrl,
      attempts: 1,
      startedAt,
      updatedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: storyContentEnrichments.storyId,
      set: {
        status: "pending",
        method: "direct",
        sourceUrl,
        resolvedUrl: null,
        articleTitle: null,
        byline: null,
        contentText: null,
        contentHash: null,
        contentStatus: null,
        wordCount: null,
        attempts: sql`${storyContentEnrichments.attempts} + 1`,
        error: null,
        startedAt,
        fetchedAt: null,
        updatedAt: startedAt,
      },
    });
}

export async function completeStoryContentEnrichment({
  storyId,
  resolvedUrl,
  articleTitle,
  byline,
  contentText,
  contentHash,
  contentStatus,
  method,
  wordCount,
  fetchedAt = new Date(),
}: CompleteStoryContentEnrichmentInput): Promise<void> {
  await db.batch([
    db
      .update(storyContentEnrichments)
      .set({
        status: "completed",
        method,
        resolvedUrl,
        articleTitle: articleTitle ?? null,
        byline: byline ?? null,
        contentText,
        contentHash,
        contentStatus,
        wordCount,
        error: null,
        fetchedAt,
        updatedAt: fetchedAt,
      })
      .where(eq(storyContentEnrichments.storyId, storyId)),
    db
      .update(stories)
      .set({
        contentText,
        contentStatus,
      })
      .where(eq(stories.id, storyId)),
    // Once richer article content is available, only promote the collection
    // workflow state that was waiting specifically for enrichment. It does
    // not override a human selection, rejection, or publication state.
    db
      .update(topicStories)
      .set({ processingStatus: "ready" })
      .where(
        and(
          eq(topicStories.storyId, storyId),
          eq(topicStories.processingStatus, "needs-enrichment"),
        ),
      ),
  ]);
}

export async function failStoryContentEnrichment(
  storyId: string,
  status: Extract<StoryContentEnrichmentStatus, "failed" | "blocked">,
  error: string,
  updatedAt = new Date(),
): Promise<void> {
  await db
    .update(storyContentEnrichments)
    .set({
      status,
      error: error.slice(0, 1_000),
      updatedAt,
    })
    .where(eq(storyContentEnrichments.storyId, storyId));
}
