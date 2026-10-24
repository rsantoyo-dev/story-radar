import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError } from "./draft2-facts.types";
import { editorCast,
  forbiddenElement,
  VISUAL_CRITERIA, VISUAL_FIX_INSTRUCTION, VISUAL_JUDGE_CODES, VISUAL_LONG_PLAN, VISUAL_MECHANICAL_CODES, VISUAL_PLAN, VISUAL_PLAN_V3, VISUAL_BEAT_MAX_CHARACTERS, avoidTerms, bindPanoramaShots, beatWithinLimit, bindSpineBeats, carouselSlides, deckCarousel, mechanicalVisualIssues, parseVisualCandidates, parseVisualEvaluation, sameCarouselWords, sameVisual, spineImageLines, spineStations,
  visualEvaluationSchema, visualExploreRequest, visualFixRequest, visualJudgeRequest, visualLayout, visualModeLine, visualPlan, visualRefineRequest, visualSchema,
  type Draft2CarouselSlide, type Draft2VisualCandidate, type Draft2VisualIssue, type Draft2VisualRound, type Draft2VisualScore, type Draft2VisualSlide,
} from "./draft2-visual.types";
import { funnelExtendable, funnelScorePasses, funnelVersions } from "./draft2-funnel";
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
const json = (value: unknown) => JSON.stringify(value);

const material = (overrides: Partial<Draft2InventoryEntity> & Pick<Draft2InventoryEntity, "id" | "name" | "kind">): Draft2InventoryEntity => ({ role: "secondary", description: "", factIds: ["f1"], ...overrides });
const inventory: Pick<Draft2Inventory, "entities" | "storyPhotos"> = {
  entities: [
    material({ id: "e1", name: "Catherine Fournier", kind: "person", person: { status: "confirmed", candidates: [], confirmed: { entityId: "Q1", name: "Catherine Fournier", thumbnailUrl: "u", author: "A", license: "CC BY 4.0", commonsUrl: "c", storyPhotoId: "photo-1" } } }),
    material({ id: "e2", name: "Rue Saint-Charles", kind: "place", place: { status: "verified", map: true, photo: { source: "commons", author: "B", license: "CC BY 4.0", resourceUrl: "r", width: 2000, height: 1300, retrievedAt: "t" } } }),
    material({ id: "e3", name: "Jean Tremblay", kind: "person", person: { status: "rejected", candidates: [] } }),
    material({ id: "e4", name: "Pomerleau", kind: "organization" }),
  ],
  storyPhotos: [{ id: "p1", name: "Reading room", description: "", provenance: "Editor", transmissionAllowed: true, rights: "own" as const }],
};
const characters = [{ id: "char-mia", name: "Mia", description: "An illustrated local presenter in a mustard coat" }];

const direction = (focal: string) => `Paper-cut collage in cream and night blue: ${focal}, one focal subject on the left third, soft lavender light, generous space at the top for the headline.`;
/** Shots that never repeat from one slide to the next. */
const SHOTS: Record<string, Draft2VisualSlide["shot"]> = { cover: "wide", slide2: "medium", s1: "close", s2: "medium", penultimate: "wide", last: "close" };
/** Subjects that move on from slide to slide, as a sequence does. */
const SUBJECTS: Record<string, string> = { cover: "a closed library door at dawn", slide2: "the mayor's ribbon on the steps", s1: "a child reaching for a picture book", s2: "volunteers shelving returned books", penultimate: "an evening reading circle", last: "the same door, open and lit" };
const slide = (position: string, overrides: Partial<Draft2VisualSlide> = {}): Draft2VisualSlide => ({
  slide: position, beat: `The ${position} beat.`, subject: SUBJECTS[position] ?? position, discovery: `What ${position} shows for the first time.`, recurring: "none", shot: SHOTS[position] ?? "medium", headlineLink: "",
  direction: direction(`a library card for ${position}`), need: "generic-illustration", characterIds: [], references: [], ...overrides,
});
/** A clean script: Mia guides the reader from a closed door to an open reading room. */
const script = (id: string, overrides: Partial<Draft2VisualCandidate> = {}): Draft2VisualCandidate => ({
  id, angle: "From the closed door to the open room",
  concept: "Mia walks the reader from a closed library door to a full reading room.",
  protagonist: "Mia, guiding a reader seen from behind",
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
const score = (candidateId: string, overall: number): Draft2VisualScore => ({ candidateId, fidelity: overall, continuity: overall, brand: overall, truth: overall, craft: overall, originality: overall, overall, note: "Why." });

test("the carousel in order, from the opening, the deck and the closing; one script and the judge's, then the best revised beside it: two rounds for any length", () => {
  assert.deepEqual(carousel.map((entry) => [entry.slide, entry.label]), [["cover", "Cover"], ["slide2", "Slide 2"], ["s1", "Slide 3"], ["s2", "Slide 4"], ["penultimate", "Slide 5"], ["last", "Slide 6"]]);
  assert.equal(carousel[5].cta, "Follow us for what opens near you.");
  assert.deepEqual(carouselSlides(opening, deck, { ...closing, penultimate: undefined }).map((entry) => entry.slide).slice(-1), ["last"]);
  assert.equal(visualPlan(carousel), VISUAL_PLAN);
  assert.equal(visualPlan(Array.from({ length: 11 })), VISUAL_LONG_PLAN);
  assert.deepEqual(VISUAL_PLAN.map((round) => [round.fresh, round.revise, round.proposals, round.effort ?? "high"]), [[1, 0, 1, "medium"], [0, 1, 0, "medium"]], "one script and the judge's, then the best revised at medium");
  assert.equal(VISUAL_LONG_PLAN, VISUAL_PLAN, "a long carousel runs the same plan");
  assert.deepEqual(visualPlan(carousel, "v3").map((round) => [round.fresh, round.revise, round.proposals, round.effort, round.judgeEffort]), [[1, 0, 0, "medium", "medium"], [0, 1, 0, "medium", "medium"]], "v3: one script, then the judge's revision when the first is not accepted, the judge at medium (at low it scored 3 to 13 points under and accepted nothing), no proposal");
  const judged = { round: 1, candidates: [], mechanical: [], at: "t", evaluation: {} };
  const unjudged = { ...judged, round: 2, evaluation: undefined };
  assert.equal(funnelExtendable({ status: "needs-review", rounds: [judged] }, VISUAL_PLAN.length), true, "a run that ended after one round takes the second");
  assert.equal(funnelExtendable({ status: "needs-review", rounds: [judged, { ...judged, round: 2 }] }, VISUAL_PLAN.length), false, "a run that had every round");
  assert.equal(funnelExtendable({ status: "ready", rounds: [judged] }, VISUAL_PLAN.length), false, "an accepted run");
  assert.equal(funnelExtendable({ status: "needs-review", rounds: [judged, unjudged] }, VISUAL_PLAN.length), false, "a round left unjudged is a stopped run's to continue");
  const schema = visualSchema(carousel.map((entry) => entry.slide)) as { properties: { candidates: { items: { properties: { slides: { minItems: number; items: { properties: { slide: { enum: string[] } } } } } } } } };
  assert.equal(schema.properties.candidates.items.properties.slides.minItems, 6);
  assert.deepEqual(schema.properties.candidates.items.properties.slides.items.properties.slide.enum, ["cover", "slide2", "s1", "s2", "penultimate", "last"]);
  const item = (schema as unknown as { properties: { candidates: { items: { required: string[]; properties: { slides: { items: { required: string[]; properties: { shot: { enum: string[] } } } } } } } } }).properties.candidates.items;
  assert.ok(item.required.includes("protagonist"));
  assert.deepEqual(item.properties.slides.items.properties.shot.enum, ["wide", "medium", "close", "overhead", "typography"]);
  assert.ok(item.properties.slides.items.required.includes("headlineLink"));
  for (const field of ["subject", "discovery", "recurring"]) assert.ok(item.properties.slides.items.required.includes(field), field);
});

test("the layout tells the script what is added afterwards: the words the image model letters, the logo where the Topic puts it, the page number", () => {
  const overlay = { enabled: true, scope: "first-unit", placement: "top-left", sizePercent: 12, insetPercent: 2, backdropMode: "solid", backdropColor: "#F6F0E4", backdropOpacity: 0, assetId: "a1", asset: { id: "a1", fileName: "logo.png", contentType: "image/png", fileSize: 1, width: 400, height: 200, createdAt: new Date(0) } } as const;
  const chrome = { enabled: true, style: "blob", backgroundColor: "#173F52", textColor: "#E3A62F", accentColor: "#F6F0E4" } as const;
  const layout = visualLayout({ brandOverlay: overlay, carouselChrome: chrome } as unknown as Parameters<typeof visualLayout>[0], carousel);
  assert.deepEqual(layout.logo, { slides: ["cover"], area: "the top left corner, about 12% of the slide's width, plus a margin" });
  assert.match(String(layout.numbering?.area), /page-number badge centred on the bottom edge/);
  assert.match(layout.lettering, /The image model letters each slide's words/);
  assert.match(visualLayout({ brandOverlay: overlay, carouselChrome: chrome } as unknown as Parameters<typeof visualLayout>[0], carousel, { text: "program" }).lettering, /^The program sets each slide's words after the image is made, on a calm band along the top[^]*asks for no word, letter or number at all/, "under the program's words a direction asks for none: a writer told the image model letters them placed them where it would have, three OTHER issues in one judgment");
  const everywhere = visualLayout({ brandOverlay: { ...overlay, scope: "all-units" }, carouselChrome: { ...chrome, enabled: false } } as unknown as Parameters<typeof visualLayout>[0], carousel);
  assert.deepEqual([everywhere.logo?.slides.length, everywhere.numbering], [6, null]);
  assert.equal(visualLayout({ brandOverlay: { ...overlay, enabled: false }, carouselChrome: chrome } as unknown as Parameters<typeof visualLayout>[0], carousel).logo, null, "no logo when it is off");
  const symbol = { ...overlay, scope: "all-units", innerForm: "symbol", versions: [{ assetId: "s", form: "symbol", tone: "negative" }] };
  assert.match(String(visualLayout({ brandOverlay: symbol, carouselChrome: chrome } as unknown as Parameters<typeof visualLayout>[0], carousel).logo?.area), /on the cover the full logo.*on the other slides the brand's symbol alone, a square about 12%/u);
  assert.doesNotMatch(String(visualLayout({ brandOverlay: { ...symbol, versions: [] }, carouselChrome: chrome } as unknown as Parameters<typeof visualLayout>[0], carousel).logo?.area), /symbol/u, "no symbol uploaded: the full logo everywhere");
});

test("continuity does not replace progression: each slide names its subject and what it shows first, no subject leads two slides in a row, and the recurring element leads at most two and returns once at the end", () => {
  assert.deepEqual(findings(withSlide("s1", { subject: "the mayor's ribbon on the steps" })), ["SAME_SUBJECT c1 s1"], "the same subject as slide 2");
  assert.deepEqual(findings(withSlide("s1", { subject: "the mayor's ribbon, closer, on the steps" })), ["SAME_SUBJECT c1 s1"], "a closer view of the same subject is the same subject");
  assert.deepEqual(findings(withSlide("s1", { subject: "" })), ["SUBJECT_MISSING c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { discovery: "" })), ["DISCOVERY_MISSING c1 s1"]);
  const recurring = (roles: Draft2VisualSlide["recurring"][]) => script("c1", { slides: script("c1").slides.map((entry, index) => ({ ...entry, recurring: roles[index] ?? "none" })) });
  assert.deepEqual(findings(recurring(["focus", "accent", "none", "focus", "accent", "callback"])), [], "it may open, step back, lead once more and return at the end");
  assert.deepEqual(findings(recurring(["focus", "focus"])), ["RECURRING_DOMINANT c1 slide2"]);
  assert.deepEqual(findings(recurring(["focus", "none", "focus", "none", "focus"])), ["RECURRING_DOMINANT c1"]);
  assert.deepEqual(findings(recurring(["focus", "none", "callback"])), ["CALLBACK_MISPLACED c1"], "a return belongs to the end");
  assert.deepEqual(findings(recurring(["none", "none", "none", "none", "callback", "callback"])), ["CALLBACK_MISPLACED c1"], "once");
});

test("shots alternate: no two slides in a row share one, and a typography slide has the typography shot, and only it", () => {
  assert.deepEqual(findings(withSlide("s1", { shot: "medium" })), ["SAME_SHOT c1 s1", "SAME_SHOT c1 s2"], "s1 repeats slide 2's, and s2 repeats s1's");
  assert.deepEqual(findings(withSlide("s2", { need: "typography" })), ["SHOT_MISMATCH c1 s2"]);
  assert.deepEqual(findings(withSlide("s2", { shot: "typography" })), ["SHOT_MISMATCH c1 s2"]);
  assert.deepEqual(findings(withSlide("s2", { need: "typography", shot: "typography" })), []);
  const line = { form: "follow-the-line" as const, anchorKind: "line" as const, characterId: null, anchor: "The trail", anchorFactIds: [], progression: "What the trail reaches", ending: "resolves" as const };
  assert.deepEqual(findings(withSlide("s2", { need: "typography" }), { narrative: line }).filter((code) => /^(SHOT_MISMATCH|SECTION_MISSING)/.test(code)), ["SECTION_MISSING c1 s2"], "in one wide scene the shot is the scene's: a typography card is refused as a section, never as a shot");
});

test("the writer's answer becomes scripts; a slide missing a part is rejected; the judge scores every visual criterion per carousel slide", () => {
  const [parsed] = parseVisualCandidates(JSON.stringify({ candidates: [script("c1")] }));
  assert.equal(parsed.slides.length, 6);
  assert.equal(parsed.characterPlan.use, true);
  const broken = { ...script("c1"), slides: [{ slide: "cover", beat: "x", need: "painting", characterIds: [], references: [] }] };
  assert.throws(() => parseVisualCandidates(JSON.stringify({ candidates: [broken] })), (error: Error) => error instanceof Draft2ResponseError && /c1 is incomplete/.test(error.message));
  const evaluation = parseVisualEvaluation(JSON.stringify({ verdict: "revise", winnerId: "c1", summary: "x", suggestions: [], proposals: [script("p1")], scores: [score("c1", 90)],
    issues: [{ code: "ILLUSTRATES_TEXT", candidateId: "c1", part: "s2", detail: "Repeats the words.", material: false }, { code: "LOOKS_AI", candidateId: "c1", part: "slide9", detail: "Glossy." }, { code: "DIRECTION_TOO_LONG", candidateId: "c1", part: "s1", detail: "Over 700 characters." }, { code: "SHOT_MISMATCH", candidateId: "c1", part: "cover", detail: "A close shot." }, { code: "NO_SUCH_CODE", candidateId: "c1", part: "s1", detail: "Something else." }] }), ["c1"], carousel.map((entry) => entry.slide));
  assert.deepEqual(evaluation.issues.map((issue) => [issue.code, issue.part ?? null]), [["ILLUSTRATES_TEXT", "s2"], ["LOOKS_AI", null], ["OTHER", "s1"]], "an issue under one of the program's codes is dropped (the program counted: a judge at low had named five directions of 448–530 characters too long), an unknown code is OTHER");
  const judgeSchema = visualEvaluationSchema(carousel.map((entry) => entry.slide)) as { properties: { issues: { items: { properties: { code: { enum: string[] } } } } } };
  assert.deepEqual(judgeSchema.properties.issues.items.properties.code.enum, [...VISUAL_JUDGE_CODES], "the judge's schema offers its own codes only");
  assert.ok(VISUAL_MECHANICAL_CODES.every((code) => !(VISUAL_JUDGE_CODES as readonly string[]).includes(code)));
  assert.deepEqual([...VISUAL_CRITERIA], ["fidelity", "continuity", "brand", "truth", "craft", "originality"], "the narrative is the spine's, judged at the Focus; the images are judged on executing it, and on their originality");
  const [open] = parseVisualCandidates(JSON.stringify({ candidates: [{ ...script("c1"), protagonist: "", motif: "" }] }));
  assert.equal(json([open.protagonist, open.motif]), json(["", ""]), "the protagonist and the motif are optional: the identity can carry the continuity alone");
  const noSubject = { ...script("c1"), slides: script("c1").slides.map(({ subject, ...rest }) => { void subject; return rest; }) };
  assert.throws(() => parseVisualCandidates(JSON.stringify({ candidates: [noSubject] })), /c1 is incomplete/);
});

test("a clean script has no finding; it has one slide per carousel slide, in order, each with a beat and a direction within its length", () => {
  assert.deepEqual(findings(script("c1")), []);
  assert.deepEqual(findings(script("c1", { slides: script("c1").slides.slice(0, 5) })), ["SLIDE_ORDER c1"]);
  assert.deepEqual(findings(script("c1", { slides: [...script("c1").slides].reverse() })), ["SLIDE_ORDER c1"]);
  assert.deepEqual(findings(withSlide("s1", { direction: `${direction("a long hall")} ${"More detail. ".repeat(50)}` })), ["DIRECTION_TOO_LONG c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { direction: "A hall." })), ["DIRECTION_TOO_SHORT c1 s1"]);
  assert.deepEqual(findings(withSlide("s1", { beat: "" })), ["BEAT_MISSING c1 s1"]);
});

test("characters come from the roster, follow the editor's choice, may take part in a slide without narrating, and stay off slides that rest on verified material", () => {
  assert.deepEqual(findings(withSlide("s1", { characterIds: ["char-jo"], need: "character-reference" })), ["CHARACTER_UNKNOWN c1"]);
  assert.deepEqual(findings(script("c1", { characterPlan: { use: false, characterIds: [], role: "" } })), [], "a character in one slide's action, with no narrator, is a participant");
  assert.deepEqual(findings(script("c1", { slides: script("c1").slides.map((entry) => ({ ...entry, characterIds: [], need: "generic-illustration" as const })) })), ["CHARACTER_OFF_PLAN c1"], "a narrator the plan names must appear");
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
  const given = { ...inventory, entities: inventory.entities.map((entity) => entity.id === "e3" ? { ...entity, storyPhoto: { id: "p1", name: "Reading room", provenance: "Editor", transmissionAllowed: true, rights: "own" as const } } : entity) };
  assert.deepEqual(findings(withSlide("slide2", { need: "real-photo", references: ["e3"], direction: direction("Tremblay at the desk, from the front") }), { inventory: given }), [], "the story photo the editor gave him is his portrait");
  assert.deepEqual(findings(withSlide("s1", { need: "real-photo", references: ["p1"] }), { inventory: given }), ["REFERENCE_UNKNOWN c1 s1", "NEED_MISMATCH c1 s1"], "a person's photo is never a free reference");
  assert.deepEqual(findings(withSlide("s1", { need: "real-photo", references: ["e2"], characterIds: ["char-mia"] })), ["NEED_MISMATCH c1 s1"], "the character stays off a verified photo");
  assert.deepEqual(findings(withSlide("s1", { need: "verified-map", references: ["e2"], characterIds: ["char-mia"] })), [], "a character may stand beside a map card");
  assert.deepEqual(findings(withSlide("s2", { need: "typography", shot: "typography" })), []);
  const plain = script("c1", { characterPlan: { use: false, characterIds: [], role: "" }, slides: script("c1").slides.map((entry) => ({ ...entry, characterIds: [], ...(entry.slide === "cover" ? { need: "typography" as const, shot: "typography" as const } : { need: "generic-illustration" as const }) })) });
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
  assert.match(refine.instruction, /^Revise each script in scripts[^]*Keep its concept, its protagonist, its cast and its motif[^]*Edit the script in develop/);
  assert.equal(visualJudgeRequest(VISUAL_PLAN, 1, [script("c1")], [], []).proposalsWanted, 1);
  const fix = visualFixRequest([script("c1")], [{ code: "DIRECTION_TOO_LONG", candidateId: "c1", part: "s1", detail: "Slide 3's direction has 740 characters; the limit is 700." }]) as unknown as { instruction: string; scripts: { findings: { detail: string }[] }[] };
  assert.equal(fix.instruction, VISUAL_FIX_INSTRUCTION, "the fix pass counts characters, not words, and cuts what a direction repeats");
  assert.match(fix.scripts[0].findings[0].detail, /Remove at least 41 characters\.$/);
  assert.match(visualModeLine("illustration-editorial"), /real people only through confirmed documentary portraits/);
  assert.match(visualModeLine("photo-required"), /Nothing is generated/);
});

test("a direction that reserves the logo's corner or rules logos out asks for no logo; one that draws a logo, a caption or lettering does", () => {
  assert.equal(forbiddenElement("Collage en crema; arriba a la izquierda queda libre el espacio para el logo, sin texto."), undefined);
  assert.equal(forbiddenElement("Paper-cut scene, the top-left corner kept clear for the logo added afterwards."), undefined);
  assert.equal(forbiddenElement("A kitchen table, no logos, no signage, nothing written."), undefined);
  assert.equal(forbiddenElement("A tote bag with the library's logo on the shelf."), "logo");
  assert.equal(forbiddenElement("A door with lettering that reads OPEN."), "lettering that reads");
  assert.equal(forbiddenElement("A kitchen with no text anywhere; a shop sign that says CLOSED hangs on the door."), undefined, "a sign is a thing in the scene; lettering, words or text that read something are forbidden");
  assert.equal(forbiddenElement("Photo with a caption under it."), "caption");
  // Real runs: "logo" inside "diálogo", and a corner left free for the logo, are not a logo to draw.
  assert.equal(forbiddenElement("Consultorio con tres figuras; ese diálogo es el foco. Un catálogo abierto sobre la mesa."), undefined);
  assert.equal(forbiddenElement("Titular y texto arriba; logo abajo a la derecha y página abajo al centro libres."), undefined);
  assert.equal(forbiddenElement("Letras teal oscuro; esquina inferior derecha libre para logo y centro inferior para página."), undefined);
  assert.equal(forbiddenElement("Un diálogo entre dos personas; en la pared, el logo de la clínica."), "logo");
});

test("a narrative form's anchor is in every generated image: a brand character by its id, a figure or an object as the recurring element; a photo, a map or a typography card is exempt", () => {
  const mia = { form: "character-guide" as const, anchorKind: "character" as const, characterId: "char-mia", anchor: "Mia", anchorFactIds: [], progression: "From the closed door to the reading room", ending: "returns" as const };
  const everywhere = script("c1", { slides: script("c1").slides.map((entry) => ({ ...entry, characterIds: ["char-mia"] })) });
  assert.deepEqual(findings(everywhere, { narrative: mia }).filter((code) => code.startsWith("ANCHOR")), []);
  assert.deepEqual(findings(script("c1"), { narrative: mia }).filter((code) => code.startsWith("ANCHOR")), ["ANCHOR_MISSING c1 slide2", "ANCHOR_MISSING c1 s1", "ANCHOR_MISSING c1 s2", "ANCHOR_MISSING c1 penultimate", "ANCHOR_MISSING c1 last"], "only the cover casts Mia");
  assert.deepEqual(findings(script("c1"), {}).filter((code) => code.startsWith("ANCHOR")), [], "a classic story asks for no anchor");
  const toad = { form: "character-guide" as const, anchorKind: "figure" as const, characterId: null, anchor: "A curious toad", anchorFactIds: ["f1"], progression: "Trail to trail", ending: "resolves" as const };
  const recurring = script("c1", { characterPlan: { use: false, characterIds: [], role: "" }, slides: script("c1").slides.map((entry) => ({ ...entry, characterIds: [], need: "generic-illustration" as const, recurring: "accent" as const })) });
  assert.deepEqual(findings(recurring, { narrative: toad }).filter((code) => code.startsWith("ANCHOR")), []);
  const card = { ...recurring, slides: recurring.slides.map((entry) => entry.slide === "s1" ? { ...entry, recurring: "none" as const } : entry.slide === "s2" ? { ...entry, recurring: "none" as const, need: "typography" as const, shot: "typography" as const } : entry) };
  const issues = mechanicalVisualIssues([card], { ...rules, narrative: toad }).filter((issue) => issue.code === "ANCHOR_MISSING");
  assert.deepEqual(issues.map((issue) => issue.part), ["s1"], "the typography card is exempt");
  assert.match(issues[0].detail, /Slide 3 leaves out A curious toad, the guide: with this narrative form it is in every image, as the recurring element\./);
});

test("a panorama or a line is one wide scene: adjacent shots may match, a typography card breaks it, a line is in every image, a panorama's scene needs no mark", () => {
  const line = { form: "follow-the-line" as const, anchorKind: "line" as const, characterId: null, anchor: "The boardwalk trail", anchorFactIds: ["f1"], progression: "What the trail reaches", ending: "resolves" as const };
  const sections = script("c1", { characterPlan: { use: false, characterIds: [], role: "" }, slides: script("c1").slides.map((entry) => ({ ...entry, shot: "wide" as const, characterIds: [], need: "generic-illustration" as const, recurring: "accent" as const })) });
  const relevant = (codes: string[]) => codes.filter((code) => /^(SAME_SHOT|ANCHOR_MISSING|SECTION_MISSING)/.test(code));
  assert.deepEqual(relevant(findings(sections, { narrative: line })), []);
  assert.ok(findings(sections).some((code) => code.startsWith("SAME_SHOT")), "a classic script still alternates its shots");
  const broken = { ...sections, slides: sections.slides.map((entry) => entry.slide === "s2" ? { ...entry, need: "typography" as const, shot: "typography" as const } : entry.slide === "s1" ? { ...entry, recurring: "none" as const } : entry) };
  assert.deepEqual(relevant(findings(broken, { narrative: line })), ["ANCHOR_MISSING c1 s1", "SECTION_MISSING c1 s2"]);
  assert.deepEqual(relevant(findings(broken, { narrative: { ...line, form: "panorama", anchorKind: "scene", anchor: "An autumn trail" } })), ["SECTION_MISSING c1 s2"], "the scene is every slide by construction");
});

test("a direction in French that keeps the logo's corner free or rules a logo out does not ask for one", () => {
  assert.equal(forbiddenElement("Titre bleu profond en gras. Logo en haut à gauche dégagé, bas dégagé pour le numéro de page."), undefined);
  assert.equal(forbiddenElement("Bleu profond pour la hiérarchie typographique. Aucun logo ni interface lisible."), undefined);
  assert.equal(forbiddenElement("Accent corail discret. Pas de visage, de logo ni de lieu identifiable."), undefined);
  assert.equal(forbiddenElement("Touche d'ocre. Aucun document lisible, nom, visage ou logo."), undefined);
  assert.equal(forbiddenElement("Zone crème pour le titre; espace réservé au logo en haut à droite."), undefined);
  assert.equal(forbiddenElement("Sans texte ni logo; une enseigne lumineuse ordinaire au-dessus de la porte."), undefined, "a sign is a thing in the scene");
  assert.equal(forbiddenElement("Au mur, une affiche avec le logo de la ville."), "logo", "a logo asked for is still a logo");
  assert.equal(forbiddenElement("Une légende sous la photo et un filigrane discret."), undefined, "French nouns for captions and watermarks are not in the forbidden list; the judge reads them");
});

test("with a narrative form the anchor is on every slide by design: the recurring-element limits and the single return do not apply to it", () => {
  const guide = { form: "character-guide" as const, anchorKind: "figure" as const, characterId: null, anchor: "A child seen from behind", anchorFactIds: [], progression: "Stop to stop", ending: "returns" as const };
  const recurring = (roles: Draft2VisualSlide["recurring"][]) => script("c1", { slides: script("c1").slides.map((entry, index) => ({ ...entry, recurring: roles[index] ?? "none" })) });
  const relevant = (codes: string[]) => codes.filter((code) => /^(RECURRING_DOMINANT|CALLBACK_MISPLACED|ANCHOR_MISSING)/.test(code));
  assert.deepEqual(relevant(findings(recurring(["focus", "focus", "focus", "accent", "callback", "callback"]), { narrative: guide })), [], "led on every slide, two returns: the form, not a fault");
  assert.deepEqual(relevant(findings(recurring(["focus", "focus", "focus", "accent", "callback", "callback"]))), ["RECURRING_DOMINANT c1 slide2", "RECURRING_DOMINANT c1 s1", "RECURRING_DOMINANT c1", "CALLBACK_MISPLACED c1"], "without a form the limits stand");
  assert.deepEqual(relevant(findings(recurring(["focus", "none", "focus", "accent", "accent", "callback"]), { narrative: guide })), ["ANCHOR_MISSING c1 slide2"], "a slide without the anchor is still the one fault the form has");
});

test("the carousel as it stands, and whether a script's words are still its words: a patch or an edit changes them, labels and fact ids do not", () => {
  const run = {
    status: "ready", winnerId: "d2", rounds: [{ round: 1, candidates: [{ id: "d1", angle: "a", slides: deck.slides }, { id: "d2", angle: "b", slides: deck.slides.slice(0, 1) }], mechanical: [] }], opening, closing,
  } as unknown as NonNullable<Parameters<typeof deckCarousel>[0]>;
  assert.deepEqual(deckCarousel(run)?.map((slide) => slide.slide), ["cover", "slide2", "s1", "penultimate", "last"], "the winner's deck between the opening and closing the deck recorded");
  assert.equal(deckCarousel({ ...run, editorChoiceId: "d1" })?.length, 6, "the editor's choice before the winner");
  assert.equal(deckCarousel({ ...run, winnerId: undefined }), undefined, "no chosen deck, no carousel");
  assert.equal(deckCarousel({ ...run, opening: undefined }), undefined, "no recorded ends, no carousel");
  assert.equal(deckCarousel(undefined), undefined);
  assert.ok(sameCarouselWords(carousel, carousel.map((slide) => ({ ...slide, label: "x", factIds: [] }))), "labels and fact ids are not words");
  assert.ok(sameCarouselWords(carousel, carousel.map((slide) => ({ ...slide, headline: ` ${slide.headline} ` }))), "surrounding whitespace is not a change");
  assert.ok(!sameCarouselWords(carousel, carousel.map((slide, index) => index === 0 ? { ...slide, headline: "Your library is back" } : slide)), "a patched cover headline");
  assert.ok(!sameCarouselWords(carousel, carousel.map((slide) => slide.slide === "last" ? { ...slide, cta: "Save this." } : slide)), "a patched call to action");
  assert.ok(!sameCarouselWords(carousel, carousel.map((slide) => slide.slide === "s1" ? { ...slide, practical: "Sat · 10 a.m." } : slide)), "a patched practical line");
  assert.ok(!sameCarouselWords(carousel, carousel.slice(0, -1)), "a slide fewer");
});

test("the editor's cast for an image: the brand's characters, each once, at most two, never on a verified photo, beside a map card", () => {
  const roster = [{ id: "char-jo" }, { id: "char-mia" }, { id: "char-leo" }];
  assert.deepEqual(editorCast(["char-jo", "char-jo"], roster, "generic-illustration"), ["char-jo"]);
  assert.deepEqual(editorCast([], roster, "real-photo"), [], "taking every character off is always possible");
  assert.throws(() => editorCast(["char-zed"], roster, "generic-illustration"), /char-zed is not one of the brand's characters/);
  assert.throws(() => editorCast(["char-jo", "char-mia", "char-leo"], roster, "generic-illustration"), /At most 2 characters/);
  assert.throws(() => editorCast(["char-jo"], roster, "real-photo"), /verified photo: the brand's characters stay off it/);
  assert.deepEqual(editorCast(["char-jo"], roster, "verified-map"), ["char-jo"], "a map slide may carry a character beside the card");
  assert.throws(() => editorCast("char-jo", roster, "generic-illustration"), /list of their ids/);
});

test("each slide's beat is the spine's image line: the cover's and slide 2's beats, the middle beats in order for the deck's slides, the closing's; a slide the spine does not cover keeps the writer's", () => {
  const beat = (slide: "cover" | "slide2" | "middle" | "penultimate" | "last", image: string) => ({ slide, role: "setup" as const, scene: "s", words: "w", image, withholds: "", factIds: [] });
  const spine = { beats: [beat("cover", "The closed door at dawn."), beat("slide2", "The ribbon, cut."), beat("middle", "A child's hand on a low shelf."), beat("penultimate", "Lamps on at nine."), beat("last", " The same door, open. ")] };
  const lines = spineImageLines(spine, carousel);
  assert.deepEqual(lines, { cover: "The closed door at dawn.", slide2: "The ribbon, cut.", s1: "A child's hand on a low shelf.", penultimate: "Lamps on at nine.", last: "The same door, open." }, "s2 has no middle beat: no line");
  assert.deepEqual(spineImageLines(undefined, carousel), {}, "no spine binds nothing");
  const [bound] = bindSpineBeats([script("c1")], lines);
  assert.deepEqual(bound.slides.map((slide) => slide.beat), ["The closed door at dawn.", "The ribbon, cut.", "A child's hand on a low shelf.", script("c1").slides[3].beat, "Lamps on at nine.", "The same door, open."], "the writer's beat survives only where the spine has none");
  assert.equal(bound.id, "c1");
  assert.deepEqual(bindSpineBeats([script("c1")], {})[0], script("c1"), "nothing to bind, nothing changed");
});

test("a panorama's script is one scene: a direction that gives its section a background of its own breaks the continuity, and under v3 the judge's revision round is kept", async () => {
  const panorama = { form: "panorama" as const, anchorKind: "scene" as const, characterId: null, anchor: "A kitchen counter seen straight on", anchorFactIds: [], progression: "From the wet drop to the dry ring", ending: "resolves" as const };
  const sections = script("c1", { characterPlan: { use: false, characterIds: [], role: "" }, slides: script("c1").slides.map((entry) => ({ ...entry, shot: "wide" as const, characterIds: [], need: "generic-illustration" as const, recurring: "accent" as const })) });
  const striped = { ...sections, slides: sections.slides.map((entry) => entry.slide === "slide2" ? { ...entry, direction: direction("the next drop, fondo crema plano en la banda superior") } : entry.slide === "last" ? { ...entry, direction: direction("the glass; the section on terracotta closes it") } : entry) };
  const continuity = (codes: string[]) => codes.filter((code) => code.startsWith("BREAKS_CONTINUITY"));
  assert.deepEqual(continuity(findings(striped, { narrative: panorama })), ["BREAKS_CONTINUITY c1 slide2", "BREAKS_CONTINUITY c1 last"]);
  assert.deepEqual(continuity(findings(sections, { narrative: panorama })), []);
  assert.deepEqual(continuity(findings(striped)), [], "one image per slide may have a background each");
  assert.equal(visualPlan(carousel, "v3"), VISUAL_PLAN_V3);
  assert.equal(VISUAL_PLAN_V3.length, 2, "since 2026-10-19 every v3 script keeps the judge's revision round, run only when the first is not accepted");
  assert.deepEqual(VISUAL_PLAN_V3.map((round) => [round.revise, round.fresh, round.proposals, round.judgeEffort]), [[0, 1, 0, "medium"], [1, 0, 0, "medium"]]);
  // The sections' shots are the scene's: the program sets them to wide whatever the writer wrote (two real panoramas were judged on twelve shot mismatches).
  const varied = script("c1");
  const [bound] = bindPanoramaShots([{ ...varied, slides: varied.slides.map((entry) => entry.slide === "s2" ? { ...entry, need: "typography" as const, shot: "typography" as const } : entry) }]);
  assert.deepEqual(bound.slides.map((entry) => entry.shot), ["wide", "wide", "wide", "typography", "wide", "wide"], "a typography card keeps its shot: the program refuses it as a section");
  assert.deepEqual(findings(bindPanoramaShots([script("c1")])[0], { narrative: panorama }).filter((code) => /^(SAME_SHOT|SHOT_MISMATCH)/.test(code)), []);
  // Each slide's station, for the writer and the judge, found as its beat is.
  const station = (size: "large" | "medium" | "small", crossing: string) => ({ size, character: false, crossing });
  const beat = (slide: "cover" | "slide2" | "middle" | "penultimate" | "last") => ({ slide, role: "setup" as const, scene: "s", words: "w", image: "i", withholds: "", factIds: [] });
  const spine = { beats: [beat("cover"), beat("slide2"), beat("middle"), beat("penultimate"), beat("last")], panorama: { world: "A long cream plane", device: "journey" as const, axis: "left to right", field: "cream", carrier: "the soil band", ending: "resolves" as const, stations: [station("medium", "the band runs on"), station("small", "to the plants"), station("large", "to the hole"), station("medium", "to the tree"), station("medium", "")] } };
  assert.deepEqual(spineStations(spine, carousel), { cover: station("medium", "the band runs on"), slide2: station("small", "to the plants"), s1: station("large", "to the hole"), penultimate: station("medium", "to the tree"), last: station("medium", "") }, "s2 has no middle beat: no station");
  assert.deepEqual(spineStations({ beats: spine.beats }, carousel), {}, "no panorama, no stations");
});

test("the visual gate (2026-10-19): the funnel's acceptable score, the criteria at 85 and originality at 70, since the spine chose what each image shows", async () => {
  const { VISUAL_GATE, VISUAL_ACCEPT_SCORE, VISUAL_CRITERION_FLOOR, VISUAL_ORIGINALITY_FLOOR } = await import("./draft2-visual.types");
  assert.deepEqual([VISUAL_ACCEPT_SCORE, VISUAL_CRITERION_FLOOR, VISUAL_ORIGINALITY_FLOOR, VISUAL_GATE.floors], [90, 85, 70, { originality: 70 }]);
  const strong: Draft2VisualScore = { ...score("c1", 91), fidelity: 93, continuity: 93, brand: 92, truth: 96, craft: 93, originality: 80 };
  assert.equal(funnelScorePasses(strong, VISUAL_GATE), true, "a script the judge found predictable but right everywhere else passes (d31e7249 and b7e9c5b9 scored 91 with originality 80 and were sent back)");
  const dull: Draft2VisualScore = { ...strong, originality: 65 };
  const rough: Draft2VisualScore = { ...strong, craft: 84 };
  const under: Draft2VisualScore = { ...strong, overall: 89 };
  assert.equal(funnelScorePasses(dull, VISUAL_GATE), false, "originality has its own floor");
  assert.equal(funnelScorePasses(rough, VISUAL_GATE), false, "the other criteria keep theirs");
  assert.equal(funnelScorePasses(under, VISUAL_GATE), false);
});

test("room kept for the logo asks for no logo, in the publications' phrasings: the writer is told where the logo goes and says so", () => {
  for (const direction of ["La dirección pide dejar sitio para el logo en la esquina superior izquierda.", "Deja libre el centro superior para el logo.", "Franja superior libre para el titular; lugar para el logo arriba a la izquierda.", "Le tiers supérieur reste dégagé pour le logo.", "The top band kept clear for the logo added afterwards."]) {
    assert.equal(forbiddenElement(direction), undefined, direction);
  }
  assert.equal(forbiddenElement("A card with the logo drawn in the corner"), "logo");
});

test("a beat bound from the spine or the draft never exceeds the beat's limit: cut at a word (2026-10-24, the pineapple's v4 intents)", () => {
  const long = "Rodaja de piña fresca a la izquierda soltando puntitos que flotan, y a la derecha el personaje de la marca con la cara arrugada por el hormigueo, sobre fondo terracota plano; el gesto cuenta la molestia antes que el titular. Ilustración plana serigráfica retro, trazo azul tinta, sin texto ni números.";
  assert.ok(long.length > VISUAL_BEAT_MAX_CHARACTERS);
  const cut = beatWithinLimit(long);
  assert.ok(cut.length <= VISUAL_BEAT_MAX_CHARACTERS && long.startsWith(cut) && /[\p{L}]$/u.test(cut), cut);
  assert.equal(beatWithinLimit("  Una capa  fina. "), "Una capa fina.");
  const [bound] = bindSpineBeats([{ slides: [{ slide: "cover", beat: "x" }, { slide: "s1", beat: "y" }] as unknown as Draft2VisualSlide[] }], { cover: long });
  assert.equal(bound.slides[0].beat, cut);
  assert.equal(bound.slides[1].beat, "y", "a slide the lines do not name keeps the writer's beat");
});
