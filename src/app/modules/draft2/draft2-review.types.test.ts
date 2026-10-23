import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError } from "./draft2-facts.types";
import {
  DRAFT2_READER_SCHEMA, DRAFT2_REVIEW_SCHEMA, DRAFT2_REVIEW_SHORTEN_SCHEMA, REVIEW_CRITERIA, deckIndex, lengthOnly, locateQuote, parseReaderAnswer, parseReviewAnswer, parseShortenAnswer, patchField, patchOwner, patchedClosing, patchedDeck, patchedOpening, proposedPatches, resolveSlide, reviewCurrent,
  reviewPatches, reviewWordLimits, slideFields, slideText,
  type Draft2Review,
} from "./draft2-review.types";
import type { Draft2CarouselSlide } from "./draft2-visual.types";
import * as reviewTypes from "./draft2-review.types";

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

test("a patch on the text it quoted: a sentence of a body is that part of the body, a text on another slide moves the patch there; a quote that is nowhere is refused", () => {
  const json = (value: unknown) => JSON.stringify(value);
  assert.deepEqual(locateQuote(carousel, "penultimate", "body", " the mayor  said"), { slide: "penultimate", field: "body", text: "The roof came first, the mayor said.", part: true });
  assert.deepEqual(locateQuote(carousel, "slide2", "body", "A reading room and a workshop."), { slide: "s1", field: "body", text: "A reading room and a workshop.", part: false });
  assert.equal(locateQuote(carousel, "penultimate", "body", "the roof"), undefined, "too short to find as a part");
  const answer = { scores: { tension: 90, clarity: 90, grace: 90, flow: 90, turn: 90, truth: 90, originality: 90, overall: 90 }, verdict: "patch" as const, summary: "x", strengths: [] };
  const [part, moved, nowhere] = reviewPatches({ ...answer, patches: [
    { slide: "penultimate", field: "body", kind: "detail", before: "the mayor said.", after: "the mayor told the council.", reason: "Say where." },
    { slide: "slide2", field: "body", kind: "repetition", before: "A reading room and a workshop.", after: "A reading room, then a workshop.", reason: "Rhythm." },
    { slide: "last", field: "body", kind: "truth", before: "The doors stay open all night.", after: "Doors open at ten.", reason: "x" },
  ] }, carousel);
  assert.equal(json([part.status, part.before, part.after, part.note]), json(["proposed", "The roof came first, the mayor said.", "The roof came first, the mayor told the council.", "It quoted part of the text: the patch replaces that part."]));
  assert.equal(json([moved.status, moved.slide, moved.owner, moved.before]), json(["proposed", "s1", "deck", "A reading room and a workshop."]));
  assert.match(moved.note ?? "", /named slide2's body; the text it quoted is s1's body/);
  assert.equal(nowhere.status, "refused");
});

test("the word limits the editor reads, per slide and text, as the steps set them for the carousel's shapes; a refusal for length alone; the shortened replacement", () => {
  assert.deepEqual(reviewWordLimits(carousel, { deck: { kind: "arc" }, closing: "two-slides" }), {
    cover: { headline: 8, subheadline: 12 }, slide2: { headline: 8, body: 30 }, s1: { headline: 8, body: 30, practical: 14 }, penultimate: { headline: 8, body: 30 }, last: { headline: 8, body: 25, cta: 14 },
  });
  const oneSlide = reviewWordLimits(carousel.filter((slide) => slide.slide !== "penultimate"), { deck: { kind: "list" }, closing: "one-slide" });
  assert.deepEqual([oneSlide.s1, oneSlide.last, "penultimate" in oneSlide], [{ headline: 8, body: 12, practical: 14 }, { headline: 8, body: 40, cta: 14 }, false], "a list's items and a one-slide closing have their own");
  assert.deepEqual(reviewWordLimits(carousel, {}).s1.body, 30, "an older run without shapes is read as an arc with a two-slide closing");
  assert.equal(lengthOnly(["The slide 2 body has 33 words; the limit is 30."]), true);
  assert.equal(lengthOnly(["The slide 2 body has 33 words; the limit is 30.", "It drops 17, which the facts give: a patch keeps the dates, times and prices a slide carries."]), false);
  assert.equal(lengthOnly([]), false);
  assert.equal(parseShortenAnswer(JSON.stringify({ after: "  Shorter.  " })), "Shorter.");
  assert.throws(() => parseShortenAnswer(JSON.stringify({ after: "" })), (error: Error) => error instanceof Draft2ResponseError && /shortened replacement is missing or longer than 400/.test(error.message));
  assert.throws(() => parseShortenAnswer(JSON.stringify({ after: "x".repeat(401) })), Draft2ResponseError);
  assert.deepEqual((DRAFT2_REVIEW_SHORTEN_SCHEMA as { required: string[] }).required, ["after"]);
});

test("a v4 review's direction patches: the direction it quoted checked against the script, numbered after the text patches; a misquote, the same direction or what the brand avoids is refused (2026-10-23)", () => {
  const images = [
    { slide: "slide2", need: "generic-illustration", subject: "the sky", direction: "A wide rectangle of clear autumn daytime sky, soft blue, a few light clouds." },
    { slide: "s1", need: "generic-illustration", subject: "walking shoes", direction: "A pair of brown leather walking shoes, cut out, on a teal plane." },
  ];
  const answer = JSON.stringify({ directions: [
    { slide: "slide2", kind: "truth", before: "A wide rectangle of clear autumn daytime sky, soft blue, a few light clouds.", after: "The inside of a planetarium dome at night, a projected starry sky over rows of reclined seats, seen from below.", reason: "The show is under a dome, not outdoors." },
    { slide: "slide2", kind: "detail", before: "x", after: "twice", reason: "A second patch on one slide is dropped." },
    { slide: "s1", kind: "style", before: "Something the script never said.", after: "A lantern on a cobbled street.", reason: "Misquoted." },
  ] });
  const avoid = (direction: string) => /sparkles/i.test(direction) ? "Sparkles" : undefined;
  const patches = reviewTypes.directionPatches(answer, images, { firstId: 3, avoid });
  assert.deepEqual(patches.map((patch) => [patch.id, patch.slide, patch.owner, patch.field, patch.kind, patch.status]), [["p3", "slide2", "visual", "direction", "truth", "proposed"], ["p4", "s1", "visual", "direction", "style", "refused"]]);
  assert.equal(patches[0].before, images[0].direction, "the direction as it stands, quoted whole");
  assert.match(patches[1].note ?? "", /^The review quoted "Something the script never said\."/);
  const avoided = reviewTypes.directionPatches(JSON.stringify({ directions: [{ slide: "s1", kind: "detail", before: images[1].direction, after: "Walking shoes with sparkles around them.", reason: "Brighter." }] }), images, { firstId: 1, avoid });
  assert.match(avoided[0].note ?? "", /asks for "Sparkles", which the brand's identity avoids/);
  const same = reviewTypes.directionPatches(JSON.stringify({ directions: [{ slide: "s1", kind: "style", before: images[1].direction, after: images[1].direction, reason: "Same." }] }), images, { firstId: 1, avoid });
  assert.equal(same[0].note, "The replacement is the same direction.");
  assert.deepEqual(reviewTypes.directionPatches("not json", images, { firstId: 1, avoid }), []);
  // A review is current for the script it read, when a script is named.
  const read = { openingId: "c1", closingId: "k1", deckId: "d1", visualId: "v1" };
  assert.equal(reviewTypes.reviewCurrent(read, { openingId: "c1", closingId: "k1", deckId: "d1", visualId: "v1" }), true);
  assert.equal(reviewTypes.reviewCurrent(read, { openingId: "c1", closingId: "k1", deckId: "d1", visualId: "v2" }), false);
  assert.equal(reviewTypes.reviewCurrent({ ...read, visualId: undefined }, { openingId: "c1", closingId: "k1", deckId: "d1", visualId: "v1" }), false, "a review that read no script is not current for one");
  assert.equal(reviewTypes.reviewCurrent({ ...read, visualId: undefined }, { openingId: "c1", closingId: "k1", deckId: "d1" }), true, "v2 and v3 name none");
});
