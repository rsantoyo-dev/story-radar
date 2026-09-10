import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ageInHours,
  bucketiseSourceHealth,
  DEFAULT_OVERVIEW_PERIOD,
  metricValue,
  parseOverviewPeriod,
  resolveOverviewPeriod,
  resolveScoreState,
} from "./topic-overview.logic";

test("parseOverviewPeriod accepts the allowed windows and falls back otherwise", () => {
  assert.equal(parseOverviewPeriod("7"), 7);
  assert.equal(parseOverviewPeriod("30"), 30);
  assert.equal(parseOverviewPeriod(90), 90);
  assert.equal(parseOverviewPeriod("45"), DEFAULT_OVERVIEW_PERIOD);
  assert.equal(parseOverviewPeriod(null), DEFAULT_OVERVIEW_PERIOD);
  assert.equal(parseOverviewPeriod("not-a-number"), DEFAULT_OVERVIEW_PERIOD);
});

test("resolveOverviewPeriod returns a half-open interval ending at now", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const { days, since, until } = resolveOverviewPeriod(30, now);

  assert.equal(days, 30);
  assert.equal(until.toISOString(), now.toISOString());
  assert.equal(since.toISOString(), "2026-08-11T12:00:00.000Z");
  assert.equal(until.getTime() - since.getTime(), 30 * 24 * 60 * 60 * 1000);
});

test("resolveScoreState distinguishes unevaluated, stale, and current", () => {
  const evaluatedAt = new Date("2026-09-01T00:00:00.000Z");

  assert.equal(resolveScoreState(null, new Date()), "unevaluated");
  assert.equal(
    resolveScoreState(evaluatedAt, new Date("2026-09-05T00:00:00.000Z")),
    "stale",
  );
  assert.equal(
    resolveScoreState(evaluatedAt, new Date("2026-08-20T00:00:00.000Z")),
    "current",
  );
  assert.equal(resolveScoreState(evaluatedAt, null), "current");
});

test("ageInHours floors and never goes negative", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  assert.equal(ageInHours(new Date("2026-09-10T09:30:00.000Z"), now), 2);
  assert.equal(ageInHours(new Date("2026-09-10T13:00:00.000Z"), now), 0);
});

test("bucketiseSourceHealth keeps buckets disjoint and reports failures separately", () => {
  assert.deepEqual(bucketiseSourceHealth({ configured: 5, enabled: 3 }, 4), {
    enabled: 3,
    disabledOrUnknown: 2,
    lastFailedSources: 4,
  });

  // A never-run topic has no failed-source figure at all.
  assert.deepEqual(bucketiseSourceHealth({ configured: 2, enabled: 2 }, null), {
    enabled: 2,
    disabledOrUnknown: 0,
    lastFailedSources: null,
  });

  // `configured` is treated as at least `enabled` even if the inputs disagree.
  assert.deepEqual(bucketiseSourceHealth({ configured: 0, enabled: 3 }, -1), {
    enabled: 3,
    disabledOrUnknown: 0,
    lastFailedSources: 0,
  });
});

test("metricValue only passes through finite numbers", () => {
  assert.equal(metricValue(0), 0);
  assert.equal(metricValue(12), 12);
  assert.equal(metricValue(null), null);
  assert.equal(metricValue(undefined), null);
  assert.equal(metricValue(Number.NaN), null);
});
