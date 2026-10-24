import assert from "node:assert/strict";
import test from "node:test";
import { funnelRoundImproved, tidyTypography, criterionFloor, lengthHint, funnelEvaluationSchema, funnelParseEvaluation, funnelRefineRequest, funnelSchemaWithoutArrayEnums, funnelScorePasses, numbersIn, statedNumbers } from "./draft2-funnel";
import { DECK_GATE } from "./draft2-deck.types";
import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";

const facts: Draft2Fact[] = [{ id: "f1", claim: "Doors open at 10 a.m. for 1,200 visitors.", evidence: "10 a.m. … 1,200 visitors", kind: "event", status: "established", importance: 80 }];

test("the numbers a slide may state: the cited facts', a list's count and its items' own numbering", () => {
  assert.deepEqual([...statedNumbers(facts)].sort(), ["10", "1200"]);
  assert.deepEqual([...statedNumbers(facts, 5)].sort(), ["1", "10", "1200", "2", "3", "4", "5"], "a five-item list numbers its items 1 to 5 and states its count");
  assert.equal(statedNumbers(facts, 5).has("7"), false);
  assert.deepEqual(numbersIn("Tip 1 of 5: 1,200 visitors, 10 a.m.").map((number) => number.digits), ["1", "5", "1200", "10"]);
  assert.deepEqual(numbersIn("Au Randolph de Brossard (@randolphdix30), à 19h30. #Brossard2026 https://randolph.ca/2026/10 www.areq.ca/p2").map((number) => number.digits), ["19", "30"], "a handle, a hashtag or a web address states no number; a time still does");
  assert.deepEqual(numbersIn("Écris à info2026@areq.ca").map((number) => number.digits), ["2026"], "an email address is no handle");
});

test("a season run together in the source (\"20262027\") states both years, so a slide may write 2026-2027", () => {
  const season: Draft2Fact[] = [{ id: "f1", claim: "Les P’tites sorties 20262027 misent sur l’imaginaire.", evidence: "Les P’tites sorties 20262027 misent", kind: "event", status: "established", importance: 80 }];
  const stated = statedNumbers(season);
  assert.deepEqual([...stated].sort(), ["2026", "20262027", "2027"]);
  assert.ok(numbersIn("Huit spectacles en 2026-2027").every((number) => stated.has(number.digits)), "the range's two years are stated");
  assert.equal(statedNumbers([{ ...season[0], claim: "Code 20252027 on the door.", evidence: "20252027" }]).has("2025"), false, "eight digits that are not consecutive years stay one number");
});

test("a judge that scores its own proposal, or names it the winner, does not end the round: the proposal competes next round, the best candidate stands", () => {
  type Candidate = { id: string; angle: string; text: string };
  const options = {
    criteria: ["tension"], codes: ["OTHER"], parts: [], maxProposals: 1,
    parseProposal: (raw: unknown, fallbackId: string): Candidate | undefined => { const item = raw as { id?: string; text?: string }; return item.text ? { id: item.id ?? fallbackId, angle: "", text: item.text } : undefined; },
  };
  const score = (candidateId: string, overall: number) => ({ candidateId, tension: overall, overall, note: "Why." });
  const answer = (overrides: Record<string, unknown>) => JSON.stringify({ verdict: "revise", winnerId: "c2", summary: "Close.", suggestions: [], issues: [], proposals: [{ id: "p1", text: "The judge's own opening." }], ...overrides });
  const parse = (overrides: Record<string, unknown>) => funnelParseEvaluation<Candidate, { candidateId: string; overall: number; note: string; tension: number }, { code: string; detail: string }>(answer(overrides), ["c1", "c2"], options);

  const extra = parse({ scores: [score("c2", 91), score("c1", 84), score("p1", 95)] });
  assert.deepEqual(extra.scores.map((entry) => entry.candidateId), ["c2", "c1"], "the score the judge gave its own proposal is dropped");
  assert.deepEqual([extra.verdict, extra.winnerId, extra.summary, extra.proposals?.map((proposal) => proposal.id)], ["revise", "c2", "Close.", ["p1"]], "everything else stands, the proposal included");

  const self = parse({ verdict: "accept", winnerId: "p1", scores: [score("c1", 84), score("c2", 91), score("p1", 96)] });
  assert.deepEqual([self.verdict, self.winnerId], ["revise", "c2"], "its own proposal cannot win the round it is proposed in: the best scored candidate stands, and the round goes on");
  assert.equal(self.summary, "Close. (The judge named its own proposal p1 the winner; it competes in the next round, and c2 stands as this round's best.)");

  const unnamed = parse({ winnerId: "p1", scores: [score("c1", 84), score("c2", 91)], proposals: [{ text: "A proposal without an id." }] });
  assert.deepEqual([unnamed.winnerId, unnamed.proposals?.map((proposal) => proposal.id)], ["c2", ["p1"]], "a proposal without an id is p1, as the judge was told, so naming p1 still means it");

  assert.throws(() => parse({ scores: [score("c1", 84), score("c2", 91), score("p1", 96)], proposals: [] }), (error: Error) => error instanceof Draft2ResponseError && /unknown candidate \(p1\)/.test(error.message), "a score for p1 with no proposal is still unknown");
  assert.throws(() => parse({ scores: [score("c1", 84), score("c2", 91), score("c3", 96)] }), /unknown candidate \(c3\)/, "any other unknown id is still fatal");
  assert.throws(() => parse({ winnerId: "c7", scores: [score("c1", 84), score("c2", 91)] }), /winner c7 is not one of the candidates/);
});

test("an issue under a code the step gives as the program's is dropped: the program checked it, and a judge re-counting got it wrong", () => {
  type Candidate = { id: string; angle: string; text: string };
  const options = { criteria: ["tension"], codes: ["VAGUE", "OTHER"], dropCodes: ["TOO_LONG"], parts: ["cover"], maxProposals: 0, parseProposal: (): Candidate | undefined => undefined };
  const answer = JSON.stringify({ verdict: "revise", winnerId: "c1", summary: "x", suggestions: [], proposals: [], scores: [{ candidateId: "c1", tension: 80, overall: 80, note: "n" }], issues: [{ code: "TOO_LONG", candidateId: "c1", part: "cover", detail: "Too long." }, { code: "VAGUE", candidateId: "c1", part: "cover", detail: "Vague." }, { code: "ODD", candidateId: "c1", part: "cover", detail: "Odd." }] });
  const parsed = funnelParseEvaluation<Candidate, { candidateId: string; overall: number; note: string; tension: number }, { code: string; detail: string }>(answer, ["c1"], options);
  assert.deepEqual(parsed.issues.map((issue) => [issue.code, issue.detail]), [["VAGUE", "Vague."], ["OTHER", "Odd."]], "the program's code is dropped, an unknown one is OTHER");
});

test("the judge says what must survive revision: keep is read on every score and the revision request tells the writer to protect it", () => {
  type Candidate = { id: string; angle: string; text: string };
  const options = { criteria: ["tension"], codes: ["OTHER"], parts: [], maxProposals: 1, parseProposal: (raw: unknown, fallbackId: string): Candidate | undefined => { const item = raw as { id?: string; text?: string }; return item.text ? { id: item.id ?? fallbackId, angle: "", text: item.text } : undefined; } };
  const answer = JSON.stringify({ verdict: "revise", winnerId: "c1", summary: "Close.", suggestions: [], issues: [], proposals: [], scores: [{ candidateId: "c1", tension: 90, overall: 90, note: "Why.", keep: "The irony of the empty hall." }, { candidateId: "c2", tension: 80, overall: 80, note: "Why." }] });
  const parsed = funnelParseEvaluation<Candidate, { candidateId: string; overall: number; note: string; keep?: string; tension: number }, { code: string; detail: string }>(answer, ["c1", "c2"], options);
  assert.deepEqual(parsed.scores.map((score) => score.keep), ["The irony of the empty hall.", undefined], "an older judgment without keep still parses");
  const words = { task: "openings", listKey: "openings" as const, label: (candidate: Candidate) => ({ text: candidate.text }), noCleanNote: "none", revise: "Revise each opening.", develop: "Edit the proposal.", newCandidates: (count: number) => `Write ${count} new.` };
  const target = { candidate: { id: "c1", angle: "", text: "Hall" }, round: 1, score: parsed.scores[0], findings: [], issues: [] };
  const request = funnelRefineRequest(words, [target], [target], [], undefined) as { instruction: string; openings: { scores: { keep?: string } }[] };
  assert.match(request.instruction, /^Revise each opening\. Each candidate's scores\.keep names what the judge says must survive your revision: protect it/);
  assert.equal(request.openings[0].scores.keep, "The irony of the empty hall.", "the keep travels with the candidate's scores");
  const bare = funnelRefineRequest(words, [{ ...target, score: { ...parsed.scores[1], candidateId: "c1" } }], [target], [], undefined) as { instruction: string };
  assert.equal(bare.instruction, "Revise each opening.", "no keep, no note");
});

test("a criterion may have its own floor: the deck's originality passes at 75, every other criterion at 85", () => {
  const score = (overrides: Record<string, number> = {}) => ({ candidateId: "c1", flow: 96, coverage: 96, pacing: 96, clarity: 96, grounding: 96, voice: 96, focus: 96, originality: 96, overall: 96, note: "", ...overrides });
  assert.deepEqual([criterionFloor(DECK_GATE, "originality"), criterionFloor(DECK_GATE, "flow")], [75, 85]);
  assert.equal(funnelScorePasses(score({ originality: 76 }), DECK_GATE), true, "a procedure's deck at 76 originality can be accepted");
  assert.equal(funnelScorePasses(score({ originality: 74 }), DECK_GATE), false);
  assert.equal(funnelScorePasses(score({ flow: 84 }), DECK_GATE), false, "the other criteria keep 85");
  assert.equal(funnelScorePasses(score({ originality: undefined as unknown as number }), DECK_GATE), true, "a score stored before originality was scored");
});

test("a Claude judge's evaluation schema has no enum inside an array, and keeps the rest as it was", () => {
  const item = { type: "object", properties: { shot: { type: "string", enum: ["wide", "close"] } }, required: ["shot"], additionalProperties: false };
  const schema = funnelEvaluationSchema({ criteria: ["tension"], codes: ["A", "B"], maxScored: 3, item, maxProposals: 1 });
  const stripped = funnelSchemaWithoutArrayEnums(schema) as { properties: Record<string, { items?: { properties: Record<string, { enum?: unknown; type?: unknown }> } ; enum?: unknown }> };
  const count = (node: unknown, inArray = false): number => {
    if (!node || typeof node !== "object") return 0;
    const record = node as Record<string, unknown>;
    let found = inArray && Array.isArray(record.enum) ? 1 : 0;
    for (const value of Object.values((record.properties as Record<string, unknown>) ?? {})) found += count(value, inArray);
    if (record.items) found += count(record.items, true);
    return found;
  };
  assert.ok(count(schema) > 0, "the evaluation schema has enums inside arrays: issue codes, the proposals' values");
  assert.equal(count(stripped), 0);
  assert.deepEqual(stripped.properties.verdict, { type: "string", enum: ["accept", "revise"] }, "an enum outside an array stays");
  assert.deepEqual(stripped.properties.issues.items?.properties.code, { type: "string" });
  assert.deepEqual((schema.required as string[]), (stripped as unknown as { required: string[] }).required);
});

test("a length finding says how many words to remove, at least: one more than the excess, so the fixed text ends under its limit", () => {
  assert.equal(lengthHint("The penultimate body has 31 words; the limit is 30."), "The penultimate body has 31 words; the limit is 30. Remove at least 2 words.");
  assert.equal(lengthHint("Slide 3's headline has 10 words; the limit is 8."), "Slide 3's headline has 10 words; the limit is 8. Remove at least 3 words.");
  assert.equal(lengthHint("Slide 3's direction has 740 characters; the limit is 700."), "Slide 3's direction has 740 characters; the limit is 700. Remove at least 41 characters.", "a visual direction's limit is in characters");
  assert.equal(lengthHint("The cover cites f9, which is not a verified fact."), "The cover cites f9, which is not a verified fact.", "any other finding stays as it is");
});

test("a slide's typography settled at parse: an opening single quote used as an apostrophe becomes the apostrophe, « » take their narrow space; straight apostrophes stay (2026-10-24)", () => {
  assert.equal(tidyTypography("L‘artiste et l’œuvre, «émerveilleurs» et « les Veilleurs »"), "L’artiste et l’œuvre, «\u202fémerveilleurs\u202f» et «\u202fles Veilleurs\u202f»");
  assert.equal(tidyTypography("The Pentagon's new shortcut"), "The Pentagon's new shortcut");
  assert.equal(tidyTypography("‘Quoted’ at the start"), "‘Quoted’ at the start", "a real opening quote at a word's start is kept");
});

test("a round improves the run when its best clean version beats the earlier ones; with no clean version anywhere, when its best score does (2026-10-24, the pineapple deck)", () => {
  const version = (id: string, round: number, overall: number, extra: Partial<{ findings: unknown[]; issues: { material?: boolean }[] }> = {}) =>
    ({ candidate: { id, angle: "" }, round, score: { candidateId: id, overall, note: "" }, findings: extra.findings ?? [], issues: extra.issues ?? [] }) as never;
  assert.equal(funnelRoundImproved([version("c1", 1, 88), version("c1.2", 2, 89)], 2), true, "clean versions: the best clean rose");
  assert.equal(funnelRoundImproved([version("c1", 1, 90), version("c1.2", 2, 89)], 2), false);
  const material = { issues: [{ material: true }] };
  assert.equal(funnelRoundImproved([version("c4", 1, 88, material), version("c4.2", 2, 89, material)], 2), true, "no clean version anywhere: the best score decides, so the fixing round is earned");
  assert.equal(funnelRoundImproved([version("c4", 1, 89, material), version("c4.2", 2, 88, material)], 2), false);
  assert.equal(funnelRoundImproved([version("c4", 1, 88, material), version("c4.2", 2, 89, material), version("c7", 2, 80)], 2), true, "a clean version in the round: the clean rule, 80 over nothing clean before");
});
