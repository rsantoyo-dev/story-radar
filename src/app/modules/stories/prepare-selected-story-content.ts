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
    const prepared = await fetchPreparedArticle(story.url, story.contentText);

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

async function fetchPreparedArticle(
  sourceUrl: string,
  existingText?: string,
): Promise<{
  extracted: ExtractedArticleContent;
  resolvedUrl: string;
  method: "direct" | "reader";
}> {
  let directError: unknown;

  try {
    const fetched = await fetchArticleHtml(sourceUrl);
    const extracted = extractArticleContent(fetched.html, fetched.resolvedUrl);
    assertContentImproved(existingText, extracted.text);

    return {
      extracted,
      resolvedUrl: fetched.resolvedUrl,
      method: "direct",
    };
  } catch (error) {
    if (!shouldAttemptReaderFallback(error) || !isArticleReaderFallbackEnabled()) {
      throw error;
    }

    directError = error;
  }

  try {
    const reader = await fetchArticleWithReader(sourceUrl);
    const extracted = extractReaderArticleContent({
      markdown: reader.markdown,
      ...(reader.title ? { title: reader.title } : {}),
      ...(reader.description ? { description: reader.description } : {}),
    });
    assertContentImproved(existingText, extracted.text);

    return {
      extracted,
      resolvedUrl: reader.resolvedUrl,
      method: "reader",
    };
  } catch (readerError) {
    throw new ArticleFetchError(
      `Direct extraction failed (${articleErrorSummary(directError)}); Reader fallback failed (${articleErrorSummary(readerError)})`,
      { cause: readerError },
    );
  }
}

/**
 * Reader is a generic publisher fallback. Security-policy failures remain
 * excluded so private, malformed, oversized, or redirect-loop URLs are never
 * handed to a third-party fetcher.
 */
function shouldAttemptReaderFallback(error: unknown): boolean {
  return (
    error instanceof PublisherArticleAccessBlockedError ||
    error instanceof ArticleFetchError ||
    error instanceof ArticleExtractionError
  );
}

function articleErrorSummary(error: unknown): string {
  if (
    error instanceof ArticleAccessBlockedError ||
    error instanceof ArticleFetchError ||
    error instanceof ArticleExtractionError
  ) {
    return error.message.replace(/\s+/g, " ").slice(0, 240);
  }

  return "unknown error";
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
