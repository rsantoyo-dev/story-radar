import type { StoryCandidate } from "./story-candidate.types";

const TRACKING_QUERY_PARAMETERS = new Set([
  "_hsenc",
  "_hsmi",
  "dclid",
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
]);

type CandidateGroup = {
  item: StoryCandidate;
  keys: Set<string>;
};

export function deduplicateStoryCandidates(
  candidates: readonly StoryCandidate[],
): StoryCandidate[] {
  const groups = new Set<CandidateGroup>();
  const groupsByKey = new Map<string, CandidateGroup>();

  candidates.forEach((candidate) => {
    const keys = getCandidateKeys(candidate);
    const matchingGroups = new Set(
      keys.flatMap((key) => {
        const group = groupsByKey.get(key);

        return group ? [group] : [];
      }),
    );

    if (matchingGroups.size === 0) {
      const group: CandidateGroup = {
        item: candidate,
        keys: new Set(keys),
      };

      groups.add(group);
      keys.forEach((key) => groupsByKey.set(key, group));
      return;
    }

    const [primaryGroup, ...additionalGroups] = matchingGroups;

    primaryGroup.item = selectPreferredCandidate(primaryGroup.item, candidate);

    additionalGroups.forEach((group) => {
      primaryGroup.item = selectPreferredCandidate(primaryGroup.item, group.item);

      group.keys.forEach((key) => {
        primaryGroup.keys.add(key);
        groupsByKey.set(key, primaryGroup);
      });

      groups.delete(group);
    });

    keys.forEach((key) => {
      primaryGroup.keys.add(key);
      groupsByKey.set(key, primaryGroup);
    });
  });

  return [...groups].map((group) => group.item);
}

export function canonicalizeStoryUrl(value: string): string {
  const normalizedValue = value.trim();

  try {
    const url = new URL(normalizedValue);

    url.hash = "";

    [...url.searchParams.keys()].forEach((parameter) => {
      const normalizedParameter = parameter.toLowerCase();

      if (
        normalizedParameter.startsWith("utm_") ||
        TRACKING_QUERY_PARAMETERS.has(normalizedParameter)
      ) {
        url.searchParams.delete(parameter);
      }
    });

    url.searchParams.sort();

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return normalizedValue;
  }
}

function getCandidateKeys(candidate: StoryCandidate): string[] {
  return [
    `external:${candidate.sourceId}:${candidate.externalId.trim()}`,
    `url:${canonicalizeStoryUrl(candidate.url)}`,
  ];
}

function selectPreferredCandidate(
  left: StoryCandidate,
  right: StoryCandidate,
): StoryCandidate {
  const preferred =
    getContentQuality(right) > getContentQuality(left) ? right : left;
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

function getContentQuality(candidate: StoryCandidate): number {
  const statusWeight = {
    missing: 0,
    excerpt: 1,
    "likely-full": 2,
    full: 3,
  }[candidate.content.status];

  return statusWeight * 1_000_000 + (candidate.content.text?.length ?? 0);
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
