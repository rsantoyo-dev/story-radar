import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as models from "./draft2-models";
import * as traceCost from "./draft2-trace-cost";
import * as focusTypes from "./draft2-focus.types";
import * as openingTypes from "./draft2-opening.types";
import * as closingTypes from "./draft2-closing.types";
import * as deckTypes from "./draft2-deck.types";
import * as visualTypes from "./draft2-visual.types";
import * as reviewTypes from "./draft2-review.types";
import * as skills from "./skills/draft2-skills";
import * as reviewSkill from "./skills/review";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Review } from "./draft2-review.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const json = (value: unknown) => JSON.stringify(value);

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The Vieux-Longueuil library reopens Saturday.", evidence: "reopens Saturday", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "Admission is free for children under twelve.", evidence: "free for children under twelve", kind: "event", status: "established", importance: 70 },
  { id: "f3", claim: "The roof was rebuilt first, the mayor said.", evidence: "the roof was rebuilt first", kind: "event", status: "attributed", attribution: "the mayor", importance: 60 },
];
const VALUES: focusTypes.Draft2FocusValues = {
  line: null, audience: "Families in Vieux-Longueuil", framing: "explainer", readerConsequence: null, structure: { kind: "arc", itemFactIds: [] }, goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 40, energy: 60, optimism: 70, provocation: 20 }, direction: "Lead with the reopening.", visualDirection: "Doors and rooms.",
};
const FOCUS: focusTypes.Draft2FocusSnapshot = { version: 2, values: VALUES };
const opening = { id: "c1", angle: "The doors", cover: { headline: "The library opens its doors again", subheadline: "Saturday, in Vieux-Longueuil.", factIds: ["f1"] }, slide2: { headline: "Free for kids", body: "Under twelve, admission is free.", factIds: ["f2"] } };
const closing = { id: "k1", angle: "The roof", penultimate: { headline: "Why the wait", body: "The roof came first, the mayor said.", factIds: ["f3"] }, last: { headline: "See you there", body: "Bring the children.", cta: "Save this for Saturday.", factIds: ["f1"] } };
const deck = { id: "d1", angle: "Rooms", slides: [{ headline: "A reading room", body: "Quiet tables by the windows.", practical: "", factIds: ["f1"] }, { headline: "A workshop", body: "Tools for small hands.", practical: "", factIds: ["f2"] }] };
const run = <C extends { id: string }>(candidate: C, extra: Record<string, unknown>) => ({ status: "ready", winnerId: candidate.id, candidates: [candidate], rounds: [{ round: 1, candidates: [candidate], mechanical: [], at: "t" }], focus: FOCUS, ...extra });
const OPENING = run(opening, {});
const CLOSING = run(closing, { opening: { id: opening.id, cover: opening.cover, slide2: opening.slide2 }, shape: "two-slides" });
const DECK = run(deck, { opening: { id: opening.id, cover: opening.cover, slide2: opening.slide2 }, closing: { id: closing.id, penultimate: closing.penultimate, last: closing.last }, shape: { kind: "arc", min: 2, max: 5, items: [] } });
const profile = { name: "Salut Longueuil", language: "French", region: "Longueuil", platform: "Instagram", audience: "Families", brandPersonality: ["warm"], formality: 30, humor: 40, energy: 60, optimism: 70, provocation: 20, allowEmojis: true, maxEmojis: 3, callToActionStyle: "One warm step" };

const READER = {
  reactions: [{ slide: "cover", swipe: true, thought: "Which library?" }, { slide: "slide2", swipe: true, thought: "Free, nice." }, { slide: "s1", swipe: true, thought: "Ok." }, { slide: "s2", swipe: false, thought: "Tools?" }, { slide: "penultimate", swipe: true, thought: "Ah, the roof." }, { slide: "last", swipe: true, thought: "Saturday it is." }],
  follow: true, comment: "Finally!", share: false, stoppedAt: null, verdict: "I would go.",
};
const EDITOR = {
  scores: { tension: 86, clarity: 90, grace: 84, flow: 88, turn: 80, truth: 97, overall: 87 }, verdict: "patch", summary: "Close; slide 4 loses the reader.",
  strengths: ["The roof pays the wait."],
  patches: [
    { slide: "slide2", field: "body", before: "Under twelve, admission is free.", after: "Kids under twelve get in free.", reason: "Plainer, in the audience's words." },
    { slide: "cover", field: "headline", before: "The library opens its doors again", after: "After two long years the library finally opens its doors again", reason: "Name the wait." },
    { slide: "s2", field: "body", before: "Tools for grown hands.", after: "Tools made for small hands.", reason: "misquoted" },
  ],
};

type Row = Record<string, unknown> & { review: Draft2Review | null; trace: types.Draft2TraceEntry[]; updatedAt: Date };

function harness({ session, reader = READER, editor = EDITOR, env = { OPENAI_API_KEY: "sk-test" } }: { session?: Record<string, unknown>; reader?: unknown; editor?: unknown; env?: Record<string, string> } = {}) {
  const calls: Record<string, unknown>[] = [];
  let row: Row = { id: sessionId, topicId, storyId, step: "deck", status: "needs-review", facts, focus: { status: "ready", version: 2, values: VALUES, edited: [], lineOptions: [] }, opening: OPENING, closing: CLOSING, deck: DECK, review: null, error: null, trace: [], updatedAt: new Date(), ...session };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types, "./draft2-funnel": funnel, "./draft2-models": models, "./draft2-trace-cost": traceCost, "./draft2-focus.types": focusTypes,
    "./draft2-opening.types": openingTypes, "./draft2-closing.types": closingTypes, "./draft2-deck.types": deckTypes, "./draft2-visual.types": visualTypes, "./draft2-review.types": reviewTypes,
    "./skills/draft2-skills": skills, "./skills/review": reviewSkill,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push(input);
      const answer = input.schemaName === "draft2_review_read" ? reader : editor;
      if (answer instanceof Error) throw answer;
      return { text: JSON.stringify(answer), usage: { promptTokens: 300, outputTokens: 120, thoughtsTokens: 0, totalTokens: 420 }, cachedInputTokens: 0 };
    } },
    "./draft2-session.repository": {
      activeDraft2Session: async () => undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, status: "running", updatedAt: new Date() }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, updatedAt: new Date() }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  const exports = loadInSandbox("./draft2-review.ts", mocks, { process: { env } });
  return {
    review: () => (exports.reviewDraft2Carousel as (input: unknown) => Promise<Row>)({ topicId, storyId, sessionId }),
    decide: (action: string, patchId?: string, by?: string) => (exports.decideDraft2ReviewPatch as (input: unknown) => Promise<Row>)({ topicId, sessionId, patchId, action, by }),
    models: () => (exports.reviewModels as (env: Record<string, string>) => { reader: string; editor: string })(env),
    calls,
    row: () => row,
  };
}

test("the review reads the chosen carousel: a reader of the audience first, then the editor with the reactions, the focus and the facts; the program refuses a patch that breaks a rule or misquotes a slide", async () => {
  const h = harness();
  const session = await h.review();
  assert.equal(json([session.step, session.status, session.review?.status, session.review?.version]), json(["review", "ready", "ready", 1]));
  const review = session.review!;
  assert.equal(json([review.openingId, review.closingId, review.deckId, review.focusVersion, review.carousel.map((slide) => slide.slide)]), json(["c1", "k1", "d1", 2, ["cover", "slide2", "s1", "s2", "penultimate", "last"]]));
  const [readerCall, editorCall] = h.calls;
  assert.equal(json([readerCall.schemaName, readerCall.model, readerCall.reasoningEffort]), json(["draft2_review_read", "gpt-6-luna", "low"]), "the reader is the cheap judge by default");
  assert.match(String(readerCall.instructions), /^You are one reader of the publication described below/);
  assert.equal("review" in (readerCall.instructions as string ? {} : {}), false);
  assert.doesNotMatch(String(readerCall.instructions), /# Reviewing a carousel/, "the reader knows no rubric");
  assert.equal(json([editorCall.schemaName, editorCall.model, editorCall.reasoningEffort]), json(["draft2_review", "gpt-6.1-sol", "medium"]), "the editor is Sol by default: the independent gate");
  assert.match(String(editorCall.instructions), /You are the demanding editor of a finished social carousel[^]*# Reviewing a carousel[^]*# Verified facts/);
  const contents = editorCall.contents as { task: string; slides: { slide: string }[]; reader: { verdict: string }; focus: { audience: string } };
  assert.equal(json([contents.task, contents.slides.length, contents.reader.verdict, contents.focus.audience]), json(["review", 6, "I would go.", "Families in Vieux-Longueuil"]));
  assert.equal(json(review.reader?.reactions.map((reaction) => reaction.swipe)), json([true, true, true, false, true, true]));
  assert.equal(json([review.editor?.verdict, review.editor?.scores.overall, review.editor?.strengths]), json(["patch", 87, ["The roof pays the wait."]]));
  assert.equal(json(review.editor?.patches.map((patch) => [patch.id, patch.owner, patch.status])), json([["p1", "opening", "proposed"], ["p2", "opening", "refused"], ["p3", "deck", "refused"]]));
  assert.match(review.editor!.patches[1].note ?? "", /headline/i, "a cover headline over eight words breaks the opening's rule");
  assert.match(review.editor!.patches[2].note ?? "", /quoted "Tools for grown hands\."/);
  assert.equal(json(session.trace.map((entry) => [entry.step, entry.operation, entry.outcome, entry.effort, entry.skillVersions])), json([["review", "draft2_review_read", "ok", "low", {}], ["review", "draft2_review", "ok", "medium", { review: "1" }]]));
});

test("a patch applied edits the chosen version in place, in its step and in the copies the later steps keep; the review keeps what it replaced, and an undo restores it", async () => {
  const h = harness();
  await h.review();
  const applied = await h.decide("apply", "p1");
  const text = (row: Row) => ({
    opening: (row.opening as { rounds: { candidates: { slide2: { body: string } }[] }[]; candidates: { slide2: { body: string } }[] }),
    closingCopy: (row.closing as { opening: { slide2: { body: string } } }).opening.slide2.body,
    deckCopy: (row.deck as { opening: { slide2: { body: string } } }).opening.slide2.body,
    reviewCopy: (row.review as Draft2Review).carousel[1].text,
  });
  const after = text(applied);
  assert.equal(json([after.opening.rounds[0].candidates[0].slide2.body, after.opening.candidates[0].slide2.body, after.closingCopy, after.deckCopy, after.reviewCopy]), json(Array(5).fill("Kids under twelve get in free.")), "the version and every copy of it");
  const patch = applied.review!.editor!.patches[0];
  assert.equal(json([patch.status, patch.appliedBy, patch.before, applied.review!.version]), json(["applied", "editor", "Under twelve, admission is free.", 2]));
  await assert.rejects(h.decide("apply", "p1"), /already applied/);
  await assert.rejects(h.decide("apply", "p2"), /already refused/);
  const undone = await h.decide("undo", "p1");
  const before = text(undone);
  assert.equal(json([before.opening.rounds[0].candidates[0].slide2.body, before.closingCopy, before.deckCopy, before.reviewCopy, undone.review!.editor!.patches[0].status, undone.review!.version]), json(["Under twelve, admission is free.", "Under twelve, admission is free.", "Under twelve, admission is free.", "Under twelve, admission is free.", "proposed", 3]));
  const declined = await h.decide("decline", "p1");
  assert.equal(declined.review!.editor!.patches[0].status, "declined");
  await assert.rejects(h.decide("undo", "p1"), /not applied/);
});

test("apply-all applies every proposed patch for the autopilot and nothing else; a carousel that changed since the reading refuses a patch", async () => {
  const h = harness({ editor: { ...EDITOR, patches: [EDITOR.patches[0], { slide: "last", field: "cta", before: "Save this for Saturday.", after: "Save this for the weekend.", reason: "Wider." }] } });
  await h.review();
  const all = await h.decide("apply-all", undefined, "autopilot");
  assert.equal(json(all.review!.editor!.patches.map((patch) => [patch.status, patch.appliedBy])), json([["applied", "autopilot"], ["applied", "autopilot"]]));
  assert.equal((all.closing as { candidates: { last: { cta: string } }[] }).candidates[0].last.cta, "Save this for the weekend.");
  assert.equal((all.deck as { closing: { last: { cta: string } } }).closing.last.cta, "Save this for the weekend.", "the deck's copy of the closing follows");
  assert.equal((await h.decide("apply-all", undefined, "autopilot")).review!.version, all.review!.version, "nothing left to apply changes nothing");
  // A new opening chosen since the reading: the review is of other versions.
  const stale = harness({ session: { review: { ...all.review!, openingId: "c0" } } });
  await assert.rejects(stale.decide("undo", "p1"), /read other versions of the carousel/);
});

test("the review needs a finished, consistent carousel and the OpenAI key; a failure keeps the review from before and marks the step failed", async () => {
  await assert.rejects(harness({ session: { deck: { ...DECK, status: "running" } } }).review(), (error: Error) => error instanceof types.Draft2InputError && /Finish the deck first/.test(error.message));
  await assert.rejects(harness({ session: { opening: { ...OPENING, editorChoiceId: "c9", rounds: [{ round: 1, candidates: [opening, { ...opening, id: "c9" }], mechanical: [], at: "t" }] } } }).review(), /chosen now are c9/);
  await assert.rejects(harness({ env: {} }).review(), /OPENAI_API_KEY is not configured/);
  const failing = harness({ reader: new Error("openai gpt-6-luna failed (HTTP 429: rate limited)") });
  await assert.rejects(failing.review(), /HTTP 429/);
  const row = failing.row();
  assert.equal(json([row.status, row.review?.status, row.step]), json(["failed", "failed", "review"]));
  assert.match(String(row.review?.error), /HTTP 429/);
  assert.equal(row.trace[row.trace.length - 1].outcome, "error");
  assert.equal(json(harness({ env: { OPENAI_API_KEY: "k", DRAFT2_MODEL_JUDGE: "gpt-6-luna", DRAFT2_MODEL_REVIEW_JUDGE: "gpt-6-astra" } }).models()), json({ reader: "gpt-6-luna", editor: "gpt-6-astra" }), "the editor's model is the review's own knob, never the cheap judge by accident");
});
