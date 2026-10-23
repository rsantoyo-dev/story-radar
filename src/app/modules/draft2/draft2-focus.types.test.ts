import assert from "node:assert/strict";
import test from "node:test";
import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  FOCUS_BEAT_WORDS_MAX_CHARACTERS, CLASSIC_CONCEPT, CLASSIC_NARRATIVE, DRAFT2_FOCUS_PLAN_SCHEMA, DRAFT2_FOCUS_SCHEMA, focusConcept, FOCUS_FIELDS, applyFocusEdit, decidedFocus, editorChoicesOf, focusDecisionRequest, focusFindings, focusForModels, focusItemCount, focusLine,
  anchorNoun, beatFactsFinding, beatFactsMissing, focusMaterial, focusToday, focusWithPlan, focusWithSpineProblems, narrativeUsesMaster, parseFocusDecision, parseFocusPlan, parseNarrativeReview, resetFocusField, spineBeatFactIds, spineMiddleFactIds, spineShapeProblem,
  spineUnusedFacts, visualDirectionChanged, visualFocus, wordsFollowFocus, focusPresentation, FOCUS_DECISION_FIELDS,
  focusNarrative, spineLimitsForModels, focusPlanSchema, PANORAMA_DEFAULT_ANCHOR, PANORAMA_WORLD_MAX_CHARACTERS,
  type Draft2Focus, type Draft2FocusLine, type Draft2FocusMaterial, type Draft2FocusNarrative, type Draft2FocusValues, type Draft2SpineBeat,
} from "./draft2-focus.types";
import type { Draft2Inventory } from "./draft2-inventory.types";

const facts: Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week.", evidence: "awards took less than a week", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
  { id: "f3", claim: "The program could reach $1.5 trillion by 2030.", evidence: "could reach $1.5 trillion by 2030", kind: "number", status: "attributed", attribution: "the Pentagon", qualifier: "could", importance: 70 },
];
const LINE: Draft2FocusLine = { id: "55555555-5555-4555-8555-555555555555", revision: 2, name: "Actualidad", objective: "Recent defence AI news for founders." };
const OTHER_LINE: Draft2FocusLine = { id: "66666666-6666-4666-8666-666666666666", revision: 1, name: "Guides", objective: "How to sell to government, step by step." };
const lines = [LINE, OTHER_LINE];
const reasons = Object.fromEntries(FOCUS_FIELDS.map((field) => [field, `Why ${field}.`]));
const NOW = new Date("2026-10-10T15:00:00.000Z");

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
/** A valid spine for a list or a procedure of `items` items: no penultimate, one middle beat per item but the first (on slide2), the turn on the first middle beat. */
const itemsSpine = (items: number) => ({ beats: [
  ARC_SPINE.beats[0],
  { ...ARC_SPINE.beats[1], words: "State the first item." },
  ...Array.from({ length: Math.max(1, items - 1) }, (_, index) => ({ slide: "middle", role: index === 0 ? "turning-point" : "rising", scene: `Item ${index + 2} comes into view.`, words: `Say item ${index + 2}.`, image: `Item ${index + 2} as a thing in a place.`, withholds: "The next item.", factIds: [] })),
  ARC_SPINE.beats[6],
] });

/** Claude's answer, every field valid unless overridden. */
const answer = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  lineId: LINE.id,
  interest: "A five-minute video can now open a Pentagon contract: the shortest door the Pentagon ever opened.",
  approaches: ["Classic: the rule, the award, the number; feels like news, risks the plain.", "Discovery: the reader follows one founder's video to the award; feels like a story, risks inventing the founder.", "Escalation: five minutes, less than a week, $1.5 trillion; feels like vertigo, risks the qualifiers."],
  audience: "Founders who sell software to the Pentagon",
  framing: "reader-consequence",
  readerConsequence: { text: "A five-minute video can now open a Pentagon contract.", factIds: ["f1", "f9", "f2", "f1"] },
  structure: { kind: "arc", itemFactIds: ["f2"] },
  goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 150, energy: 70.4, optimism: 60, provocation: 0 },
  direction: "Lead with the five-minute video; pay it with the award time.",
  visualDirection: "Anonymous founders at a laptop and a screen; the demo video recurs, and closes the story as a signed award.",
  spine: ARC_SPINE,
  reasons,
  ...overrides,
});
/** The structure that will stand (the editor's, else the answer's) decides the spine's shape, as Claude would shape it. */
const spineFor = (overrides: Record<string, unknown>, editorChoices: Record<string, unknown>) => {
  const structure = (editorChoices.structure ?? overrides.structure) as { kind?: string; itemFactIds?: string[] } | undefined;
  if (!structure || structure.kind === "arc") return ARC_SPINE;
  const items = (structure.itemFactIds ?? []).filter((id) => ["f1", "f2", "f3"].includes(id)).length || 3;
  return itemsSpine(items);
};
const parse = (overrides: Record<string, unknown> = {}, editorChoices: Record<string, unknown> = {}) => parseFocusDecision(answer({ spine: spineFor(overrides, editorChoices), ...overrides }), { facts, lines, editorChoices });

const decided = (values?: Partial<Draft2FocusValues>): Draft2Focus => {
  const decision = parse();
  const focus = decidedFocus({ status: "running", version: 0, edited: [], lineOptions: lines }, decision, { provider: "anthropic", model: "claude-sonnet-5-5" }, NOW);
  return values ? { ...focus, values: { ...focus.values!, ...values }, ai: { ...focus.ai!, ...values } } : focus;
};

test("Claude's answer becomes the focus: unknown fact ids dropped, dials clamped to whole numbers, a reason per field", () => {
  const { values, reasons: parsed } = parse();
  assert.deepEqual(values.line, LINE);
  assert.deepEqual(values.readerConsequence, { text: "A five-minute video can now open a Pentagon contract.", factIds: ["f1", "f2"] }, "an id that is not a verified fact is dropped, a repeated one kept once");
  assert.deepEqual(values.structure, { kind: "arc", itemFactIds: [] }, "an arc names no items");
  assert.deepEqual(values.voice, { gravity: "ordinary", formality: 30, humor: 100, energy: 70, optimism: 60, provocation: 1 }, "the adapter strips the schema's bounds; the program clamps");
  assert.equal(parsed.goal, "Why goal.");
  assert.deepEqual(parse({ readerConsequence: { text: "Something no fact says.", factIds: ["f9"] } }).values.readerConsequence, null, "a consequence resting on no verified fact is none");
  assert.deepEqual(parse({ readerConsequence: { text: null, factIds: [] } }).values.readerConsequence, null);
  assert.deepEqual(parse({ structure: { kind: "list", itemFactIds: ["f3", "f1", "f9", "f2"] } }).values.structure, { kind: "list", itemFactIds: ["f3", "f1", "f2"] }, "items keep Claude's order");
  assert.equal(parseFocusDecision(answer({ lineId: null }), { facts, lines: [] }).values.line, null, "a Topic without lines has no line");
  assert.deepEqual((DRAFT2_FOCUS_SCHEMA.required as string[]).sort(), ["anchorAlternatives", "approaches", "audience", "concept", "conceptAlternatives", "framing", "goal", "interest", "lineId", "narrative", "readerConsequence", "reasons", "structure", "voice"]);
  assert.deepEqual(values.narrative, CLASSIC_NARRATIVE, "an answer without a narrative form, from before them, is classic");
});

test("an answer outside the contract is a response error, never a focus", () => {
  const rejects = (overrides: Record<string, unknown>, pattern: RegExp) => assert.throws(() => parse(overrides), (error: Error) => error instanceof Draft2ResponseError && pattern.test(error.message));
  rejects({ lineId: "77777777-7777-4777-8777-777777777777" }, /editorial line the Topic does not have/);
  rejects({ lineId: null }, /editorial line the Topic does not have/);
  rejects({ audience: "" }, /audience is missing/);
  rejects({ audience: "x".repeat(301) }, /longer than 300/);
  rejects({ direction: "x".repeat(1_501) }, /direction is longer than 1500/);
  rejects({ visualDirection: "x".repeat(601) }, /visual direction is longer than 600/);
  rejects({ framing: "auto" }, /outside the contract/);
  rejects({ goal: "virality" }, /outside the contract/);
  rejects({ structure: { kind: "carousel", itemFactIds: [] } }, /outside the contract/);
  rejects({ voice: { gravity: "dramatic", formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60 } }, /outside the contract/);
  rejects({ voice: { gravity: "grave", formality: "30", humor: 40, energy: 70, optimism: 60, provocation: 60 } }, /number for every tone dial/);
  rejects({ readerConsequence: { text: "x".repeat(301), factIds: ["f1"] } }, /reader consequence is longer than 300/);
  assert.throws(() => parseFocusDecision("not json", { facts, lines }), /not valid JSON/);
  assert.throws(() => parseFocusDecision("[1]", { facts, lines }), /not an object/);
});

test("the editor's fields win over the answer; a structure the editor chose takes Claude's items for that kind", () => {
  const choices = { goal: "saves", lineId: OTHER_LINE.id, readerConsequence: { text: "My own words.", factIds: [] }, structure: { kind: "list", itemFactIds: [] } };
  const { values, reasons: parsed } = parse({ structure: { kind: "list", itemFactIds: ["f1", "f2", "f3"] } }, choices);
  assert.equal(values.goal, "saves");
  assert.deepEqual(values.line, OTHER_LINE);
  assert.deepEqual(values.readerConsequence, { text: "My own words.", factIds: [] }, "the editor's words stay, though they cite no fact");
  assert.deepEqual(values.structure, { kind: "list", itemFactIds: ["f1", "f2", "f3"] }, "the list the editor asked for gets its items");
  assert.deepEqual(parse({ structure: { kind: "arc", itemFactIds: [] } }, { structure: { kind: "steps", itemFactIds: ["f1", "f2"] } }).values.structure, { kind: "steps", itemFactIds: ["f1", "f2"] }, "an answer of another kind leaves the editor's items");
  assert.equal(parse({ goal: "followers" }, { goal: "saves" }).values.goal, "saves", "whatever the answer says");
  assert.deepEqual(Object.keys(parsed).sort(), ["audience", "concept", "direction", "framing", "levers", "narrative", "spine", "visualDirection", "voice"], "reasons only for the fields Claude decided");
});

test("a decision is one version more and keeps Claude's own values under the editor's fields", () => {
  const first = decided();
  assert.equal(first.status, "ready");
  assert.equal(first.version, 1);
  assert.deepEqual(first.ai, first.values);
  assert.equal(first.decidedAt, NOW.toISOString());
  assert.deepEqual(first.decidedBy, { provider: "anthropic", model: "claude-sonnet-5-5" });
  const edited = applyFocusEdit(first, "goal", "saves", NOW);
  const again = decidedFocus({ ...edited, status: "running" }, parse({ goal: "saves", direction: "Lead with what to keep." }, editorChoicesOf(edited)), { provider: "anthropic", model: "claude-sonnet-5-5" }, NOW);
  assert.equal(again.version, 3);
  assert.equal(again.values?.goal, "saves");
  assert.equal(again.ai?.goal, "followers", "Claude's earlier value is still the one the goal can go back to");
  assert.equal(again.ai?.direction, "Lead with what to keep.", "Claude's new values for the other fields");
  assert.deepEqual(again.edited, ["goal"]);
});

test("an edit is checked, becomes the editor's, and gives the field back when it equals Claude's value", () => {
  const focus = decided();
  const saves = applyFocusEdit(focus, "goal", "saves", NOW);
  assert.equal(saves.values?.goal, "saves");
  assert.deepEqual(saves.edited, ["goal"]);
  assert.equal(saves.version, 2);
  assert.equal(saves.updatedAt, NOW.toISOString());
  assert.equal(applyFocusEdit(saves, "goal", "saves", NOW), saves, "an unchanged value changes nothing");
  const back = applyFocusEdit(saves, "goal", "followers", NOW);
  assert.deepEqual(back.edited, [], "Claude's value gives the field back to Claude");
  assert.equal(back.version, 3);
  assert.deepEqual(applyFocusEdit(focus, "line", OTHER_LINE.id, NOW).values?.line, OTHER_LINE);
  assert.deepEqual(applyFocusEdit(focus, "readerConsequence", "  My own words.  ", NOW).values?.readerConsequence, { text: "My own words.", factIds: [] }, "the editor's words cite no fact");
  assert.equal(applyFocusEdit(focus, "readerConsequence", "", NOW).values?.readerConsequence, null);
  assert.deepEqual(applyFocusEdit(focus, "structure", "list", NOW).values?.structure, { kind: "list", itemFactIds: [] }, "Claude picks the items when it decides again");
  const voice = { gravity: "grave", formality: 50, humor: 5, energy: 30, optimism: 30, provocation: 20 };
  assert.deepEqual(applyFocusEdit(focus, "voice", voice, NOW).values?.voice, voice);
  const invalid = (field: (typeof FOCUS_FIELDS)[number], value: unknown, pattern: RegExp) => assert.throws(() => applyFocusEdit(focus, field, value, NOW), (error: Error) => error instanceof Draft2InputError && pattern.test(error.message));
  invalid("goal", "virality", /goal is one of followers, discussion, saves, shares/);
  invalid("framing", "auto", /framing is one of/);
  invalid("structure", "carousel", /structure is one of/);
  invalid("line", "77777777-7777-4777-8777-777777777777", /one of the Topic's editorial lines/);
  invalid("audience", " ", /audience needs 1 to 300 characters/);
  invalid("direction", "x".repeat(1_501), /direction needs 1 to 1,500 characters/);
  invalid("voice", { ...voice, humor: 101 }, /whole number from 1 to 100/);
  invalid("voice", { ...voice, gravity: "dramatic" }, /gravity is one of/);
  assert.throws(() => applyFocusEdit({ status: "ready", version: 0, edited: [], lineOptions: [] }, "goal", "saves", NOW), /Decide the focus before changing it/);
});

test("a reset gives one field back to Claude's value", () => {
  const edited = applyFocusEdit(applyFocusEdit(decided(), "goal", "saves", NOW), "audience", "Parents in Laval", NOW);
  const reset = resetFocusField(edited, "goal", NOW);
  assert.equal(reset.values?.goal, "followers");
  assert.equal(reset.values?.audience, "Parents in Laval");
  assert.deepEqual(reset.edited, ["audience"]);
  assert.equal(reset.version, edited.version + 1);
  assert.equal(resetFocusField(reset, "goal", NOW), reset, "a field that is Claude's already changes nothing");
});

test("the program's findings: a reader-consequence framing needs a consequence, a list three items and steps two", () => {
  const values = decided().values!;
  assert.deepEqual(focusFindings(values), []);
  assert.deepEqual(focusFindings({ ...values, readerConsequence: null }).map((finding) => [finding.field, finding.code]), [["readerConsequence", "NO_READER_CONSEQUENCE"]]);
  assert.deepEqual(focusFindings({ ...values, framing: "explainer", readerConsequence: null }), [], "another framing needs none");
  assert.deepEqual(focusFindings({ ...values, structure: { kind: "list", itemFactIds: ["f1", "f2"] }, spine: undefined }).map((finding) => finding.code), ["TOO_FEW_ITEMS"]);
  assert.match(focusFindings({ ...values, structure: { kind: "list", itemFactIds: ["f1", "f2"] }, spine: undefined })[0].detail, /at least 3 items from the facts, and the focus names 2/);
  assert.deepEqual(focusFindings({ ...values, structure: { kind: "steps", itemFactIds: ["f1", "f2"] }, spine: undefined }), []);
  assert.deepEqual(focusFindings({ ...values, structure: { kind: "steps", itemFactIds: ["f1", "f2"] } }).map((finding) => [finding.field, finding.code]), [["spine", "SPINE_SHAPE"]], "an arc's spine no longer fits a procedure: its penultimate beat has no slide");
  assert.equal(focusItemCount({ ...values, structure: { kind: "list", itemFactIds: ["f1", "f2", "f3"] } }), 3);
  assert.equal(focusItemCount(values), undefined);
});

test("the Opening's models read the focus with the dials in words and the editor's words marked as guidance", () => {
  const values = decided({ structure: { kind: "list", itemFactIds: ["f1", "f2", "f3"] } }).values!;
  const forModels = focusForModels(values);
  assert.deepEqual(forModels.line, { name: LINE.name, objective: LINE.objective });
  assert.deepEqual(forModels.structure, { kind: "list", items: 3, itemFactIds: ["f1", "f2", "f3"] });
  assert.equal(forModels.voice.tone, "formality 30/100: conversational; humor 100/100: playful throughout; energy 70/100: lively; optimism 60/100: balanced; provocation 1/100: gentle, never confrontational");
  assert.deepEqual(focusForModels({ ...values, readerConsequence: { text: "My words.", factIds: [] } }).readerConsequence, { text: "My words.", note: "the editor's words: guidance, not a fact" });
  assert.equal("line" in focusForModels({ ...values, line: null }), false);
});

test("Claude's request: the profile's defaults in the focus's terms, the lines, the ones that found the story, the editor's choices when there are any", () => {
  const source = { id: LINE.id, revision: 2, name: "Actualidad", objective: `${"Recent defence AI news. ".repeat(40)}`, themes: ["defence", "procurement"] };
  const request = focusDecisionRequest({ title: "Pentagon buys AI by video", today: "2026-10-10", profile: { framingStrategy: "auto", storyStructure: "hook-steps", conversionGoal: "followers" }, lines: [source, { ...OTHER_LINE, themes: [] }], foundBy: [LINE.id] });
  assert.deepEqual(Object.keys(request), ["task", "story", "today", "topicDefaults", "lines", "foundBy"]);
  assert.deepEqual(request.topicDefaults, { framing: "auto", structure: "steps", goal: "followers" });
  assert.equal(request.lines[0].objective.length, 600, "a long objective is clipped");
  assert.deepEqual(request.lines[1], { id: OTHER_LINE.id, name: OTHER_LINE.name, objective: OTHER_LINE.objective }, "a line without themes says none");
  assert.equal(focusLine(source).objective.endsWith("…"), true);
  const edited = applyFocusEdit(applyFocusEdit(decided(), "line", OTHER_LINE.id, NOW), "goal", "saves", NOW);
  assert.deepEqual(editorChoicesOf(edited), { lineId: OTHER_LINE.id, goal: "saves" });
  assert.deepEqual(editorChoicesOf({ ...edited, lineOptions: [LINE] }), { goal: "saves" }, "a line archived since the editor chose it is no longer a choice");
  assert.deepEqual(Object.keys(focusDecisionRequest({ title: "t", today: "d", profile: { framingStrategy: "auto", storyStructure: "auto", conversionGoal: "saves" }, lines: [], foundBy: [], editorChoices: { goal: "saves" } })), ["task", "story", "today", "topicDefaults", "lines", "editorChoices"]);
});

test("today is the date where the publication works", () => {
  assert.equal(focusToday("America/Toronto", new Date("2026-10-11T02:00:00.000Z")), "2026-10-10", "still the 10th in Toronto");
  assert.equal(focusToday("Not/AZone", new Date("2026-10-11T02:00:00.000Z")), "2026-10-11", "UTC when the zone is unknown");
  assert.equal(focusToday(undefined, NOW), "2026-10-10");
});

const MATERIAL: Draft2FocusMaterial = {
  characterChoice: "auto",
  characters: [{ id: "char-jo", name: "Jo", description: "The local narrator, a modern Johannaise." }],
  people: ["Catherine Fournier"],
  portraits: [],
  places: [{ name: "Parc des Parulines", verifiedPhoto: true, map: true }],
  organizations: ["CIME Haut-Richelieu"],
  storyPhotos: [],
};
const guide = (overrides: Record<string, unknown> = {}) => ({ form: "character-guide", anchorKind: "character", characterId: "char-jo", anchor: "Jo, our narrator", anchorFactIds: [], progression: "From the kiosk to each animal of the trail", ending: "returns", ...overrides });
const withNarrative = (narrative: Record<string, unknown>, material: Draft2FocusMaterial = MATERIAL) => parseFocusDecision(answer({ narrative }), { facts, lines, material });

test("a narrative form: a brand character guides by its id and its name, a figure or an object keeps the facts it cites", () => {
  assert.deepEqual(withNarrative(guide()).values.narrative, { form: "character-guide", anchorKind: "character", characterId: "char-jo", anchor: "Jo", anchorFactIds: [], progression: "From the kiosk to each animal of the trail", ending: "returns" }, "the character's own name, never Claude's words for it");
  assert.deepEqual(withNarrative(guide({ anchorKind: "figure", characterId: null, anchor: "A curious toad", anchorFactIds: ["f2", "f9"] })).values.narrative?.anchorFactIds, ["f2"], "an id that is not a verified fact is dropped");
  assert.deepEqual(withNarrative(guide({ anchorKind: "figure", characterId: null, anchor: "A child seen from behind", anchorFactIds: [] })).values.narrative?.anchor, "A child seen from behind", "an anonymous figure cites no fact");
  assert.deepEqual(withNarrative({ form: "traveling-object", anchorKind: "object", characterId: null, anchor: "The bag of « bonbons »", anchorFactIds: ["f1"], progression: "Trail to trail", ending: "resolves" }).values.narrative?.anchorKind, "object");
  assert.deepEqual(withNarrative({ form: "classic", anchorKind: "figure", characterId: null, anchor: "Ignored", anchorFactIds: ["f1"], progression: "Ignored", ending: "returns" }).values.narrative, CLASSIC_NARRATIVE, "classic keeps nothing else, and resolves");
});

test("a narrative form outside the contract or the material is a response error, asked for again with the rule it broke", () => {
  const rejects = (narrative: Record<string, unknown>, pattern: RegExp, material: Draft2FocusMaterial = MATERIAL) =>
    assert.throws(() => withNarrative(narrative, material), (error: Error) => error instanceof Draft2ResponseError && pattern.test(error.message));
  rejects(guide({ form: "time-machine" }), /narrative form is one of classic, character-guide, traveling-object/);
  rejects(guide({ anchorKind: "object" }), /character-guide anchor is character or figure/);
  rejects(guide({ characterId: "char-mia" }), /brand character the brand does not have \(char-mia\)/);
  rejects(guide(), /turned the brand's characters off/, { ...MATERIAL, characterChoice: "off", characters: [] });
  rejects(guide({ anchorKind: "figure", characterId: null, anchor: "catherine fournier at the kiosk" }), /Catherine Fournier is a real person of the story/);
  rejects({ form: "traveling-object", anchorKind: "object", characterId: null, anchor: "A ticket", anchorFactIds: [], progression: "p", ending: "resolves" }, /traveling object comes from the facts/);
  rejects(guide({ anchorKind: "figure", characterId: null, anchor: "" }), /anchor is missing or longer than 200/);
  rejects(guide({ progression: "x".repeat(301) }), /progression is missing or longer than 300/);
});

test("a publication's own narrative forms: one it turned off is asked for again, the request names the forms it keeps, and the editor cannot choose it either", () => {
  const forms = ["classic", "traveling-object", "panorama", "follow-the-line"] as const;
  assert.throws(() => parseFocusDecision(answer({ narrative: guide() }), { facts, lines, material: MATERIAL, narrativeForms: forms }),
    (error: Error) => error instanceof Draft2ResponseError && /does not tell its stories as character-guide; the narrative form is one of classic, traveling-object, panorama, follow-the-line/.test(error.message));
  assert.deepEqual(parseFocusDecision(answer({ narrative: { form: "classic", anchorKind: "figure", characterId: null, anchor: "x", anchorFactIds: [], progression: "x", ending: "resolves" } }), { facts, lines, material: MATERIAL, narrativeForms: ["classic"] }).values.narrative, CLASSIC_NARRATIVE, "classic is always allowed");
  const request = focusDecisionRequest({ title: "t", today: "d", profile: { framingStrategy: "auto", storyStructure: "auto", conversionGoal: "saves", narrativeForms: [...forms] }, lines: [], foundBy: [] });
  assert.deepEqual((request as { narrativeForms?: { allowed: string[] } }).narrativeForms?.allowed, [...forms]);
  assert.equal("narrativeForms" in focusDecisionRequest({ title: "t", today: "d", profile: { framingStrategy: "auto", storyStructure: "auto", conversionGoal: "saves" }, lines: [], foundBy: [] }), false, "every form allowed: the request says nothing");
  const focus = { ...decided({}), narrativeForms: [...forms] };
  assert.throws(() => applyFocusEdit(focus, "narrative", { form: "character-guide", anchorKind: "character", characterId: "char-jo", anchor: "Jo", progression: "p", ending: "returns" }, NOW),
    (error: Error) => error instanceof Draft2InputError && /does not tell its stories as character-guide: turn the form on in its creative profile first/.test(error.message));
  assert.equal(applyFocusEdit(focus, "narrative", { form: "traveling-object", anchorKind: "object", anchor: "A pumpkin bucket", progression: "" }, NOW).values?.narrative?.form, "traveling-object");
});

test("Claude's other anchors are offered to the editor: valid ones only, never a person of the story, at most three", () => {
  const { alternatives } = parseFocusDecision(answer({ anchorAlternatives: [
    { kind: "object", anchor: "The rally sheet", factIds: ["f1", "f9"] }, { kind: "figure", anchor: "Catherine Fournier", factIds: [] }, { kind: "person", anchor: "A bat", factIds: [] },
    { kind: "figure", anchor: "A bat", factIds: [] }, { kind: "figure", anchor: "A spider", factIds: [] }, { kind: "figure", anchor: "A toad", factIds: [] },
  ] }), { facts, lines, material: MATERIAL });
  assert.deepEqual(alternatives, [{ kind: "object", anchor: "The rally sheet", factIds: ["f1"] }, { kind: "figure", anchor: "A bat", factIds: [] }, { kind: "figure", anchor: "A spider", factIds: [] }]);
});

test("the editor's narrative form: classic needs nothing; a guide or an object needs its words; an anchor Claude found keeps its facts", () => {
  const focus = { ...decided({ narrative: withNarrative(guide({ anchorKind: "figure", characterId: null, anchor: "A curious toad", anchorFactIds: ["f2"] })).values.narrative }), narrativeOptions: [{ kind: "object" as const, anchor: "The rally sheet", factIds: ["f1"] }] };
  const edit = (value: Partial<Draft2FocusNarrative>) => applyFocusEdit(focus, "narrative", value, NOW).values?.narrative;
  assert.deepEqual(edit({ form: "classic", anchor: "anything" }), CLASSIC_NARRATIVE);
  assert.deepEqual(edit({ form: "traveling-object", anchorKind: "object", anchor: "The rally sheet", progression: "" })?.anchorFactIds, ["f1"], "an alternative Claude saw keeps its facts");
  assert.deepEqual(edit({ form: "traveling-object", anchorKind: "object", anchor: "A pumpkin bucket", progression: "" })?.anchorFactIds, [], "the editor's own words cite none");
  assert.deepEqual(edit({ form: "character-guide", anchorKind: "character", characterId: "char-jo", anchor: "Jo", progression: "Stop to stop", ending: "returns" }), { form: "character-guide", anchorKind: "character", characterId: "char-jo", anchor: "Jo", anchorFactIds: [], progression: "Stop to stop", ending: "returns" });
  const refuses = (value: Partial<Draft2FocusNarrative>, pattern: RegExp) => assert.throws(() => edit(value), (error: Error) => error instanceof Draft2InputError && pattern.test(error.message));
  refuses({ form: "time-machine" as never }, /narrative form is one of/);
  refuses({ form: "character-guide", anchorKind: "object", anchor: "x" }, /guide is one of the brand's characters or a figure/);
  refuses({ form: "character-guide", anchorKind: "character", anchor: "Jo" }, /Choose one of the brand's characters/);
  refuses({ form: "traveling-object", anchorKind: "object", anchor: " " }, /Say what the object is/);
  assert.equal(applyFocusEdit(focus, "narrative", { form: "classic" }, NOW).edited.includes("narrative"), true, "the editor's form stays theirs");
});

test("the program checks the narrative against People and places as they stand: a character turned off or gone, a real person as the anchor", () => {
  const values = (narrative: Draft2FocusNarrative): Draft2FocusValues => ({ ...decided().values!, narrative });
  const jo: Draft2FocusNarrative = { form: "character-guide", anchorKind: "character", characterId: "char-jo", anchor: "Jo", anchorFactIds: [], progression: "", ending: "resolves" };
  assert.deepEqual(focusFindings(values(jo), MATERIAL), []);
  assert.deepEqual(focusFindings(values(jo)), [], "without People and places there is nothing to check");
  assert.match(focusFindings(values(jo), { ...MATERIAL, characterChoice: "off", characters: [] })[0].detail, /Jo guides the carousel, and the brand's characters are off in People and places/);
  assert.match(focusFindings(values(jo), { ...MATERIAL, characters: [] })[0].detail, /Jo is no longer one of the brand's characters/);
  assert.deepEqual(focusFindings(values({ ...jo, anchorKind: "figure", characterId: null, anchor: "Catherine Fournier, smiling" }), MATERIAL).map((finding) => [finding.field, finding.code]), [["narrative", "NARRATIVE_REAL_PERSON"]]);
});

test("the models read a narrative form only when it is not classic, so a classic story's prompts stay as they were", () => {
  const classic = decided({ narrative: CLASSIC_NARRATIVE }).values!;
  assert.equal("narrative" in focusForModels(classic), false);
  const told = focusForModels({ ...classic, narrative: { form: "traveling-object", anchorKind: "object", characterId: null, anchor: "The bag of « bonbons »", anchorFactIds: ["f1"], progression: "Trail to trail", ending: "returns" } });
  assert.deepEqual(told.narrative, { form: "traveling-object", anchor: { kind: "object", what: "The bag of « bonbons »", factIds: ["f1"] }, progression: "Trail to trail", recurs: "the anchor is what recurs across the images; it replaces any other recurring element visualDirection names", ending: "returns" }, "with a visualDirection in the focus, the models are told the anchor replaces whatever else it names");
  const bare = focusForModels({ ...classic, visualDirection: "", narrative: { form: "traveling-object", anchorKind: "object", characterId: null, anchor: "The torch", anchorFactIds: ["f1"], progression: "", ending: "resolves" }, structure: { kind: "list", itemFactIds: ["f1", "f2", "f3"] } });
  assert.deepEqual(["recurs" in (bare.narrative ?? {}), bare.narrative?.progression], [false, "one item per slide, in the list's order: the anchor meets each in turn, in a new state each time"], "no visualDirection, no note; an empty progression is filled from the structure");
  const anonymous = focusForModels({ ...classic, narrative: { form: "character-guide", anchorKind: "figure", characterId: null, anchor: "A child seen from behind", anchorFactIds: [], progression: "", ending: "resolves" } });
  assert.match(String((anonymous.narrative?.anchor as { note?: string }).note), /not from the facts/);
});

test("People and places as the focus reads them: the brand's characters only while allowed, the people never drawn, the places and what verifies them", () => {
  const inventory = {
    characters: "auto", roster: [{ id: "char-jo", name: "Jo", description: "x".repeat(400) }],
    entities: [
      { id: "e1", name: "Catherine Fournier", kind: "person", role: "subject", description: "", factIds: ["f1"] },
      { id: "e2", name: "Parc des Parulines", kind: "place", role: "setting", description: "", factIds: ["f2"], place: { status: "verified", map: true } },
    ],
    storyPhotos: [],
  } as unknown as Draft2Inventory;
  const material = focusMaterial(inventory);
  assert.deepEqual([material.characters.map((character) => [character.id, character.name, character.description.length]), material.people, material.places], [[["char-jo", "Jo", 300]], ["Catherine Fournier"], [{ name: "Parc des Parulines", verifiedPhoto: false, map: true }]]);
  assert.deepEqual(focusMaterial({ ...inventory, characters: "off" }).characters, [], "characters the editor turned off are not offered");
  assert.deepEqual(material.portraits, [], "a person without a verified portrait is never shown");
  const portrait = { ...inventory, entities: [{ ...inventory.entities[0], storyPhoto: { id: "p1", name: "Catherine Fournier", provenance: "Photo: Ville", transmissionAllowed: false, rights: "licensed" as const } }, inventory.entities[1]] } as unknown as Draft2Inventory;
  assert.deepEqual(focusMaterial(portrait).portraits, ["Catherine Fournier"], "a story photo the editor gave them is their portrait");
  assert.equal(JSON.stringify(focusDecisionRequest({ title: "t", today: "2026-10-12", profile: { framingStrategy: "auto", storyStructure: "auto", conversionGoal: "followers" }, lines: [], foundBy: [], material }).material), JSON.stringify(material));
});

test("the judge's review of a narrative form is a verdict and a reason; anything else is a response error", () => {
  assert.deepEqual(parseNarrativeReview(JSON.stringify({ verdict: "classic", reason: "The schedule has no thread to follow." })), { verdict: "classic", reason: "The schedule has no thread to follow." });
  assert.throws(() => parseNarrativeReview(JSON.stringify({ verdict: "maybe", reason: "x" })), Draft2ResponseError);
  assert.throws(() => parseNarrativeReview("not json"), Draft2ResponseError);
});

test("a panorama's scene and a line to follow: the line comes from the facts, the scene need not; both can be offered and chosen", () => {
  const panorama = withNarrative({ form: "panorama", anchorKind: "scene", characterId: null, anchor: "An autumn trail from the kiosk to the pond", anchorFactIds: [], progression: "From the kiosk to each animal", ending: "returns" }).values.narrative!;
  assert.deepEqual([panorama.form, panorama.anchorKind, panorama.anchorFactIds, narrativeUsesMaster(panorama), anchorNoun(panorama)], ["panorama", "scene", [], true, "scene"]);
  const line = withNarrative({ form: "follow-the-line", anchorKind: "line", characterId: null, anchor: "The boardwalk trail", anchorFactIds: ["f2"], progression: "What the trail reaches", ending: "resolves" }).values.narrative!;
  assert.deepEqual([line.anchorKind, line.anchorFactIds, narrativeUsesMaster(line), anchorNoun(line)], ["line", ["f2"], true, "line"]);
  assert.equal(narrativeUsesMaster({ form: "character-guide" }), false);
  assert.throws(() => withNarrative({ form: "follow-the-line", anchorKind: "line", characterId: null, anchor: "A trail", anchorFactIds: [], progression: "p", ending: "resolves" }), /line comes from the facts/);
  assert.throws(() => withNarrative({ form: "panorama", anchorKind: "object", characterId: null, anchor: "A trail", anchorFactIds: ["f1"], progression: "p", ending: "resolves" }), /panorama anchor is scene, not object/);
  const { alternatives } = parseFocusDecision(answer({ anchorAlternatives: [{ kind: "line", anchor: "The 15 bus route", factIds: ["f1"] }, { kind: "scene", anchor: "The whole festival ground", factIds: [] }] }), { facts, lines, material: MATERIAL });
  assert.deepEqual(alternatives.map((alternative) => alternative.kind), ["line", "scene"]);
  const focus = decided();
  assert.equal(applyFocusEdit(focus, "narrative", { form: "panorama", anchorKind: "scene", anchor: "A shore at dawn" }, NOW).values?.narrative?.anchorKind, "scene");
  assert.throws(() => applyFocusEdit(focus, "narrative", { form: "follow-the-line", anchorKind: "figure", anchor: "x" }, NOW), (error: Error) => error instanceof Draft2InputError && /line to follow needs its line/.test(error.message));
});

const LIGHT = { gravity: "light", formality: 30, humor: 60, energy: 70, optimism: 60, provocation: 20 };
const discovery = (overrides: Record<string, unknown> = {}) => ({
  arc: "discovery", premise: "The park's animals sent an SOS: they need humans to bring them « bonbons » before Halloween.", premiseFactIds: ["f1", "f9"],
  reveals: ["What is this message?", "Who sent it?", "What do they ask?", "When and where?"], ...overrides,
});
const withConcept = (concept: Record<string, unknown>, gravity = "light") => parseFocusDecision(answer({ concept, voice: { ...LIGHT, gravity } }), { facts, lines, material: MATERIAL });

test("a discovery premise dramatizes the facts with its chain of reveals; classic keeps nothing; Claude offers two more premises", () => {
  const { values, premiseOptions } = parseFocusDecision(answer({
    concept: discovery(), voice: LIGHT,
    conceptAlternatives: [
      { premise: "A message is nailed to a tree on the trail.", premiseFactIds: ["f1"], reveals: ["Who left it?", "When and where?"] },
      { premise: "Catherine Fournier needs your help.", premiseFactIds: ["f1"], reveals: ["a", "b"] },
      { premise: "A mission order with no facts.", premiseFactIds: ["f9"], reveals: ["a", "b"] },
      { premise: "The trail keeps a secret.", premiseFactIds: ["f2"], reveals: ["Which secret?", "When and where?"] },
      { premise: "One too many.", premiseFactIds: ["f3"], reveals: ["a", "b"] },
    ],
  }), { facts, lines, material: MATERIAL });
  assert.deepEqual(values.concept, { arc: "discovery", premise: discovery().premise, premiseFactIds: ["f1"], reveals: discovery().reveals as string[] }, "an id that is not a verified fact is dropped");
  assert.deepEqual(premiseOptions.map((option) => option.premise), ["A message is nailed to a tree on the trail.", "The trail keeps a secret."], "never a person of the story, never without facts, two at most");
  assert.deepEqual(withConcept({ arc: "classic", premise: "Ignored", premiseFactIds: ["f1"], reveals: ["a", "b"] }).values.concept, CLASSIC_CONCEPT);
  assert.deepEqual(parse().values.concept, CLASSIC_CONCEPT, "an answer from before concepts is classic");
});

test("a premise outside the contract is a response error, asked for again with the rule it broke: no facts, a short chain, a serious story, a real person", () => {
  const rejects = (concept: Record<string, unknown>, pattern: RegExp, gravity = "light") =>
    assert.throws(() => withConcept(concept, gravity), (error: Error) => error instanceof Draft2ResponseError && pattern.test(error.message));
  rejects(discovery({ arc: "mystery" }), /concept's arc is one of classic, discovery/);
  rejects(discovery({ premiseFactIds: [] }), /cite the facts its mission or mystery comes from/);
  rejects(discovery({ reveals: ["Only one?"] }), /discovery chain needs 2 to 6 reveals/);
  rejects(discovery(), /this one's gravity is serious: tell it classic/, "serious");
  rejects(discovery({ premise: "Catherine Fournier sent an SOS to every family." }), /Catherine Fournier is a real person of the story/);
  rejects(discovery({ premise: "x".repeat(281) }), /premise is missing or longer than 280/);
});

test("the editor's concept: classic needs nothing; a premise Claude wrote keeps its facts, the editor's own cites none; the chain is theirs to write", () => {
  const focus = { ...decided({ concept: withConcept(discovery()).values.concept }), conceptOptions: [{ premise: "The trail keeps a secret.", premiseFactIds: ["f2"], reveals: ["Which secret?", "When?"] }] };
  const edit = (value: Record<string, unknown>) => applyFocusEdit(focus, "concept", value, NOW).values?.concept;
  assert.deepEqual(edit({ arc: "classic", premise: "anything" }), CLASSIC_CONCEPT);
  assert.deepEqual(edit({ arc: "discovery", premise: "The trail keeps a secret.", reveals: ["Which secret?"] }), { arc: "discovery", premise: "The trail keeps a secret.", premiseFactIds: ["f2"], reveals: ["Which secret?"] });
  assert.deepEqual(edit({ arc: "discovery", premise: "Le parc a reçu une lettre", reveals: [] })?.premiseFactIds, [], "the editor's own words");
  const refuses = (value: Record<string, unknown>, pattern: RegExp) => assert.throws(() => edit(value), (error: Error) => error instanceof Draft2InputError && pattern.test(error.message));
  refuses({ arc: "teaser" }, /concept is one of classic, discovery/);
  refuses({ arc: "discovery", premise: " " }, /Write the premise in 1 to 280 characters/);
  refuses({ arc: "discovery", premise: "p", reveals: ["a", "b", "c", "d", "e", "f", "g"] }, /at most 6 reveals/);
});

test("the program checks a premise: a serious or grave story is told straight; a real person of the story is never in it", () => {
  const values = (concept: Record<string, unknown>, gravity: string) => ({ ...decided().values!, voice: { ...decided().values!.voice, gravity }, concept: { ...discovery(), ...concept } }) as Draft2FocusValues;
  assert.deepEqual(focusFindings(values({}, "ordinary"), MATERIAL), []);
  assert.deepEqual(focusFindings(values({}, "grave")).map((finding) => [finding.field, finding.code]), [["concept", "CONCEPT_GRAVITY"]], "the gravity needs no People and places");
  assert.deepEqual(focusFindings(values({ premise: "Catherine Fournier lost the bonbons" }, "light"), MATERIAL).map((finding) => finding.code), ["CONCEPT_REAL_PERSON"]);
});

test("the models read a premise only for discovery, so a classic story's prompts stay as they were", () => {
  const classic = decided({ concept: CLASSIC_CONCEPT }).values!;
  assert.equal("concept" in focusForModels(classic), false);
  assert.deepEqual(focusForModels({ ...classic, concept: { arc: "discovery", premise: "An SOS", premiseFactIds: ["f1"], reveals: ["Who?", "When?"] } }).concept, { arc: "discovery", premise: "An SOS", premiseFactIds: ["f1"], reveals: ["Who?", "When?"] });
  assert.match(String((focusForModels({ ...classic, concept: { arc: "discovery", premise: "My own", premiseFactIds: [], reveals: [] } }).concept as { note?: string }).note), /the editor's premise/);
  assert.equal(focusConcept({}).arc, "classic");
});

const arc = (overrides: Record<string, unknown> = {}) => ({ arc: "cause-effect", premise: "Ignored for an arc", premiseFactIds: ["f1", "f9"], reveals: ["Videos replace binders", "Awards come in a week", "Small firms get a chance"], ...overrides });

test("a story arc rests on the facts with its beats in order, takes no premise and any gravity", () => {
  const told = withConcept(arc(), "serious").values.concept;
  assert.deepEqual(told, { arc: "cause-effect", premise: "", premiseFactIds: ["f1"], reveals: ["Videos replace binders", "Awards come in a week", "Small firms get a chance"] }, "a serious story may follow a chain of causes");
  for (const name of ["progressive-reveal", "problem-solution", "escalation", "comparison"]) assert.equal(withConcept(arc({ arc: name })).values.concept?.arc, name);
  assert.throws(() => withConcept(arc({ premiseFactIds: [] })), (error: Error) => error instanceof Draft2ResponseError && /A cause-effect arc rests on the facts/.test(error.message));
  assert.throws(() => withConcept(arc({ reveals: ["One link"] })), /A cause-effect arc needs 2 to 6 beats/);
  assert.deepEqual(focusFindings({ ...decided().values!, voice: { ...decided().values!.voice, gravity: "grave" }, concept: told! }), [], "the gravity rule is discovery's alone");
  assert.deepEqual(focusForModels({ ...decided().values!, concept: told! }).concept, { arc: "cause-effect", factIds: ["f1"], beats: told!.reveals });
});

test("Claude's other concepts may be other arcs; the editor picks an arc with Claude's beats and facts, or orders their own", () => {
  const { premiseOptions } = parseFocusDecision(answer({ concept: discovery(), voice: LIGHT, conceptAlternatives: [
    { arc: "comparison", premise: "", premiseFactIds: ["f2"], reveals: ["Time", "Cost"] },
    { arc: "escalation", premise: "", premiseFactIds: [], reveals: ["a", "b"] },
    { arc: "classic", premise: "", premiseFactIds: ["f1"], reveals: ["a", "b"] },
    { arc: "discovery", premise: "A message on a tree.", premiseFactIds: ["f1"], reveals: ["Who?", "When?"] },
  ] }), { facts, lines, material: MATERIAL });
  assert.deepEqual(premiseOptions.map((option) => [option.arc, option.premise]), [["comparison", ""], ["discovery", "A message on a tree."]], "an arc needs its facts; classic is no alternative");
  const focus = { ...decided(), conceptOptions: premiseOptions };
  assert.deepEqual(applyFocusEdit(focus, "concept", { arc: "comparison", premise: "ignored", reveals: ["Time", "Cost"] }, NOW).values?.concept, { arc: "comparison", premise: "", premiseFactIds: ["f2"], reveals: ["Time", "Cost"] }, "Claude's comparison keeps its facts");
  assert.deepEqual(applyFocusEdit(focus, "concept", { arc: "escalation", reveals: [] }, NOW).values?.concept, { arc: "escalation", premise: "", premiseFactIds: [], reveals: [] }, "the arc alone, for the writers to order");
});

test("the spine: one beat per slide, shaped for the structure, a turning point or a climax, a payoff or a resolution last; anything else is asked for again", () => {
  const { values } = parse();
  assert.equal(values.spine?.beats.length, 7);
  assert.deepEqual(values.spine?.beats.map((beat) => `${beat.slide}:${beat.role}`), ["cover:hook", "slide2:setup", "middle:inciting", "middle:rising", "middle:turning-point", "penultimate:climax", "last:payoff"]);
  assert.deepEqual(values.spine?.beats[2].factIds, ["f2"], "a beat keeps the known facts it cites");
  const rejects = (spine: unknown, pattern: RegExp) => assert.throws(() => parse({ spine }), (error: Error) => error instanceof Draft2ResponseError && pattern.test(error.message));
  rejects({ beats: ARC_SPINE.beats.slice(0, 3) }, /4 to 10 beats/);
  rejects({ beats: [{ ...ARC_SPINE.beats[0], role: "setup" }, ...ARC_SPINE.beats.slice(1)] }, /first beat is the cover and its role is hook/);
  rejects({ beats: ARC_SPINE.beats.map((beat) => beat.role === "turning-point" || beat.role === "climax" ? { ...beat, role: "rising" } : beat) }, /turning point or a climax/);
  rejects({ beats: [...ARC_SPINE.beats.slice(0, 6), { ...ARC_SPINE.beats[6], role: "rising" }] }, /last beat is a payoff or a resolution/);
  rejects({ beats: ARC_SPINE.beats.map((beat, index) => index === 2 ? { ...beat, withholds: "" } : beat) }, /withholds something for the next slide/);
  rejects({ beats: ARC_SPINE.beats.map((beat, index) => index === 1 ? { ...beat, scene: "x".repeat(241) } : beat) }, /Beat 2's scene is 241 characters, over the 240 allowed: shorten that field alone and keep every beat/);
  rejects({ beats: ARC_SPINE.beats.map((beat, index) => index === 1 ? { ...beat, scene: " " } : beat) }, /Beat 2 needs its scene, in 1 to 240 characters/);
  rejects({ beats: ARC_SPINE.beats.filter((beat) => beat.slide !== "penultimate") }, /arc's closing has one penultimate beat/);
  assert.equal(parse({ structure: { kind: "list", itemFactIds: ["f1", "f2", "f3"] } }).values.spine?.beats.filter((beat) => beat.slide === "middle").length, 2, "a list of three: the first item on slide2, two middle beats");
  assert.throws(() => parse({ structure: { kind: "list", itemFactIds: ["f1", "f2", "f3"] }, spine: ARC_SPINE }), /closes on the last slide alone/, "an arc's spine on a list");
  assert.deepEqual(parseFocusDecision(answer({ spine: undefined }), { facts, lines }).values.spine, undefined, "an answer without a spine, from before them, has none");
});

test("the models read the spine between the telling and the directions; the editor edits it whole, and a change to how the story is told leaves the directions stale until Claude rewrites them", () => {
  const focus = decided();
  const told = focusForModels(focus.values!);
  assert.deepEqual(Object.keys(told).slice(-3), ["spine", "direction", "visualDirection"], "the spine comes before the directions it decides");
  assert.deepEqual((told.spine as { slide: string; withholds?: string }[])[6], { slide: "last", role: "payoff", scene: "The founder closes the laptop.", words: "What it means for the reader, and the call to action.", image: "The empty hall, now lit." }, "an empty withholds and no facts are left out");
  assert.equal(focus.staleDirections, false);
  const shorter = { beats: [...ARC_SPINE.beats.slice(0, 4), ...ARC_SPINE.beats.slice(5)] };
  const edited = applyFocusEdit(focus, "spine", shorter, NOW);
  assert.deepEqual([edited.values?.spine?.beats.length, edited.edited, edited.staleDirections], [6, ["spine"], true], "the editor's spine stands, and the directions were written for another one");
  assert.throws(() => applyFocusEdit(focus, "spine", { beats: ARC_SPINE.beats.slice(0, 2) }, NOW), (error: Error) => error instanceof Draft2InputError && /4 to 10 beats/.test(error.message));
  const owned = applyFocusEdit(applyFocusEdit(edited, "direction", "My own direction.", NOW), "visualDirection", "My own visual direction.", NOW);
  assert.equal(owned.staleDirections, false, "directions the editor wrote are theirs, never stale");
  assert.equal(applyFocusEdit(owned, "narrative", { form: "classic" }, NOW).staleDirections, false, "both directions the editor's: a new telling does not make them stale");
  const freeLevers = { primary: "free", alternatives: [], factIds: [], paidBy: "slide2" as const };
  const rewritten = focusWithPlan(edited, { levers: freeLevers, spine: ARC_SPINE as never, direction: "Rewritten from the spine.", visualDirection: "Rewritten images.", reasons: { spine: "Ignored: the editor owns it.", direction: "Why direction." } }, NOW);
  assert.deepEqual([rewritten.version, rewritten.values?.direction, rewritten.ai?.visualDirection, rewritten.values?.spine?.beats.length, rewritten.edited, rewritten.staleDirections, rewritten.reasons?.direction, rewritten.reasons?.spine], [edited.version + 1, "Rewritten from the spine.", "Rewritten images.", 6, ["spine"], false, "Why direction.", "Why spine."], "the editor's spine stays theirs, with the reason it had; the directions become Claude's with their reasons");
  assert.equal(focusWithPlan(edited, { levers: freeLevers, spine: ARC_SPINE as never, direction: "d", visualDirection: "v" }, NOW, { bump: false }).version, edited.version, "within a decision the version does not move again");
  const known = new Set(["f1", "f2", "f3"]);
  const arc = { kind: "arc" as const, itemFactIds: [] };
  const plan = parseFocusPlan(JSON.stringify({ levers: freeLevers, spine: ARC_SPINE, direction: " Lead with the video. ", visualDirection: "One laptop, one hall.", reasons: { spine: "Why spine.", direction: "Why direction.", visualDirection: "Why visual." } }), { known, structure: arc });
  assert.deepEqual([plan.direction, plan.visualDirection, plan.spine.beats.length, plan.reasons], ["Lead with the video.", "One laptop, one hall.", 7, { spine: "Why spine.", direction: "Why direction.", visualDirection: "Why visual." }]);
  assert.throws(() => parseFocusPlan(JSON.stringify({ levers: freeLevers, spine: ARC_SPINE, direction: "x", visualDirection: "y".repeat(601), reasons: {} }), { known, structure: arc }), /visual direction is missing or longer than 600/);
  assert.throws(() => parseFocusPlan(JSON.stringify({ spine: { beats: ARC_SPINE.beats.slice(0, 2) }, direction: "x", visualDirection: "y", reasons: {} }), { known, structure: arc }), (error: Error) => error instanceof Draft2ResponseError && /4 to 10 beats/.test(error.message));
  const kept = parseFocusPlan(JSON.stringify({ levers: freeLevers, spine: ARC_SPINE, direction: "Claude's direction.", visualDirection: "Claude's images.", reasons: { spine: "s", direction: "d", visualDirection: "v" } }), { known, structure: arc, editorChoices: { spine: shorter, direction: "Mine." } });
  assert.deepEqual([kept.spine.beats.length, kept.direction, kept.visualDirection, kept.reasons], [6, "Mine.", "Claude's images.", { visualDirection: "v" }], "the parts the editor owns are kept as given, without a reason of Claude's");
  const guarded = parseFocusPlan(JSON.stringify({ levers: freeLevers, guards: [
    { misreading: " The bar is closed. ", factIds: ["f2", "f9", "f3", "f1"] },
    { misreading: "The bar is closed.", factIds: ["f1"] },
    { misreading: "These events are this week's.", factIds: ["f9"] },
    { misreading: "", factIds: ["f1"] },
  ], spine: ARC_SPINE, direction: "d", visualDirection: "v", reasons: {} }), { known, structure: arc });
  assert.deepEqual(guarded.guards, [{ misreading: "The bar is closed.", factIds: ["f2", "f3"] }], "a misreading with one or two verified facts, once; one without a known fact or a line is left out");
  assert.deepEqual(parseFocusPlan(JSON.stringify({ levers: freeLevers, spine: ARC_SPINE, direction: "d", visualDirection: "v", reasons: {} }), { known, structure: arc }).guards, [], "an answer without guards has none");
  const withGuards = focusWithPlan(focus, { ...guarded, guards: guarded.guards }, NOW);
  assert.deepEqual([withGuards.values?.guards, withGuards.ai?.guards, focusForModels(withGuards.values!).guards], [guarded.guards, guarded.guards, [{ misreading: "The bar is closed.", factIds: ["f2", "f3"] }]], "Claude's, read by every step");
  const cleared = focusWithPlan(withGuards, { ...guarded, guards: [] }, NOW);
  assert.deepEqual(["guards" in cleared.values!, "guards" in cleared.ai!, "guards" in focusForModels(cleared.values!)], [false, false, false], "a plan with none leaves none from the earlier one");
  assert.deepEqual(focusFindings({ ...focus.values!, structure: { kind: "steps", itemFactIds: ["f1", "f2"] } }).map((finding) => finding.code), ["SPINE_SHAPE"], "a spine for another structure is a finding until Claude decides again");
  assert.equal(spineShapeProblem(ARC_SPINE.beats as Draft2SpineBeat[], { kind: "arc", itemFactIds: [] }), undefined);
});

test("a short story's arc runs five slides, one middle beat; none in the middle is still too few", () => {
  const arc = { kind: "arc" as const, itemFactIds: [] };
  // The Milan boulevard notice: cover, slide 2, what changes and since when, how long it lasts, the card to keep.
  const notice = [ARC_SPINE.beats[0], ARC_SPINE.beats[1], { ...ARC_SPINE.beats[2], role: "climax" }, ARC_SPINE.beats[5], ARC_SPINE.beats[6]] as Draft2SpineBeat[];
  assert.equal(spineShapeProblem(notice, arc), undefined, "one middle beat is enough for a notice");
  const bare = [ARC_SPINE.beats[0], ARC_SPINE.beats[1], ARC_SPINE.beats[5], ARC_SPINE.beats[6]] as Draft2SpineBeat[];
  assert.match(spineShapeProblem(bare, arc) ?? "", /An arc's deck has 1 to 5 middle beats; this spine has 0/);
});

test("the decision and the plan are two answers: the decision carries no directions and no spine, and neither schema puts an enum inside an array (the compiled grammar has a size limit)", () => {
  const bare = parseFocusDecision(answer({ direction: undefined, visualDirection: undefined, spine: undefined }), { facts, lines });
  assert.deepEqual([bare.values.direction, "visualDirection" in bare.values, "spine" in bare.values], ["", false, false]);
  assert.throws(() => parseFocusDecision(answer({ direction: "x".repeat(1501) }), { facts, lines }), /direction is longer than 1,500|direction is longer than 1500/);
  const enumsInArrays = (node: unknown, inArray = false): number => {
    if (!node || typeof node !== "object") return 0;
    const record = node as Record<string, unknown>;
    let count = Array.isArray(record.enum) && inArray ? 1 : 0;
    for (const value of Object.values((record.properties as Record<string, unknown>) ?? {})) count += enumsInArrays(value, inArray);
    if (record.items) count += enumsInArrays(record.items, true);
    return count;
  };
  assert.equal(enumsInArrays(DRAFT2_FOCUS_SCHEMA), 0, "the decision schema");
  assert.equal(enumsInArrays(DRAFT2_FOCUS_PLAN_SCHEMA), 0, "the plan schema");
  assert.deepEqual((DRAFT2_FOCUS_PLAN_SCHEMA.required as string[]).sort(), ["direction", "guards", "levers", "reasons", "spine", "visualDirection"]);
  assert.ok(JSON.stringify(DRAFT2_FOCUS_SCHEMA).length < 3_600, `the decision schema stays small (${JSON.stringify(DRAFT2_FOCUS_SCHEMA).length} characters)`);
});

test("the deliberation: the interest in one line and the tellings compared, kept on the focus; the interest travels with the values to every step", () => {
  const decision = parse();
  assert.equal(decision.values.interest, "A five-minute video can now open a Pentagon contract: the shortest door the Pentagon ever opened.");
  assert.deepEqual(decision.deliberation?.approaches.length, 3);
  const focus = decided();
  assert.equal(focus.deliberation?.interest, focus.values?.interest);
  assert.equal(focusForModels(focus.values!).interest, focus.values?.interest, "the Opening's writer and judge read the interest");
  assert.equal(focus.ai?.interest, focus.values?.interest, "Claude's own interest beside its own values; not a field the editor edits");
  const rejects = (overrides: Record<string, unknown>, pattern: RegExp) => assert.throws(() => parse(overrides), (error: Error) => error instanceof Draft2ResponseError && pattern.test(error.message));
  rejects({ interest: "" }, /interest is missing or longer than 200/);
  rejects({ approaches: ["Only one way."] }, /Compare 2 to 4 ways to tell the story/);
  rejects({ approaches: ["x".repeat(161), "y".repeat(161)] }, /Compare 2 to 4 ways/);
  const before = parseFocusDecision(answer({ interest: undefined, approaches: undefined }), { facts, lines });
  assert.deepEqual([before.values.interest, before.deliberation], [undefined, undefined], "an answer from before the deliberation has none");
});

test("the visual direction is the visual script's own: changing it asks for a new script, never for new words, and a new script reads it as it stands", () => {
  const focus = decided({ visualDirection: "Generic scenes, nobody recognizable." });
  const words = { version: focus.version, values: focus.values! };
  const portraits = applyFocusEdit(focus, "visualDirection", "Each personality by their documentary portrait, one per slide.", NOW);
  assert.equal(portraits.version, focus.version + 1);
  assert.equal(wordsFollowFocus(words, portraits), true, "the words still follow a focus whose only change is the visual direction");
  assert.equal(wordsFollowFocus(words, applyFocusEdit(portraits, "goal", "saves", NOW)), false);
  assert.equal(wordsFollowFocus(undefined, portraits), false, "words written before the Focus step follow none");
  const reordered = { ...words, values: Object.fromEntries(Object.entries(words.values).reverse()) as unknown as Draft2FocusValues };
  assert.equal(wordsFollowFocus(reordered, portraits), true, "a stored row's keys in another order are the same focus");
  assert.equal(visualDirectionChanged(words, portraits), true);
  assert.equal(visualDirectionChanged(words, focus), false);
  assert.equal(visualDirectionChanged(undefined, portraits), false, "a script that records no focus is not judged");
  const followed = visualFocus(words, portraits);
  assert.deepEqual(followed, { version: words.version, values: { ...words.values, visualDirection: "Each personality by their documentary portrait, one per slide." } }, "the words' focus, with the visual direction as it stands");
  assert.equal(visualFocus(words, focus), words, "the same direction keeps the words' snapshot");
  assert.equal(visualDirectionChanged(followed, portraits), false);
});

test("the spine's image lines, subjects and scene are the images': one rewritten by hand asks for a new visual script and never for new words, and the new script reads them as they stand", () => {
  const focus = decided({ spine: ARC_SPINE as never });
  const words = { version: focus.version, values: focus.values! };
  const relit = applyFocusEdit(focus, "spine", { ...ARC_SPINE, beats: ARC_SPINE.beats.map((beat, index) => index === 2 ? { ...beat, image: "A single screen in a dark room, the cursor blinking.", subject: "the screen" } : beat) }, NOW);
  assert.equal(wordsFollowFocus(words, relit), true, "an image line is not the words'");
  assert.equal(visualDirectionChanged(words, relit), true, "the images changed");
  const followed = visualFocus(words, relit);
  assert.deepEqual([followed.version, followed.values.spine?.beats[2].image, followed.values.spine?.beats[2].subject, followed.values.spine?.beats[1].image], [words.version, "A single screen in a dark room, the cursor blinking.", "the screen", ARC_SPINE.beats[1].image], "the words' version, with the images as they stand");
  assert.equal(visualDirectionChanged(followed, relit), false);
  const reworded = applyFocusEdit(focus, "spine", { ...ARC_SPINE, beats: ARC_SPINE.beats.map((beat, index) => index === 2 ? { ...beat, words: "Say who reviews, in the reader's words." } : beat) }, NOW);
  assert.equal(wordsFollowFocus(words, reworded), false, "a words line is the words'");
  assert.equal(visualDirectionChanged(words, reworded), false);
  const longer = applyFocusEdit(focus, "spine", { ...ARC_SPINE, beats: [...ARC_SPINE.beats.slice(0, 3), ARC_SPINE.beats[2], ...ARC_SPINE.beats.slice(3)] }, NOW);
  assert.equal(wordsFollowFocus(words, longer), false, "a beat added tells another story: the words follow it first");
  assert.equal(visualDirectionChanged(words, longer), false, "the script is not told twice");
  assert.equal(visualFocus(words, longer), words, "the words' spine stands until the words are written again");
});

test("the plan's image lines: Claude's first answer is asked again when a beat repeats the subject before it or asks the image for words; each beat's subject is kept; the problems stay on the focus for the editor", () => {
  const json = (value: unknown) => JSON.stringify(value);
  const known = new Set(["f1", "f2", "f3"]);
  const arc = { kind: "arc" as const, itemFactIds: [] };
  const levers = { primary: "free", alternatives: [], factIds: [], paidBy: "slide2" };
  const withSubjects = { beats: ARC_SPINE.beats.map((beat, index) => ({ ...beat, subject: ["a founder's laptop", "the founder's laptops", "a dark screen", "a calendar", "a vast figure", "a signed award", "an empty hall"][index] })) };
  const plan = (spine: unknown) => JSON.stringify({ levers, spine, direction: "d", visualDirection: "v", reasons: {} });
  assert.throws(() => parseFocusPlan(plan(withSubjects), { known, structure: arc, imageCheck: { avoid: [] } }), (error: Error) => error instanceof Draft2ResponseError && /^The spine's image lines: Beats 1 and 2 \(cover, slide2\) show the same dominant subject/.test(error.message));
  const numbered = { beats: ARC_SPINE.beats.map((beat, index) => index === 3 ? { ...beat, image: "Four numbered cards on cream." } : beat) };
  assert.throws(() => parseFocusPlan(plan(numbered), { known, structure: arc, imageCheck: { avoid: [] } }), /Beat 4 \(middle\) asks the image for "numbered"/);
  const kept = parseFocusPlan(plan(withSubjects), { known, structure: arc });
  assert.equal(json(kept.spine.beats.slice(0, 2).map((beat) => beat.subject)), json(["a founder's laptop", "the founder's laptops"]), "the second answer is not checked: its problems go to the editor");
  const focus = { status: "ready", version: 1, edited: [], lineOptions: [], values: { spine: kept.spine } } as unknown as Draft2Focus;
  assert.equal(json(focusWithSpineProblems(focus, []).spineProblems?.map((problem) => [problem.code, problem.beat])), json([["SPINE_SAME_SUBJECT", 2]]));
  assert.equal("spineProblems" in focusWithSpineProblems({ ...focus, spineProblems: [{ code: "SPINE_SAME_SUBJECT", beat: 2, detail: "x" }], values: { spine: ARC_SPINE } } as unknown as Draft2Focus, []), false, "a clean spine clears the earlier problems");
  assert.equal(focusForModels({ ...decided().values!, spine: kept.spine }).spine?.[0].subject, "a founder's laptop", "the models read each beat's subject");
});

test("the spine covers the story: a fact it depends on has a beat or a guard, or the plan is asked again once and the opening waits; each slide knows the facts its beat rests on", () => {
  const arrests: Draft2Fact = { id: "f9", claim: "Two suspects, 16 and 19, were arrested on 10 September.", evidence: "arrested", kind: "event", status: "established", importance: 98 };
  const rumour: Draft2Fact = { id: "f10", claim: "A rumour the article disputes.", evidence: "", kind: "event", status: "disputed", importance: 95 };
  const important = [...facts, arrests, rumour];
  assert.deepEqual(spineUnusedFacts(ARC_SPINE as never, [], important).map((fact) => fact.id), ["f9"], "f1 (90) has beats, f2 and f3 are under 85, a disputed fact never counts");
  assert.deepEqual(spineUnusedFacts(ARC_SPINE as never, [{ factIds: ["f9"] }], important), [], "a guard's fact is placed");
  const known = new Set(["f1", "f2", "f3", "f9"]);
  const arc = { kind: "arc" as const, itemFactIds: [] };
  const freeLevers = { primary: "free", alternatives: [], factIds: [], paidBy: "slide2" as const };
  const plan = { levers: freeLevers, spine: ARC_SPINE, direction: "d", visualDirection: "v", reasons: {} };
  const message = "The spine leaves out facts the story depends on: f9 (Two suspects, 16 and 19, were arrested on 10 September.). Give each a beat, or fold it into one.";
  assert.throws(() => parseFocusPlan(JSON.stringify(plan), { known, structure: arc, coverage: important }), (error: Error) => error instanceof Draft2ResponseError && error.message === message);
  const covering = { ...plan, spine: { beats: ARC_SPINE.beats.map((beat, index) => index === 5 ? { ...beat, factIds: [...beat.factIds, "f9"] } : beat) } };
  assert.deepEqual(parseFocusPlan(JSON.stringify(covering), { known, structure: arc, coverage: important }).spine.beats[5].factIds, ["f1", "f2", "f9"]);
  assert.equal(parseFocusPlan(JSON.stringify(plan), { known, structure: arc, coverage: important, editorChoices: { spine: ARC_SPINE } }).spine.beats.length, 7, "a spine the editor owns is theirs: not asked again");
  assert.equal(parseFocusPlan(JSON.stringify(plan), { known, structure: arc }).spine.beats.length, 7, "the last attempt is not checked: its gaps go to the editor as a finding");
  const values = decided().values!;
  assert.deepEqual(focusFindings(values, undefined, important).map((finding) => [finding.field, finding.code, finding.detail]), [["spine", "SPINE_FACT_UNUSED", message]]);
  assert.deepEqual(focusFindings(values, undefined, facts), [], "every fact of importance 85 or more has a beat");
  assert.deepEqual(focusFindings(values), [], "without the facts there is nothing to cover");
  assert.deepEqual(
    ["cover", "slide2", "s1", "s3", "penultimate", "last", "s4"].map((slide) => spineBeatFactIds(values.spine, slide)),
    [["f1"], ["f1"], ["f2"], ["f3"], ["f1", "f2"], [], undefined], "the cover's, slide 2's, the middle beats' in order, the closing's; none for a slide the spine does not have");
  assert.equal(spineBeatFactIds(undefined, "cover"), undefined);
  assert.deepEqual(spineMiddleFactIds(values.spine), [["f2"], ["f2"], ["f3"]]);
  assert.deepEqual(beatFactsMissing(["f4"], ["f1", "f2", "f3", "f4", "f5", "f6"]), ["f1", "f2", "f3", "f5", "f6"], "a beat of six needs three cited");
  assert.deepEqual(beatFactsMissing(["f4", "f1", "f6"], ["f1", "f2", "f3", "f4", "f5", "f6"]), [], "three of six is enough");
  assert.deepEqual(beatFactsMissing(["f9"], ["f1", "f2"]), ["f1", "f2"], "a beat of two needs one");
  assert.deepEqual(beatFactsMissing(["f1"], ["f1"]), []);
  assert.deepEqual([beatFactsMissing([], []), beatFactsMissing(["f1"], undefined)], [[], []], "a beat without facts, or no spine, asks nothing");
  assert.equal(beatFactsFinding("Slide 2", ["f2"], ["f1", "f2"], facts), "Slide 2 leaves out the facts its beat rests on: f2 (A DOD official says awards took less than a week.). State at least 1 of the beat's 2, and cite them.");
});

test("how the carousel is made is the editor's: a panorama always takes the program's words and at most six slides; the words do not follow it, the visual script does", () => {
  assert.deepEqual(focusPresentation(undefined), { text: "image", images: "slides" }, "absent: one image per slide, its words drawn in it");
  assert.deepEqual(focusPresentation({ textMode: "program" }), { text: "program", images: "slides" });
  assert.deepEqual(focusPresentation({ imageMode: "panorama", textMode: "image" }), { text: "program", images: "panorama" }, "a panorama is made without words");
  assert.ok(!FOCUS_DECISION_FIELDS.includes("textMode") && !FOCUS_DECISION_FIELDS.includes("imageMode"), "Claude neither decides nor gives a reason for them");
  const focus = decided();
  const program = applyFocusEdit(focus, "textMode", "program", NOW);
  assert.deepEqual([program.values?.textMode, program.edited.includes("textMode"), program.staleDirections ?? false], ["program", true, false], "who sets the words leaves the spine as it is");
  const panorama = applyFocusEdit(focus, "imageMode", "panorama", NOW);
  assert.equal(panorama.staleDirections, true, "a panorama asks for the spine again: one scene");
  assert.throws(() => applyFocusEdit(panorama, "textMode", "image", NOW), /A panorama's words are set by the program/);
  assert.throws(() => applyFocusEdit(focus, "imageMode", "carousel", NOW), /The images are one of slides, panorama/);
  // Seven beats are too many for a panorama: a finding until the spine is rewritten.
  assert.match(focusFindings(panorama.values!).find((finding) => finding.code === "SPINE_SHAPE")?.detail ?? "", /A panorama runs at most 6 slides, one section of its scene each; this spine has 7/);
  assert.match(spineShapeProblem(ARC_SPINE.beats as Draft2SpineBeat[], { kind: "arc", itemFactIds: [] }, { maxBeats: 6 }) ?? "", /at most 6 slides/);
  // The words written before still follow the focus; the visual script does not.
  const words = { version: focus.version, values: focus.values! };
  assert.equal(wordsFollowFocus(words, program), true, "no words to write again");
  assert.equal(visualDirectionChanged(words, program), true, "a script for images with their words drawn in them");
  assert.equal(visualFocus(words, program).values.textMode, "program", "the new script follows the editor's choice");
  assert.equal("presentation" in focusForModels(focus.values!), false, "the default is not spelled out to the models");
  assert.deepEqual(focusForModels(panorama.values!).presentation, { text: "program", images: "panorama" });
  // Deciding again keeps them.
  const again = decidedFocus(program, parse(), { provider: "anthropic", model: "claude-sonnet-5-5" }, NOW);
  assert.equal(again.values?.textMode, "program", "a decision never takes the editor's choice away");
});

test("the last plan answer's beat over a character limit is cut at a word instead of failing the step", () => {
  const long = "Cuenta que el almidón líquido sale por la cáscara y se vuelve sólido en unas centésimas de segundo, y que por eso no hay dos palomitas iguales; además, que el sonido viene de las cavidades vacías que vibran al caer la presión. ".repeat(2).trim();
  assert.ok(long.length > FOCUS_BEAT_WORDS_MAX_CHARACTERS);
  const answerWith = (words: string) => JSON.stringify({ levers: { primary: "free", alternatives: [], factIds: [], paidBy: "last" }, spine: { beats: ARC_SPINE.beats.map((entry, index) => index === 2 ? { ...entry, words } : entry) }, direction: "d", visualDirection: "v", reasons: {} });
  const known = new Set(["f1", "f2", "f3"]);
  const arc = { kind: "arc" as const, itemFactIds: [] };
  assert.throws(() => parseFocusPlan(answerWith(long), { known, structure: arc }), new RegExp(`Beat 3's words' job is ${long.length} characters, over the ${FOCUS_BEAT_WORDS_MAX_CHARACTERS} allowed: shorten that field alone and keep every beat, its slide, its role and its facts`), "a first answer is asked again, for that field alone");
  const cut = parseFocusPlan(answerWith(long), { known, structure: arc, clip: true }).spine.beats[2].words;
  assert.ok(cut.length <= FOCUS_BEAT_WORDS_MAX_CHARACTERS && long.startsWith(cut), "the last one keeps its beat, cut at a word");
  assert.match(cut, /[\p{L}]$/u, "never on a comma or a space");
});

test("a decision that keeps the editor's spine keeps its plan, marked stale; beats edited by hand that keep their shape leave the directions standing", () => {
  const planned = decided({ direction: "Lead with the video.", visualDirection: "One laptop in an empty hall.", levers: { primary: "provocative-question", alternatives: [], factIds: ["f1"], paidBy: "slide2" } as never });
  // The editor places a fact in a beat: same slides, same roles.
  const placed = applyFocusEdit(planned, "spine", { beats: ARC_SPINE.beats.map((beat, index) => index === 2 ? { ...beat, factIds: ["f2", "f3"] } : beat) }, NOW);
  assert.deepEqual([placed.edited, placed.staleDirections ?? false], [["spine"], false], "a fact placed is the same telling");
  // Claude decides again: the story may change, the editor's spine stays, and so does the plan written for it until the plan runs again.
  const again = decidedFocus(placed, parse({ direction: undefined, visualDirection: undefined }, editorChoicesOf(placed)), { provider: "anthropic", model: "claude-sonnet-5-5" }, NOW);
  assert.equal(JSON.stringify(again.values?.spine), JSON.stringify(placed.values?.spine), "the editor's spine");
  assert.deepEqual([again.values?.direction, again.values?.visualDirection, again.values?.levers?.primary], ["Lead with the video.", "One laptop in an empty hall.", "provocative-question"], "never an empty direction and no lever under the spine");
  assert.equal(again.staleDirections, true, "the Spine step writes the plan again before the opening follows it");
});

test("a panorama's spine designs its scene (spine v10): required with the plan and checked, the narrative the focus follows, what the models read, the limits and the schema, and a panorama chosen after the plan", () => {
  const known = new Set(["f1", "f2", "f3"]);
  const arc = { kind: "arc" as const, itemFactIds: [] };
  const freeLevers = { primary: "free", alternatives: [], factIds: [], paidBy: "slide2" as const };
  const stations = ARC_SPINE.beats.map((beat, index) => ({ size: beat.role === "turning-point" ? "large" : "medium", character: index === 0, crossing: index < ARC_SPINE.beats.length - 1 ? `The hall's floor runs on past beat ${index + 1}` : "" }));
  const panorama = { world: "One procurement hall seen straight on, the entrance at the left end, the award desk at the right.", device: "journey", axis: "From the entrance at the left to the signed award at the right.", field: "The hall's upper wall, flat cream, across the whole width.", carrier: "The hall's floor line.", ending: "returns", stations };
  const body = { levers: freeLevers, spine: { ...ARC_SPINE, panorama }, direction: "d", visualDirection: "v", reasons: {} };
  const parse = (spine: unknown, options: Record<string, unknown> = {}) => parseFocusPlan(JSON.stringify({ ...body, spine }), { known, structure: arc, panorama: true, ...options });
  assert.throws(() => parse(ARC_SPINE), (error: Error) => error instanceof Draft2ResponseError && /A panorama's spine designs its scene/.test(error.message));
  assert.equal(parseFocusPlan(JSON.stringify({ ...body, spine: ARC_SPINE }), { known, structure: arc }).spine.panorama, undefined, "one image per slide needs none");
  const plan = parse(body.spine);
  assert.deepEqual(plan.spine.panorama, panorama);
  const rejects = (patch: Record<string, unknown>, expected: RegExp) => assert.throws(() => parse({ ...ARC_SPINE, panorama: { ...panorama, ...patch } }), expected);
  rejects({ stations: stations.slice(1) }, /one station per beat, in the beats' order: 7 beats, 6 stations/);
  rejects({ stations: stations.map((station, index) => index === 0 ? { ...station, size: "large" } : station) }, /Exactly one station is large/);
  rejects({ stations: stations.map((station, index) => ({ ...station, size: index === 1 ? "large" : "medium" })) }, /The large station is the turn's \(beat 2 is setup\)/);
  rejects({ stations: stations.map((station, index) => index === 2 ? { ...station, crossing: "" } : station) }, /Every station but the last says what crosses its right edge into the next section; station 3 does not/);
  rejects({ device: "collage" }, /device is one of journey, time-lapse, mechanism, comparison/);
  rejects({ field: "" }, /The panorama's field/);
  const long = "A very long hall ".repeat(40).trim();
  const clipped = parse({ ...ARC_SPINE, panorama: { ...panorama, world: long } }, { clip: true }).spine.panorama!.world;
  assert.ok(clipped.length <= PANORAMA_WORLD_MAX_CHARACTERS && long.startsWith(clipped) && long[clipped.length] === " ", "the last answer is cut at a word, not refused");
  // The narrative the focus follows: the editor's panorama is the panorama form, the scene its anchor, the axis its progression.
  const values = { ...decided().values!, imageMode: "panorama" as const, spine: plan.spine };
  assert.deepEqual(focusNarrative(values), { form: "panorama", anchorKind: "scene", characterId: null, anchor: panorama.world, anchorFactIds: [], progression: panorama.axis, ending: "returns" });
  assert.equal(focusNarrative({ ...values, spine: ARC_SPINE as never }).anchor, PANORAMA_DEFAULT_ANCHOR, "before the spine designs it");
  assert.equal(focusNarrative({ ...values, imageMode: "slides" }).form, "classic");
  assert.equal(narrativeUsesMaster(focusNarrative(values)), true);
  // The models read the scene beside the spine, each beat with its station, and the narrative as a panorama; the limits and the schema ask for the scene.
  const told = focusForModels(values) as { panorama?: Record<string, unknown>; spine: { station?: unknown }[]; narrative?: { form: string } };
  const { stations: _stations, ...scene } = panorama;
  void _stations;
  assert.deepEqual([told.panorama, told.spine[4].station, told.narrative?.form], [scene, stations[4], "panorama"]);
  assert.deepEqual([spineLimitsForModels(values).panorama?.required, spineLimitsForModels(values).beats.max, spineLimitsForModels({}).panorama], [true, 6, undefined]);
  const schema = focusPlanSchema(values) as { properties: { spine: { required: string[]; properties: Record<string, unknown> } } };
  assert.ok(schema.properties.spine.required.includes("panorama") && "panorama" in schema.properties.spine.properties);
  assert.ok(!(DRAFT2_FOCUS_PLAN_SCHEMA.properties as { spine: { required: string[] } }).spine.required.includes("panorama"), "one image per slide keeps the plan's contract as it was");
  // A panorama chosen after the plan: the spine has no scene, and the Spine screen says the images would improvise it.
  const without = focusWithSpineProblems({ ...decided(), values: { ...values, spine: ARC_SPINE as never } }, []);
  assert.deepEqual(without.spineProblems?.map((problem) => problem.code), ["SPINE_PANORAMA_SCENE"]);
  assert.equal(focusWithSpineProblems({ ...decided(), values }, []).spineProblems, undefined);
});

test("a list's spine with the wrong count of beats is told which items no beat cites and which beats carry two, in the items' order; the planner reads the items in its limits (2026-10-23)", () => {
  const structure = { kind: "list" as const, itemFactIds: ["f2", "f9", "f13", "f22", "f30"] };
  const beat = (slide: string, role: string, factIds: string[]) => ({ slide, role, scene: "A scene.", words: "Say the item.", image: "The item in its place.", withholds: slide === "last" ? "" : "The next one.", factIds });
  const three = [beat("cover", "hook", []), beat("slide2", "setup", ["f2"]), beat("middle", "turning-point", ["f9"]), beat("middle", "rising", ["f13", "f22"]), beat("middle", "rising", ["f13"]), beat("last", "payoff", [])] as Draft2SpineBeat[];
  assert.equal(spineShapeProblem(three, structure), "A list has one middle beat per item or step (5, the first allowed on slide2); this spine has 3: f30 is cited by no beat; middle 2 carries f13 and f22. Keep every beat you have and give each item its own, in this order: f2, f9, f13, f22, f30; a weaker item is still one of them (the focus chose them)");
  const uncited = itemsSpine(2).beats as Draft2SpineBeat[];
  assert.match(spineShapeProblem(uncited, structure) ?? "", /this spine has 1: f2, f9, f13, f22, f30 are cited by no beat\. Keep every beat/);
  assert.deepEqual(spineLimitsForModels({ structure }).items, { factIds: ["f2", "f9", "f13", "f22", "f30"], middleBeats: { min: 4, max: 5 }, rule: "one beat of its own per item, in this order, each citing its item's fact: the first on slide2 or on the first middle beat, every other on a middle beat; never two items on one beat, none left out" });
  assert.equal(spineLimitsForModels({ structure: { kind: "arc", itemFactIds: [] } }).items, undefined, "an arc has no items to place");
});

test("an item's beat may carry its conditions as plain data after \"Ligne pratique :\"; before it, on the cover or on the last, a condition is still the beat's job (2026-10-23)", () => {
  const values = decided().values!;
  const list = { ...values, structure: { kind: "list" as const, itemFactIds: ["f1", "f2", "f3"] }, spine: itemsSpine(3), guards: [] } as unknown as Draft2FocusValues;
  const withWords = (words: Record<number, string>) => ({ ...list, spine: { beats: list.spine!.beats.map((beat, index) => words[index] ? { ...beat, words: words[index] } : beat) } }) as Draft2FocusValues;
  const caveats = (next: Draft2FocusValues) => focusFindings(next).find((finding) => finding.code === "SPINE_CAVEATS")?.detail;
  assert.equal(caveats(withWords({ 1: "Le spectacle de feu au Domaine Trinity, ce qu'on y voit. Ligne pratique : samedi 24 et dimanche 25, billetterie en ligne.", 2: "Le Relais hanté au Verger Charbonneau. Infos : une activité liée à un achat." })), undefined, "the practical line holds the data");
  assert.match(caveats(withWords({ 2: "Dire que l'activité est liée à un achat. Ligne pratique : dimanche 25." })) ?? "", /middle 1 \("liée à un achat"\)/u, "before the line, it is the beat's job");
  assert.match(caveats(withWords({ 4: "Choisir sa sortie. Ligne pratique : billetterie en ligne." })) ?? "", /last \("billetterie"\)/u, "the last is read whole");
  assert.match(caveats(withWords({ 0: "Cinq sorties. Infos : billetterie." })) ?? "", /cover \("billetterie"\)/u, "the cover is read whole");
  assert.match(caveats(withWords({ 2: "Dire que l'activité est liée à un achat." })) ?? "", /after "Ligne pratique :", where its days, price and booking stand as plain data/u);
});

test("a list's spine that plans conditions, or a guard that generalizes over the items, is a finding the autopilot stops on (2026-10-22)", () => {
  const values = decided().values!;
  const list = { ...values, structure: { kind: "list" as const, itemFactIds: ["f1", "f2", "f3"] }, spine: itemsSpine(3), guards: [] } as unknown as Draft2FocusValues;
  const codes = (next: Draft2FocusValues) => focusFindings(next).filter((finding) => finding.code === "SPINE_CAVEATS" || finding.code === "SPINE_GUARD_ITEMS").map((finding) => finding.code);
  assert.deepEqual(codes(list), []);
  const caveats = { ...list, spine: { beats: list.spine!.beats.map((beat, index) => index === 0 ? { ...beat, words: "Promettre cinq idées, avec le détail à connaître avant de partir." } : index === 2 ? { ...beat, words: "Dire que l'heure et le tarif se confirment à la billetterie." } : beat) } } as Draft2FocusValues;
  assert.deepEqual(codes(caveats), ["SPINE_CAVEATS"]);
  assert.match(focusFindings(caveats).find((finding) => finding.code === "SPINE_CAVEATS")!.detail, /cover \("avant de partir"\), middle 1 \("billetterie"\)/u);
  const guards = { ...list, guards: [{ misreading: "Chaque sortie est offerte les trois jours du week-end", factIds: ["f2"] }, { misreading: "Le Houston ferme", factIds: ["f1"] }] } as Draft2FocusValues;
  assert.deepEqual(codes(guards), ["SPINE_GUARD_ITEMS"]);
  assert.match(focusFindings(guards).find((finding) => finding.code === "SPINE_GUARD_ITEMS")!.detail, /"Chaque sortie est offerte les trois jours du week-end" generalizes over the items/u);
  assert.deepEqual(codes({ ...values, spine: { beats: ARC_SPINE.beats.map((beat, index) => index === 2 ? { ...beat, words: "Vérifie à la billetterie." } : beat) }, guards: [{ misreading: "Tous ferment", factIds: ["f1"] }] } as unknown as Draft2FocusValues), [], "an arc's beats and guards are its own");
});
