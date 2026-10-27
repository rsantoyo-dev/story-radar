import assert from "node:assert/strict";
import test from "node:test";
import { ENRICHMENT_STORY_TIMEOUT_MS, candidatesToEnrich, runEnrichment, type EnrichmentAttempt } from "./enrich-candidates-before-evaluation.core";

const now = new Date("2026-10-27T13:00:00Z");
const day = 86_400_000;
const candidate = (storyId: string, contentStatus: "excerpt" | "missing" | "likely-full" | "full", localScore: number, publishedAt?: Date) => ({ storyId, contentStatus, localScore, ...(publishedAt ? { publishedAt } : {}) });

test("the articles worth fetching before an evaluation: excerpts without a recent attempt, the strongest local signal first, capped", () => {
  const attempts = new Map<string, EnrichmentAttempt>([
    ["failed-yesterday", { status: "failed", updatedAt: new Date(now.getTime() - day) }],
    ["failed-long-ago", { status: "failed", updatedAt: new Date(now.getTime() - 8 * day) }],
    ["blocked-long-ago", { status: "blocked", updatedAt: new Date(now.getTime() - 30 * day) }],
    ["pending-fresh", { status: "pending", updatedAt: new Date(now.getTime() - 10_000) }],
    ["pending-stale", { status: "pending", updatedAt: new Date(now.getTime() - ENRICHMENT_STORY_TIMEOUT_MS * 5) }],
    ["completed", { status: "completed", updatedAt: new Date(now.getTime() - 20 * day) }],
  ]);
  const picked = candidatesToEnrich([
    candidate("full", "full", 90), candidate("likely", "likely-full", 90),
    candidate("new-low", "excerpt", 30), candidate("new-high", "excerpt", 80), candidate("missing", "missing", 50),
    candidate("failed-yesterday", "excerpt", 95), candidate("failed-long-ago", "excerpt", 60), candidate("blocked-long-ago", "excerpt", 55),
    candidate("pending-fresh", "excerpt", 99), candidate("pending-stale", "excerpt", 45),
    candidate("completed", "excerpt", 70),
    candidate("tie-older", "excerpt", 50, new Date("2026-10-20T00:00:00Z")), candidate("tie-newer", "excerpt", 50, new Date("2026-10-26T00:00:00Z")),
  ], attempts, { now });
  assert.deepEqual(picked.map((entry) => entry.storyId), ["new-high", "completed", "failed-long-ago", "blocked-long-ago", "tie-newer", "tie-older", "missing", "pending-stale", "new-low"], "a tie goes to the newer; one without a date last among its score");
  assert.deepEqual(candidatesToEnrich([candidate("a", "excerpt", 1), candidate("b", "excerpt", 2), candidate("c", "excerpt", 3)], new Map(), { now, maxStories: 2 }).map((entry) => entry.storyId), ["c", "b"]);
});

test("the fetches run a few at a time within the budget; a slow or failing one never stops the others, and the counts say what happened", async () => {
  let clock = 0;
  const started: string[] = [];
  const prepare = async (storyId: string) => {
    started.push(storyId);
    if (storyId === "fails") throw new Error("paywall");
    if (storyId === "slow") return new Promise<{ outcome: "prepared" }>(() => undefined);
    return { outcome: storyId === "known" ? "already-ready" as const : "prepared" as const };
  };
  const counts = await runEnrichment([{ storyId: "a" }, { storyId: "fails" }, { storyId: "known" }, { storyId: "slow" }, { storyId: "b" }], prepare, { budgetMs: 1_000, concurrency: 2, storyTimeoutMs: 20, now: () => clock });
  assert.deepEqual(counts, { attempted: 5, prepared: 2, failed: 2 }, "the slow one counts as failed after its time; the one already complete is neither");
  assert.deepEqual(started.sort(), ["a", "b", "fails", "known", "slow"]);
  const ticking = async (storyId: string) => { clock += 600; started.push(storyId); return { outcome: "prepared" as const }; };
  started.length = 0;
  assert.deepEqual(await runEnrichment([{ storyId: "a" }, { storyId: "b" }, { storyId: "c" }], ticking, { budgetMs: 1_000, concurrency: 1, now: () => clock }), { attempted: 2, prepared: 2, failed: 0 }, "nothing starts once the budget is spent");
  assert.deepEqual(started, ["a", "b"]);
  assert.deepEqual(await runEnrichment([], prepare, { budgetMs: 1_000 }), { attempted: 0, prepared: 0, failed: 0 });
});
