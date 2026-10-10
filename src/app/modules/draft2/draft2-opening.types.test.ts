import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  OPENING_CANDIDATES, OPENING_DEVELOP_INSTRUCTION, OPENING_REVISION_INSTRUCTION, bestOpeningVersions, mechanicalOpeningIssues, openingAcceptedWinner, openingExploreRequest, openingFactsSnapshot,
  openingFreshWanted, openingIsAccepted, openingJudgeRequest, openingRefineRequest, openingRegressions, openingReviewNote, openingRunSummary, openingTargets,
  openingVersions, openingWordCount, parseOpeningCandidates, parseOpeningEvaluation, renumberedCandidates, renumberedProposals, writtenCandidates,
  type Draft2OpeningCandidate, type Draft2OpeningEvaluation, type Draft2OpeningIssue, type Draft2OpeningRound, type Draft2OpeningScore,
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
  const tooMany = Array.from({ length: OPENING_CANDIDATES + 1 }, (_, index) => candidate(`c${index + 1}`));
  assert.equal(parseOpeningCandidates(JSON.stringify({ candidates: tooMany })).length, OPENING_CANDIDATES, "the candidate count is capped");
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
  const proposed = parseOpeningEvaluation(answer({ proposals: [candidate("p1"), { id: "p2", cover: { headline: "Only a headline" } }, candidate("p3"), candidate("p4"), candidate("p5")] }), ids);
  assert.deepEqual(proposed.proposals?.map((proposal) => proposal.id), ["p1", "p3", "p4"], "the judge's own openings: a malformed one is dropped, at most three are kept");
  assert.equal("proposals" in parseOpeningEvaluation(answer({ proposals: [] }), ids), false);
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

/** A judged round: every candidate scored (70 unless named), no findings unless given. */
const judgedRound = (number: number, candidates: Draft2OpeningCandidate[], overall: Record<string, number>, overrides: Partial<Draft2OpeningRound> = {}): Draft2OpeningRound => ({
  round: number, kind: number === 1 ? "explore" : "refine", candidates, mechanical: [], at: "t",
  evaluation: evaluation({ verdict: "revise", winnerId: candidates[0].id, scores: candidates.map((entry) => score(entry.id, overall[entry.id] ?? 70)) }),
  ...overrides,
});
const ids = (versions: { candidate: { id: string } }[]) => versions.map((version) => version.candidate.id);

test("both models read the verified facts as one compact snapshot, the same every round", () => {
  assert.deepEqual(openingFactsSnapshot(facts.slice(1)), [
    { id: "f2", claim: facts[1].claim, status: "attributed", attribution: "A DOD official", evidence: facts[1].evidence, importance: 80 },
    { id: "f3", claim: facts[2].claim, status: "attributed", qualifier: "could", attribution: "the Pentagon", evidence: facts[2].evidence, importance: 70 },
  ]);
  const request = openingExploreRequest(openingFactsSnapshot(facts), OPENING_CANDIDATES);
  assert.deepEqual(Object.keys(request), ["verifiedFacts", "task", "candidatesWanted"], "the facts lead, so the prompt cache reads them");
  assert.equal(request.candidatesWanted, OPENING_CANDIDATES);
});

test("the best version can come from any round: clean first, then the highest overall, a later round on a tie", () => {
  const first = judgedRound(1, ["c1", "c2", "c3"].map((id) => candidate(id)), { c1: 84, c2: 90, c3: 80 }, { mechanical: [{ code: "COVER_TOO_LONG", candidateId: "c2", part: "cover", detail: "11 words" }] });
  const second = judgedRound(2, [{ ...candidate("c1.2"), revisionOf: "c1" }, { ...candidate("c3.2"), revisionOf: "c3" }], { "c1.2": 78, "c3.2": 84 });
  const versions = openingVersions([first, second]);
  assert.deepEqual(ids(versions), ["c1", "c2", "c3", "c1.2", "c3.2"]);
  assert.equal(versions[1].findings.length, 1);
  assert.deepEqual(ids(bestOpeningVersions(versions)), ["c3.2", "c1", "c3", "c1.2"], "c2 has a program finding; c3.2 ties c1 at 84 and is later");
  const tie = openingVersions([
    judgedRound(1, [candidate("c1")], {}, { evaluation: evaluation({ verdict: "revise", winnerId: "c1", scores: [score("c1", 90, { grounding: 92 })] }) }),
    judgedRound(2, [{ ...candidate("c1.2"), revisionOf: "c1" }], {}, { evaluation: evaluation({ verdict: "revise", winnerId: "c1.2", scores: [score("c1.2", 90, { grounding: 87 })] }) }),
  ]);
  assert.deepEqual(ids(bestOpeningVersions(tie)), ["c1", "c1.2"], "on a tie the better grounded version wins, even from an earlier round");
  const reused = openingVersions([judgedRound(1, [candidate("c1")], { c1: 70 }), judgedRound(2, [candidate("c1", { angle: "New" })], { c1: 75 })]);
  assert.equal(reused.length, 1, "the first loop reused ids; the latest round's candidate stands");
  assert.equal(reused[0].candidate.angle, "New");
});

test("the funnel: ten new angles, then the three best lines revised beside two new angles, then the two best lines", () => {
  const first = judgedRound(1, ["c1", "c2", "c3", "c4", "c5"].map((id) => candidate(id)), { c1: 80, c2: 88, c3: 84, c4: 60, c5: 82 });
  assert.deepEqual(ids(openingTargets(openingVersions([first]), 1)), []);
  assert.equal(openingFreshWanted(1, []), 15);
  const targets = openingTargets(openingVersions([first]), 2);
  assert.deepEqual(ids(targets), ["c2", "c3", "c5"]);
  assert.equal(openingFreshWanted(2, targets), 3);
  const second = judgedRound(2, [{ ...candidate("c2.2"), revisionOf: "c2" }, candidate("c11")], { "c2.2": 90, c11: 86 });
  assert.deepEqual(ids(openingTargets(openingVersions([first, second]), 3)), ["c2.2", "c11"], "one version per line: c2 (88) is skipped, c2.2 already speaks for that opening");
  assert.equal(openingFreshWanted(3, openingTargets(openingVersions([first, second]), 3)), 0);
  const flagged = openingVersions([judgedRound(1, [candidate("c1")], { c1: 96 }, { mechanical: [{ code: "NO_FACTS", candidateId: "c1", part: "cover", detail: "x" }] })]);
  assert.deepEqual(ids(openingTargets(flagged, 2)), []);
  assert.equal(openingFreshWanted(2, []), 6, "a round with nothing clean to revise writes new angles in its place");
  assert.equal(openingFreshWanted(3, []), 2);
});

test("the judge's proposals are numbered across the run, developed under fresh ids that remember them, and never revealed to the judge", () => {
  const first = judgedRound(1, [candidate("c1")], {}, { evaluation: evaluation({ verdict: "revise", winnerId: "c1", scores: [score("c1", 80)], proposals: [candidate("p1"), candidate("p2"), candidate("p3")] }) });
  assert.deepEqual(renumberedProposals([candidate("x"), candidate("y")], [first]).map((proposal) => proposal.id), ["p4", "p5"]);
  const versions = openingVersions([first]);
  const developed = writtenCandidates([candidate("c1")], [candidate("p2", { angle: "Sharper" }), candidate("c1"), candidate("p1"), candidate("n1")], 2, 1, versions, [candidate("p1"), candidate("p2")]);
  assert.deepEqual(developed.map((entry) => [entry.id, entry.revisionOf ?? null, entry.proposalOf ?? null]), [["c1.2", "c1", null], ["c2", null, "p1"], ["c3", null, "p2"], ["c4", null, null]]);
  assert.equal(developed[2].angle, "Sharper");
  const judged = openingJudgeRequest(2, developed, [], openingTargets(versions, 2));
  assert.equal(judged.candidates.some((entry) => "proposalOf" in entry), false, "the judge scores its own ideas blind");
  assert.equal(judged.proposalsWanted, 1);
  assert.equal(openingJudgeRequest(1, [candidate("c1")], [], []).proposalsWanted, 3);
  assert.equal("proposalsWanted" in openingJudgeRequest(3, [candidate("c1")], [], []), false, "the final round only decides");
  const request = openingRefineRequest(openingFactsSnapshot(facts), openingTargets(versions, 2), versions, [], first, 3, [candidate("p1")]);
  assert.deepEqual(request.develop?.map((proposal) => proposal.id), ["p1"]);
  assert.ok(request.instruction.startsWith(`${OPENING_REVISION_INSTRUCTION} ${OPENING_DEVELOP_INSTRUCTION} Then write 3 new openings`));
  const developOnly = openingRefineRequest(openingFactsSnapshot(facts), [], versions, [], first, 0, [candidate("p1")]);
  assert.equal(developOnly.instruction, OPENING_DEVELOP_INSTRUCTION);
});

test("a revision that scores lower, or picks up a program finding, is a regression naming what got worse", () => {
  const before = openingVersions([judgedRound(1, [candidate("c1"), candidate("c2")], { c1: 84, c2: 80 })]);
  const revisions = openingVersions([judgedRound(2, [{ ...candidate("c1.2"), revisionOf: "c1" }, { ...candidate("c2.2"), revisionOf: "c2" }], {}, {
    mechanical: [{ code: "COVER_TOO_LONG", candidateId: "c2.2", part: "cover", detail: "11 words" }],
    evaluation: evaluation({ verdict: "revise", winnerId: "c2.2", scores: [score("c1.2", 80, { voice: 72, tension: 90 }), score("c2.2", 88)] }),
  })]);
  assert.deepEqual(openingRegressions(revisions, before), [
    { candidateId: "c1.2", previousId: "c1", from: 84, to: 80, worse: ["payoff 84 → 80", "clarity 84 → 80", "grounding 84 → 80", "voice 84 → 72"] },
    { candidateId: "c2.2", previousId: "c2", from: 80, to: 88, worse: ["COVER_TOO_LONG"] },
  ]);
  const improved = openingVersions([judgedRound(2, [{ ...candidate("c1.2"), revisionOf: "c1" }], { "c1.2": 90 })]);
  assert.deepEqual(openingRegressions(improved, before), []);
  const sameOverall = openingVersions([judgedRound(2, [{ ...candidate("c1.2"), revisionOf: "c1" }], {}, { evaluation: evaluation({ verdict: "revise", winnerId: "c1.2", scores: [score("c1.2", 84, { grounding: 79, tension: 89 })] }) })]);
  assert.deepEqual(openingRegressions(sameOverall, before).map((regression) => regression.worse), [["grounding 84 → 79"]], "a grounding loss the overall did not repay is a regression");
});

test("a revision keeps its line with an id naming its round; every other candidate is a new angle with a fresh id", () => {
  const versions = openingVersions([judgedRound(1, ["c1", "c3", "c10"].map((id) => candidate(id)), {}), judgedRound(2, [{ ...candidate("c10.2"), revisionOf: "c10" }], {})]);
  const mixed = writtenCandidates([candidate("c3"), candidate("c10.2")], [candidate("c10.2", { angle: "Sharper" }), candidate("n1"), candidate("c3"), candidate("n2"), candidate("n3")], 3, 2, versions);
  assert.deepEqual(mixed.map((entry) => [entry.id, entry.revisionOf ?? null]), [["c3.3", "c3"], ["c10.3", "c10.2"], ["c11", null], ["c12", null]], "new angles beyond the number asked are dropped");
  assert.deepEqual(writtenCandidates([candidate("c3")], [candidate("x")], 3, 0, versions).map((entry) => [entry.id, entry.revisionOf]), [["c3.3", "c3"]], "with no new angle asked, a renamed revision is matched in order");
  assert.deepEqual(writtenCandidates([candidate("c3")], [candidate("x")], 2, 2, versions).map((entry) => [entry.id, entry.revisionOf ?? null]), [["c11", null]], "with new angles asked, a renamed candidate is a new angle");
  assert.throws(() => writtenCandidates([candidate("c3")], [], 2, 0, versions), /none of the openings/);
  assert.deepEqual(renumberedCandidates([candidate("a"), candidate("b")], []).map((entry) => entry.id), ["c1", "c2"]);
});

test("the writer refines with each target's scores and issues, any earlier attempt that came out worse, and the preservation instruction", () => {
  const first = judgedRound(1, [candidate("c1"), candidate("c2")], { c1: 84, c2: 80 }, {
    mechanical: [],
    evaluation: evaluation({ verdict: "revise", winnerId: "c1", scores: [score("c1", 84), score("c2", 80)], issues: [{ code: "WEAK_TENSION", candidateId: "c1", part: "cover", detail: "Flat." }], suggestions: ["Name the deadline."] }),
  });
  const second = judgedRound(2, [{ ...candidate("c1.2", { cover: { headline: "A flatter headline" } }), revisionOf: "c1" }], { "c1.2": 78 });
  const versions = openingVersions([first, second]);
  const regressions = openingRegressions(versions.filter((version) => version.round === 2), versions);
  const request = openingRefineRequest(openingFactsSnapshot(facts), openingTargets(versions, 3).slice(0, 1), versions, regressions, { ...second, evaluation: evaluation({ verdict: "revise", winnerId: "c1.2", scores: [score("c1.2", 78)], suggestions: ["Keep the payoff."] }) });
  assert.deepEqual(Object.keys(request), ["verifiedFacts", "task", "openings", "suggestions", "instruction"]);
  assert.deepEqual(request.suggestions, ["Keep the payoff."]);
  assert.equal(request.task, "revise");
  assert.equal(request.openings.length, 1);
  const [target] = request.openings;
  assert.equal(target.id, "c1", "c1.2 scored lower, so c1 is revised again");
  assert.equal(target.scores?.overall, 84);
  assert.deepEqual(target.issues.map((issue) => issue.code), ["WEAK_TENSION"]);
  assert.deepEqual(target.earlierAttempts, [{ id: "c1.2", coverHeadline: "A flatter headline", overall: 78, worse: ["tension 84 → 78", "payoff 84 → 78", "clarity 84 → 78", "grounding 84 → 78", "voice 84 → 78"] }]);
  assert.equal(request.instruction, OPENING_REVISION_INSTRUCTION);
  assert.match(OPENING_REVISION_INSTRUCTION, /Never make the writing flatter or more bureaucratic/);
  const withAngles = openingRefineRequest(openingFactsSnapshot(facts), openingTargets(versions, 2), versions, regressions, first, 2);
  assert.deepEqual(Object.keys(withAngles), ["verifiedFacts", "task", "openings", "newAngles", "anglesSoFar", "feedback", "suggestions", "instruction"]);
  assert.equal(withAngles.newAngles, 2);
  assert.deepEqual(withAngles.anglesSoFar?.map((angle) => angle.id), ["c1", "c2", "c1.2"], "new angles know every opening tried");
  assert.deepEqual(withAngles.feedback?.issues.map((issue) => issue.code), ["WEAK_TENSION"], "and what the last judgment found");
  assert.match(withAngles.instruction, /Then write 2 new openings, with ids n1, n2: each a different angle from every opening in anglesSoFar/);
});

test("the judge sees each revision beside the version it revises, with that version's scores", () => {
  const versions = openingVersions([judgedRound(1, [candidate("c1")], { c1: 84 })]);
  const request = openingJudgeRequest(2, [{ ...candidate("c1.2"), revisionOf: "c1" }], [], openingTargets(versions, 2));
  assert.equal(JSON.stringify(request.candidates.map((entry) => [entry.id, entry.revises])), JSON.stringify([["c1.2", "c1"]]));
  assert.equal("revisionOf" in request.candidates[0], false, "the models read revises, not the program's field");
  assert.equal(request.previousVersions?.[0].scores?.overall, 84);
  assert.equal("previousVersions" in openingJudgeRequest(1, [candidate("c1")], [], []), false);
  assert.equal("verifiedFacts" in request, false, "the facts travel as the cached context, not in each round's contents");
});

test("a run that ends without acceptance names the best version's weak criteria and what is left to fix on it", () => {
  const first = judgedRound(1, [candidate("c1"), candidate("c2")], {}, {
    mechanical: [{ code: "UNSUPPORTED_NUMBER", candidateId: "c1", part: "cover", detail: "2 trillion" }],
    evaluation: evaluation({ verdict: "revise", winnerId: "c1", scores: [score("c1", 97), score("c2", 92, { payoff: 82 })], issues: [{ code: "PROMISE_NOT_PAID", candidateId: "c2", part: "slide2", detail: "No payoff." }] }),
  });
  const best = bestOpeningVersions(openingVersions([first]))[0];
  assert.equal(openingReviewNote(best, first, "Claude did not accept an opening after 3 rounds."), "Claude did not accept an opening after 3 rounds. The best version, c2, scored 92/100 (payoff 82). Remaining issues: PROMISE_NOT_PAID (c2 · slide2). Choose an opening below or write it again.");
  assert.match(openingReviewNote(undefined, first, "Stopped."), /^Stopped\. Every version has a program finding\. Remaining issues: UNSUPPORTED_NUMBER \(c1 · cover\), PROMISE_NOT_PAID/);
});

test("an earlier run is summarized without its rounds, keeping the editor's choice", () => {
  const summary = openingRunSummary({ status: "ready", rounds: [{ round: 1, candidates: [candidate("c1")], mechanical: [], at: "t" }], candidates: [candidate("c1"), candidate("c2")], winnerId: "c1", editorChoiceId: "c2", editorChoiceAt: "2026-10-09T12:00:00.000Z" });
  assert.equal("rounds" in summary, false);
  assert.equal(summary.editorChoiceId, "c2");
  assert.equal(summary.candidates.length, 2);
});
