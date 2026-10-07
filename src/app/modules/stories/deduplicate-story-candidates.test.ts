import assert from "node:assert/strict";
import test from "node:test";

import { deduplicateSimilarStories } from "./deduplicate-similar-stories";
import { deduplicateStoryCandidates } from "./deduplicate-story-candidates";
import type { StoryCandidate } from "./story-candidate.types";

const fetchedAt = new Date("2026-10-01T12:00:00Z");

function candidate(overrides: Partial<StoryCandidate>): StoryCandidate {
  return {
    externalId: "item-1",
    sourceId: "feed-a",
    sourceName: "Feed A",
    title: "City council approves new transit line",
    url: "https://news.example/transit",
    content: { status: "excerpt", text: "Short excerpt" },
    language: "en",
    region: "ca",
    tags: [],
    fetchedAt,
    relevance: { score: 70, decision: "ready", reasons: [] },
    ...overrides,
  };
}

test("an exact duplicate keeps the losing source's provenance on the winner", () => {
  const [merged, ...rest] = deduplicateStoryCandidates([
    candidate({}),
    candidate({
      sourceId: "feed-b",
      sourceName: "Feed B",
      externalId: "b-77",
      url: "https://news.example/transit?utm_source=rss",
      content: { status: "full", text: "The complete article text, much longer than the excerpt." },
      research: { score: 80, reasons: ["Local impact"] },
    }),
  ]);

  assert.equal(rest.length, 0);
  // Feed B wins on content quality; Feed A is kept as a merged contribution.
  assert.equal(merged.sourceId, "feed-b");
  assert.deepEqual(merged.mergedContributions, [
    {
      sourceId: "feed-a",
      sourceName: "Feed A",
      externalId: "item-1",
      url: "https://news.example/transit",
      fetchedAt,
    },
  ]);
});

test("a chain of duplicates keeps every source once and never lists the winner", () => {
  const [merged] = deduplicateStoryCandidates([
    candidate({}),
    candidate({ sourceId: "feed-b", sourceName: "Feed B", externalId: "b-1" }),
    candidate({ sourceId: "feed-c", sourceName: "Feed C", externalId: "c-1" }),
    // The same feed item seen twice is one contribution, not a merge.
    candidate({}),
  ]);

  assert.equal(merged.sourceId, "feed-a");
  assert.deepEqual(
    merged.mergedContributions?.map((ref) => `${ref.sourceId}:${ref.externalId}`),
    ["feed-b:b-1", "feed-c:c-1"],
  );
});

test("a candidate with no duplicate carries no merged contributions", () => {
  const [single] = deduplicateStoryCandidates([candidate({})]);
  assert.equal(single.mergedContributions, undefined);
});

test("merging two groups through a shared key keeps both groups' sources", () => {
  const [merged, ...rest] = deduplicateStoryCandidates([
    candidate({ url: "https://news.example/one" }),
    candidate({ sourceId: "feed-b", sourceName: "Feed B", externalId: "b-1", url: "https://news.example/two" }),
    // Same feed item as the first (external key) and same URL as the second.
    candidate({ url: "https://news.example/two" }),
  ]);

  assert.equal(rest.length, 0);
  assert.deepEqual(
    [merged.sourceId, ...(merged.mergedContributions ?? []).map((ref) => ref.sourceId)].sort(),
    ["feed-a", "feed-b"],
  );
});

test("near-duplicate titles also keep the absorbed story's provenance", () => {
  const items = deduplicateSimilarStories([
    candidate({}),
    candidate({
      sourceId: "feed-b",
      sourceName: "Feed B",
      externalId: "b-9",
      url: "https://other.example/council-transit",
      title: "City council approves the new transit line",
    }),
  ]);

  assert.equal(items.length, 1);
  const [kept] = items;
  const sources = [kept.sourceId, ...(kept.mergedContributions ?? []).map((ref) => ref.sourceId)].sort();
  assert.deepEqual(sources, ["feed-a", "feed-b"]);
});
