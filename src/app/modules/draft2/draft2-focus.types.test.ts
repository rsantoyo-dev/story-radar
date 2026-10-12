import assert from "node:assert/strict";
import test from "node:test";
import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  CLASSIC_CONCEPT, CLASSIC_NARRATIVE, DRAFT2_FOCUS_SCHEMA, focusConcept, FOCUS_FIELDS, applyFocusEdit, decidedFocus, editorChoicesOf, focusDecisionRequest, focusFindings, focusForModels, focusItemCount, focusLine,
  anchorNoun, focusMaterial, focusToday, narrativeUsesMaster, parseFocusDecision, parseNarrativeReview, resetFocusField,
  type Draft2Focus, type Draft2FocusLine, type Draft2FocusMaterial, type Draft2FocusNarrative, type Draft2FocusValues,
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

/** Claude's answer, every field valid unless overridden. */
const answer = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  lineId: LINE.id,
  audience: "Founders who sell software to the Pentagon",
  framing: "reader-consequence",
  readerConsequence: { text: "A five-minute video can now open a Pentagon contract.", factIds: ["f1", "f9", "f2", "f1"] },
  structure: { kind: "arc", itemFactIds: ["f2"] },
  goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 150, energy: 70.4, optimism: 60, provocation: 0 },
  direction: "Lead with the five-minute video; pay it with the award time.",
  visualDirection: "Anonymous founders at a laptop and a screen; the demo video recurs, and closes the story as a signed award.",
  reasons,
  ...overrides,
});
const parse = (overrides: Record<string, unknown> = {}, editorChoices: Record<string, unknown> = {}) => parseFocusDecision(answer(overrides), { facts, lines, editorChoices });

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
  assert.deepEqual((DRAFT2_FOCUS_SCHEMA.required as string[]).sort(), ["anchorAlternatives", "audience", "concept", "conceptAlternatives", "direction", "framing", "goal", "lineId", "narrative", "readerConsequence", "reasons", "structure", "visualDirection", "voice"]);
  assert.deepEqual(values.narrative, CLASSIC_NARRATIVE, "an answer without a narrative form, from before them, is classic");
});

test("an answer outside the contract is a response error, never a focus", () => {
  const rejects = (overrides: Record<string, unknown>, pattern: RegExp) => assert.throws(() => parse(overrides), (error: Error) => error instanceof Draft2ResponseError && pattern.test(error.message));
  rejects({ lineId: "77777777-7777-4777-8777-777777777777" }, /editorial line the Topic does not have/);
  rejects({ lineId: null }, /editorial line the Topic does not have/);
  rejects({ audience: "" }, /audience is missing/);
  rejects({ audience: "x".repeat(301) }, /longer than 300/);
  rejects({ direction: "x".repeat(1_501) }, /direction is missing or longer than 1500/);
  rejects({ visualDirection: "x".repeat(601) }, /visual direction is missing or longer than 600/);
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
  assert.deepEqual(Object.keys(parsed).sort(), ["audience", "concept", "direction", "framing", "narrative", "visualDirection", "voice"], "reasons only for the fields Claude decided");
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
  assert.deepEqual(focusFindings({ ...values, structure: { kind: "list", itemFactIds: ["f1", "f2"] } }).map((finding) => finding.code), ["TOO_FEW_ITEMS"]);
  assert.match(focusFindings({ ...values, structure: { kind: "list", itemFactIds: ["f1", "f2"] } })[0].detail, /at least 3 items from the facts, and the focus names 2/);
  assert.deepEqual(focusFindings({ ...values, structure: { kind: "steps", itemFactIds: ["f1", "f2"] } }), []);
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
