import { normalizeRelevanceText } from "./evaluate-story-relevance";
import type { StoryCandidate } from "./story-candidate.types";

export const DEFAULT_SIMILAR_TITLE_THRESHOLD = 0.78;
export const DEFAULT_SIMILAR_TITLE_WINDOW_DAYS = 7;

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "de",
  "del",
  "el",
  "en",
  "for",
  "from",
  "how",
  "in",
  "is",
  "la",
  "las",
  "los",
  "of",
  "on",
  "para",
  "por",
  "que",
  "the",
  "this",
  "to",
  "un",
  "una",
  "with",
  "y",
]);

const DUPLICATE_ANCHOR_TOKENS = new Set([
  "anthropic",
  "chatgpt",
  "claude",
  "copilot",
  "cursor",
  "deepmind",
  "gemini",
  "grok",
  "groq",
  "llama",
  "mistral",
  "nvidia",
  "openai",
  "openrouter",
  "perplexity",
]);

const DUPLICATE_GENERIC_TOKENS = new Set([
  "ai",
  "announce",
  "introduc",
  "launch",
  "model",
  "new",
  "product",
  "project",
  "release",
  "system",
  "update",
]);

export type SimilarStoryDeduplicationOptions = {
  titleThreshold?: number;
  windowDays?: number;
};

export function deduplicateSimilarStories(
  candidates: readonly StoryCandidate[],
  options: SimilarStoryDeduplicationOptions = {},
): StoryCandidate[] {
  const titleThreshold =
    options.titleThreshold ?? DEFAULT_SIMILAR_TITLE_THRESHOLD;
  const windowDays = options.windowDays ?? DEFAULT_SIMILAR_TITLE_WINDOW_DAYS;
  const groups: Array<{
    item: StoryCandidate;
    members: StoryCandidate[];
  }> = [];

  candidates.forEach((candidate) => {
    const matchingGroups = groups.filter((group) =>
      group.members.some((member) =>
        areStoriesSimilar(candidate, member, titleThreshold, windowDays),
      ),
    );

    if (matchingGroups.length === 0) {
      groups.push({ item: candidate, members: [candidate] });
      return;
    }

    const [primaryGroup, ...additionalGroups] = matchingGroups;

    primaryGroup.item = selectPreferredStory(primaryGroup.item, candidate);
    primaryGroup.members.push(candidate);

    additionalGroups.forEach((group) => {
      primaryGroup.item = selectPreferredStory(primaryGroup.item, group.item);
      primaryGroup.members.push(...group.members);
      groups.splice(groups.indexOf(group), 1);
    });
  });

  return groups.map((group) => group.item);
}

export function calculateTitleSimilarity(
  leftTitle: string,
  rightTitle: string,
): number {
  const leftNormalized = normalizeRelevanceText(leftTitle);
  const rightNormalized = normalizeRelevanceText(rightTitle);

  if (!leftNormalized || !rightNormalized) {
    return 0;
  }

  if (leftNormalized === rightNormalized) {
    return 1;
  }

  const leftTokens = tokenizeTitle(leftNormalized);
  const rightTokens = tokenizeTitle(rightNormalized);

  if (Math.min(leftTokens.size, rightTokens.size) < 4) {
    return 0;
  }

  const intersectionSize = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const unionSize = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = intersectionSize / unionSize;
  const containment =
    intersectionSize / Math.min(leftTokens.size, rightTokens.size);
  const sharesAnchor = [...leftTokens].some(
    (token) => DUPLICATE_ANCHOR_TOKENS.has(token) && rightTokens.has(token),
  );
  const sharesSpecificTopic = [...leftTokens].some(
    (token) =>
      rightTokens.has(token) &&
      !DUPLICATE_ANCHOR_TOKENS.has(token) &&
      !DUPLICATE_GENERIC_TOKENS.has(token),
  );

  if (
    sharesAnchor &&
    sharesSpecificTopic &&
    intersectionSize >= 2 &&
    containment >= 0.25
  ) {
    return Math.max(jaccard, 0.8);
  }

  return Math.max(jaccard, containment >= 0.86 ? containment : 0);
}

function areStoriesSimilar(
  left: StoryCandidate,
  right: StoryCandidate,
  titleThreshold: number,
  windowDays: number,
): boolean {
  if (!areWithinWindow(left, right, windowDays)) {
    return false;
  }

  return calculateTitleSimilarity(left.title, right.title) >= titleThreshold;
}

function areWithinWindow(
  left: StoryCandidate,
  right: StoryCandidate,
  windowDays: number,
): boolean {
  const leftDate = left.publishedAt ?? left.fetchedAt;
  const rightDate = right.publishedAt ?? right.fetchedAt;
  const difference = Math.abs(leftDate.getTime() - rightDate.getTime());

  return difference <= windowDays * 24 * 60 * 60 * 1_000;
}

function tokenizeTitle(normalizedTitle: string): Set<string> {
  return new Set(
    normalizedTitle
      .split(" ")
      .filter((token) => token.length >= 2 && !TITLE_STOP_WORDS.has(token))
      .map(stemToken),
  );
}

function stemToken(value: string): string {
  if (value.length > 6 && value.endsWith("ing")) {
    return value.slice(0, -3);
  }

  if (value.length > 5 && value.endsWith("ed")) {
    return value.slice(0, -2);
  }

  if (value.length > 5 && value.endsWith("es")) {
    return value.slice(0, -2);
  }

  if (value.length > 4 && value.endsWith("s")) {
    return value.slice(0, -1);
  }

  return value;
}

function selectPreferredStory(
  left: StoryCandidate,
  right: StoryCandidate,
): StoryCandidate {
  const preferred = getStoryQuality(right) > getStoryQuality(left) ? right : left;
  const publishedAt = selectEarliestDate(left.publishedAt, right.publishedAt);

  return {
    ...preferred,
    tags: [...new Set([...left.tags, ...right.tags])],
    ...(publishedAt ? { publishedAt } : {}),
    fetchedAt: new Date(
      Math.max(left.fetchedAt.getTime(), right.fetchedAt.getTime()),
    ),
  };
}

function getStoryQuality(candidate: StoryCandidate): number {
  const contentWeight = {
    missing: 0,
    excerpt: 1,
    "likely-full": 2,
    full: 3,
  }[candidate.content.status];

  return (
    contentWeight * 1_000_000_000 +
    Math.min(candidate.content.text?.length ?? 0, 100_000) * 1_000 +
    candidate.relevance.score
  );
}

function selectEarliestDate(
  left: Date | undefined,
  right: Date | undefined,
): Date | undefined {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return left.getTime() <= right.getTime() ? left : right;
}
