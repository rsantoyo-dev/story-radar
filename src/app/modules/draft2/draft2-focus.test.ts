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
import * as leversSkill from "./skills/levers";
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

/** A valid spine for an arc: seven beats, three in the middle, a turning point, a climax before the payoff. */
const ARC_SPINE = { beats: [
  { slide: "cover", role: "hook", scene: "A founder presses play on a five-minute video.", words: "Promise that a short video can open a contract.", image: "The scale: one laptop against an empty procurement hall.", withholds: "How fast the award came.", factIds: ["f1"] },
  { slide: "slide2", role: "setup", scene: "The video plays; a clock starts.", words: "State the rule: videos no longer than five minutes.", image: "The timer beside the play button.", withholds: "What happened next.", factIds: ["f1"] },
  { slide: "middle", role: "inciting", scene: "An official opens the submission.", words: "Say who reviews and what they look for.", image: "A single screen in a dark room.", withholds: "How long it took.", factIds: ["f2"] },
  { slide: "middle", role: "rising", scene: "Days pass on a calendar.", words: "The award came in less than a week, as the official says.", image: "Seven calendar squares, six crossed.", withholds: "The size of the program.", factIds: ["f2"] },
  { slide: "middle", role: "turning-point", scene: "The number appears.", words: "Attribute the $1.5 trillion by 2030 with its qualifier.", image: "One small laptop under a vast figure.", withholds: "What it means for a founder.", factIds: ["f3"] },
  { slide: "penultimate", role: "climax", scene: "The founder signs.", words: "Pay the promise: the contract opened.", image: "The signed award on the same laptop.", withholds: "What to do now.", factIds: ["f1", "f2"] },
  { slide: "last", role: "payoff", scene: "The founder closes the laptop.", words: "What it means for the reader, and the call to action.", image: "The empty hall, now lit.", withholds: "", factIds: [] },
] };

/** Claude's answer, every field valid unless overridden. */
const answer = (overrides: Record<string, unknown> = {}) => ({
  lineId: LINE_ID,
  interest: "A five-minute video can now open a Pentagon contract: the shortest door the Pentagon ever opened.",
  approaches: ["Classic: the rule, the award, the number; feels like news, risks the plain.", "Discovery: the reader follows one founder's video to the award; feels like a story, risks inventing the founder.", "Escalation: five minutes, less than a week, $1.5 trillion; feels like vertigo, risks the qualifiers."],
  audience: "Founders who sell software to the Pentagon",
  framing: "reader-consequence",
  readerConsequence: { text: "A five-minute video can now open a Pentagon contract.", factIds: ["f1", "f2"] },
  structure: { kind: "arc", itemFactIds: [] },
  goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60 },
  reasons,
  ...overrides,
});
/** Claude's plan, the second call's answer: the levers, the spine and the two directions, with their reasons. */
const PLAN = {
  levers: { primary: "counterintuitive", alternatives: ["direct-benefit"], factIds: ["f1", "f2"], paidBy: "slide2" },
  spine: ARC_SPINE,
  direction: "Lead with the five-minute video; pay it with the award time.",
  visualDirection: "Anonymous founders at a laptop; the demo video recurs and closes the story as a signed award.",
  reasons: { levers: "Why levers.", spine: "Why spine.", direction: "Why direction.", visualDirection: "Why visualDirection." },
};

type Row = Record<string, unknown> & { focus: Draft2Focus | null; trace: types.Draft2TraceEntry[]; updatedAt: Date };

/** People and places as found before the focus: one person of the story, a place, and the brand's character Jo. */
const INVENTORY = {
  status: "ready", version: 2, characters: "auto", roster: [{ id: "char-jo", name: "Jo", description: "The local narrator." }], storyPhotos: [],
  entities: [
    { id: "e1", name: "Catherine Fournier", kind: "person", role: "subject", description: "A naturalist", factIds: ["f1"] },
    { id: "e2", name: "Parc des Parulines", kind: "place", role: "setting", description: "The park", factIds: ["f1"], place: { status: "verified", map: true } },
  ],
};
const GUIDE = { form: "character-guide", anchorKind: "character", characterId: "char-jo", anchor: "Jo", anchorFactIds: [], progression: "From the kiosk to each animal of the trail", ending: "returns" };

/** The step with Claude, the profile, the lines, the story and the database replaced; `answers` are Claude's, in order. */
function harness({ answers = [], plans = [], reviews = [], session, busy = false, claimRefused = false, fail = false, env = {}, recentLevers = [] }: {
  answers?: unknown[];
  /** Claude's plans, in order, for the second call of each decision and for a rewrite; PLAN when none is queued. */
  plans?: unknown[];
  /** The judge's answers on a narrative form, in order; an Error fails that call. */
  reviews?: unknown[];
  session?: Record<string, unknown>; busy?: boolean; claimRefused?: boolean; fail?: boolean;
  env?: Record<string, string>;
  /** The Topic's last published levers, newest first. */
  recentLevers?: string[];
} = {}) {
  const calls: Record<string, unknown>[] = [];
  const reviewCalls: Record<string, unknown>[] = [];
  let row: Row = {
    id: sessionId, topicId, storyId, step: "facts", status: "ready", facts, evaluation: null, rounds: [], focus: null, opening: null, error: null, threads: {}, inventory: INVENTORY,
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
    "./skills/levers": leversSkill,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/story-content.repository": { getStoryContent: async () => ({ storyId, title: "Pentagon buys AI by video", url: "https://example.com/a", text: "…" }) },
    "../editorial-lines/editorial-lines.repository": { activeEditorialLines: async () => lines, storyCollectionContexts: async () => contexts },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push(input);
      if (fail) throw Object.assign(new Error("anthropic claude-sonnet-5-5 failed (HTTP 529: overloaded)"), { status: 529 });
      const next = input.schemaName === "draft2_focus_plan" ? (plans.shift() ?? PLAN) : answers.shift();
      return { text: typeof next === "string" ? next : JSON.stringify(next), provider: "anthropic", model: input.model, usage: { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 }, cachedInputTokens: 0, cacheWriteTokens: 900 };
    } },
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: Record<string, unknown>) => {
      reviewCalls.push(input);
      const next = reviews.shift();
      if (next instanceof Error) throw next;
      return { text: JSON.stringify(next), usage: { promptTokens: 80, outputTokens: 20, thoughtsTokens: 0, totalTokens: 100 }, cachedInputTokens: 0 };
    } },
    "./draft2-session.repository": {
      recentDraft2CoverRows: async () => [],
      activeDraft2Session: async () => busy ? row : undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { if (claimRefused) return undefined; row = { ...row, ...patch, status: "running", updatedAt: new Date() }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, updatedAt: new Date() }; return row; },
      touchDraft2Session: async () => undefined,
      recentDraft2Levers: async () => [...recentLevers],
    },
  };
  vm.runInNewContext(code, { exports, Date, JSON, Error, Object, Array, Math, Number, String, Boolean, Set, Map, Promise, Intl, console, setInterval, clearInterval, process: { env },
    require: (name: string) => name in mocks ? mocks[name] : localRequire(name) });
  return {
    decide: () => exports.decideDraft2Focus({ topicId, storyId, sessionId }),
    edit: (field: string, change: { value?: unknown; reset?: boolean }) => exports.editDraft2Focus({ topicId, sessionId, field, ...change }),
    rewrite: () => exports.rewriteDraft2FocusPlan({ topicId, storyId, sessionId }),
    /** The Spine step: the plan written from the focus as it stands. */
    plan: () => exports.planDraft2Spine({ topicId, storyId, sessionId }),
    /** The Spine step with the editor's notes: the plan as it stands, revised to follow them. */
    planWithNotes: (notes: string) => exports.planDraft2Spine({ topicId, storyId, sessionId, notes }),
    /** The decision calls alone, without the plan calls between them. */
    decisions: () => calls.filter((call) => call.schemaName === "draft2_focus"),
    calls,
    reviewCalls,
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
  assert.equal(json(Object.keys(call.contents as object)), json(["task", "story", "today", "topicDefaults", "lines", "foundBy", "material"]));
  assert.equal(json((call.contents as { material: unknown }).material), json(focusTypes.focusMaterial(INVENTORY as never)), "People and places' material: the brand's characters, the people never drawn, the places");
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
  const [decisionCall] = session.trace.filter((entry) => entry.step === "focus");
  assert.equal(session.trace.length, 2, "the facts trace is kept; the decision is one call, and the plan is the Spine step's");
  assert.equal(json([decisionCall.provider, decisionCall.operation, decisionCall.outcome, decisionCall.skillVersions, decisionCall.cacheWriteTokens]), json(["anthropic", "draft2_focus", "ok", { focus: "17", discovery: "1", arcs: "1", narratives: "4", spine: "9" }, 900]));
  assert.equal(json([focus.values?.spine, focus.values?.levers, focus.staleDirections]), json([undefined, undefined, false]), "no plan yet: the Spine step writes it");
  assert.equal(focus.deliberation?.approaches.length, 3, "the tellings Claude compared stay on the focus for the editor");
  assert.equal(json([focus.values?.narrative, focus.inventoryVersion, h.reviewCalls.length]), json([focusTypes.CLASSIC_NARRATIVE, 2, 0]), "a classic story is not reviewed");

  // The Spine step: one call writes the plan from the decision as it stands.
  const planned = await h.plan();
  const planCall = planned.trace[planned.trace.length - 1];
  assert.equal(json([planned.step, planned.status, planned.error]), json(["spine", "ready", null]), "the Spine step claims the session and ends it ready");
  assert.equal(json([planCall.operation, planCall.outcome, planCall.effort, planCall.skillVersions]), json(["draft2_focus_plan", "ok", "high", { focus: "17", levers: "1", spine: "9", reader: "2" }]), "a classic telling: the planner reads the focus, levers, spine and reader skills only");
  const spined = planned.focus!;
  assert.equal(json([spined.version, spined.values?.spine?.beats.length, spined.values?.direction, spined.reasons?.spine, spined.staleDirections]), json([2, 7, PLAN.direction, "Why spine.", false]), "the plan's spine, directions and reasons join the decision, and the version moves");
  assert.equal(json(Object.keys((h.calls[1].contents as { focus: Record<string, unknown> }).focus)), json(["line", "interest", "audience", "framing", "readerConsequence", "structure", "goal", "voice"]), "the planner reads the decision, the interest first, without the empty directions");
  const planContents = h.calls[1].contents as { eligibleLevers: string[]; recentLevers: string[] };
  assert.ok(planContents.eligibleLevers.includes("counterintuitive") && !planContents.eligibleLevers.includes("stat") && !planContents.eligibleLevers.includes("quick-list"), "the levers these facts can carry: no figure, so no statistic; an arc, so no list");
  assert.equal(json(planContents.recentLevers), json([]), "no carousel of this Topic published with a lever yet");
  assert.equal(json([spined.values?.levers, spined.reasons?.levers]), json([PLAN.levers, "Why levers."]), "the plan's levers and their reason join the decision");
  assert.equal(json((h.calls[1].contents as { material?: unknown }).material), json(focusTypes.focusMaterial(INVENTORY as never)), "the planner reads People and places too: the visual direction shows the people with a verified portrait through it");
  await assert.rejects(harness().plan(), /Decide the focus before writing its spine/);
});

test("deciding again keeps the editor's fields: Claude receives them as choices and the program keeps them whatever it answers", async () => {
  const h = harness({ answers: [answer(), answer({ goal: "followers", direction: "Lead with what to keep." })] });
  await h.decide();
  await h.edit("goal", { value: "saves" });
  const session = await h.decide();
  assert.equal(json((h.decisions()[1].contents as { editorChoices: unknown }).editorChoices), json({ goal: "saves" }));
  assert.equal(json([session.focus?.values?.goal, session.focus?.ai?.goal]), json(["saves", "followers"]));
  assert.equal(json([session.focus?.version, session.focus?.edited]), json([3, ["goal"]]), "decided, edited, decided again");
  assert.equal((await h.plan()).focus?.values?.direction, PLAN.direction, "the direction is the plan's, whatever the decision answer carried");
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
  assert.equal(h.calls.length, 1, "no provider call beyond the decision");
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
  assert.equal(h.calls.length, 2, "the decision twice");
  const retry = h.calls[1].contents as { correction: string; story: { title: string } };
  assert.match(retry.correction, /^The focus's reader consequence is longer than 300 characters\. Return the whole decision again, every field and every reason/);
  assert.equal(retry.story.title, "Pentagon buys AI by video", "the whole request travels again");
  assert.equal("correction" in (h.calls[0].contents as object), false, "the first request carries none");
  assert.equal(h.calls[1].instructions, h.calls[0].instructions, "the same instructions and cached facts");
  assert.equal((session.focus as Draft2Focus).values?.readerConsequence?.text, "A five-minute video can now open a Pentagon contract.");
  const focusTrace = (session.trace as types.Draft2TraceEntry[]).filter((entry) => entry.step === "focus");
  assert.equal(json(focusTrace.map((entry) => [entry.round, entry.operation, entry.outcome, entry.effort])), json([[1, "draft2_focus", "ok", "high"], [2, "draft2_focus", "ok", "high"]]), "every call is on the trace: they were paid");
});

test("a second plan outside the contract fails the Spine step, with both plan calls on the trace and the focus as it was decided", async () => {
  const h = harness({ answers: [answer()], plans: [{ ...PLAN, direction: "" }, { ...PLAN, visualDirection: "" }] });
  const decided = await h.decide();
  await assert.rejects(h.plan(), /visual direction is missing or longer than/);
  assert.equal(h.calls.length, 3, "the decision, then the plan twice");
  assert.match(String((h.calls[2].contents as { correction: string }).correction), /^The direction is missing or longer than 1500 characters\. Return the whole plan again/);
  const last = h.last();
  assert.equal(json([last.step, last.status, (last.focus as Draft2Focus).version, (last.focus as Draft2Focus).values?.spine]), json(["spine", "failed", decided.focus!.version, undefined]), "the spine failed; the focus stands as decided");
  assert.match(String(last.error), /visual direction is missing/);
  assert.equal((last.trace as types.Draft2TraceEntry[]).filter((entry) => entry.step === "focus").length, 3);
  // Why each answer was refused stays on its call, so a failed Spine can be read afterwards.
  const notes = (last.trace as types.Draft2TraceEntry[]).filter((entry) => entry.operation === "draft2_focus_plan").map((entry) => entry.note ?? "");
  assert.match(notes[0], /^Refused by the program: The direction is missing or longer than 1500 characters/);
  assert.match(notes[1], /^Refused by the program: The visual direction is missing/);
  // The planner read the numbers it is checked against in its request.
  assert.deepEqual((h.calls[1].contents as { spineLimits?: unknown }).spineLimits, { beats: { min: 4, max: 10 }, characters: { scene: 240, words: 200, image: 240, withholds: 160, subject: 120 } });
  // And the facts it must place, so a first answer places them.
  assert.ok(Array.isArray((h.calls[1].contents as { factsToCover?: unknown }).factsToCover), "the facts every spine must place");
});

test("the focus waits for People and places: the narrative form is chosen with them", async () => {
  const h = harness({ answers: [answer()], session: { inventory: null } });
  await assert.rejects(h.decide(), (error: Error) => error instanceof types.Draft2InputError && /Find the people and places first/.test(error.message));
  await assert.rejects(harness({ answers: [answer()], session: { inventory: { ...INVENTORY, status: "running" } } }).decide(), /Find the people and places first/);
});

test("a guide Claude chose goes to the judge, which keeps it; the call is on the trace with the facts in its instructions", async () => {
  const h = harness({ answers: [answer({ narrative: GUIDE })], reviews: [{ verdict: "keep", reason: "Jo turns the trail into a search the reader follows." }], env: { OPENAI_API_KEY: "sk-test", DRAFT2_MODEL_JUDGE: "gpt-6-luna" } });
  const focus = (await h.decide()).focus!;
  assert.equal(json([focus.values?.narrative, focus.narrativeReview?.verdict, focus.narrativeReview?.by]), json([GUIDE, "keep", { provider: "openai", model: "gpt-6-luna" }]));
  const [review] = h.reviewCalls;
  assert.equal(json([review.model, review.schemaName, review.reasoningEffort]), json(["gpt-6-luna", "draft2_focus_narrative_review", "low"]));
  assert.match(String(review.instructions), /# Verified facts\n/);
  assert.equal(json((review.contents as { focus: { narrative: unknown } }).focus.narrative), json(focusTypes.focusForModels({ ...focus.values!, visualDirection: undefined }).narrative), "the judge reads the form as decided, before the plan writes the visual direction");
  const reviewEntry = h.row().trace.find((entry) => entry.operation === "draft2_focus_narrative_review")!;
  assert.equal(json([reviewEntry.provider, reviewEntry.model, reviewEntry.outcome, reviewEntry.skillVersions]), json(["openai", "gpt-6-luna", "ok", { narratives: "4" }]));
});

test("the judge sends a form back to classic: Claude's proposal stays beside it for the editor", async () => {
  const h = harness({ answers: [answer({ narrative: GUIDE })], reviews: [{ verdict: "classic", reason: "A schedule of unrelated items has no thread to follow." }], env: { OPENAI_API_KEY: "sk-test" } });
  const focus = (await h.decide()).focus!;
  assert.equal(json([focus.values?.narrative, focus.ai?.narrative, focus.narrativeReview?.verdict, focus.narrativeReview?.proposed]), json([focusTypes.CLASSIC_NARRATIVE, focusTypes.CLASSIC_NARRATIVE, "classic", GUIDE]));
  const edited = (await h.edit("narrative", { value: focus.narrativeReview?.proposed })).focus!;
  assert.equal(json([edited.values?.narrative, edited.edited]), json([GUIDE, ["narrative"]]), "the editor takes Claude's proposal back; it stays theirs");
});

test("a review that cannot run leaves Claude's form standing, with why; a decision never fails for it", async () => {
  const unconfigured = (await harness({ answers: [answer({ narrative: GUIDE })] }).decide()).focus!;
  assert.equal(json([unconfigured.values?.narrative, unconfigured.narrativeReview?.verdict]), json([GUIDE, "unavailable"]));
  assert.match(unconfigured.narrativeReview!.reason, /OPENAI_API_KEY is not configured/);
  const h = harness({ answers: [answer({ narrative: GUIDE })], reviews: [new Error("openai gpt-6-luna failed (HTTP 429: rate limited)")], env: { OPENAI_API_KEY: "sk-test", DRAFT2_MODEL_JUDGE: "gpt-6-luna" } });
  const session = await h.decide();
  assert.equal(json([session.status, session.focus?.values?.narrative, session.focus?.narrativeReview?.verdict]), json(["ready", GUIDE, "unavailable"]));
  assert.match(session.focus!.narrativeReview!.reason, /^Luna could not review the narrative form \(openai gpt-6-luna failed \(HTTP 429/);
  assert.equal(session.trace.find((entry) => entry.operation === "draft2_focus_narrative_review")?.outcome, "error");
});

test("the editor's narrative form goes back to Claude as a choice and is not reviewed again", async () => {
  const h = harness({ answers: [answer(), answer({ narrative: { ...GUIDE, characterId: "char-unknown" } })], env: { OPENAI_API_KEY: "sk-test" } });
  await h.decide();
  await h.edit("narrative", { value: GUIDE });
  const focus = (await h.decide()).focus!;
  assert.equal(json((h.decisions()[1].contents as { editorChoices: unknown }).editorChoices), json({ narrative: GUIDE }));
  assert.equal(json([focus.values?.narrative, focus.narrativeReview, h.reviewCalls.length]), json([GUIDE, undefined, 0]), "kept as the editor chose it, whatever Claude answered");
});

const DISCOVERY = { arc: "discovery", premise: "The park's animals sent an SOS: they need humans to bring them « bonbons ».", premiseFactIds: ["f1"], reveals: ["What is this message?", "Who sent it?", "When and where?"] };

test("a premise and a narrative form Claude chose are reviewed side by side; each is kept or sent back to classic on its own", async () => {
  const h = harness({
    answers: [answer({ concept: DISCOVERY, narrative: GUIDE })],
    reviews: [{ verdict: "keep", reason: "Jo carries the walk." }, { verdict: "classic", reason: "The SOS invents a danger the facts do not have." }],
    env: { OPENAI_API_KEY: "sk-test", DRAFT2_MODEL_JUDGE: "gpt-6-luna" },
  });
  const focus = (await h.decide()).focus!;
  assert.equal(json(h.reviewCalls.map((call) => call.schemaName)), json(["draft2_focus_narrative_review", "draft2_focus_concept_review"]));
  assert.match(String(h.reviewCalls[1].instructions), /## Reviewing a premise/);
  assert.equal(json((h.reviewCalls[1].contents as { focus: { concept: unknown } }).focus.concept), json(focusTypes.conceptForModels(DISCOVERY as never)));
  assert.equal(json([focus.values?.narrative, focus.values?.concept, focus.ai?.concept]), json([GUIDE, focusTypes.CLASSIC_CONCEPT, focusTypes.CLASSIC_CONCEPT]));
  assert.equal(json([focus.narrativeReview?.verdict, focus.conceptReview?.verdict, focus.conceptReview?.proposed]), json(["keep", "classic", DISCOVERY]));
  const concept = h.row().trace.filter((entry) => entry.operation === "draft2_focus_concept_review");
  assert.equal(json(concept.map((entry) => [entry.provider, entry.model, entry.skillVersions])), json([["openai", "gpt-6-luna", { discovery: "1" }]]));
  const edited = (await h.edit("concept", { value: focus.conceptReview?.proposed })).focus!;
  assert.equal(json([edited.values?.concept, edited.edited]), json([DISCOVERY, ["concept"]]), "the editor takes Claude's premise back; it stays theirs");
});

test("an arc Claude chose is reviewed with the arcs skill", async () => {
  const chain = { arc: "cause-effect", premise: "", premiseFactIds: ["f1"], reveals: ["Videos replace binders", "Awards come in a week"] };
  const h = harness({ answers: [answer({ concept: chain })], reviews: [{ verdict: "keep", reason: "Each link is a fact." }], env: { OPENAI_API_KEY: "sk-test" } });
  const focus = (await h.decide()).focus!;
  assert.equal(json([focus.values?.concept, focus.conceptReview?.verdict]), json([chain, "keep"]));
  assert.match(String(h.reviewCalls[0].instructions), /## Reviewing an arc/);
  const entry = h.row().trace.find((call) => call.operation === "draft2_focus_concept_review");
  assert.equal(json(entry?.skillVersions), json({ arcs: "1" }));
});

test("after the editor changes how the story is told, Claude rewrites the plan from it in one call; the spine and the directions become Claude's again and the stale mark clears", async () => {
  const again = { ...PLAN, direction: "Lead with the guide's first stop; keep the award for the climax.", visualDirection: "Jo at one laptop in an empty hall, lit at the end." };
  const h = harness({ answers: [answer()], plans: [PLAN, again] });
  await h.decide();
  await h.plan();
  const edited = (await h.edit("narrative", { value: GUIDE })).focus!;
  assert.equal(edited.staleDirections, true, "a new form leaves Claude's plan behind");
  const session = await h.rewrite();
  const focus = session.focus!;
  assert.deepEqual([focus.values?.direction, focus.values?.visualDirection, focus.ai?.direction, focus.edited, focus.staleDirections, focus.version], [again.direction, again.visualDirection, again.direction, ["narrative"], false, edited.version + 1]);
  assert.deepEqual(focus.values?.narrative, GUIDE, "the telling the editor chose stands");
  const call = h.calls[h.calls.length - 1];
  assert.equal(call.schemaName, "draft2_focus_plan");
  assert.match(String(call.instructions), /You write the plan of a story's focus/);
  assert.match(String(call.instructions), /# The spine/);
  assert.match(String(call.instructions), /# Narrative forms/, "the planner reads the skill of the telling it plans for");
  const contents = call.contents as { task: string; focus: { narrative?: { form: string }; spine?: unknown }; editorChoices: unknown };
  assert.equal(json([contents.task, contents.focus.narrative?.form, "spine" in contents.focus, contents.editorChoices]), json(["plan", "character-guide", true, {}]), "the planner reads the decision, the earlier spine and the parts the editor owns (none here)");
  assert.equal(json((call.contents as { material?: unknown }).material), json(focusTypes.focusMaterial(INVENTORY as never)), "and People and places, as found now");
  const last = session.trace[session.trace.length - 1];
  assert.equal(json([last.operation, last.outcome, last.effort, last.skillVersions]), json(["draft2_focus_plan", "ok", "high", { focus: "17", levers: "1", spine: "9", reader: "2", narratives: "4" }]));
});

test("with the editor's notes, Claude revises the plan as it stands, the editor's changes in it; the whole new plan is Claude's and the notes are kept", async () => {
  const revised = { ...PLAN, direction: "Name the study once on slide 2; tell the facts after it without attribution.", reasons: { ...PLAN.reasons, spine: "Moved the attribution to slide 2 as asked; left out the year, which no fact gives." } };
  const h = harness({ answers: [answer()], plans: [PLAN, revised] });
  await h.decide();
  await h.plan();
  // The editor changed a beat and the direction by hand before writing notes.
  const handBeats = ARC_SPINE.beats.map((beat, index) => index === 0 ? { ...beat, scene: "The editor's own cover scene." } : beat);
  await h.edit("spine", { value: { beats: handBeats } });
  const before = (await h.edit("direction", { value: "The editor's direction." })).focus!;
  assert.deepEqual(before.edited, ["spine", "direction"]);
  const notes = "Attribute once, on slide 2, to the original study.\nNever say \"critical temperature\".";
  const focus = (await h.planWithNotes(notes)).focus!;
  const call = h.calls[h.calls.length - 1];
  const contents = call.contents as { notes?: string; editorChoices: unknown; focus: { spine?: { scene: string }[]; direction?: string } };
  assert.equal(contents.notes, notes, "the notes go to the planner as written");
  assert.equal(json(contents.editorChoices), "{}", "nothing is held back: the planner revises the whole plan");
  assert.equal(json([contents.focus.spine?.[0]?.scene, contents.focus.direction]), json(["The editor's own cover scene.", "The editor's direction."]), "from the plan as it stands, the editor's changes in it");
  assert.match(String(call.instructions), /## The editor's notes/);
  assert.equal(focus.values?.direction, revised.direction, "Claude's revised plan replaces the editor's direction");
  assert.equal(json(focus.values?.spine), json(focus.ai?.spine), "and the spine is Claude's");
  assert.deepEqual(focus.edited, [], "the plan's fields are Claude's again");
  assert.equal(focus.reasons?.spine, revised.reasons.spine, "Claude says what it did with each note");
  assert.equal(json(focus.planNotes?.map((entry) => [entry.text, entry.focusVersion])), json([[notes, before.version]]));
  assert.equal(focus.version, before.version + 1);
  // A rewrite without notes keeps a hand edit made after it, as before.
  await h.edit("direction", { value: "Edited again by hand." });
  const plain = (await h.plan()).focus!;
  assert.equal(plain.values?.direction, "Edited again by hand.");
  assert.equal(plain.planNotes?.length, 1, "a rewrite without notes adds none");
});

test("the notes as the route reads them: trimmed, line breaks kept, empty is none, too long refused", () => {
  assert.equal(focusTypes.parsePlanNotes("  Attribute once.\r\nNo jargon.  "), "Attribute once.\nNo jargon.");
  assert.equal(focusTypes.parsePlanNotes("   "), undefined);
  assert.equal(focusTypes.parsePlanNotes(undefined), undefined);
  assert.throws(() => focusTypes.parsePlanNotes("x".repeat(focusTypes.FOCUS_PLAN_NOTES_MAX_CHARACTERS + 1)), /under 2,000 characters/);
  assert.throws(() => focusTypes.parsePlanNotes(42), /The notes are text/);
});

test("the plan reads the Topic's last published levers, and a primary these facts cannot carry is asked for again with the list", async () => {
  const h = harness({ answers: [answer()], plans: [{ ...PLAN, levers: { ...PLAN.levers, primary: "stat" } }, PLAN], recentLevers: ["pride", "counterintuitive"] });
  await h.decide();
  const session = await h.plan();
  const plans = h.calls.filter((call) => call.schemaName === "draft2_focus_plan");
  assert.equal(plans.length, 2, "asked again once");
  assert.equal(json((plans[0].contents as { recentLevers: string[] }).recentLevers), json(["pride", "counterintuitive"]));
  assert.match(String((plans[1].contents as { correction?: string }).correction), /primary lever is free or one of this story's levers/);
  assert.equal(session.focus?.values?.levers?.primary, "counterintuitive");
});
