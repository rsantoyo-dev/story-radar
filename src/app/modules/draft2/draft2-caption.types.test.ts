import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  CAPTION_MAX_CHARACTERS, CAPTION_PLAN, captionPostText, captionRulesBrief, captionText, mechanicalCaptionIssues, normalHashtag, parseCaptionCandidates, sameCaption,
  type Draft2CaptionCandidate, type Draft2CaptionRules,
} from "./draft2-caption.types";

const facts: Draft2Fact[] = [
  { id: "f1", claim: "The Vieux-Longueuil library reopens Saturday at 10 a.m.", evidence: "reopens Saturday at 10 a.m.", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "Admission is free for children under 12.", evidence: "free for children under 12", kind: "event", status: "established", importance: 70 },
];
const RULES: Draft2CaptionRules = { emojis: 2, ctaStyle: "Warm, one clear step", cta: "Save this for Saturday.", grave: false };
const TEXT = "📚 The Vieux-Longueuil library opens its doors again on Saturday.\n\nDoors open at 10 a.m.\nFree for children under 12.\n\nSave this for Saturday.";
const TAGS = ["Longueuil", "VieuxLongueuil", "Bibliotheque", "FamilyOuting", "Rentree"];
const caption = (id: string, extra: Partial<Draft2CaptionCandidate> = {}): Draft2CaptionCandidate => ({ id, angle: "Saturday, free for kids", text: TEXT, hashtags: TAGS, factIds: ["f1", "f2"], ...extra });
const codes = (candidates: Draft2CaptionCandidate[], options: Partial<{ credits: string[]; mentions: { handle: string }[]; rules: Draft2CaptionRules }> = {}) =>
  mechanicalCaptionIssues(candidates, facts, { credits: [], mentions: [], rules: RULES, ...options }).map((issue) => `${issue.candidateId}:${issue.code}`);

test("two rounds: three captions and Sol's proposal, then the best revised beside it", () => {
  assert.equal(JSON.stringify(CAPTION_PLAN), JSON.stringify([{ revise: 0, fresh: 3, proposals: 1, effort: "medium" }, { revise: 1, fresh: 0, proposals: 0 }]));
});

test("a caption keeps its line breaks and one blank line between parts; spaces are tidied inside each line", () => {
  assert.equal(captionText("  Line one  \r\nLine   two\n\n\n\nPart two \t\n"), "Line one\nLine two\n\nPart two");
  assert.equal(normalHashtag(" ##Longueuil "), "Longueuil");
});

test("the post v1 publishes: the text, a blank line and the credits, a blank line and the hashtags", () => {
  assert.equal(captionPostText({ text: "Hello.\n\nSee you Saturday.", credits: ["Photo: A. Lens · CC BY 4.0", "Map: © OpenStreetMap"], hashtags: ["Longueuil", "#Biblio"] }),
    "Hello.\n\nSee you Saturday.\n\nPhoto: A. Lens · CC BY 4.0\nMap: © OpenStreetMap\n\n#Longueuil #Biblio");
  assert.equal(captionPostText({ text: "Hello.", credits: [], hashtags: [] }), "Hello.");
});

test("the writer's captions: hashtags without the #, the line breaks kept; a malformed answer is a response error", () => {
  const [parsed] = parseCaptionCandidates(JSON.stringify({ candidates: [{ id: "c1", text: "One\n\nTwo", hashtags: ["#Longueuil", "Biblio"], factIds: ["f1"], angle: "Saturday" }] }));
  assert.equal(JSON.stringify([parsed.text, parsed.hashtags]), JSON.stringify(["One\n\nTwo", ["Longueuil", "Biblio"]]));
  assert.throws(() => parseCaptionCandidates("{"), Draft2ResponseError);
  assert.throws(() => parseCaptionCandidates(JSON.stringify({ candidates: [{ id: "c1", text: "", hashtags: [], factIds: [], angle: "" }] })), Draft2ResponseError);
});

test("a clean caption has no finding", () => {
  assert.deepEqual(codes([caption("c1")]), []);
});

test("facts, numbers and length: every claim rests on verified facts, and the whole post fits Instagram", () => {
  assert.deepEqual(codes([caption("c1", { factIds: [] })]), ["c1:NO_FACTS", "c1:UNSUPPORTED_NUMBER"]);
  assert.deepEqual(codes([caption("c1", { factIds: ["f1", "f9"] })]), ["c1:FACT_UNKNOWN", "c1:UNSUPPORTED_NUMBER"], "12 is stated only by f2");
  assert.deepEqual(codes([caption("c1", { text: TEXT.replace("10 a.m.", "11 a.m.") })]), ["c1:UNSUPPORTED_NUMBER"]);
  const long = `${TEXT}\n\n${"A long line that keeps going on. ".repeat(70)}`;
  assert.ok(long.length < CAPTION_MAX_CHARACTERS * 2);
  assert.deepEqual(codes([caption("c1", { text: long })]), ["c1:TEXT_TOO_LONG"]);
  const almost = `${TEXT}\n\n${"x".repeat(CAPTION_MAX_CHARACTERS - TEXT.length - 120)}`;
  assert.deepEqual(codes([caption("c1", { text: almost })]), [], "within the limit on its own");
  assert.deepEqual(codes([caption("c1", { text: almost })], { credits: ["Photo: ".padEnd(80, "y")] }), ["c1:TEXT_TOO_LONG"], "the credits and the hashtags count too");
});

test("the brand's emojis, the hashtags after the text, and no talk of the carousel or credit line", () => {
  assert.deepEqual(codes([caption("c1")], { rules: { ...RULES, emojis: 0 } }), ["c1:TOO_MANY_EMOJIS"]);
  assert.deepEqual(codes([caption("c1", { text: `🎉🎈 ${TEXT}` })]), ["c1:TOO_MANY_EMOJIS"]);
  assert.deepEqual(codes([caption("c1", { hashtags: TAGS.slice(0, 4) })]), ["c1:HASHTAG_COUNT"]);
  assert.deepEqual(codes([caption("c1", { hashtags: [...TAGS, "a", "Longueuil"] })]), ["c1:HASHTAG_FORMAT"], "one letter, and a tag used twice");
  assert.deepEqual(codes([caption("c1", { text: `${TEXT}\n#Longueuil` })]), ["c1:HASHTAG_IN_TEXT"]);
  assert.deepEqual(codes([caption("c1", { text: TEXT.replace("Save this", "Swipe, then save this") })]), ["c1:NARRATES_CAROUSEL"]);
  assert.deepEqual(codes([caption("c1", { text: `${TEXT}\nPhoto: A. Lens` })]), ["c1:CREDIT_IN_TEXT"]);
  assert.deepEqual(codes([caption("c1", { text: TEXT.replace(/\n+/gu, " ") + " More words to pass the length a caption reads as one block without blank lines, and then some more words." })]), ["c1:NO_SPACING"]);
});

test("every account the editor confirmed is tagged, and no other; an email address is not an account", () => {
  const tagged = `${TEXT}\nWith @biblio.longueuil and info@longueuil.quebec. Thanks @Biblio.Longueuil.`;
  assert.deepEqual(codes([caption("c1", { text: tagged })], { mentions: [{ handle: "@Biblio.Longueuil" }] }), []);
  assert.deepEqual(codes([caption("c1", { text: `${tagged} Thanks @cfournier.` })], { mentions: [{ handle: "@biblio.longueuil" }] }), ["c1:UNVERIFIED_MENTION"]);
  assert.deepEqual(codes([caption("c1")], { mentions: [{ handle: "@biblio.longueuil" }] }), ["c1:MENTION_MISSING"], "a confirmed account the caption never tags");
  const [issue] = mechanicalCaptionIssues([caption("c1", { text: tagged })], facts, { credits: [], mentions: [{ handle: "@biblio.longueuil" }, { handle: "@cirqueeloize" }], rules: RULES });
  assert.deepEqual([issue.code, issue.detail], ["MENTION_MISSING", "@cirqueeloize is an account the editor confirmed; tag it once, where its name would go or right after it."], "one of two confirmed accounts left out");
  assert.deepEqual(codes([caption("c1", { text: `${TEXT}\nMerci @cirqueeloize.` })], { mentions: [{ handle: "@cirqueeloize" }] }), [], "a period after the handle ends the sentence");
});

test("two captions that open alike: the second is a duplicate, unless both are the judge's proposal as written and as edited", () => {
  assert.deepEqual(codes([caption("c1"), caption("c2", { text: `${TEXT.split("\n")[0]}\n\nAnother body.\n\nSave this for Saturday.` })]), ["c2:DUPLICATE_CANDIDATE"]);
  assert.deepEqual(codes([caption("c5", { proposalOf: "p1" }), caption("c6", { proposalOf: "p1", asProposed: true })]), []);
  assert.ok(sameCaption(caption("c1", { text: "It's open.\n\nSave this." }), caption("c2", { text: "It’s open.\n\nSave this." })), "the same words, typography aside");
  assert.ok(!sameCaption(caption("c1"), caption("c2", { hashtags: [...TAGS].reverse() })));
});

test("the rules each model reads: the emoji allowance, the closing's call to action in the publication's style, none on a grave story", () => {
  assert.equal(captionRulesBrief(RULES), "# The post\n- Emojis: at most 2 in the whole caption.\n- The call to action: the closing's, the same single action, stated once (Save this for Saturday.).\n- The publication's call-to-action style (its voice; the action is the closing's): Warm, one clear step");
  assert.equal(captionRulesBrief({ emojis: 0, ctaStyle: " ", cta: "", grave: true }), "# The post\n- Emojis: none.\n- The story is grave: no call to action.");
});

test("the caption never uses an abbreviation the facts had to spell out", () => {
  const explaining: Draft2Fact[] = [...facts, { id: "f3", claim: "La Bibliothèque du Vieux-Longueuil (BVL) rouvre samedi.", evidence: "", kind: "event", status: "established", importance: 50 }];
  const text = TEXT.replace("The Vieux-Longueuil library", "The BVL");
  assert.deepEqual(mechanicalCaptionIssues([caption("c1", { text })], explaining, { credits: [], mentions: [], rules: RULES }).map((issue) => `${issue.candidateId}:${issue.code}`), ["c1:ABBREVIATION"]);
});
