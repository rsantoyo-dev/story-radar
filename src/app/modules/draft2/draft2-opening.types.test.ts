import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  keptOpeningIds, mechanicalOpeningIssues, mergeKeptCandidates, openingAcceptedWinner, openingIsAccepted, openingReviewNote, openingRevisionRequest,
  openingRunSummary, openingWordCount, parseOpeningCandidates, parseOpeningEvaluation,
  type Draft2OpeningCandidate, type Draft2OpeningEvaluation, type Draft2OpeningIssue, type Draft2OpeningScore,
} from "./draft2-opening.types";

const facts: Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "reviews product videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week in several instances.", evidence: "A DOD official says awards took less than a week in several instances", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
  { id: "f3", claim: "The program could reach $1.5 trillion in contracts by 2030.", evidence: "could reach $1.5 trillion in contracts by 2030", kind: "number", status: "attributed", attribution: "the Pentagon", qualifier: "could", importance: 70 },
];

type CandidateOverrides = { cover?: Partial<Draft2OpeningCandidate["cover"]>; slide2?: Partial<Draft2OpeningCandidate["slide2"]>; angle?: string };

/** A candidate every mechanical rule accepts. */
const candidate = (id: string, overrides: CandidateOverrides = {}): Draft2OpeningCandidate => ({
  id,
  cover: { headline: "Pentagon buyers now judge five-minute videos", subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"], ...overrides.cover },
  slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"], ...overrides.slide2 },
  angle: overrides.angle ?? "Speed over paperwork",
});

const score = (candidateId: string, overall: number, overrides: Partial<Draft2OpeningScore> = {}): Draft2OpeningScore =>
  ({ candidateId, tension: overall, payoff: overall, clarity: overall, grounding: overall, voice: overall, overall, note: "Why.", ...overrides });

const evaluation = (overrides: Partial<Draft2OpeningEvaluation> = {}): Draft2OpeningEvaluation =>
  ({ verdict: "accept", winnerId: "c1", scores: [score("c1", 96), score("c2", 95), score("c3", 80)], issues: [], suggestions: [], summary: "Strong.", ...overrides });

const codes = (issues: Draft2OpeningIssue[]) => issues.map((issue) => [issue.code, issue.candidateId, issue.part].filter(Boolean).join(" "));
const findings = (overrides: CandidateOverrides) => codes(mechanicalOpeningIssues([candidate("c1", overrides)], facts));

test("the writer's answer becomes candidates; a missing part, a repeated id or a non-object is rejected", () => {
  const parsed = parseOpeningCandidates(JSON.stringify({ candidates: [
    { ...candidate("c1"), cover: { ...candidate("c1").cover, factIds: ["f1", "f1", 7] } },
    { ...candidate("c2"), angle: "" },
  ] }));
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0].cover.factIds, ["f1"], "repeated and non-string ids are dropped");
  assert.equal(parsed[1].angle, "");
  const eight = Array.from({ length: 8 }, (_, index) => candidate(`c${index + 1}`));
  assert.equal(parseOpeningCandidates(JSON.stringify({ candidates: eight })).length, 7, "the candidate count is capped");
  const { slide2: _slide2, ...noSlide2 } = candidate("c1");
  void _slide2;
  assert.throws(() => parseOpeningCandidates(JSON.stringify({ candidates: [noSlide2] })), (error: Error) => error instanceof Draft2ResponseError && /c1 is incomplete/.test(error.message));
  assert.throws(() => parseOpeningCandidates(JSON.stringify({ candidates: [{ ...candidate("c1"), cover: { headline: "Only a headline", subheadline: "", factIds: [] } }] })), /incomplete/);
  assert.throws(() => parseOpeningCandidates(JSON.stringify({ candidates: [candidate("c1"), candidate("c1")] })), /repeated/);
  assert.throws(() => parseOpeningCandidates(JSON.stringify({ candidates: [] })), /no candidates/);
  assert.throws(() => parseOpeningCandidates("[]"), /not an object/);
  assert.throws(() => parseOpeningCandidates("not json"), /not valid JSON/);
});

test("the judge's answer is parsed strictly: every candidate scored once with integers, clamped, and a winner among them", () => {
  const ids = ["c1", "c2"];
  const answer = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    verdict: "revise", winnerId: "c2", summary: "Close.", suggestions: ["Pay the promise on slide 2."],
    scores: [score("c1", 120, { payoff: 0 }), score("c2", 91)],
    issues: [
      { code: "NOT_A_CODE", candidateId: "c1", part: "slide2", detail: "Vague." },
      { code: "OVERCLAIMS", candidateId: "c9", part: "inside", detail: "Drops the qualifier." },
      { code: "UNCLEAR", candidateId: null, part: null, detail: "" },
    ],
    ...overrides,
  });
  const parsed = parseOpeningEvaluation(answer(), ids);
  assert.equal(parsed.scores[0].overall, 100, "a score above the scale is clamped");
  assert.equal(parsed.scores[0].payoff, 1, "a score below the scale is clamped");
  assert.equal(JSON.stringify(parsed.issues), JSON.stringify([
    { code: "OTHER", detail: "Vague.", candidateId: "c1", part: "slide2" },
    { code: "OVERCLAIMS", detail: "Drops the qualifier." },
  ]), "unknown codes become OTHER; an unknown candidate or part is dropped; an issue without detail is dropped");
  assert.deepEqual(parsed.suggestions, ["Pay the promise on slide 2."]);
  assert.throws(() => parseOpeningEvaluation(answer({ winnerId: "c7" }), ids), (error: Error) => error instanceof Draft2ResponseError && /winner c7/.test(error.message));
  assert.throws(() => parseOpeningEvaluation(answer({ scores: [score("c1", 90), score("c2", 90.5)] }), ids), /not an integer/);
  assert.throws(() => parseOpeningEvaluation(answer({ scores: [score("c1", 90)] }), ids), /did not score c2/);
  assert.throws(() => parseOpeningEvaluation(answer({ scores: [score("c1", 90), score("c2", 90), score("c3", 90)] }), ids), /unknown candidate/);
  assert.throws(() => parseOpeningEvaluation(answer({ scores: [score("c1", 90), score("c1", 90)] }), ids), /twice/);
  assert.throws(() => parseOpeningEvaluation(answer({ verdict: "maybe" }), ids), /incomplete/);
  assert.throws(() => parseOpeningEvaluation(answer({ summary: "" }), ids), /incomplete/);
  assert.throws(() => parseOpeningEvaluation("[1]", ids), /not an object/);
});

test("a clean candidate has no mechanical finding; unknown or missing fact ids are flagged per part", () => {
  assert.deepEqual(codes(mechanicalOpeningIssues([candidate("c1")], facts)), []);
  assert.deepEqual(findings({ cover: { factIds: ["f1", "f9"] } }), ["FACT_UNKNOWN c1 cover"]);
  assert.deepEqual(findings({ slide2: { factIds: [] } }), ["NO_FACTS c1 slide2"], "an empty slide 2 is not also reported as having no new fact");
});

test("lengths are counted in words a reader sees, against each part's limit", () => {
  assert.equal(openingWordCount("Weeks — not years — to an award"), 6, "a dash is not a word");
  assert.deepEqual(findings({ cover: { headline: "Pentagon buyers now judge short product demo videos" } }), [], "8 words is the limit");
  assert.deepEqual(findings({ cover: { headline: "Pentagon buyers now judge short product demo videos quickly" } }), ["COVER_TOO_LONG c1 cover"]);
  assert.deepEqual(findings({ cover: { subheadline: "Product demos replace months of paperwork in a new buying program that judges five minute videos from small companies." } }), ["SUBHEADLINE_TOO_LONG c1 cover"]);
  assert.deepEqual(findings({ slide2: { headline: "Awards now arrive in under a single short week" } }), ["SLIDE2_HEADLINE_TOO_LONG c1 slide2"]);
  assert.deepEqual(findings({ slide2: { body: "A DOD official says awards took less than a week in several instances, which means small companies with a working product can now get paid while the larger contractors still wait for their paperwork to clear." } }), ["SLIDE2_BODY_TOO_LONG c1 slide2"]);
});

test("attribution on the cover headline is flagged in English, French and Spanish, and only on the headline", () => {
  assert.deepEqual(findings({ cover: { headline: "Pentagon says videos now win contracts" } }), ["ATTRIBUTION_ON_COVER c1 cover"]);
  assert.deepEqual(findings({ cover: { headline: "Les vidéos gagnent, selon le Pentagone" } }), ["ATTRIBUTION_ON_COVER c1 cover"]);
  assert.deepEqual(findings({ cover: { headline: "Los videos ganan, según el Pentágono" } }), ["ATTRIBUTION_ON_COVER c1 cover"]);
  assert.deepEqual(findings({ cover: { subheadline: "A DOD official says awards come within a week." } }), [], "the subheadline may carry attribution");
});

test("slide 2 must advance: no restatement of the cover and at least one fact the cover did not use", () => {
  assert.deepEqual(findings({ slide2: { headline: "Pentagon buyers judge five-minute videos", body: "Product demos replace months of paperwork in the new buying program.", factIds: ["f2"] } }), ["SLIDE2_RESTATES_COVER c1 slide2"]);
  assert.deepEqual(findings({ slide2: { factIds: ["f1"] } }), ["SLIDE2_NO_NEW_FACT c1 slide2"]);
  assert.deepEqual(findings({ slide2: { factIds: ["f1", "f2"] } }), [], "one new fact is enough");
});

test("a number must be stated by the facts the candidate cites, compared without separators", () => {
  const trillion = { cover: { subheadline: "A program that could reach 1.5 trillion in contracts by 2030.", factIds: ["f1", "f3"] } };
  assert.deepEqual(findings(trillion), [], "\"1.5 trillion\" matches a fact that says \"$1.5 trillion\"");
  assert.deepEqual(findings({ cover: { subheadline: "A program that could reach 2 trillion in contracts.", factIds: ["f1", "f3"] } }), ["UNSUPPORTED_NUMBER c1 cover"]);
  assert.deepEqual(findings({ cover: { subheadline: "A program that could reach 1.5 trillion in contracts by 2030." } }), ["UNSUPPORTED_NUMBER c1 cover"], "a number from a fact the candidate does not cite is not supported");
  const [issue] = mechanicalOpeningIssues([candidate("c1", { slide2: { body: "Awards took less than 7 days in 12 cases." } })], facts);
  assert.equal(issue.detail, "7, 12 are not stated by the facts this candidate cites.");
});

test("two candidates with the same cover headline are duplicates; the later one is flagged", () => {
  const issues = mechanicalOpeningIssues([candidate("c1"), candidate("c2", { cover: { headline: "PENTAGON buyers now judge five-minute videos!" } }), candidate("c3", { cover: { headline: "Your demo video is now the bid" } })], facts);
  assert.deepEqual(codes(issues), ["DUPLICATE_CANDIDATE c2 cover"]);
});

test("an opening is accepted only on an accept verdict whose winner passes every threshold with no mechanical finding", () => {
  assert.equal(openingAcceptedWinner([], evaluation()), "c1");
  assert.equal(openingIsAccepted([], evaluation({ verdict: "revise" })), false, "the judge must accept");
  assert.equal(openingIsAccepted([], evaluation({ scores: [score("c1", 94), score("c2", 95)] })), false, "overall below 95");
  assert.equal(openingIsAccepted([], evaluation({ scores: [score("c1", 97, { payoff: 84 }), score("c2", 80)] })), false, "a criterion below the floor");
  const flagged: Draft2OpeningIssue[] = [{ code: "ATTRIBUTION_ON_COVER", candidateId: "c1", part: "cover", detail: "says" }];
  assert.equal(openingAcceptedWinner(flagged, evaluation()), "c2", "the clean runner-up wins when its scores pass");
  assert.equal(openingIsAccepted(flagged, evaluation({ scores: [score("c1", 98), score("c2", 94), score("c3", 96, { voice: 80 })] })), false, "no clean candidate passes: the round is a revise");
  assert.equal(openingAcceptedWinner(flagged, evaluation({ scores: [score("c1", 98), score("c2", 99, { voice: 70 }), score("c3", 95)] })), "c3", "the best clean candidate that passes, not merely the highest");
});

test("a revision keeps the best clean candidates scored 90 or more, at most three, and sends the program's findings first", () => {
  const flagged: Draft2OpeningIssue[] = [{ code: "COVER_TOO_LONG", candidateId: "c4", part: "cover", detail: "Too long." }];
  const verdict = evaluation({ verdict: "revise", scores: [score("c1", 90), score("c2", 92), score("c3", 89), score("c4", 99), score("c5", 93), score("c6", 91)], issues: [{ code: "WEAK_TENSION", candidateId: "c3", part: "cover", detail: "Labels the news." }], suggestions: ["Name the deadline."] });
  const keep = keptOpeningIds(flagged, verdict);
  assert.deepEqual(keep, ["c5", "c2", "c6"]);
  const request = openingRevisionRequest(flagged, verdict, keep);
  assert.deepEqual(request.issues.map((issue) => issue.code), ["COVER_TOO_LONG", "WEAK_TENSION"]);
  assert.deepEqual(request.keep, ["c5", "c2", "c6"]);
  assert.deepEqual(request.suggestions, ["Name the deadline."]);
  assert.match(request.instruction, /Return 7 candidates: keep the listed ones unchanged/);
});

test("a kept candidate the writer dropped or rewrote is put back as the judge scored it, without growing the list", () => {
  const previous = ["c1", "c2", "c3"].map((id) => candidate(id, { cover: { headline: `Headline ${id}` } }));
  const revised = [
    candidate("c1", { cover: { headline: "Headline c1 rewritten" } }),
    ...["c4", "c5", "c6", "c7", "c8", "c9"].map((id) => candidate(id, { cover: { headline: `Headline ${id}` } })),
  ];
  const merged = mergeKeptCandidates(previous, revised, ["c1", "c2"]);
  assert.deepEqual(merged.restored, ["c1", "c2"]);
  assert.equal(merged.candidates.length, 7);
  assert.equal(merged.candidates[0].cover.headline, "Headline c1", "the rewrite is replaced by the scored original");
  assert.deepEqual(merged.candidates.map((entry) => entry.id), ["c1", "c4", "c5", "c6", "c7", "c8", "c2"], "the last new candidate makes room for the restored one");
  assert.deepEqual(mergeKeptCandidates(previous, [previous[0], candidate("c4")], ["c1"]).restored, [], "an unchanged kept candidate is not a restoration");
});

test("a run that ends without acceptance names the best clean candidate's weak criteria and the remaining issues", () => {
  const flagged: Draft2OpeningIssue[] = [{ code: "UNSUPPORTED_NUMBER", candidateId: "c1", part: "cover", detail: "2 trillion" }];
  const note = openingReviewNote(flagged, evaluation({ verdict: "revise", scores: [score("c1", 97), score("c2", 92, { payoff: 82 })], issues: [{ code: "PROMISE_NOT_PAID", candidateId: "c2", part: "slide2", detail: "No payoff." }] }), "Claude did not accept an opening after 3 rounds.");
  assert.equal(note, "Claude did not accept an opening after 3 rounds. The best clean candidate, c2, scored 92/100 (payoff 82). Remaining issues: UNSUPPORTED_NUMBER (c1 · cover), PROMISE_NOT_PAID (c2 · slide2). Choose an opening below or write it again.");
  assert.match(openingReviewNote([...flagged, { ...flagged[0], candidateId: "c2" }], evaluation({ scores: [score("c1", 97), score("c2", 92)] }), "Stopped."), /Every candidate has a program finding/);
});

test("an earlier run is summarized without its rounds, keeping the editor's choice", () => {
  const summary = openingRunSummary({ status: "ready", rounds: [{ round: 1, candidates: [candidate("c1")], mechanical: [], at: "t" }], candidates: [candidate("c1"), candidate("c2")], winnerId: "c1", editorChoiceId: "c2", editorChoiceAt: "2026-10-09T12:00:00.000Z" });
  assert.equal("rounds" in summary, false);
  assert.equal(summary.editorChoiceId, "c2");
  assert.equal(summary.candidates.length, 2);
});
