import assert from "node:assert/strict";
import test from "node:test";

import { activeWindowHours, ageLabel, hourLabel, needsAttention, passesPerDay, urgentStatus, type UrgentStory } from "./auto-collection-view";

const story = (overrides: Partial<UrgentStory> = {}): UrgentStory => ({
  id: "scoop-1", storyId: "story-1", growthScore: 92, editorialScore: 86, reasons: ["Growth 92 ≥ 85"],
  status: "detected", detectedAt: "2026-10-09T12:00:00.000Z", seen: false, ...overrides,
});

test("the schedule's passes a day follow the active window and the interval", () => {
  assert.equal(activeWindowHours(6, 22), 16);
  assert.equal(activeWindowHours(22, 6), 8, "a window can cross midnight");
  assert.equal(activeWindowHours(0, 24), 24);
  assert.equal(activeWindowHours(7, 7), 24, "equal ends mean all day");
  // 6–22 every 4 h: 6, 10, 14 and 18.
  assert.equal(passesPerDay({ intervalHours: 4, activeFromHour: 6, activeToHour: 22 }), 4);
  assert.equal(passesPerDay({ intervalHours: 3, activeFromHour: 6, activeToHour: 22 }), 6);
  assert.equal(passesPerDay({ intervalHours: 24, activeFromHour: 6, activeToHour: 22 }), 1);
  assert.equal(hourLabel(6), "06:00");
});

test("an urgent story stays on the banner until it is seen or dismissed", () => {
  assert.equal(needsAttention(story()), true);
  assert.equal(needsAttention(story({ seen: true })), false);
  assert.equal(needsAttention(story({ status: "dismissed" })), false);
});

test("an urgent story's preparation reads in the editor's words", () => {
  assert.deepEqual(urgentStatus(story({ status: "ready" })), { label: "Draft ready to review", tone: "success" });
  assert.deepEqual(urgentStatus(story({ status: "preparing" })), { label: "Preparing its brief and draft…", tone: "info" });
  assert.deepEqual(urgentStatus(story({ status: "blocked", blockedStep: "brief" })), { label: "Needs you at the brief step", tone: "warning" });
  assert.equal(urgentStatus(story()).label, "Waiting for its brief and draft");
  assert.equal(urgentStatus(story(), false).label, "Flagged", "without preparation ahead it is only flagged");
});

test("ages read in minutes, then hours, then days", () => {
  const now = Date.parse("2026-10-09T14:00:00.000Z");
  assert.equal(ageLabel("2026-10-09T13:35:00.000Z", now), "25 min ago");
  assert.equal(ageLabel("2026-10-09T12:00:00.000Z", now), "2 h ago");
  assert.equal(ageLabel("2026-10-06T14:00:00.000Z", now), "3 days ago");
});
