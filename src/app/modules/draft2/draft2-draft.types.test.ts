import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError } from "./draft2-facts.types";
import { draftFindings, draftFixRequest, draftPlan, draftRequest, draftRuns, findingCount, findingLines, parseDraft } from "./draft2-draft.types";
import { CAPTION, FACTS, FOCUS, answer, cover } from "./draft2-draft.fixtures";

const plan = draftPlan(FOCUS, ["free"], 0);

test("the draft becomes the steps' own candidates: three openings sharing slide 2, one closing and one deck; a broken part is asked for again", () => {
  const draft = parseDraft(answer(), plan.closingShape);
  assert.deepEqual(draft.openings.map((opening) => [opening.id, opening.cover.headline, opening.slide2.headline, opening.lever]), [
    ["c1", "Pentagon buyers now judge five-minute videos", "Awards in under a week", "free"],
    ["c2", "Your demo video is now the bid", "Awards in under a week", "free"],
    ["c3", "Five minutes of video replaces the paperwork", "Awards in under a week", "free"],
  ]);
  assert.equal(plan.closingShape, "two-slides", "an arc closes on two slides");
  assert.equal(draft.closing.penultimate?.headline, "Awards in days, not years");
  assert.equal(draft.deck.slides.length, 1);
  assert.deepEqual(parseDraft(answer(), plan.closingShape, { round: 2 }).openings.map((opening) => opening.id), ["c1.2", "c2.2", "c3.2"], "a fixed draft's versions are new ones");
  assert.equal(parseDraft(answer(), "one-slide").closing.penultimate, undefined, "a list closes on its last slide alone");
  assert.throws(() => parseDraft("not json", plan.closingShape), Draft2ResponseError);
  assert.throws(() => parseDraft(answer({ covers: [] }), plan.closingShape), /covers/);
  assert.throws(() => parseDraft(answer({ deck: { slides: [{ headline: "No body" }] } }), plan.closingShape), Draft2ResponseError);
  // What the draft wrote beside the words: each slide's image intent, by the carousel's slide ids, and the caption with its first comment.
  assert.deepEqual(draft.extras.images.map((image) => image.slide), ["cover", "slide2", "s1", "penultimate", "last"]);
  assert.equal(draft.extras.images[1].intent, "A wall calendar with six days crossed out and the seventh circled.");
  assert.deepEqual(parseDraft(answer(), "one-slide").extras.images.map((image) => image.slide), ["cover", "slide2", "s1", "last"], "a list's closing has no penultimate intent");
  assert.deepEqual(draft.extras.caption, CAPTION);
  assert.throws(() => parseDraft(answer({ coverImage: "" }), plan.closingShape), /The cover needs its image intent/);
  assert.throws(() => parseDraft(answer({ caption: { ...CAPTION, text: "" } }), plan.closingShape), /The draft needs its caption/);
});

test("the writer's request carries the deck it must fill, the closing's shape and every limit as numbers; a fix carries the draft and the findings", () => {
  const request = draftRequest(plan);
  assert.equal(request.task, "draft");
  assert.equal(request.coversWanted, 3);
  assert.equal(request.closingShape, "two-slides");
  assert.deepEqual(Object.keys(request.wordLimits as object), ["opening", "deck", "closing"]);
  const fix = draftFixRequest(plan, answer(), ["cover (c1): Too long."]);
  assert.equal(fix.task, "fix");
  assert.deepEqual(fix.findings, ["cover (c1): Too long."]);
  assert.equal((fix.draft as { angle: string }).angle, "Speed over paperwork", "the draft travels as the writer wrote it");
});

test("the program checks every part as its funnel would; the draft goes on with the first cover it finds nothing on", () => {
  const clean = draftFindings(parseDraft(answer(), plan.closingShape), plan, { facts: FACTS });
  assert.equal(findingCount(clean), 0, JSON.stringify(findingLines(clean)));
  assert.equal(clean.chosenId, "c1");
  assert.deepEqual(clean.openingSnapshot, { id: "c1", cover: { headline: "Pentagon buyers now judge five-minute videos", subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"] }, slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"] }, lever: "free" });
  // The first cover states a number no fact gives: the second, clean, goes on.
  const flagged = draftFindings(parseDraft(answer({ covers: [cover("Pentagon buyers now judge 90-second videos"), cover("Your demo video is now the bid"), cover("Five minutes of video replaces the paperwork")] }), plan.closingShape), plan, { facts: FACTS });
  assert.equal(flagged.chosenId, "c2");
  assert.equal(findingCount(flagged), 0, "the findings counted are the chosen cover's");
  const all = draftFindings(parseDraft(answer({ covers: [cover("Pentagon buyers now judge 90-second videos")], closing: { penultimate: { headline: "Awards in days, not years", body: "Several awards came in under 30 days, a DOD official says.", factIds: ["f2"], image: "A signed award letter on the table." }, last: { headline: "Your next pitch is a video", body: "Record five minutes that show the product working.", cta: "Follow for the next defence buying change.", factIds: ["f1"], image: "A phone on a tripod filming a product." } } }), plan.closingShape), plan, { facts: FACTS });
  assert.equal(all.chosenId, "c1", "no clean cover: the writer's first");
  assert.ok(all.opening.length >= 1 && all.closing.length >= 1);
  assert.ok(findingLines(all).some((line) => line.startsWith("cover (c1):")) && findingLines(all).some((line) => line.startsWith("penultimate:")), JSON.stringify(findingLines(all)));
});

test("the draft is stored as the Opening, the Closing and the Deck the later steps read: one version each, the fix kept only when it has fewer findings", () => {
  const writer = { provider: "anthropic" as const, model: "claude-opus-5-5" };
  const first = parseDraft(answer({ covers: [cover("Pentagon buyers now judge 90-second videos")] }), plan.closingShape);
  const fixed = parseDraft(answer({ covers: [cover("Pentagon buyers now judge five-minute videos")] }), plan.closingShape, { round: 2 });
  const rounds = [{ draft: first, findings: draftFindings(first, plan, { facts: FACTS }) }, { draft: fixed, findings: draftFindings(fixed, plan, { facts: FACTS }) }];
  const { opening, closing, deck } = draftRuns({ rounds, plan, writer, at: "2026-10-23T20:00:00.000Z" });
  assert.deepEqual([opening.status, opening.winnerId, opening.pipeline, opening.rounds.length, opening.focus], ["ready", "c1.2", "v4", 2, FOCUS]);
  assert.deepEqual([opening.draft?.images.length, opening.draft?.caption.hashtags], [5, CAPTION.hashtags], "the kept draft's image intents and caption travel on the opening run");
  assert.deepEqual([closing.status, closing.winnerId, closing.opening?.id, closing.shape, closing.focus], ["ready", "c1.2", "c1.2", "two-slides", FOCUS]);
  assert.deepEqual([deck.status, deck.winnerId, deck.opening?.id, deck.closing?.id, deck.shape?.kind], ["ready", "c1.2", "c1.2", "c1.2", "arc"]);
  assert.equal(opening.rounds[0].mechanical.length > 0, true, "the first draft's findings stay on its round");
  // A fix that came out worse: the first draft stands, marked for the review.
  const worse = draftRuns({ rounds: [rounds[1], rounds[0]], plan, writer, at: "2026-10-23T20:00:00.000Z" });
  assert.equal(worse.opening.winnerId, "c1.2", "the draft with fewer findings stands, whatever its round");
  const stuck = draftRuns({ rounds: [rounds[0]], plan, writer, at: "2026-10-23T20:00:00.000Z" });
  assert.deepEqual([stuck.opening.status, stuck.opening.winnerId], ["needs-review", "c1"]);
  assert.match(String(stuck.opening.error), /The program found 1 issue on the drafted opening; the whole-carousel review reads it next/);
});
