import assert from "node:assert/strict";
import test from "node:test";
import {
  Draft2ResponseError, draft2FactsAreValid, mechanicalFactIssues, mergeRevisedFacts, parseDraft2Facts, parseDraft2FactsEvaluation, revisionRequest, editedFacts, applyFactsRepair, factsRepairable, repairRequest, type Draft2Fact } from "./draft2-facts.types";

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
  // The headline is part of the article: an outcome stated only there is grounded in it.
  const headline = parseDraft2Facts(JSON.stringify({ facts: [fact({ claim: "A cashier spared an 80-year-old a 4,000 $ loss.", evidence: "une caissière évite une perte de 4 000 $ à un octogénaire" })] }));
  assert.deepEqual(mechanicalFactIssues(headline, article, "Fraude du faux policier : une caissière évite une perte de 4 000 $ à un octogénaire"), []);
  assert.deepEqual(mechanicalFactIssues(headline, article).map((issue) => issue.code), ["EVIDENCE_NOT_FOUND"], "without the headline the excerpt is not in the article");
});

test("the reviewer's verdict is parsed strictly and only counts when the program found nothing", () => {
  const evaluation = parseDraft2FactsEvaluation(JSON.stringify({ verdict: "valid", score: 93, issues: [{ code: "NOT_A_CODE", factId: null, detail: "Minor wording." }], suggestions: ["Keep the qualifier."], summary: "Grounded and complete." }));
  assert.equal(evaluation.issues[0].code, "OTHER");
  assert.equal(evaluation.issues[0].factId, undefined);
  assert.equal(draft2FactsAreValid([], evaluation), true);
  assert.equal(draft2FactsAreValid([{ code: "EVIDENCE_NOT_FOUND", factId: "f1", detail: "missing" }], evaluation), false);
  assert.equal(draft2FactsAreValid([], { ...evaluation, verdict: "revise" }), false);
  assert.throws(() => parseDraft2FactsEvaluation(JSON.stringify({ verdict: "maybe", score: 50, issues: [], suggestions: [], summary: "x" })), /incomplete/);
  const previous = parseDraft2Facts(JSON.stringify({ facts: [fact()] }));
  const request = revisionRequest(previous, [{ code: "EVIDENCE_NOT_FOUND", factId: "f1", detail: "missing" }], { ...evaluation, verdict: "revise" });
  assert.equal(request.issues.length, 2);
  assert.equal(request.issues[0].code, "EVIDENCE_NOT_FOUND", "the program's findings come first");
  assert.deepEqual(request.previousFacts, [{ id: "f1", claim: previous[0].claim }]);
  assert.match(request.instruction, /keep every fact in previousFacts/);
});

test("a revision that drops valid facts gets them back; a fact removed for a reason or rewritten under a new id stays out", () => {
  const previous = parseDraft2Facts(JSON.stringify({ facts: [
    fact(),
    fact({ id: "f2", claim: "Awards took less than a week.", evidence: "awards took less than a week in several instances", status: "attributed", attribution: "A DOD official" }),
    fact({ id: "f3", claim: "Three companies are listed.", evidence: "OpenAI, Anthropic, and Google are all listed as participants" }),
    fact({ id: "f4", claim: "A duplicate claim.", evidence: "A DOD official says" }),
  ] }));
  const revised = parseDraft2Facts(JSON.stringify({ facts: [
    fact({ claim: "The program reviews product videos no longer than five minutes, the article says." }),
    fact({ id: "f9", claim: "Three companies are listed as participants.", evidence: "OpenAI, Anthropic, and Google are all listed as participants" }),
    fact({ id: "f10", claim: "A new fact.", evidence: "A new fact." }),
  ] }));
  const merged = mergeRevisedFacts(previous, revised, [{ code: "DUPLICATE", factId: "f4", detail: "repeats f1" }]);
  assert.deepEqual(merged.restored, ["f2"], "f1 was kept, f3 was rewritten as f9, f4 was removed for a reason");
  assert.deepEqual(merged.facts.map((entry) => entry.id), ["f1", "f9", "f10", "f2"]);
  assert.equal(merged.facts[3].attribution, "A DOD official", "the restored fact keeps its content");
});

test("the editor changes a fact's claim or attribution by hand: the evidence stays, what it said before is kept, and nothing else changes (2026-10-23)", () => {
  const facts: Draft2Fact[] = [
    { id: "f6", claim: "Selon le tribunal de la RAJC, la présence récurrente d'une clientèle affiliée au crime organisé peut constituer une nuisance.", evidence: "selon le tribunal de la RAJC", kind: "event", status: "attributed", attribution: "le tribunal de la RAJC", importance: 70 },
    { id: "f7", claim: "Le 3 février 2023, des policiers sont intervenus.", evidence: "Le 3 février 2023", kind: "event", status: "established", importance: 60 },
  ];
  const now = new Date("2026-10-23T10:30:00Z");
  const edited = editedFacts(facts, "f6", { claim: "Selon le tribunal de la RACJ, la présence récurrente d'une clientèle affiliée au crime organisé peut constituer une nuisance.", attribution: " le tribunal de la RACJ " }, now);
  assert.equal(edited[0].claim.includes("RACJ"), true);
  assert.equal(edited[0].attribution, "le tribunal de la RACJ");
  assert.equal(edited[0].evidence, facts[0].evidence, "the evidence is never edited");
  assert.deepEqual(edited[0].edited, { at: now.toISOString(), claim: facts[0].claim, attribution: "le tribunal de la RAJC" });
  assert.deepEqual(edited[1], facts[1]);
  const again = editedFacts(edited, "f6", { claim: "La RACJ juge la présence récurrente d'une clientèle du crime organisé une nuisance." }, new Date("2026-10-23T10:40:00Z"));
  assert.equal(again[0].edited?.claim, facts[0].claim, "a second edit keeps the original as what it said before");
  assert.throws(() => editedFacts(facts, "f9", { claim: "x" }, now), /not one of this session's facts/u);
  assert.throws(() => editedFacts(facts, "f7", { claim: "  " }, now), /cannot be left empty/u);
  assert.throws(() => editedFacts(facts, "f7", { claim: facts[1].claim }, now), /already says that/u);
  assert.equal("attribution" in editedFacts(facts, "f6", { attribution: "" }, now)[0], false, "an emptied attribution goes");
});

test("the repair's rules: repairable only when every issue names a fact or asks for one and the list is close; a named fact replaced, a duplicate omitted removed, a key fact added, anything else ignored or unaddressed", () => {
  const facts: Draft2Fact[] = [
    { id: "f1", claim: "Le tribunal a suspendu le permis.", evidence: "le tribunal", kind: "event", status: "established", importance: 90 },
    { id: "f6", claim: "Selon le tribunal de la RAJC, la présence peut constituer une nuisance.", evidence: "RAJC", kind: "event", status: "attributed", attribution: "le tribunal de la RAJC", importance: 70 },
    { id: "f24", claim: "Le début de la suspension est laissé à la discrétion des policiers.", evidence: "le tribunal", kind: "event", status: "established", importance: 60 },
  ];
  const issues = [
    { code: "INEXACT_VALUE" as const, factId: "f6", detail: "RAJC is the article's typo for RACJ." },
    { code: "DUPLICATE" as const, factId: "f24", detail: "Reuses f1's evidence." },
    { code: "MISSING_KEY_FACT" as const, detail: "The date of the decision is missing." },
  ];
  const evaluation = { verdict: "revise" as const, score: 82, issues, suggestions: [], summary: "" };
  assert.equal(factsRepairable([], evaluation), true);
  assert.equal(factsRepairable([], { ...evaluation, score: 65 }), false, "too far from accepted");
  assert.equal(factsRepairable([], { ...evaluation, issues: [{ code: "VAGUE", detail: "Several facts are vague." }] }), false, "an issue that names no fact is the editor's");
  assert.equal(factsRepairable([], { ...evaluation, verdict: "valid", issues: [] }), false);
  assert.deepEqual(repairRequest(facts, [], evaluation).facts.map((fact) => fact.id), ["f6", "f24"], "only the facts named travel");
  const repaired: Draft2Fact[] = [
    { ...facts[1], claim: "Selon le tribunal de la RACJ, la présence peut constituer une nuisance.", attribution: "le tribunal de la RACJ" },
    { id: "f30", claim: "La décision date du 10 octobre 2026.", evidence: "10 octobre 2026", kind: "date", status: "established", importance: 50 },
    { id: "f1", claim: "Le tribunal a suspendu le permis.", evidence: "le tribunal", kind: "event", status: "established", importance: 90 },
  ];
  const applied = applyFactsRepair(facts, repaired, issues);
  assert.deepEqual(applied.repair, { changed: ["f6"], removed: ["f24"], added: ["f30"] });
  assert.deepEqual(applied.unaddressed, []);
  assert.deepEqual(applied.facts.map((fact) => fact.id), ["f1", "f6", "f30"], "f1 was not named: the model's copy of it is ignored");
  assert.equal(applied.facts[1].attribution, "le tribunal de la RACJ");
  const partial = applyFactsRepair(facts, [facts[1]], issues);
  assert.deepEqual(partial.unaddressed, ["f6", "a missing key fact"], "returned unchanged, and no key fact added");
  assert.deepEqual(partial.repair, { changed: [], removed: ["f24"], added: [] });
  const noDuplicateRule = applyFactsRepair(facts, [], [{ code: "VAGUE", factId: "f24", detail: "Vague." }]);
  assert.deepEqual(noDuplicateRule.unaddressed, ["f24"], "an omitted fact is removed only when called a duplicate");
});

test("an abbreviation with its letters in another order is the article's typo: the program names it, so the extractor fixes it and the repair covers it (2026-10-23)", () => {
  const article = "Selon une décision récente de la Régie des alcools, des courses et des jeux (RACJ), les policiers ont observé des individus. Selon le tribunal de la RAJC, la présence récurrente peut constituer une nuisance.";
  const facts: Draft2Fact[] = [
    { id: "f3", claim: "Selon une décision récente de la Régie des alcools, des courses et des jeux (RACJ), les policiers ont observé des individus.", evidence: "Selon une décision récente de la Régie des alcools, des courses et des jeux (RACJ), les policiers ont observé des individus.", kind: "event", status: "attributed", attribution: "la RACJ", importance: 80 },
    { id: "f6", claim: "Selon le tribunal de la RAJC, la présence récurrente peut constituer une nuisance.", evidence: "Selon le tribunal de la RAJC, la présence récurrente peut constituer une nuisance.", kind: "event", status: "attributed", attribution: "le tribunal de la RAJC", importance: 70 },
  ];
  const issues = mechanicalFactIssues(facts, article);
  assert.deepEqual(issues.map((issue) => [issue.code, issue.factId]), [["INEXACT_VALUE", "f6"]]);
  assert.match(issues[0].detail, /"RAJC" has the letters of RACJ in another order/u);
  assert.deepEqual(mechanicalFactIssues([facts[0], { ...facts[1], claim: facts[1].claim.replace("RAJC", "RACJ"), attribution: "le tribunal de la RACJ" }], article), [], "written right, nothing to find; the evidence keeps the article's typo");
  assert.deepEqual(mechanicalFactIssues([facts[0], { ...facts[1], claim: "Le SPAL enquête.", attribution: undefined, status: "established" }], article), [], "another abbreviation is not a typo of this one");
});
