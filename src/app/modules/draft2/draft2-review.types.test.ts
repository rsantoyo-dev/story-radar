import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError } from "./draft2-facts.types";
import {
  DRAFT2_READER_SCHEMA, DRAFT2_REVIEW_SCHEMA, REVIEW_CRITERIA, deckIndex, parseReaderAnswer, parseReviewAnswer, patchField, patchOwner, patchedClosing, patchedDeck, patchedOpening, proposedPatches, resolveSlide, reviewCurrent, reviewPatches, slideFields, slideText,
  type Draft2Review,
} from "./draft2-review.types";
import type { Draft2CarouselSlide } from "./draft2-visual.types";

const carousel: Draft2CarouselSlide[] = [
  { slide: "cover", label: "Cover", headline: "The library opens its doors again", text: "Saturday, in Vieux-Longueuil, after two years of work.", factIds: ["f1"] },
  { slide: "slide2", label: "Slide 2", headline: "Free for kids", text: "Under twelve, admission is free.", factIds: ["f2"] },
  { slide: "s1", label: "Slide 3", headline: "What the new rooms hold", text: "A reading room and a workshop.", practical: "Sat · 10 a.m. · free", factIds: ["f1"] },
  { slide: "penultimate", label: "Slide 4", headline: "Why it took two years", text: "The roof came first, the mayor said.", factIds: ["f3"] },
  { slide: "last", label: "Slide 5", headline: "See you Saturday", text: "Doors open at ten.", cta: "Save this for Saturday.", factIds: ["f1"] },
];

test("the reader's answer: a reaction per known slide in the carousel's order, the rest within limits; nothing for no slide is no reading", () => {
  const read = parseReaderAnswer(JSON.stringify({
    reactions: [{ slide: "slide2", swipe: true, thought: "Oh, free." }, { slide: "cover", swipe: true, thought: "Which library?" }, { slide: "nowhere", swipe: false, thought: "x" }, { slide: "cover", swipe: false, thought: "again" }],
    follow: true, comment: "Finally!", share: false, stoppedAt: "s9", verdict: "I would go.",
  }), carousel);
  assert.deepEqual(read.reactions.map((reaction) => `${reaction.slide}:${reaction.swipe}:${reaction.thought}`), ["cover:true:Which library?", "slide2:true:Oh, free."], "the carousel's order, one per slide, unknown slides dropped");
  assert.deepEqual([read.follow, read.comment, read.share, read.stoppedAt, read.verdict], [true, "Finally!", false, null, "I would go."], "a stop on an unknown slide is no stop");
  assert.throws(() => parseReaderAnswer(JSON.stringify({ reactions: [], follow: false, comment: "", share: false, stoppedAt: null, verdict: "Meh." }), carousel), (error: Error) => error instanceof Draft2ResponseError && /none of the carousel's slides/.test(error.message));
  assert.throws(() => parseReaderAnswer("not json", carousel), /not valid JSON/);
  assert.deepEqual((DRAFT2_READER_SCHEMA.required as string[]).sort(), ["comment", "follow", "reactions", "share", "stoppedAt", "verdict"]);
});

test("the editor's answer: integer scores clamped, a verdict and a summary, strengths, and patches only for texts the slides have", () => {
  const answer = parseReviewAnswer(JSON.stringify({
    scores: { tension: 88, clarity: 101, grace: 0, flow: 90, turn: 85, truth: 97, originality: 86, overall: 89 },
    verdict: "patch", summary: "Close; the cover promises less than the story gives.", strengths: ["The penultimate pays the roof."],
    patches: [
      { slide: "cover", field: "headline", before: "The library opens its doors again", after: "The library is back, two years later", reason: "Name the wait." },
      { slide: "slide2", field: "subheadline", before: "x", after: "y", reason: "no such text on slide 2" },
      { slide: "s1", field: "practical", before: "Sat · 10 a.m. · free", after: "Sat · 10 a.m. · free · all ages", reason: "Say who." },
      { slide: "last", field: "cta", before: "Save this for Saturday.", after: "Save this for Saturday.", reason: "same text" },
      { slide: "cover", field: "headline", before: "dup", after: "dup2", reason: "a second patch on the same text is dropped" },
    ],
  }), carousel);
  assert.deepEqual(answer.scores, { tension: 88, clarity: 100, grace: 1, flow: 90, turn: 85, truth: 97, originality: 86, overall: 89 });
  assert.deepEqual([answer.verdict, answer.strengths], ["patch", ["The penultimate pays the roof."]]);
  assert.deepEqual(answer.patches.map((patch) => `${patch.slide}.${patch.field}`), ["cover.headline", "s1.practical", "last.cta"], "slide 2 has no subheadline; one patch per text");
  const patches = reviewPatches(answer, carousel);
  assert.deepEqual(patches.map((patch) => [patch.id, patch.owner, patch.status]), [["p1", "opening", "proposed"], ["p2", "deck", "proposed"], ["p3", "closing", "refused"]], "the same text is no patch");
  assert.match(patches[2].note ?? "", /same text/);
  const misquoted = reviewPatches({ ...answer, patches: [{ slide: "slide2", field: "body", before: "Under twelve, admission costs nothing.", after: "Kids under twelve get in free.", reason: "Plainer." }] }, carousel);
  assert.equal(misquoted[0].status, "refused");
  assert.match(misquoted[0].note ?? "", /quoted "Under twelve, admission costs nothing\."/);
  assert.throws(() => parseReviewAnswer(JSON.stringify({ scores: { tension: 1.5 }, verdict: "patch", summary: "x", strengths: [], patches: [] }), carousel), /tension score is not an integer/);
  assert.throws(() => parseReviewAnswer(JSON.stringify({ scores: Object.fromEntries([...REVIEW_CRITERIA, "overall"].map((key) => [key, 90])), verdict: "maybe", summary: "x", strengths: [], patches: [] }), carousel), /verdict or summary is missing/);
  const enumsInArrays = (node: unknown, inArray = false): number => {
    if (!node || typeof node !== "object") return 0;
    const record = node as Record<string, unknown>;
    let count = Array.isArray(record.enum) && inArray ? 1 : 0;
    for (const value of Object.values((record.properties as Record<string, unknown>) ?? {})) count += enumsInArrays(value, inArray);
    if (record.items) count += enumsInArrays(record.items, true);
    return count;
  };
  assert.equal(enumsInArrays(DRAFT2_REVIEW_SCHEMA) + enumsInArrays(DRAFT2_READER_SCHEMA), 0, "no enum inside an array: the compiled grammar stays small");
});

test("slides, owners and texts: the cover has a subheadline, the others a body, a list item its practical line, the last its call to action", () => {
  assert.deepEqual([patchOwner("cover"), patchOwner("slide2"), patchOwner("s3"), patchOwner("penultimate"), patchOwner("last")], ["opening", "opening", "deck", "closing", "closing"]);
  assert.deepEqual([deckIndex("s1"), deckIndex("s12"), deckIndex("cover")], [0, 11, undefined]);
  assert.deepEqual(slideFields(carousel[0]), ["headline", "subheadline"]);
  assert.deepEqual(slideFields(carousel[2]), ["headline", "body", "practical"]);
  assert.deepEqual(slideFields(carousel[4]), ["headline", "body", "cta"]);
  assert.deepEqual([slideText(carousel[0], "subheadline"), slideText(carousel[2], "practical"), slideText(carousel[4], "cta"), slideText(carousel[1], "cta")], ["Saturday, in Vieux-Longueuil, after two years of work.", "Sat · 10 a.m. · free", "Save this for Saturday.", ""]);
});

test("a patched candidate replaces one text and nothing else; a text the step does not have is an error", () => {
  const opening = { id: "c1", angle: "a", cover: { headline: "H", subheadline: "S", factIds: ["f1"] }, slide2: { headline: "H2", body: "B2", factIds: ["f2"] } };
  assert.deepEqual(patchedOpening(opening, "cover", "headline", "New").cover, { headline: "New", subheadline: "S", factIds: ["f1"] });
  assert.deepEqual(patchedOpening(opening, "slide2", "body", "New body").slide2.body, "New body");
  assert.throws(() => patchedOpening(opening, "slide2", "cta", "x"), /no cta on slide2/);
  const closing = { id: "c1", angle: "a", penultimate: { headline: "P", body: "PB", factIds: ["f3"] }, last: { headline: "L", body: "LB", cta: "Go.", factIds: ["f1"] } };
  assert.equal(patchedClosing(closing, "last", "cta", "Save it.").last.cta, "Save it.");
  assert.equal(patchedClosing(closing, "penultimate", "body", "New").penultimate?.body, "New");
  assert.throws(() => patchedClosing({ ...closing, penultimate: undefined }, "penultimate", "body", "x"), /no body on penultimate/);
  const deck = { id: "c1", angle: "a", slides: [{ headline: "A", body: "AB", practical: "", factIds: ["f1"] }, { headline: "B", body: "BB", practical: "p", factIds: ["f2"] }] };
  assert.deepEqual(patchedDeck(deck, "s2", "practical", "q").slides.map((slide) => slide.practical), ["", "q"]);
  assert.throws(() => patchedDeck(deck, "s3", "body", "x"), /no body on s3/);
  const review = { openingId: "o1", closingId: "k1", deckId: "d1", editor: { patches: [{ status: "proposed" }, { status: "applied" }, { status: "refused" }] } } as unknown as Draft2Review;
  assert.equal(reviewCurrent(review, { openingId: "o1", closingId: "k1", deckId: "d1" }), true);
  assert.equal(reviewCurrent(review, { openingId: "o1", closingId: "k1", deckId: "d2" }), false, "a new deck needs a new reading");
  assert.equal(proposedPatches(review).length, 1);
});

test("a reader or an editor who names slides their own way is understood: by id in any case, by label, by position, by headline, or in order when nothing fits", () => {
  assert.deepEqual(["Cover", "slide 2", "Slide 3", "#4", "5 of 5", "S1", "What the new rooms hold", "nowhere", 3].map((name) => resolveSlide(name, carousel)), ["cover", "slide2", "s1", "penultimate", "last", "s1", "s1", undefined, undefined]);
  const numbered = parseReaderAnswer(JSON.stringify({ reactions: carousel.map((slide, index) => ({ slide: `Slide ${index + 1}`, swipe: true, thought: `t${index}` })), follow: false, comment: "", share: false, stoppedAt: "slide 4", verdict: "Fine." }), carousel);
  assert.deepEqual(numbered.reactions.map((reaction) => reaction.slide), ["cover", "slide2", "s1", "penultimate", "last"], "slide N is the Nth slide");
  assert.equal(numbered.stoppedAt, "penultimate");
  const unnamed = parseReaderAnswer(JSON.stringify({ reactions: carousel.map((slide, index) => ({ slide: `moment ${"abcde"[index]}`, swipe: index < 3, thought: "x".repeat(400) })), follow: true, comment: "", share: false, stoppedAt: null, verdict: "v".repeat(400) }), carousel);
  assert.deepEqual(unnamed.reactions.map((reaction) => `${reaction.slide}:${reaction.swipe}`), ["cover:true", "slide2:true", "s1:true", "penultimate:false", "last:false"], "one answer per slide, in order, when no name fits");
  assert.equal(unnamed.reactions[0].thought.length, 300, "a long thought is cut, not dropped");
  assert.equal(unnamed.verdict.length, 300, "a long verdict is cut, not fatal");
  assert.throws(() => parseReaderAnswer(JSON.stringify({ reactions: [{ slide: "intro", swipe: true, thought: "x" }, { slide: "outro", swipe: true, thought: "y" }], follow: false, comment: "", share: false, stoppedAt: null, verdict: "v" }), carousel), /it named "intro", "outro"; the slides are cover, slide2, s1, penultimate, last/);
  assert.deepEqual([patchField("text", carousel[0]), patchField("text", carousel[2]), patchField("Subtitle", carousel[0]), patchField("call to action", carousel[4]), patchField("practical line", carousel[2]), patchField("headline", carousel[1]), patchField("footer", carousel[1])], ["subheadline", "body", "subheadline", "cta", "practical", "headline", undefined]);
  const patched = parseReviewAnswer(JSON.stringify({ scores: Object.fromEntries([...REVIEW_CRITERIA, "overall"].map((key) => [key, 90])), verdict: "patch", summary: "x", strengths: [], patches: [{ slide: "Slide 3", field: "text", before: "A reading room and a workshop.", after: "A reading room, and a workshop.", reason: "r".repeat(400) }] }), carousel);
  assert.deepEqual(patched.patches.map((patch) => `${patch.slide}.${patch.field}.${patch.reason.length}`), ["s1.body.300"], "the third slide's text is the first deck slide's body; a long reason is cut");
});
