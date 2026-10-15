import assert from "node:assert/strict";
import test from "node:test";
import {
  formatInsight, insightBreakdown, insightCurve, insightPeriods, insightTrend, insightValue, insightValues, median, medianCurve, timesMedian,
  INSIGHT_CURVE_AGES, type InsightPost,
} from "./instagram-insights.types";

const post = (id: string, publishedAt: string, readings: [number, Record<string, number>][], extra: Partial<InsightPost> = {}): InsightPost => ({
  id, externalId: `x${id}`, permalink: null, caption: null, imageUrl: null, publishedAt, format: "carousel", storyId: null, storyTitle: null,
  latest: readings.at(-1)?.[1] ?? {}, snapshots: readings.map(([ageHours, values]) => ({ ageHours, values })), ...extra,
});

test("a stored metrics record gives the values Instagram returned, and nothing it did not", () => {
  assert.deepEqual(insightValues({ views: { state: "ok", value: 120, unit: "count" }, reach: { state: "error", value: 0 }, saved: { state: "ok", value: 3 }, other: { state: "ok", value: 9 } }), { views: 120, saved: 3 });
  assert.deepEqual(insightValues(null), {});
});

test("a post read at an age: zero at publication, linear between two readings, unknown past its last; a rate needs reach", () => {
  const read = post("1", "2026-10-10T12:00:00Z", [[6, { views: 60, reach: 40, total_interactions: 4 }], [30, { views: 300, reach: 200, total_interactions: 10 }]]);
  assert.equal(insightValue(read, "views", 24), 60 + (300 - 60) * (18 / 24));
  assert.equal(insightValue(read, "views", 72), null, "past its last reading");
  assert.equal(insightValue(read, "views", "latest"), 300);
  assert.equal(insightValue(read, "engagement_rate", "latest"), 10 / 200);
  assert.equal(insightValue(post("2", "2026-10-10T12:00:00Z", [[6, { views: 10, reach: 0, total_interactions: 1 }]]), "engagement_rate", "latest"), null, "no reach, no rate");
  assert.equal(insightValue(post("3", "2026-10-10T12:00:00Z", []), "views", 24), null, "never read");
  assert.deepEqual(insightCurve(read, "views").slice(0, 3), [0, 60, 60 + 240 * (6 / 24)]);
});

test("the typical post's curve, the trend and the breakdowns read the same values", () => {
  const posts = [
    post("a", "2026-10-01T10:00:00Z", [[24, { views: 100 }], [72, { views: 200 }]], { draft2: { sessionId: "s1", leverName: "Deadline" } }),
    post("b", "2026-10-02T10:00:00Z", [[24, { views: 300 }], [72, { views: 400 }]], { draft2: { sessionId: "s2", leverName: "Deadline" } }),
    post("c", "2026-10-03T10:00:00Z", [[24, { views: 50 }]], { draft2: { sessionId: "s3", leverName: "Free" } }),
  ];
  const curve = medianCurve(posts, "views");
  assert.equal(curve[INSIGHT_CURVE_AGES.indexOf(24)], 100, "the median of 100, 300 and 50");
  assert.equal(curve[INSIGHT_CURVE_AGES.indexOf(72)], 300, "only the posts read that far");
  assert.deepEqual(insightTrend(posts, "views", 24, 2).map((point) => [point.post.id, point.value, point.trend]), [["a", 100, 100], ["b", 300, 200], ["c", 50, 175]]);
  assert.deepEqual(insightBreakdown(posts, "views", 24, (entry) => entry.draft2?.leverName), [{ group: "Deadline", median: 200, n: 2, best: 300 }, { group: "Free", median: 50, n: 1, best: 50 }]);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(timesMedian(300, 100), 3);
  assert.equal(timesMedian(300, null), null);
});

test("the period and the one before it, and values as the dashboard shows them", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  const posts = [post("new", "2026-10-10T00:00:00Z", []), post("before", "2026-10-03T00:00:00Z", []), post("old", "2026-09-01T00:00:00Z", [])];
  const { current, previous } = insightPeriods(posts, 7, now);
  assert.deepEqual([current.map((entry) => entry.id), previous.map((entry) => entry.id)], [["new"], ["before"]]);
  assert.equal(insightPeriods(posts, null, now).current.length, 3, "every post without a period");
  assert.equal(formatInsight("views", 1234), "1.2K");
  assert.equal(formatInsight("save_rate", 0.034), "3.4%");
  assert.equal(formatInsight("engagement_rate", 0.25), "25%");
  assert.equal(formatInsight("views", null), "—");
});
