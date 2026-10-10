import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError } from "./draft2-facts.types";
import {
  VISUAL_CRITERIA, VISUAL_LONG_PLAN, VISUAL_PLAN, avoidTerms, carouselSlides, mechanicalVisualIssues, parseVisualCandidates, parseVisualEvaluation, sameVisual,
  visualExploreRequest, visualJudgeRequest, visualModeLine, visualPlan, visualRefineRequest, visualSchema,
  type Draft2CarouselSlide, type Draft2VisualCandidate, type Draft2VisualIssue, type Draft2VisualRound, type Draft2VisualScore, type Draft2VisualSlide,
} from "./draft2-visual.types";
import { funnelVersions } from "./draft2-funnel";
import type { Draft2Inventory, Draft2InventoryEntity } from "./draft2-inventory.types";

const opening = {
  id: "c1",
  cover: { headline: "Your library reopens Saturday", subheadline: "A new reading room on Rue Saint-Charles.", factIds: ["f3"] },
  slide2: { headline: "The mayor cut the ribbon", body: "Mayor Catherine Fournier opened the new library.", factIds: ["f1"] },
};
const closing = {
  id: "c2",
  penultimate: { headline: "Built to stay open late", body: "The new building keeps the doors open until 9 p.m.", factIds: ["f4"] },
  last: { headline: "See you Saturday", body: "Bring the kids to the reading room.", cta: "Follow us for what opens near you.", factIds: ["f3"] },
};
const deck = { slides: [
  { headline: "A room built for reading", body: "Tall windows and long tables fill the new hall.", practical: "", factIds: ["f2"] },
  { headline: "A corner for the kids", body: "Low shelves and cushions wait in the children's corner.", practical: "", factIds: ["f2"] },
] };
const carousel: Draft2CarouselSlide[] = carouselSlides(opening, deck, closing);

const material = (overrides: Partial<Draft2InventoryEntity> & Pick<Draft2InventoryEntity, "id" | "name" | "kind">): Draft2InventoryEntity => ({ role: "secondary", description: "", factIds: ["f1"], ...overrides });
const inventory: Pick<Draft2Inventory, "entities" | "storyPhotos"> = {
  entities: [
    material({ id: "e1", name: "Catherine Fournier", kind: "person", person: { status: "confirmed", candidates: [], confirmed: { entityId: "Q1", name: "Catherine Fournier", thumbnailUrl: "u", author: "A", license: "CC BY 4.0", commonsUrl: "c", storyPhotoId: "photo-1" } } }),
    material({ id: "e2", name: "Rue Saint-Charles", kind: "place", place: { status: "verified", map: true, photo: { source: "commons", author: "B", license: "CC BY 4.0", resourceUrl: "r", width: 2000, height: 1300, retrievedAt: "t" } } }),
    material({ id: "e3", name: "Jean Tremblay", kind: "person", person: { status: "rejected", candidates: [] } }),
    material({ id: "e4", name: "Pomerleau", kind: "organization" }),
  ],
  storyPhotos: [{ id: "p1", name: "Reading room", description: "", provenance: "Editor", transmissionAllowed: true }],
};
const characters = [{ id: "char-mia", name: "Mia", description: "An illustrated local presenter in a mustard coat" }];

const direction = (focal: string) => `Paper-cut collage in cream and night blue: ${focal}, one focal subject on the left third, soft lavender light, generous space at the top for the headline.`;
const slide = (position: string, overrides: Partial<Draft2VisualSlide> = {}): Draft2VisualSlide => ({ slide: position, beat: `The ${position} beat.`, direction: direction(`a library card for ${position}`), need: "generic-illustration", characterIds: [], references: [], ...overrides });
/** A clean script: Mia guides the reader from a closed door to an open reading room. */
const script = (id: string, overrides: Partial<Draft2VisualCandidate> = {}): Draft2VisualCandidate => ({
  id, angle: "From the closed door to the open room",
  concept: "Mia walks the reader from a closed library door to a full reading room.",
  motif: "A library card that gains a stamp on every slide.",
  cast: "Mia, the illustrated presenter in her mustard coat; anonymous readers seen from behind.",
  characterPlan: { use: true, characterIds: ["char-mia"], role: "The reader's guide" },
  slides: carousel.map((entry) => slide(entry.slide, entry.slide === "cover" ? { need: "character-reference", characterIds: ["char-mia"] } : {})),
  ...overrides,
});
const rules: Parameters<typeof mechanicalVisualIssues>[1] = { carousel, inventory, characters, characterChoice: "auto", mode: "illustration-editorial", avoid: ["polaroid", "lens flare"] };
const codes = (issues: Draft2VisualIssue[]) => issues.map((issue) => [issue.code, issue.candidateId, issue.part].filter(Boolean).join(" "));
const findings = (candidate: Draft2VisualCandidate, options: Partial<typeof rules> = {}) => codes(mechanicalVisualIssues([candidate], { ...rules, ...options }));
const withSlide = (position: string, overrides: Partial<Draft2VisualSlide>) => script("c1", { slides: script("c1").slides.map((entry) => entry.slide === position ? { ...entry, ...overrides } : entry) });
const score = (candidateId: string, overall: number): Draft2VisualScore => ({ candidateId, narrative: overall, continuity: overall, brand: overall, truth: overall, fit: overall, craft: overall, focus: overall, overall, note: "Why." });

test("the carousel in order, from the opening, the deck and the closing; three scripts, two for a long carousel", () => {
  assert.deepEqual(carousel.map((entry) => [entry.slide, entry.label]), [["cover", "Cover"], ["slide2", "Slide 2"], ["s1", "Slide 3"], ["s2", "Slide 4"], ["penultimate", "Slide 5"], ["last", "Slide 6"]]);
  assert.equal(carousel[5].cta, "Follow us for what opens near you.");
  assert.deepEqual(carouselSlides(opening, deck, { ...closing, penultimate: undefined }).map((entry) => entry.slide).slice(-1), ["last"]);
  assert.equal(visualPlan(carousel), VISUAL_PLAN);
  assert.equal(visualPlan(Array.from({ length: 11 })), VISUAL_LONG_PLAN);
  assert.deepEqual(VISUAL_PLAN.map((round) => [round.fresh, round.revise, round.proposals, round.effort ?? "high"]), [[3, 0, 1, "medium"], [0, 2, 0, "high"]]);
  const schema = visualSchema(carousel.map((entry) => entry.slide)) as { properties: { candidates: { items: { properties: { slides: { minItems: number; items: { properties: { slide: { enum: string[] } } } } } } } } };
  assert.equal(schema.properties.candidates.items.properties.slides.minItems, 6);
  assert.deepEqual(schema.properties.candidates.items.properties.slides.items.properties.slide.enum, ["cover", "slide2", "s1", "s2", "penultimate", "last"]);
});

test("the writer's answer becomes scripts; a slide missing a part is rejected; the judge scores every visual criterion per carousel slide", () => {
  const [parsed] = parseVisualCandidates(JSON.stringify({ candidates: [script("c1")] }));
  assert.equal(parsed.slides.length, 6);
  assert.equal(parsed.characterPlan.use, true);
  const broken = { ...script("c1"), slides: [{ slide: "cover", beat: "x", need: "painting", characterIds: [], references: [] }] };
  assert.throws(() => parseVisualCandidates(JSON.stringify({ candidates: [broken] })), (error: Error) => error instanceof Draft2ResponseError && /c1 is incomplete/.test(error.message));
  const evaluation = parseVisualEvaluation(JSON.stringify({ verdict: "revise", winnerId: "c1", summary: "x", suggestions: [], proposals: [script("p1")], scores: [score("c1", 90)],
    issues: [{ code: "ILLUSTRATES_TEXT", candidateId: "c1", part: "s2", detail: "Repeats the words.", material: false }, { code: "LOOKS_AI", candidateId: "c1", part: "slide9", detail: "Glossy." }] }), ["c1"], carousel.map((entry) => entry.slide));
  assert.deepEqual(evaluation.issues.map((issue) => [issue.code, issue.part ?? null]), [["ILLUSTRATES_TEXT", "s2"], ["LOOKS_AI", null]]);
  assert.deepEqual([...VISUAL_CRITERIA], ["narrative", "continuity", "brand", "truth", "fit", "craft", "focus"]);
});

test("a clean script has no finding; it has one slide per carousel slide, in order, each with a beat and a direction within its length", () => {
  assert.deepEqual(findings(script("c1")), []);
  assert.deepEqual(findings(script("c1", { slides: script("c1").slides.slice(0, 5) })), ["SLIDE_ORDER c1"]);
  assert.deepEqual(findings(script("c1", { slides: [...script("c1").slides].reverse() })), ["SLIDE_ORDER c1"]);
  assert.deepEqual(findings(withSlide("s1", { direction: `${direction("a long hall")} ${"More detail. ".repeat(50)}` })), ["DIRECTION_TOO_LONG c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { direction: "A hall." })), ["DIRECTION_TOO_SHORT c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { beat: "" })), ["BEAT_MISSING c1 s1"]);
});

test("characters come from the roster, follow the plan and the editor's choice, and stay off slides that rest on verified material", () => {
  assert.deepEqual(findings(withSlide("s1", { characterIds: ["char-jo"], need: "character-reference" })), ["CHARACTER_UNKNOWN c1", "CHARACTER_OFF_PLAN c1"]);
  assert.deepEqual(findings(script("c1", { characterPlan: { use: false, characterIds: [], role: "" } })), ["CHARACTER_OFF_PLAN c1", "CHARACTER_OFF_PLAN c1"]);
  assert.deepEqual(findings(script("c1"), { characterChoice: "off" }), ["CHARACTER_CHOICE c1"]);
  const noCharacter = script("c1", { characterPlan: { use: false, characterIds: [], role: "" }, slides: script("c1").slides.map((entry) => ({ ...entry, characterIds: [], need: "generic-illustration" as const })) });
  assert.deepEqual(findings(noCharacter), []);
  assert.deepEqual(findings(noCharacter, { characterChoice: "on" }), ["CHARACTER_CHOICE c1"]);
  assert.deepEqual(findings(withSlide("s1", { characterIds: ["char-mia", "char-mia", "char-mia"], need: "character-reference" })), ["TOO_MANY_CHARACTERS c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { need: "character-reference" })), ["NEED_MISMATCH c1 s1"], "a character slide casts a character");
});

test("verified material backs what a slide asks for, and the strict modes generate nothing", () => {
  assert.deepEqual(findings(withSlide("slide2", { need: "real-photo", references: ["e1"] })), [], "the mayor's confirmed portrait");
  assert.deepEqual(findings(withSlide("slide2", { need: "real-photo", references: ["e3"] })), ["REFERENCE_UNKNOWN c1 slide2", "NEED_MISMATCH c1 slide2"], "a rejected match is no material");
  assert.deepEqual(findings(withSlide("s1", { need: "verified-map", references: ["e2"] })), []);
  assert.deepEqual(findings(withSlide("s1", { need: "verified-map", references: ["p1"] })), ["NEED_MISMATCH c1 s1"], "a story photo is no map");
  assert.deepEqual(findings(withSlide("s1", { need: "real-photo", references: ["p1"] })), []);
  assert.deepEqual(findings(withSlide("s1", { need: "real-photo", references: ["e2"], characterIds: ["char-mia"] })), ["NEED_MISMATCH c1 s1"], "the character stays off verified material");
  assert.deepEqual(findings(withSlide("s2", { need: "typography" })), []);
  const plain = script("c1", { characterPlan: { use: false, characterIds: [], role: "" }, slides: script("c1").slides.map((entry) => ({ ...entry, characterIds: [], need: entry.slide === "cover" ? "typography" as const : "generic-illustration" as const })) });
  assert.deepEqual(findings(plain), ["COVER_TYPOGRAPHY c1 cover"]);
  const strict = findings(script("c1"), { mode: "photo-required" });
  assert.equal(strict.filter((code) => code.startsWith("STRICT_MODE")).length, 7, "every generated slide, and the character on the cover");
});

test("a direction names no real person or place without its verified material, no organization, no avoided term and nothing drawn as words", () => {
  assert.deepEqual(findings(withSlide("slide2", { direction: direction("Catherine Fournier cutting a ribbon") })), ["UNVERIFIED_PERSON c1 slide2"]);
  assert.deepEqual(findings(withSlide("slide2", { direction: direction("Fournier at the door, from behind"), need: "real-photo", references: ["e1"] })), [], "with the confirmed portrait it is the photo, not a drawing");
  assert.deepEqual(findings(withSlide("s2", { direction: direction("Mr. Tremblay at the desk") })), ["UNVERIFIED_PERSON c1 s2"], "a surname alone still names them");
  assert.deepEqual(findings(withSlide("s1", { direction: direction("the facade on Rue Saint-Charles") })), ["UNVERIFIED_PLACE c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { direction: direction("Pomerleau workers on a crane") })), ["ORGANIZATION_NAMED c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { direction: direction("a Polaroid of the reading room") })), ["AVOID_TERM c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { direction: direction("a banner with text that reads OPEN") })), ["FORBIDDEN_ELEMENT c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { direction: direction("the library logo on a tote bag") })), ["FORBIDDEN_ELEMENT c1 s1"]);
  assert.deepEqual(avoidTerms({ avoid: [{ items: ["Polaroid", "lens flare.", "x", "a very long avoided phrase of many words"] }] }), ["polaroid", "lens flare"]);
});

test("scripts with the same concept are duplicates, except a proposal and its edit; an unchanged edit is the same script", () => {
  const issues = mechanicalVisualIssues([script("c1"), script("c2"), { ...script("c3"), proposalOf: "p1", asProposed: true }], rules);
  assert.deepEqual(codes(issues), ["DUPLICATE_CANDIDATE c2", "DUPLICATE_CANDIDATE c3"]);
  assert.equal(sameVisual(script("c1"), script("c9")), true);
  assert.equal(sameVisual(script("c1"), { ...script("c9"), motif: "A lamp that brightens." }), false);
});

test("the requests name scripts, and the mode line says what may be generated", () => {
  assert.deepEqual(visualExploreRequest(3), { task: "scripts", candidatesWanted: 3 });
  const first: Draft2VisualRound = { round: 1, candidates: [script("c1"), { ...script("c2"), concept: "A lamp that brightens slide by slide." }], mechanical: [], at: "t", evaluation: { verdict: "revise", winnerId: "c1", scores: [score("c1", 88), score("c2", 80)], issues: [], suggestions: ["Let the motif land on the last slide."], summary: "x" } };
  const versions = funnelVersions([first]);
  const refine = visualRefineRequest(versions.slice(0, 1), versions, [], first, 0, [script("p1")]);
  assert.deepEqual(Object.keys(refine), ["task", "scripts", "develop", "suggestions", "instruction"]);
  assert.match(refine.instruction, /^Revise each script in scripts[^]*Keep its concept, its cast and its motif[^]*Edit the script in develop/);
  assert.equal(visualJudgeRequest(VISUAL_PLAN, 1, [script("c1")], [], []).proposalsWanted, 1);
  assert.match(visualModeLine("illustration-editorial"), /real people only through confirmed documentary portraits/);
  assert.match(visualModeLine("photo-required"), /Nothing is generated/);
});
