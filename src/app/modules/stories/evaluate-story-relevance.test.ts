import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateStoryRelevance,
  getSourcePriorityBonus,
} from "./evaluate-story-relevance";

const EMPTY_PREFERENCES = {
  favoredTerms: [],
  unfavoredTerms: [],
};

test("uses topic source priority as a bounded candidacy signal", () => {
  const candidate = {
    externalId: "statcan-payroll-june-2026",
    sourceId: "statcan",
    sourceName: "Statistics Canada",
    sourcePriority: 50,
    title: "Payroll employment, earnings and hours, and job vacancies, June 2026",
    url: "https://www.statcan.gc.ca/example",
    content: {
      text: "Official monthly payroll employment estimates.",
      status: "excerpt" as const,
    },
    language: "en",
    region: "ca",
    tags: [],
    publishedAt: new Date("2026-08-27T12:30:00.000Z"),
    fetchedAt: new Date("2026-08-30T18:00:00.000Z"),
  };

  const result = evaluateStoryRelevance(
    candidate,
    new Date("2026-08-30T18:00:00.000Z"),
    EMPTY_PREFERENCES,
  );

  assert.equal(result.relevance.score, 28);
  assert.equal(result.relevance.decision, "new");
  assert.deepEqual(result.relevance.reasons, [
    "base: +8",
    "source priority 50: +20",
  ]);
});

test("clamps malformed source priority before calculating its bonus", () => {
  assert.equal(getSourcePriorityBonus({ sourcePriority: -10 }), 0);
  assert.equal(getSourcePriorityBonus({ sourcePriority: 150 }), 40);
  assert.equal(getSourcePriorityBonus({}), 0);
});
