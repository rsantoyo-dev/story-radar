import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as types from "./draft2-facts.types";
import * as focusTypes from "./draft2-focus.types";
import * as funnel from "./draft2-funnel";
import * as openingTypes from "./draft2-opening.types";
import * as skills from "./skills/draft2-skills";
import * as focusSkill from "./skills/focus";
import type { Draft2Focus } from "./draft2-focus.types";

const localRequire = createRequire(import.meta.url);
const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const LINE_ID = "55555555-5555-4555-8555-555555555555";
const GUIDES_ID = "66666666-6666-4666-8666-666666666666";

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week.", evidence: "awards took less than a week", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
];
const profile = {
  name: "Example Daily", language: "English", region: "Austin", platform: "Instagram", audience: "Founders who sell to government", brandPersonality: ["direct"],
  formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60, framingStrategy: "auto", storyStructure: "auto", conversionGoal: "followers",
};
const lines = [
  { id: GUIDES_ID, topicId, revision: 1, name: "Guides", objective: "How to sell to government, step by step.", themes: ["procurement"], timezone: "UTC", archived: false },
  { id: LINE_ID, topicId, revision: 2, name: "Actualidad", objective: "Recent defence AI news for founders.", themes: [], timezone: "America/Toronto", archived: false },
];
const contexts = [{ runId: "run-1", context: { lineId: LINE_ID }, createdAt: new Date("2026-10-09T10:00:00.000Z") }];
const reasons = Object.fromEntries(focusTypes.FOCUS_FIELDS.map((field) => [field, `Why ${field}.`]));

/** Claude's answer, every field valid unless overridden. */
const answer = (overrides: Record<string, unknown> = {}) => ({
  lineId: LINE_ID,
  audience: "Founders who sell software to the Pentagon",
  framing: "reader-consequence",
  readerConsequence: { text: "A five-minute video can now open a Pentagon contract.", factIds: ["f1", "f2"] },
  structure: { kind: "arc", itemFactIds: [] },
  goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60 },
  direction: "Lead with the five-minute video; pay it with the award time.",
  visualDirection: "Anonymous founders at a laptop; the demo video recurs and closes the story as a signed award.",
  reasons,
  ...overrides,
});

type Row = Record<string, unknown> & { focus: Draft2Focus | null; trace: types.Draft2TraceEntry[]; updatedAt: Date };

/** The step with Claude, the profile, the lines, the story and the database replaced; `answers` are Claude's, in order. */
function harness({ answers = [], session, busy = false, claimRefused = false, fail = false }: {
  answers?: unknown[]; session?: Record<string, unknown>; busy?: boolean; claimRefused?: boolean; fail?: boolean;
} = {}) {
  const calls: Record<string, unknown>[] = [];
  let row: Row = {
    id: sessionId, topicId, storyId, step: "facts", status: "ready", facts, evaluation: null, rounds: [], focus: null, opening: null, error: null, threads: {},
    trace: [{ at: "2026-10-09T12:00:00.000Z", step: "facts", round: 1, provider: "openai", model: "gpt-6.1-sol", operation: "draft2_facts", durationMs: 10, outcome: "ok" }],
    updatedAt: new Date(),
    ...session,
  };
  const exports: Record<string, (...args: unknown[]) => Promise<Row>> = {};
  const code = ts.transpileModule(readFileSync(new URL("./draft2-focus.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-focus.types": focusTypes,
    "./draft2-funnel": funnel,
    "./draft2-opening.types": openingTypes,
    "./skills/draft2-skills": skills,
    "./skills/focus": focusSkill,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/story-content.repository": { getStoryContent: async () => ({ storyId, title: "Pentagon buys AI by video", url: "https://example.com/a", text: "…" }) },
    "../editorial-lines/editorial-lines.repository": { activeEditorialLines: async () => lines, storyCollectionContexts: async () => contexts },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push(input);
      if (fail) throw Object.assign(new Error("anthropic claude-sonnet-5-5 failed (HTTP 529: overloaded)"), { status: 529 });
      const next = answers.shift();
      return { text: typeof next === "string" ? next : JSON.stringify(next), provider: "anthropic", model: input.model, usage: { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 }, cachedInputTokens: 0, cacheWriteTokens: 900 };
    } },
    "./draft2-session.repository": {
      activeDraft2Session: async () => busy ? row : undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { if (claimRefused) return undefined; row = { ...row, ...patch, status: "running", updatedAt: new Date() }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, updatedAt: new Date() }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  vm.runInNewContext(code, { exports, Date, JSON, Error, Object, Array, Math, Number, String, Boolean, Set, Map, Promise, Intl, console, setInterval, clearInterval, process: { env: {} },
    require: (name: string) => name in mocks ? mocks[name] : localRequire(name) });
  return {
    decide: () => exports.decideDraft2Focus({ topicId, storyId, sessionId }),
    edit: (field: string, change: { value?: unknown; reset?: boolean }) => exports.editDraft2Focus({ topicId, sessionId, field, ...change }),
    calls,
    last: () => row,
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);

test("Claude decides the focus from the cached facts, the brand brief, the profile's defaults and the Topic's lines; the session keeps it and the call", async () => {
  const h = harness({ answers: [answer()] });
  const session = await h.decide();
  const [call] = h.calls;
  assert.equal(call.model, "claude-sonnet-5-5");
  assert.equal(json(call.context), json({ verifiedFacts: openingTypes.openingFactsSnapshot(facts) }), "the facts travel as Claude's cached context");
  assert.equal(json(Object.keys(call.contents as object)), json(["task", "story", "today", "topicDefaults", "lines", "foundBy"]));
  const contents = call.contents as { story: unknown; today: string; topicDefaults: unknown; lines: { id: string }[]; foundBy: string[] };
  assert.equal(json(contents.story), json({ title: "Pentagon buys AI by video" }));
  assert.match(contents.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(json(contents.topicDefaults), json({ framing: "auto", structure: "auto", goal: "followers" }));
  assert.equal(json(contents.lines.map((line) => line.id)), json([GUIDES_ID, LINE_ID]));
  assert.equal(json(contents.foundBy), json([LINE_ID]), "the line whose run found the story");
  assert.equal(json([call.schemaName, call.effort, call.timeoutMs]), json(["draft2_focus", "high", 240_000]));
  assert.ok(String(call.instructions).startsWith(focusSkill.FOCUS_ROLES["focus-editor"]));
  assert.ok(String(call.instructions).includes(focusSkill.FOCUS_SKILL.text));
  assert.match(String(call.instructions), /# The publication\n- Name: Example Daily\./);
  assert.equal(json([session.step, session.status, session.error]), json(["focus", "ready", null]));
  const focus = session.focus!;
  assert.equal(json([focus.status, focus.version, focus.edited]), json(["ready", 1, []]));
  assert.equal(focus.values?.line?.name, "Actualidad");
  assert.equal(json(focus.lineOptions.map((line) => line.name)), json(["Guides", "Actualidad"]));
  assert.equal(focus.reasons?.goal, "Why goal.");
  assert.equal(json(focus.decidedBy), json({ provider: "anthropic", model: "claude-sonnet-5-5" }));
  const last = session.trace[session.trace.length - 1];
  assert.equal(session.trace.length, 2, "the facts trace is kept");
  assert.equal(json([last.step, last.provider, last.operation, last.outcome, last.skillVersions, last.cacheWriteTokens]), json(["focus", "anthropic", "draft2_focus", "ok", { focus: "3" }, 900]));
});

test("deciding again keeps the editor's fields: Claude receives them as choices and the program keeps them whatever it answers", async () => {
  const h = harness({ answers: [answer(), answer({ goal: "followers", direction: "Lead with what to keep." })] });
  await h.decide();
  await h.edit("goal", { value: "saves" });
  const session = await h.decide();
  assert.equal(json((h.calls[1].contents as { editorChoices: unknown }).editorChoices), json({ goal: "saves" }));
  assert.equal(json([session.focus?.values?.goal, session.focus?.ai?.goal, session.focus?.values?.direction]), json(["saves", "followers", "Lead with what to keep."]));
  assert.equal(json([session.focus?.version, session.focus?.edited]), json([3, ["goal"]]), "decided, edited, decided again");
  assert.equal("goal" in (session.focus?.reasons ?? {}), false, "the goal is the editor's, with no reason of Claude's");
});

test("a failed decision keeps the focus from before, marks it failed and keeps the call in the trace", async () => {
  const h = harness({ answers: [answer()] });
  const first = await h.decide();
  const failing = harness({ session: { ...first }, fail: true });
  await assert.rejects(failing.decide(), /HTTP 529/);
  const row = failing.row();
  assert.equal(json([row.status, row.focus?.status, row.focus?.version]), json(["failed", "failed", 1]));
  assert.equal(json(row.focus?.values), json(first.focus?.values), "the values from before stand");
  assert.match(String(row.focus?.error), /HTTP 529/);
  const last = row.trace[row.trace.length - 1];
  assert.equal(json([last.step, last.operation, last.outcome]), json(["focus", "draft2_focus", "error"]));
});

test("two answers outside the contract fail the step without changing the focus; the second was asked with the rule the first broke", async () => {
  const wrongLine = answer({ lineId: "77777777-7777-4777-8777-777777777777" });
  const h = harness({ answers: [wrongLine, wrongLine] });
  await assert.rejects(h.decide(), (error: Error) => error instanceof types.Draft2ResponseError && /editorial line the Topic does not have/.test(error.message));
  assert.equal(h.calls.length, 2);
  assert.match(String((h.calls[1].contents as { correction: string }).correction), /editorial line the Topic does not have/);
  assert.equal(json([h.row().status, h.row().focus?.status, h.row().focus?.values]), json(["failed", "failed", undefined]));
  assert.equal(h.row().trace[h.row().trace.length - 1].outcome, "ok", "the calls themselves answered; their trace stays");
});

test("the focus starts only on verified facts, one run at a time", async () => {
  await assert.rejects(harness({ session: { status: "needs-review" } }).decide(), (error: Error) => error instanceof types.Draft2InputError && /verified facts/.test(error.message));
  await assert.rejects(harness({ session: { facts: [] } }).decide(), /verified facts/);
  await assert.rejects(harness({ busy: true }).decide(), (error: Error) => error instanceof types.Draft2BusyError);
  await assert.rejects(harness({ claimRefused: true }).decide(), (error: Error) => error instanceof types.Draft2BusyError, "a concurrent request claimed the session first");
  await assert.rejects(harness({ session: { storyId: "44444444-4444-4444-8444-444444444444" } }).decide(), /not found for the story/);
  assert.equal((await harness({ answers: [answer()], session: { step: "opening", status: "needs-review" } }).decide()).focus?.status, "ready", "a session past the facts has them verified");
});

test("an edit is saved with no provider call; a reset gives the field back; neither waits on anything but a decision in progress", async () => {
  const h = harness({ answers: [answer()] });
  await h.decide();
  const edited = await h.edit("audience", { value: "Parents in Laval" });
  assert.equal(json([edited.focus?.values?.audience, edited.focus?.edited, edited.focus?.version]), json(["Parents in Laval", ["audience"], 2]));
  const reset = await h.edit("audience", { reset: true });
  assert.equal(json([reset.focus?.values?.audience, reset.focus?.edited, reset.focus?.version]), json(["Founders who sell software to the Pentagon", [], 3]));
  assert.equal(h.calls.length, 1, "no provider call");
  await assert.rejects(h.edit("goal", { value: "virality" }), (error: Error) => error instanceof types.Draft2InputError && /goal is one of/.test(error.message));
  const deciding = harness({ session: { ...h.row(), status: "running", focus: { ...h.row().focus, status: "running" } } });
  await assert.rejects(deciding.edit("goal", { value: "saves" }), (error: Error) => error instanceof types.Draft2BusyError && /Claude is deciding/.test(error.message));
  const stopped = harness({ session: { ...h.row(), status: "running", updatedAt: new Date(Date.now() - 5 * 60_000), focus: { ...h.row().focus, status: "running" } } });
  assert.equal((await stopped.edit("goal", { value: "saves" })).focus?.values?.goal, "saves", "a decision that stopped answering does not hold the focus");
  await assert.rejects(harness().edit("goal", { value: "saves" }), /Decide the focus before changing it/);
});

test("an answer outside the contract is asked for again once, with the rule it broke as the correction; the second one decides", async () => {
  const h = harness({ answers: [answer({ readerConsequence: { text: "x".repeat(301), factIds: ["f1"] } }), answer()] });
  const session = await h.decide();
  assert.equal(session.status, "ready");
  assert.equal(h.calls.length, 2);
  const retry = h.calls[1].contents as { correction: string; story: { title: string } };
  assert.match(retry.correction, /^The focus's reader consequence is longer than 300 characters\. Return the whole decision again, every field and every reason/);
  assert.equal(retry.story.title, "Pentagon buys AI by video", "the whole request travels again");
  assert.equal("correction" in (h.calls[0].contents as object), false, "the first request carries none");
  assert.equal(h.calls[1].instructions, h.calls[0].instructions, "the same instructions and cached facts");
  assert.equal((session.focus as Draft2Focus).values?.readerConsequence?.text, "A five-minute video can now open a Pentagon contract.");
  const focusTrace = (session.trace as types.Draft2TraceEntry[]).filter((entry) => entry.step === "focus");
  assert.equal(json(focusTrace.map((entry) => [entry.round, entry.outcome, entry.effort])), json([[1, "ok", "high"], [2, "ok", "high"]]), "both calls are on the trace: they were paid");
});

test("a second answer outside the contract fails the step, with both calls on the trace", async () => {
  const h = harness({ answers: [answer({ audience: "" }), answer({ direction: "" })] });
  await assert.rejects(h.decide(), /direction is missing or longer than/);
  assert.equal(h.calls.length, 2);
  const last = h.last();
  assert.equal(json([last.status, (last.focus as Draft2Focus).status]), json(["failed", "failed"]));
  assert.equal((last.trace as types.Draft2TraceEntry[]).filter((entry) => entry.step === "focus").length, 2);
});
