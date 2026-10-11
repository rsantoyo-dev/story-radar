import assert from "node:assert/strict";
import test from "node:test";
import { funnelParseEvaluation, numbersIn, statedNumbers } from "./draft2-funnel";
import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";

const facts: Draft2Fact[] = [{ id: "f1", claim: "Doors open at 10 a.m. for 1,200 visitors.", evidence: "10 a.m. … 1,200 visitors", kind: "event", status: "established", importance: 80 }];

test("the numbers a slide may state: the cited facts', a list's count and its items' own numbering", () => {
  assert.deepEqual([...statedNumbers(facts)].sort(), ["10", "1200"]);
  assert.deepEqual([...statedNumbers(facts, 5)].sort(), ["1", "10", "1200", "2", "3", "4", "5"], "a five-item list numbers its items 1 to 5 and states its count");
  assert.equal(statedNumbers(facts, 5).has("7"), false);
  assert.deepEqual(numbersIn("Tip 1 of 5: 1,200 visitors, 10 a.m.").map((number) => number.digits), ["1", "5", "1200", "10"]);
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
