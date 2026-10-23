import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as focusTypes from "./draft2-focus.types";
import * as funnel from "./draft2-funnel";
import * as openingTypes from "./draft2-opening.types";
import * as closingTypes from "./draft2-closing.types";
import * as deckTypes from "./draft2-deck.types";
import * as draftTypes from "./draft2-draft.types";
import * as models from "./draft2-models";
import * as skills from "./skills/draft2-skills";
import * as closingsSkill from "./skills/closings";
import * as decksSkill from "./skills/decks";
import * as draftsSkill from "./skills/drafts";
import * as fairnessSkill from "./skills/fairness";
import * as hooksSkill from "./skills/hooks";
import * as leversSkill from "./skills/levers";
import * as readerSkill from "./skills/reader";
import * as leverTypes from "./draft2-levers.types";
import { loadInSandbox } from "./draft2-test-sandbox";
import { FACTS, FOCUS, answer } from "./draft2-draft.fixtures";
import type { Draft2Closing } from "./draft2-closing.types";
import type { Draft2Deck } from "./draft2-deck.types";
import type { Draft2Opening } from "./draft2-opening.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const profile = { name: "Example Daily", language: "English", region: "Austin", platform: "Instagram", audience: "Founders who sell to government", brandPersonality: ["direct"], formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60, readerAddress: "informal", allowEmojis: false, maxEmojis: 0, callToActionStyle: "Invite the reader to follow." };
const INVENTORY = { status: "ready", version: 1, characters: "auto", roster: [], storyPhotos: [], entities: [] };

type Row = Record<string, unknown> & { opening: Draft2Opening | null; closing: Draft2Closing | null; deck: Draft2Deck | null; trace: types.Draft2TraceEntry[] };

/** The draft step with Claude, the profile and the database replaced; `answers` are Opus's, in order. */
function harness({ answers, session = {}, busy = false }: { answers: string[]; session?: Record<string, unknown>; busy?: boolean }) {
  const calls: Record<string, unknown>[] = [];
  let row: Row = {
    id: sessionId, topicId, storyId, step: "spine", status: "ready", pipeline: "v4", facts: FACTS, focus: { status: "ready", version: FOCUS.version, values: FOCUS.values, ai: FOCUS.values, reasons: {}, edited: [] },
    inventory: INVENTORY, opening: null, closing: null, deck: null, error: null, trace: [], ...session,
  } as Row;
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-focus.types": focusTypes,
    "./draft2-funnel": funnel,
    "./draft2-opening.types": openingTypes,
    "./draft2-closing.types": closingTypes,
    "./draft2-deck.types": deckTypes,
    "./draft2-draft.types": draftTypes,
    "./draft2-models": models,
    "./draft2-levers.types": leverTypes,
    "./skills/draft2-skills": skills, "./skills/closings": closingsSkill, "./skills/decks": decksSkill, "./skills/drafts": draftsSkill,
    "./skills/fairness": fairnessSkill, "./skills/hooks": hooksSkill, "./skills/levers": leversSkill, "./skills/reader": readerSkill,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "./draft2-trace-cost": { traceCost: () => ({ costMicros: 5000 }) },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { requireAnthropicApiKey: () => "k", getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }) },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push(input);
      const text = answers.shift();
      if (text === undefined) throw new Error("no answer scripted");
      return { text, usage, cachedInputTokens: 0 };
    } },
    "./draft2-session.repository": {
      activeDraft2Session: async () => busy ? row : undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, status: "running" }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  const exports = loadInSandbox("./draft2-draft.ts", mocks, { process: { env: {} } }) as Record<string, (...args: unknown[]) => Promise<Row>>;
  return { run: (extra: Record<string, unknown> = {}) => exports.runDraft2Draft({ topicId, storyId, sessionId, ...extra }), calls, row: () => row };
}

const json = (value: unknown) => JSON.stringify(value);

test("v4: one call to Opus writes the whole carousel's words; it becomes the Opening, the Closing and the Deck the later steps read", async () => {
  const h = harness({ answers: [answer()] });
  const row = await h.run();
  assert.equal(h.calls.length, 1, "a clean draft needs no second call");
  const [call] = h.calls;
  assert.equal(json([call.model, call.effort, call.schemaName]), json(["claude-opus-5-5", "high", "draft2_draft"]));
  assert.match(String(call.instructions), /^You are an expert editor of social carousels[^]*# A carousel written whole[^]*# The publication/);
  assert.equal((call.contents as { task: string }).task, "draft");
  assert.deepEqual(Object.keys(call.context as object), ["verifiedFacts", "focus", "eligibleLevers"], "the facts, the focus and its levers travel as Claude's cached context");
  assert.equal(json([row.step, row.status, row.error]), json(["deck", "ready", null]));
  assert.equal(json([row.opening?.status, row.opening?.winnerId, row.opening?.pipeline, row.opening?.candidates.length, row.opening?.focus?.version]), json(["ready", "c1", "v4", 3, FOCUS.version]));
  assert.equal(json([row.closing?.winnerId, row.closing?.opening?.id, row.closing?.shape]), json(["c1", "c1", "two-slides"]));
  assert.equal(json([row.deck?.winnerId, row.deck?.opening?.id, row.deck?.closing?.id, row.deck?.shape?.kind]), json(["c1", "c1", "c1", "arc"]));
  // The later steps read it as they read a funnel's: the closing follows the chosen opening, the deck both, so the autopilot goes on.
  const next = (await import("./draft2-autopilot.core")).nextAutopilotStep({ ...row, mentions: { status: "ready" }, updatedAt: new Date().toISOString() } as never, Date.now());
  assert.deepEqual(next, { step: "visual" }, "v4 writes the visual script before its whole-carousel review");
  const traced = row.trace.filter((entry) => entry.step === "opening");
  assert.equal(json(traced.map((entry) => [entry.operation, entry.outcome, entry.model, entry.costMicros])), json([["draft2_draft", "ok", "claude-opus-5-5", 5000]]));
});

test("what the program finds goes back to the writer once; the program keeps the draft with fewer findings, never a third call", async () => {
  const flagged = answer({ covers: [{ headline: "Pentagon buyers now judge 90-second videos", subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"], lever: "free" }] });
  const h = harness({ answers: [flagged, answer()] });
  const row = await h.run();
  assert.equal(h.calls.length, 2);
  const fix = h.calls[1].contents as { task: string; findings: string[]; draft: { covers: { headline: string }[] } };
  assert.equal(json([h.calls[1].schemaName, fix.task, fix.draft.covers[0].headline]), json(["draft2_draft_fix", "fix", "Pentagon buyers now judge 90-second videos"]));
  assert.ok(fix.findings.some((line) => /^cover \(c1\): /.test(line)), json(fix.findings));
  assert.equal(json([row.opening?.winnerId, row.opening?.rounds.length, row.status]), json(["c1.2", 2, "ready"]));
  const stubborn = harness({ answers: [flagged, flagged] });
  const kept = await stubborn.run();
  assert.equal(stubborn.calls.length, 2);
  assert.equal(json([kept.opening?.status, kept.opening?.winnerId, kept.status]), json(["needs-review", "c1", "needs-review"]), "the fix came out no better: the first draft stands, for the review and the editor");
});

test("an answer outside the contract is asked for again once with the rule; a second one fails the step and keeps the trace", async () => {
  const h = harness({ answers: [answer({ covers: [] }), answer()] });
  const row = await h.run();
  assert.equal(h.calls.length, 2);
  assert.match(String((h.calls[1].contents as { correction: string }).correction), /^The draft needs its covers/);
  assert.equal(row.opening?.status, "ready");
  const broken = harness({ answers: ["nope", "nope"] });
  await assert.rejects(broken.run(), (error: Error) => error instanceof types.Draft2ResponseError);
  assert.equal(json([broken.row().status, broken.row().opening?.status]), json(["failed", "failed"]));
  assert.match(String(broken.row().trace.at(-1)?.note), /^Refused by the program: The draft is not valid JSON/);
});

test("a server pass with too little time left pauses the draft before any call; the next pass drafts it", async () => {
  const h = harness({ answers: [answer()] });
  const row = await h.run({ deadline: Date.now() + 30_000 });
  assert.equal(h.calls.length, 0);
  assert.equal(json([row.opening?.status, row.opening?.pipeline, row.status]), json(["paused", "v4", "ready"]));
  assert.match(String(row.opening?.error), /Paused before the draft/);
});

test("the draft follows a decided focus with its spine, on verified facts, one run at a time; earlier runs stay as summaries", async () => {
  await assert.rejects(harness({ answers: [], session: { focus: null } }).run(), /Decide the focus first/);
  await assert.rejects(harness({ answers: [], session: { focus: { status: "ready", version: 3, values: { ...FOCUS.values, spine: undefined } } } }).run(), /Write the spine first/);
  await assert.rejects(harness({ answers: [], session: { facts: [] } }).run(), /verified facts/);
  await assert.rejects(harness({ answers: [], busy: true }).run(), (error: Error) => error instanceof types.Draft2BusyError);
  const earlier = { status: "ready", rounds: [{ round: 1, candidates: [], mechanical: [], at: "2026-10-22T10:00:00.000Z" }], candidates: [], winnerId: "c9", pipeline: "v3" };
  const h = harness({ answers: [answer()], session: { opening: earlier, closing: earlier, deck: earlier } });
  const row = await h.run();
  assert.equal(json([row.opening?.previousRuns?.length, row.closing?.previousRuns?.length, row.deck?.previousRuns?.length]), json([1, 1, 1]));
  assert.equal((row.opening?.previousRuns?.[0] as { winnerId?: string }).winnerId, "c9");
});
