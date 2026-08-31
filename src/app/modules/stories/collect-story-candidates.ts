import "server-only";

import { fetchRssFeed } from "@/app/modules/sources/rss/fetch-rss-feed";
import { fetchRssFeedsWithHostLimit } from "@/app/modules/sources/rss/fetch-rss-feeds-with-host-limit";
import { rssSources } from "@/app/modules/sources/rss/rss-sources.config";
import type { ContentStatus } from "@/app/modules/sources/rss/rss-feed.types";
import type { RssSourceConfig } from "@/app/modules/sources/rss/rss-source.types";

import { deduplicateSimilarStories } from "./deduplicate-similar-stories";
import { deduplicateStoryCandidates } from "./deduplicate-story-candidates";
import { evaluateStoryRelevance } from "./evaluate-story-relevance";
import {
  DEFAULT_STORY_KEYWORD_PREFERENCES,
  type StoryKeywordPreferences,
} from "./story-relevance.config";
import type {
  StoryCandidate,
  StoryCandidateInput,
  StoryContentStatus,
  StoryRadarResult,
  StorySourceCollectionResult,
} from "./story-candidate.types";

export const DEFAULT_STORY_MAX_AGE_HOURS = 72;

type FetchRssFeed = typeof fetchRssFeed;

export type CollectStoryCandidatesOptions = {
  now?: Date;
  maxAgeHours?: number;
  sources?: readonly RssSourceConfig[];
  fetchFeed?: FetchRssFeed;
  preferences?: StoryKeywordPreferences;
};

export async function collectStoryCandidates(
  options: CollectStoryCandidatesOptions = {},
): Promise<StoryRadarResult> {
  const generatedAt = options.now ?? new Date();
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_STORY_MAX_AGE_HOURS;
  const configuredSources = options.sources ?? rssSources;
  const fetchFeed = options.fetchFeed ?? fetchRssFeed;
  const activeSources = configuredSources.filter((source) => source.enabled);
  const oldestPublishedAt = new Date(
    generatedAt.getTime() - maxAgeHours * 60 * 60 * 1_000,
  );

  const [preferences, results] = await Promise.all([
    Promise.resolve(
      options.preferences ?? DEFAULT_STORY_KEYWORD_PREFERENCES,
    ),
    fetchRssFeedsWithHostLimit(activeSources, fetchFeed),
  ]);

  const candidates: StoryCandidateInput[] = [];
  const sourceDetails: StorySourceCollectionResult[] = [];
  let fetchedItems = 0;
  let successful = 0;

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const source = activeSources[index];

      console.error(
        `Failed to collect RSS source "${source.id}"`,
        result.reason,
      );

      sourceDetails.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "failed",
        fetchedItems: 0,
        includedItems: 0,
        filteredOutItems: 0,
        duplicatesRemoved: 0,
        error: getErrorMessage(result.reason),
      });
      return;
    }

    successful += 1;

    const { source, feed } = result.value;
    const candidatesBeforeSource = candidates.length;

    fetchedItems += feed.items.length;

    feed.items.forEach((item) => {
      if (
        item.publishedAt &&
        item.publishedAt.getTime() < oldestPublishedAt.getTime()
      ) {
        return;
      }

      candidates.push({
        externalId: item.externalId,
        sourceId: source.id,
        sourceName: source.name,
        ...(source.priority !== undefined
          ? { sourcePriority: source.priority }
          : {}),
        title: item.title,
        url: item.url,
        content: {
          ...(item.content.text ? { text: item.content.text } : {}),
          status: toStoryContentStatus(item.content.status),
        },
        language: source.language,
        region: source.region,
        tags: [...source.tags],
        ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
        fetchedAt: feed.fetchedAt,
      });
    });

    const eligibleItems = candidates.length - candidatesBeforeSource;

    sourceDetails.push({
      sourceId: source.id,
      sourceName: source.name,
      status: "successful",
      fetchedItems: feed.items.length,
      includedItems: 0,
      filteredOutItems: feed.items.length - eligibleItems,
      duplicatesRemoved: 0,
    });
  });

  const evaluatedCandidates = candidates.map((candidate) =>
    evaluateStoryRelevance(candidate, generatedAt, preferences),
  );
  const exactItems = deduplicateStoryCandidates(evaluatedCandidates);
  const items = deduplicateSimilarStories(exactItems);
  const includedItemsBySource = countItemsBySource(items);
  const finalizedSourceDetails = sourceDetails.map((detail) => {
    if (detail.status === "failed") {
      return detail;
    }

    const eligibleItems = detail.fetchedItems - detail.filteredOutItems;
    const includedItems = includedItemsBySource.get(detail.sourceId) ?? 0;

    return {
      ...detail,
      includedItems,
      duplicatesRemoved: eligibleItems - includedItems,
    };
  });

  items.sort(compareStoryCandidates);

  return {
    generatedAt,
    sources: {
      requested: activeSources.length,
      successful,
      failed: activeSources.length - successful,
      details: finalizedSourceDetails,
    },
    counts: {
      fetched: fetchedItems,
      included: items.length,
      filteredOut: fetchedItems - candidates.length,
      duplicatesRemoved: candidates.length - items.length,
      exactDuplicatesRemoved: candidates.length - exactItems.length,
      similarDuplicatesRemoved: exactItems.length - items.length,
      relevance: countItemsByRelevance(items),
    },
    items,
  };
}

function countItemsByRelevance(items: readonly StoryCandidate[]) {
  const counts = {
    ready: 0,
    needsEnrichment: 0,
    review: 0,
    rejected: 0,
  };

  items.forEach((item) => {
    switch (item.relevance.decision) {
      case "ready":
        counts.ready += 1;
        break;
      case "needs-enrichment":
        counts.needsEnrichment += 1;
        break;
      case "new":
        counts.review += 1;
        break;
      case "rejected":
        counts.rejected += 1;
        break;
    }
  });

  return counts;
}

function countItemsBySource(
  items: readonly StoryCandidate[],
): Map<string, number> {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1);
  });

  return counts;
}

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Unknown RSS fetch error";
}

function toStoryContentStatus(status: ContentStatus): StoryContentStatus {
  return status === "unavailable" ? "missing" : status;
}

function compareStoryCandidates(
  left: StoryCandidate,
  right: StoryCandidate,
): number {
  const leftTime = left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightTime = right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.externalId.localeCompare(right.externalId);
}
