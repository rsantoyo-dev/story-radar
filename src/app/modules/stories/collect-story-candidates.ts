import "server-only";

import { fetchRssFeed } from "@/app/modules/sources/rss/fetch-rss-feed";
import { fetchRssFeedsWithHostLimit } from "@/app/modules/sources/rss/fetch-rss-feeds-with-host-limit";
import { rssSources } from "@/app/modules/sources/rss/rss-sources.config";
import type { ContentStatus } from "@/app/modules/sources/rss/rss-feed.types";
import type { RssSourceConfig } from "@/app/modules/sources/rss/rss-source.types";
import {
  collectAiResearchCandidates,
  type CollectAiResearchCandidatesOptions,
} from "@/app/modules/sources/ai-research/collect-ai-research-candidates";

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
  /** Optional web-grounded collector run in parallel with RSS feeds. */
  aiResearch?: Omit<CollectAiResearchCandidatesOptions, "now" | "lookbackHours">;
};

export async function collectStoryCandidates(
  options: CollectStoryCandidatesOptions = {},
): Promise<StoryRadarResult> {
  const generatedAt = options.now ?? new Date();
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_STORY_MAX_AGE_HOURS;
  const configuredSources = options.sources ?? rssSources;
  const fetchFeed = options.fetchFeed ?? fetchRssFeed;
  const activeSources = configuredSources.filter((source) => source.enabled);
  const aiResearch = options.aiResearch?.config.enabled
    ? options.aiResearch
    : undefined;
  const oldestPublishedAt = new Date(
    generatedAt.getTime() - maxAgeHours * 60 * 60 * 1_000,
  );

  const [preferences, results, aiResearchResult] = await Promise.all([
    Promise.resolve(
      options.preferences ?? DEFAULT_STORY_KEYWORD_PREFERENCES,
    ),
    fetchRssFeedsWithHostLimit(activeSources, fetchFeed),
    aiResearch
      ? collectAiResearchCandidates({
          ...aiResearch,
          now: generatedAt,
          ...(options.maxAgeHours !== undefined
            ? { lookbackHours: options.maxAgeHours }
            : {}),
        }).then(
          (value) => ({ status: "fulfilled", value }) as const,
          (reason) => ({ status: "rejected", reason }) as const,
        )
      : Promise.resolve(undefined),
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

  if (aiResearchResult) {
    const sourceId = aiResearchResult.status === "fulfilled"
      ? aiResearchResult.value.sourceId
      : `ai-research:${aiResearch!.config.topicId}`;
    const sourceName = aiResearchResult.status === "fulfilled"
      ? aiResearchResult.value.sourceName
      : "AI research";

    if (aiResearchResult.status === "rejected") {
      console.error("Failed to collect AI research source", aiResearchResult.reason);
      sourceDetails.push({
        sourceId,
        sourceName,
        status: "failed",
        fetchedItems: 0,
        includedItems: 0,
        filteredOutItems: 0,
        duplicatesRemoved: 0,
        error: getErrorMessage(aiResearchResult.reason),
      });
    } else {
      const research = aiResearchResult.value;
      candidates.push(...research.items);
      sourceDetails.push({
        sourceId: research.sourceId,
        sourceName: research.sourceName,
        status: "successful",
        fetchedItems: research.fetchedItems,
        includedItems: 0,
        filteredOutItems: research.filteredOutItems,
        duplicatesRemoved: 0,
      });
      fetchedItems += research.fetchedItems;
      successful += 1;
    }
  }

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
      requested: activeSources.length + (aiResearch ? 1 : 0),
      successful,
      failed: activeSources.length + (aiResearch ? 1 : 0) - successful,
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
