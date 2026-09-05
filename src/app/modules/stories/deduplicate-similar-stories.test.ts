import assert from "node:assert/strict";
import { test } from "node:test";

import { matchesAnyCoveredStory } from "./deduplicate-similar-stories";

const DAY_MS = 24 * 60 * 60 * 1_000;
const BASE_DATE = new Date("2026-03-01T12:00:00Z");

test("matches a candidate whose title overlaps a covered item within the window", () => {
  const matched = matchesAnyCoveredStory(
    {
      title: "Canada imposes new tariffs on imported steel products",
      publishedAt: new Date(BASE_DATE.getTime() + DAY_MS),
    },
    [
      {
        title: "Canada imposes new tariffs on imported steel",
        publishedAt: BASE_DATE,
      },
    ],
  );

  assert.equal(matched, true);
});

test("does not match unrelated titles", () => {
  const matched = matchesAnyCoveredStory(
    {
      title: "Toronto transit workers announce strike vote",
      publishedAt: BASE_DATE,
    },
    [
      {
        title: "Canada imposes new tariffs on imported steel",
        publishedAt: BASE_DATE,
      },
    ],
  );

  assert.equal(matched, false);
});

test("does not match a similar title outside the comparison window", () => {
  const matched = matchesAnyCoveredStory(
    {
      title: "Canada imposes new tariffs on imported steel",
      publishedAt: new Date(BASE_DATE.getTime() + 30 * DAY_MS),
    },
    [
      {
        title: "Canada imposes new tariffs on imported steel",
        publishedAt: BASE_DATE,
      },
    ],
    { windowDays: 7 },
  );

  assert.equal(matched, false);
});

test("returns false when nothing is covered yet", () => {
  const matched = matchesAnyCoveredStory(
    { title: "Canada imposes new tariffs on imported steel", publishedAt: BASE_DATE },
    [],
  );

  assert.equal(matched, false);
});
