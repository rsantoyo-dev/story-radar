import assert from "node:assert/strict";
import test from "node:test";
import { canvasStepOf, costLabel, sameDay, todayCards, type TodayStory } from "./draft-2-today.core";
import type { Draft2SessionSummary } from "./modules/draft2/draft2-session.repository";

const story = (storyId: string, published: TodayStory["published"] = [], contentStatus = "ready"): TodayStory => ({ storyId, title: `Story ${storyId}`, sourceName: "Source", contentStatus, published });
const session = (storyId: string, patch: Partial<Draft2SessionSummary> = {}): Draft2SessionSummary => ({
  id: `session-${storyId}`, storyId, step: "images", status: "ready", pipeline: "v3", createdAt: "2026-10-19T08:00:00.000Z", updatedAt: "2026-10-19T09:00:00.000Z", error: null, alive: false, approvedAt: null, costMicros: 1_250_000, ms: 60_000, calls: 12, ...patch,
});
const now = new Date("2026-10-19T15:00:00.000Z");

test("Today's cards: each story in production once, in the group its latest session puts it in, with the canvas screen to open", () => {
  const stories = [story("s1"), story("s2"), story("s3"), story("s4"), story("s5", [{ platform: "instagram", publishedAt: "2026-10-19T12:30:00.000Z" }]), story("s6", [], "missing"), story("s7", [{ platform: "instagram", publishedAt: "2026-10-17T12:30:00.000Z" }]), story("s8")];
  const sessions = [
    session("s1", { step: "visual", status: "running", alive: true, updatedAt: "2026-10-19T14:59:00.000Z" }),
    session("s2", { step: "spine", status: "failed", error: "Luna did not accept\n a spine", updatedAt: "2026-10-19T10:00:00.000Z" }),
    session("s3", { step: "publication", status: "ready", approvedAt: "2026-10-19T11:00:00.000Z" }),
    session("s4", { step: "deck", status: "ready" }),
    session("s5", { step: "publication", status: "ready", approvedAt: "2026-10-19T12:00:00.000Z", costMicros: 2_000_000 }),
    session("s7", { step: "publication", status: "ready", approvedAt: "2026-10-17T12:00:00.000Z" }),
    session("s8", { step: "images", status: "running", alive: false, updatedAt: "2026-10-19T07:00:00.000Z" }),
  ];
  const cards = todayCards(stories, sessions, now, "UTC");
  assert.deepEqual(cards.map((card) => [card.story.storyId, card.group, card.step ?? null]), [
    ["s2", "needs-you", "spine"], ["s8", "needs-you", "images"],
    ["s1", "running", "visual"],
    ["s3", "to-publish", "publish"],
    ["s4", "waiting", "deck"], ["s7", "waiting", "publish"],
    ["s6", "not-started", null],
    ["s5", "published-today", "publish"],
  ], "needs you first, then running, to publish, waiting, not started, published today");
});

test("the lines say where each story stands, in the editor's words, and a published story keeps its cost", () => {
  const cards = todayCards([story("a"), story("b"), story("c", [{ platform: "instagram", publishedAt: "2026-10-19T12:30:00.000Z" }]), story("d", [], "missing")], [
    session("a", { step: "spine", status: "failed", error: "Luna did not accept\n   a spine." }),
    session("b", { step: "images", status: "running", alive: false }),
    session("c", { approvedAt: "2026-10-19T12:00:00.000Z", costMicros: 2_000_000 }),
  ], now, "UTC");
  assert.deepEqual(cards.map((card) => [card.story.storyId, card.line]), [
    ["a", "Spine: Luna did not accept a spine."],
    ["b", "Images: stopped mid-run; continue it"],
    ["d", "Prepare the content first, then start Draft 2."],
    ["c", "Published instagram · ≈US$2.00"],
  ]);
  assert.equal(costLabel(0), "");
  assert.equal(canvasStepOf("mentions"), "caption");
  assert.equal(canvasStepOf("publication"), "publish");
  assert.equal(canvasStepOf("nope"), undefined);
  assert.equal(sameDay(Date.parse("2026-10-19T02:00:00.000Z"), now, "America/Toronto"), false, "still the 18th in Toronto");
  assert.equal(sameDay(Date.parse("2026-10-19T12:00:00.000Z"), now, "America/Toronto"), true);
});
