import assert from "node:assert/strict";
import test from "node:test";

import { isAutoCollectionDue, isWithinActiveWindow, localHour, nextAutoCollectionRun, scoopDecision } from "./auto-collection.policy";

// 2026-09-30 14:00 UTC is 10:00 in Toronto (EDT, UTC−4).
const now = new Date("2026-09-30T14:00:00Z");
const thresholds = { scoopMinGrowth: 85, scoopMinEditorial: 80, scoopMaxAgeHours: 6 };

test("the active window uses the Topic's wall clock, including windows across midnight", () => {
  assert.equal(localHour(now, "America/Toronto"), 10);
  assert.equal(isWithinActiveWindow(now, "America/Toronto", 6, 22), true);
  assert.equal(isWithinActiveWindow(now, "America/Toronto", 12, 22), false);
  assert.equal(isWithinActiveWindow(new Date("2026-09-30T06:00:00Z"), "America/Toronto", 22, 6), true, "02:00 is inside 22 → 6");
  assert.equal(isWithinActiveWindow(now, "America/Toronto", 22, 6), false);
  assert.equal(isWithinActiveWindow(now, "Not/AZone", 13, 15), true, "an invalid zone falls back to UTC (14:00)");
});

test("a run is due only when enabled, inside the window and past its next run time", () => {
  const schedule = { enabled: true, intervalHours: 4, timezone: "America/Toronto", activeFromHour: 6, activeToHour: 22, nextRunAt: null };
  assert.equal(isAutoCollectionDue(schedule, now), true);
  assert.equal(isAutoCollectionDue({ ...schedule, enabled: false }, now), false);
  assert.equal(isAutoCollectionDue({ ...schedule, nextRunAt: new Date("2026-09-30T15:00:00Z") }, now), false);
  assert.equal(isAutoCollectionDue({ ...schedule, activeFromHour: 18 }, now), false);
  assert.equal(nextAutoCollectionRun(now, 4).toISOString(), "2026-09-30T18:00:00.000Z");
  assert.equal(nextAutoCollectionRun(now, 99).toISOString(), "2026-10-01T14:00:00.000Z", "capped at 24 h");
});

test("a scoop needs strong growth, editorial value and freshness together, with each reason recorded", () => {
  const fresh = { growthScore: 91, editorialScore: 84, publishedAt: new Date("2026-09-30T11:00:00Z"), firstSeenAt: null };
  const decision = scoopDecision(fresh, thresholds, now);
  assert.equal(decision.qualifies, true);
  assert.deepEqual(decision.reasons, ["Growth 91 ≥ 85", "Editorial 84 ≥ 80", "Published 3 h ago (≤ 6 h)"]);
  assert.equal(scoopDecision({ ...fresh, growthScore: 70 }, thresholds, now).qualifies, false);
  assert.equal(scoopDecision({ ...fresh, editorialScore: 60 }, thresholds, now).qualifies, false);
  assert.equal(scoopDecision({ ...fresh, publishedAt: new Date("2026-09-29T14:00:00Z") }, thresholds, now).qualifies, false, "a day-old story is not a scoop");
});

test("an unscored growth signal or an undated story never qualifies", () => {
  assert.equal(scoopDecision({ growthScore: null, editorialScore: 99, publishedAt: now, firstSeenAt: null }, thresholds, now).qualifies, false);
  assert.equal(scoopDecision({ growthScore: 0, editorialScore: 99, publishedAt: now, firstSeenAt: null }, thresholds, now).qualifies, false);
  assert.equal(scoopDecision({ growthScore: 99, editorialScore: 99, publishedAt: null, firstSeenAt: null }, thresholds, now).qualifies, false);
  assert.equal(scoopDecision({ growthScore: 99, editorialScore: 99, publishedAt: null, firstSeenAt: new Date("2026-09-30T13:00:00Z") }, thresholds, now).qualifies, true, "first-seen time is the fallback");
});
