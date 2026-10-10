import assert from "node:assert/strict";
import test from "node:test";
import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  DRAFT2_FOCUS_SCHEMA, FOCUS_FIELDS, applyFocusEdit, decidedFocus, editorChoicesOf, focusDecisionRequest, focusFindings, focusForModels, focusItemCount, focusLine,
  focusToday, parseFocusDecision, resetFocusField,
  type Draft2Focus, type Draft2FocusLine, type Draft2FocusValues,
} from "./draft2-focus.types";

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
  assert.deepEqual((DRAFT2_FOCUS_SCHEMA.required as string[]).sort(), ["audience", "direction", "framing", "goal", "lineId", "readerConsequence", "reasons", "structure", "voice"]);
});

test("an answer outside the contract is a response error, never a focus", () => {
  const rejects = (overrides: Record<string, unknown>, pattern: RegExp) => assert.throws(() => parse(overrides), (error: Error) => error instanceof Draft2ResponseError && pattern.test(error.message));
  rejects({ lineId: "77777777-7777-4777-8777-777777777777" }, /editorial line the Topic does not have/);
  rejects({ lineId: null }, /editorial line the Topic does not have/);
  rejects({ audience: "" }, /audience is missing/);
  rejects({ audience: "x".repeat(301) }, /longer than 300/);
  rejects({ direction: "x".repeat(1_501) }, /direction is missing or longer than 1500/);
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
  assert.deepEqual(Object.keys(parsed).sort(), ["audience", "direction", "framing", "voice"], "reasons only for the fields Claude decided");
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
