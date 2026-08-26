import "server-only";

import { createHash } from "node:crypto";

import {
  ArticleExtractionError,
  ArticlePaywallError,
  extractArticleContent,
  extractReaderArticleContent,
  type ExtractedArticleContent,
} from "./extract-article-content";
import {
  fetchArticleWithReader,
  isArticleReaderFallbackEnabled,
} from "./fetch-article-with-reader";
import {
  ArticleAccessBlockedError,
  ArticleFetchError,
  fetchArticleHtml,
  PublisherArticleAccessBlockedError,
} from "./fetch-article-html";
import {
  beginStoryContentEnrichment,
  completeStoryContentEnrichment,
  failStoryContentEnrichment,
  findStoryForEnrichment,
  getStoryContent,
  type SelectedStoryContentRecord,
} from "./story-content.repository";

export type PrepareSelectedStoryContentResult = SelectedStoryContentRecord & {
  outcome: "prepared" | "already-ready";
};

export class StoryContentPreparationBlockedError extends Error {}
export class StoryContentPreparationFailedError extends Error {}

/**
 * Prepares a collected or selected story. A complete article gives the
 * evaluator better evidence before a human decides whether to select it.
 */
export async function prepareStoryContent(
  topicId: string,
  storyId: string,
): Promise<PrepareSelectedStoryContentResult> {
  const story = await findStoryForEnrichment(topicId, storyId);

  if (story.contentStatus === "full" && story.contentText) {
    return {
      ...(await getStoryContent(topicId, storyId)),
      outcome: "already-ready",
    };
  }

  await beginStoryContentEnrichment(story.storyId, story.url);

  try {
    const prepared = await fetchPreparedArticle(story.url);

    assertContentImproved(story.contentText, prepared.extracted.text);

    await completeStoryContentEnrichment({
      storyId: story.storyId,
      resolvedUrl: prepared.resolvedUrl,
      ...(prepared.extracted.title
        ? { articleTitle: prepared.extracted.title }
        : {}),
      ...(prepared.extracted.byline
        ? { byline: prepared.extracted.byline }
        : {}),
      contentText: prepared.extracted.text,
      contentHash: createHash("sha256")
        .update(prepared.extracted.text)
        .digest("hex"),
      contentStatus: prepared.extracted.status,
      method: prepared.method,
      wordCount: prepared.extracted.wordCount,
    });

    return {
      ...(await getStoryContent(topicId, storyId)),
      outcome: "prepared",
    };
  } catch (error) {
    const blocked =
      error instanceof ArticleAccessBlockedError ||
      error instanceof ArticlePaywallError;
    const message = getPreparationErrorMessage(error);

    await failStoryContentEnrichment(
      story.storyId,
      blocked ? "blocked" : "failed",
      message,
    );

    if (blocked) {
      throw new StoryContentPreparationBlockedError(message, { cause: error });
    }

    throw new StoryContentPreparationFailedError(message, { cause: error });
  }
}

/** @deprecated Prefer prepareStoryContent; retained for internal callers. */
export const prepareSelectedStoryContent = prepareStoryContent;

async function fetchPreparedArticle(sourceUrl: string): Promise<{
  extracted: ExtractedArticleContent;
  resolvedUrl: string;
  method: "direct" | "reader";
}> {
  try {
    const fetched = await fetchArticleHtml(sourceUrl);

    return {
      extracted: extractArticleContent(fetched.html, fetched.resolvedUrl),
      resolvedUrl: fetched.resolvedUrl,
      method: "direct",
    };
  } catch (error) {
    if (
      !(error instanceof PublisherArticleAccessBlockedError) ||
      !isArticleReaderFallbackEnabled()
    ) {
      throw error;
    }

    const reader = await fetchArticleWithReader(sourceUrl);

    return {
      extracted: extractReaderArticleContent({
        markdown: reader.markdown,
        ...(reader.title ? { title: reader.title } : {}),
        ...(reader.description ? { description: reader.description } : {}),
      }),
      resolvedUrl: reader.resolvedUrl,
      method: "reader",
    };
  }
}

function assertContentImproved(
  existingText: string | undefined,
  extractedText: string,
): void {
  const existingLength = existingText?.trim().length ?? 0;

  if (existingLength === 0) {
    return;
  }

  const minimumImprovedLength = Math.ceil(existingLength * 1.1) + 100;

  if (extractedText.length < minimumImprovedLength) {
    throw new ArticleExtractionError(
      "The article page did not provide meaningfully more text than the RSS feed",
    );
  }
}

function getPreparationErrorMessage(error: unknown): string {
  if (
    error instanceof ArticleAccessBlockedError ||
    error instanceof ArticleFetchError ||
    error instanceof ArticleExtractionError
  ) {
    return error.message;
  }

  return "The article content could not be prepared";
}
