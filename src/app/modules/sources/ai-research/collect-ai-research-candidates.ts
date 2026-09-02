import "server-only";

import { createHash } from "node:crypto";

import type { StoryCandidateInput } from "@/app/modules/stories/story-candidate.types";
import { canonicalizeStoryUrl } from "@/app/modules/stories/deduplicate-story-candidates";
import type { EditorialProfile } from "@/app/modules/stories/editorial-profile.types";

import type { AiResearchSourceConfig } from "./ai-research.types";
import {
  discoverAiResearchStories,
  type AiResearchDiscovery,
} from "./openai-ai-research";

export const AI_RESEARCH_SOURCE_PREFIX = "ai-research";

export type AiResearchCollectionResult = {
  sourceId: string;
  sourceName: string;
  fetchedItems: number;
  filteredOutItems: number;
  items: StoryCandidateInput[];
};

export type CollectAiResearchCandidatesOptions = {
  config: AiResearchSourceConfig;
  profile: EditorialProfile;
  now?: Date;
  lookbackHours?: number;
  discover?: (
    input: Parameters<typeof discoverAiResearchStories>[0],
  ) => Promise<AiResearchDiscovery[]>;
};

export async function collectAiResearchCandidates({
  config,
  profile,
  now = new Date(),
  lookbackHours,
  discover = discoverAiResearchStories,
}: CollectAiResearchCandidatesOptions): Promise<AiResearchCollectionResult> {
  const sourceId = aiResearchSourceId(config.topicId);
  const sourceName = "AI research";
  const effectiveLookbackHours = lookbackHours ?? config.lookbackHours;
  const from = new Date(now.getTime() - effectiveLookbackHours * 60 * 60 * 1_000);
  const discoveries = await discover({
    config,
    profile,
    from,
    to: now,
  });
  const items = discoveries
    .filter((discovery) => isInsideWindow(discovery.publishedAt, from, now))
    .map((discovery) => toStoryCandidate(discovery, config, sourceId, now));

  return {
    sourceId,
    sourceName,
    fetchedItems: discoveries.length,
    filteredOutItems: discoveries.length - items.length,
    items,
  };
}

export function aiResearchSourceId(topicId: string): string {
  return `${AI_RESEARCH_SOURCE_PREFIX}:${topicId}`;
}

function isInsideWindow(value: Date, from: Date, to: Date): boolean {
  return value.getTime() >= from.getTime() && value.getTime() <= to.getTime();
}

function toStoryCandidate(
  discovery: AiResearchDiscovery,
  config: AiResearchSourceConfig,
  sourceId: string,
  fetchedAt: Date,
): StoryCandidateInput {
  const url = canonicalizeStoryUrl(discovery.url);

  return {
    externalId: createHash("sha256").update(url).digest("hex"),
    sourceId,
    sourceName: `AI research · ${publisherName(url)}`,
    sourcePriority: config.priority,
    title: discovery.title,
    url,
    content: {
      ...(config.includeContent && discovery.summary
        ? { text: discovery.summary }
        : {}),
      status:
        config.includeContent && discovery.summary ? "excerpt" : "missing",
    },
    language: config.language,
    region: config.region,
    tags: ["ai-research", config.orientation],
    publishedAt: discovery.publishedAt,
    fetchedAt,
    research: {
      score: discovery.researchScore,
      reasons: discovery.scoreReasons,
    },
  };
}

function publisherName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}
