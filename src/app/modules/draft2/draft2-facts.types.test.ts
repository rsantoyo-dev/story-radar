import assert from "node:assert/strict";
import test from "node:test";
import {
  Draft2ResponseError, draft2FactsAreValid, mechanicalFactIssues, parseDraft2Facts, parseDraft2FactsEvaluation, revisionRequest,
} from "./draft2-facts.types";

const article = "The Pentagon’s program reviews product videos “no longer than five minutes”. A DOD official says awards took less than a week in several instances.\nOpenAI, Anthropic, and Google are all listed as participants.";

const fact = (overrides: Record<string, unknown> = {}) => ({
  id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "reviews product videos \"no longer than five minutes\"",
  kind: "event", status: "established", attribution: null, qualifier: null, importance: 90, ...overrides,
});

test("the extractor's answer becomes facts; malformed items and repeated ids are rejected", () => {
  const facts = parseDraft2Facts(JSON.stringify({ facts: [fact(), fact({ id: "f2", status: "attributed", attribution: "A DOD official", qualifier: "according to a DOD official", claim: "Awards took less than a week in several instances.", evidence: "awards took less than a week in several instances", importance: 70 })] }));
  assert.equal(facts.length, 2);
  assert.equal(facts[0].attribution, undefined, "null attribution is dropped");
  assert.deepEqual(facts[1], { id: "f2", claim: "Awards took less than a week in several instances.", evidence: "awards took less than a week in several instances", kind: "event", status: "attributed", importance: 70, attribution: "A DOD official", qualifier: "according to a DOD official" });
  assert.equal(parseDraft2Facts(JSON.stringify({ facts: [fact({ importance: 250 })] }))[0].importance, 100, "an out-of-range importance is clamped, not fatal");
  assert.throws(() => parseDraft2Facts(JSON.stringify({ facts: [fact({ claim: "" })] })), (error: Error) => error instanceof Draft2ResponseError && /malformed/.test(error.message));
  assert.throws(() => parseDraft2Facts(JSON.stringify({ facts: [fact(), fact()] })), /repeated/);
  assert.throws(() => parseDraft2Facts(JSON.stringify({ facts: [] })), /no facts/);
  assert.throws(() => parseDraft2Facts("not json"), /not valid JSON/);
});

test("the mechanical check compares evidence with the article ignoring quotes, dashes, case and spacing", () => {
  const grounded = parseDraft2Facts(JSON.stringify({ facts: [fact(), fact({ id: "f2", claim: "Three companies are listed as participants.", evidence: "OpenAI, Anthropic, and Google are all listed  as participants" })] }));
  assert.deepEqual(mechanicalFactIssues(grounded, article), []);
  const invented = parseDraft2Facts(JSON.stringify({ facts: [
    fact({ evidence: "reviews product videos no longer than six minutes" }),
    fact({ id: "f2", status: "attributed", claim: "Awards took less than a week.", evidence: "awards took less than a week in several instances" }),
    fact({ id: "f3", claim: "The program reviews product videos no longer than five minutes." }),
  ] }));
  assert.deepEqual(mechanicalFactIssues(invented, article).map((issue) => [issue.code, issue.factId]), [
    ["EVIDENCE_NOT_FOUND", "f1"], ["WRONG_ATTRIBUTION", "f2"], ["DUPLICATE", "f3"],
  ]);
});

test("the reviewer's verdict is parsed strictly and only counts when the program found nothing", () => {
  const evaluation = parseDraft2FactsEvaluation(JSON.stringify({ verdict: "valid", score: 93, issues: [{ code: "NOT_A_CODE", factId: null, detail: "Minor wording." }], suggestions: ["Keep the qualifier."], summary: "Grounded and complete." }));
  assert.equal(evaluation.issues[0].code, "OTHER");
  assert.equal(evaluation.issues[0].factId, undefined);
  assert.equal(draft2FactsAreValid([], evaluation), true);
  assert.equal(draft2FactsAreValid([{ code: "EVIDENCE_NOT_FOUND", factId: "f1", detail: "missing" }], evaluation), false);
  assert.equal(draft2FactsAreValid([], { ...evaluation, verdict: "revise" }), false);
  assert.throws(() => parseDraft2FactsEvaluation(JSON.stringify({ verdict: "maybe", score: 50, issues: [], suggestions: [], summary: "x" })), /incomplete/);
  const request = revisionRequest([{ code: "EVIDENCE_NOT_FOUND", factId: "f1", detail: "missing" }], { ...evaluation, verdict: "revise" });
  assert.equal(request.issues.length, 2);
  assert.equal(request.issues[0].code, "EVIDENCE_NOT_FOUND", "the program's findings come first");
  assert.match(request.instruction, /complete revised facts list/);
});
