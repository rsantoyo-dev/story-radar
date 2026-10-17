import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  CLOSING_CANDIDATES, CLOSING_CRITERIA, CLOSING_GATE, CLOSING_ROUND_PLAN, callToActionBrief, closingEvaluationSchema, closingExploreRequest, closingJudgeRequest,
  closingRefineRequest, closingSchema, closingShape, mechanicalClosingIssues, openingForClosing, parseClosingCandidates, parseClosingEvaluation, sameClosing,
  type Draft2ClosingCandidate, type Draft2ClosingIssue, type Draft2ClosingOpening, type Draft2ClosingRound, type Draft2ClosingScore,
} from "./draft2-closing.types";
import { funnelAcceptedWinner, funnelVersions } from "./draft2-funnel";

const facts: Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week in several instances.", evidence: "awards took less than a week in several instances", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
  { id: "f3", claim: "The program could reach $1.5 trillion by 2030.", evidence: "could reach $1.5 trillion by 2030", kind: "number", status: "attributed", attribution: "the Pentagon", qualifier: "could", importance: 70 },
];
const opening: Draft2ClosingOpening = {
  id: "c16.3",
  cover: { headline: "Your demo video is now the bid", subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"] },
  slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"] },
};

type ClosingOverrides = { penultimate?: Partial<NonNullable<Draft2ClosingCandidate["penultimate"]>> | null; last?: Partial<Draft2ClosingCandidate["last"]>; angle?: string };

/** A two-slide closing every program rule accepts. */
const closing = (id: string, overrides: ClosingOverrides = {}): Draft2ClosingCandidate => ({
  id,
  ...(overrides.penultimate === null ? {} : { penultimate: { headline: "The binder is optional now", body: "Startups that show a working product can skip a year of forms before a contract.", factIds: ["f1"], ...overrides.penultimate } }),
  last: { headline: "Build the demo first", body: "If you sell software to government, your product does the talking now.", cta: "Follow us for every procurement change that opens a door.", factIds: ["f2"], ...overrides.last },
  angle: overrides.angle ?? "Show, don't file",
});
const score = (candidateId: string, overall: number, overrides: Partial<Draft2ClosingScore> = {}): Draft2ClosingScore =>
  ({ candidateId, resolution: overall, meaning: overall, action: overall, continuity: overall, grounding: overall, voice: overall, focus: overall, originality: overall, overall, note: "Why.", ...overrides });
const rules = { opening, shape: "two-slides" as const, grave: false, emojis: 2 };
const codes = (issues: Draft2ClosingIssue[]) => issues.map((issue) => [issue.code, issue.candidateId, issue.part].filter(Boolean).join(" "));
const findings = (overrides: ClosingOverrides, options: Partial<Parameters<typeof mechanicalClosingIssues>[2]> = {}) =>
  codes(mechanicalClosingIssues([closing("c1", overrides)], facts, { ...rules, ...options }));

test("one form of address on the whole closing, its call to action included: a tu publication never says vous", () => {
  const reader = { address: "informal" as const, language: "French" };
  const mixed = { last: { headline: "Avant de sortir", body: "Pour vos sorties, retenez les mesures du bar.", cta: "Suis Salut Brossard pour chaque décision qui touche tes soirées." } };
  assert.deepEqual(findings(mixed, { reader }), ["WRONG_ADDRESS c1 last"]);
  assert.match(mechanicalClosingIssues([closing("c1", mixed)], facts, { ...rules, reader })[0].detail, /addresses its reader as "tu".*"vos", "retenez" are the other form/);
  assert.deepEqual(findings({ last: { body: "Pour tes sorties, retiens les mesures du bar.", cta: "Suis Salut Brossard pour chaque décision qui touche tes soirées." } }, { reader }), []);
  assert.deepEqual(findings(mixed), [], "a publication without a form set: no rule");
});

test("an arc ends on two slides, a list or steps on one; the schemas ask for exactly that shape", () => {
  assert.equal(closingShape("arc"), "two-slides");
  assert.equal(closingShape("list"), "one-slide");
  assert.equal(closingShape("steps"), "one-slide");
  const item = (shape: "two-slides" | "one-slide") => ((closingSchema(shape).properties as { candidates: { items: { required: string[] } } }).candidates.items.required);
  assert.deepEqual(item("two-slides"), ["id", "penultimate", "last", "angle"]);
  assert.deepEqual(item("one-slide"), ["id", "last", "angle"]);
  const judge = closingEvaluationSchema("one-slide") as { properties: { scores: { items: { required: string[] } }; proposals: { items: { required: string[] } } } };
  assert.deepEqual(judge.properties.scores.items.required, ["candidateId", ...CLOSING_CRITERIA, "overall", "note", "keep"]);
  assert.deepEqual(judge.properties.proposals.items.required, ["id", "last", "angle"], "the judge proposes closings in the run's shape");
  assert.deepEqual(CLOSING_ROUND_PLAN, [{ revise: 0, fresh: CLOSING_CANDIDATES, proposals: 2, effort: "medium" }, { revise: 2, fresh: 0, proposals: 0 }], "eight at medium effort, then the two best beside the two proposals, thinking hard");
});

test("the writer's answer becomes closings in the run's shape; a missing part is rejected, an empty call to action is not", () => {
  const answer = (candidates: unknown[]) => JSON.stringify({ candidates });
  const [two] = parseClosingCandidates(answer([closing("c1")]), "two-slides");
  assert.equal(two.penultimate?.headline, "The binder is optional now");
  assert.throws(() => parseClosingCandidates(answer([closing("c1", { penultimate: null })]), "two-slides"), (error: Error) => error instanceof Draft2ResponseError && /c1 is incomplete/.test(error.message), "an arc needs its penultimate");
  const [one] = parseClosingCandidates(answer([closing("c1")]), "one-slide");
  assert.equal("penultimate" in one, false, "a one-slide closing drops a penultimate it should not have");
  assert.equal(parseClosingCandidates(answer([closing("c1", { last: { cta: "" } })]), "two-slides")[0].last.cta, "", "the program, not the parser, decides whether a closing needs a call to action");
  assert.throws(() => parseClosingCandidates(answer([closing("c1", { last: { headline: "" } })]), "two-slides"), /incomplete/);
  assert.throws(() => parseClosingCandidates(answer([closing("c1"), closing("c1")]), "two-slides"), /repeated/);
});

test("the judge's answer is scored on every closing criterion, with parts named penultimate or last", () => {
  const answer = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    verdict: "revise", winnerId: "c1", summary: "Close.", suggestions: [], proposals: [closing("p1"), closing("p2"), closing("p3")],
    scores: [score("c1", 90)], issues: [{ code: "RECAP", candidateId: "c1", part: "last", detail: "Sums up.", material: false }, { code: "UNRESOLVED", candidateId: "c1", part: "cover", detail: "No payoff." }],
    ...overrides,
  });
  const parsed = parseClosingEvaluation(answer(), ["c1"], "two-slides");
  assert.equal(parsed.scores[0].action, 90);
  assert.deepEqual(parsed.issues.map((issue) => [issue.code, issue.part ?? null]), [["RECAP", "last"], ["UNRESOLVED", null]], "a part the closing does not have is dropped");
  assert.deepEqual(parsed.proposals?.map((proposal) => proposal.id), ["p1", "p2"], "at most two proposals");
  const { action: _action, ...withoutAction } = score("c1", 90);
  void _action;
  assert.throws(() => parseClosingEvaluation(answer({ scores: [withoutAction] }), ["c1"], "two-slides"), /action score for c1 is not an integer/);
});

test("a clean closing has no finding; every slide cites known facts", () => {
  assert.deepEqual(findings({}), []);
  assert.deepEqual(findings({ penultimate: { factIds: [] } }), ["NO_FACTS c1 penultimate"]);
  assert.deepEqual(findings({ last: { factIds: ["f9"] } }), ["FACT_UNKNOWN c1 last"]);
  assert.deepEqual(findings({ penultimate: null }, { shape: "one-slide" }), [], "a one-slide closing has no penultimate to check");
});

test("lengths: each slide against its limit, a one-slide closing's body has room for the plan", () => {
  const long = (words: number) => Array.from({ length: words }, () => "word").join(" ");
  assert.deepEqual(findings({ penultimate: { headline: long(9) } }), ["PENULTIMATE_HEADLINE_TOO_LONG c1 penultimate"]);
  assert.deepEqual(findings({ penultimate: { body: long(31) } }), ["PENULTIMATE_BODY_TOO_LONG c1 penultimate"]);
  assert.deepEqual(findings({ last: { headline: long(9) } }), ["LAST_HEADLINE_TOO_LONG c1 last"]);
  assert.deepEqual(findings({ last: { body: long(26) } }), ["LAST_BODY_TOO_LONG c1 last"]);
  assert.deepEqual(findings({ penultimate: null, last: { body: long(40) } }, { shape: "one-slide" }), [], "the plan for the period may run to 40 words");
  assert.deepEqual(findings({ last: { cta: long(15) } }), ["CTA_TOO_LONG c1 last"]);
});

test("a closing needs a call to action unless the story is grave", () => {
  assert.deepEqual(findings({ last: { cta: "" } }), ["CTA_MISSING c1 last"]);
  assert.deepEqual(findings({ last: { cta: "" } }, { grave: true }), [], "a grave story may end without one");
});

test("a summary label, a closing that repeats the opening, and emojis beyond the publication's allowance are findings", () => {
  assert.deepEqual(findings({ last: { headline: "In summary, show the product" } }), ["RECAP_LABEL c1 last"]);
  assert.deepEqual(findings({ penultimate: { headline: "En bref, la vidéo suffit" } }), ["RECAP_LABEL c1 penultimate"]);
  assert.deepEqual(findings({ last: { body: "En resumen, tu producto habla por ti." } }), ["RECAP_LABEL c1 last"]);
  const repeated = { penultimate: { headline: "Your demo video is now the bid", body: "Product demos replace months of paperwork in a new buying program." } };
  assert.deepEqual(findings(repeated), ["RESTATES_OPENING c1 penultimate"], "a slide that copies the cover");
  assert.match(mechanicalClosingIssues([closing("c1", repeated)], facts, rules)[0].detail, /penultimate slide repeats the cover/);
  assert.deepEqual(findings({ last: { cta: "Follow us 🚀🔥🎯" } }), ["TOO_MANY_EMOJIS c1"]);
  assert.deepEqual(findings({ last: { cta: "Follow us 🚀" } }, { emojis: 0 }), ["TOO_MANY_EMOJIS c1"], "a publication that allows none");
});

test("numbers must be stated by the cited facts; a list's count counts as stated", () => {
  assert.deepEqual(findings({ penultimate: { body: "Awards came in 3 days.", factIds: ["f2"] } }), ["UNSUPPORTED_NUMBER c1 penultimate"]);
  assert.deepEqual(findings({ last: { body: "A market that could reach $1.5 trillion by 2030.", factIds: ["f3"] } }), []);
  assert.deepEqual(findings({ penultimate: null, last: { headline: "Your 4 plans this weekend" } }, { shape: "one-slide", itemCount: 4 }), []);
  assert.deepEqual(findings({ last: { cta: "Save these 5 tips" } }), ["UNSUPPORTED_NUMBER c1 last"], "the call to action states no number of its own");
});

test("two closings with the same headlines are duplicates, except a proposal and its edit", () => {
  const issues = mechanicalClosingIssues([closing("c1"), closing("c2"), { ...closing("c3"), proposalOf: "p1", asProposed: true }, { ...closing("c4"), proposalOf: "p1" }], facts, rules);
  assert.deepEqual(codes(issues), ["DUPLICATE_CANDIDATE c2", "DUPLICATE_CANDIDATE c3", "DUPLICATE_CANDIDATE c4"], "the first closing with those headlines keeps them; an edit and its original are exempt only from each other");
  assert.equal(sameClosing(closing("c1"), closing("c9")), true);
  assert.equal(sameClosing(closing("c1"), closing("c9", { last: { cta: "Save this for your next bid." } })), false, "a changed call to action is a change");
});

test("the closing's gate: every criterion at 85 or more and 95 overall; a material error blocks the judge's pick", () => {
  const round: Draft2ClosingRound = {
    round: 1, candidates: [closing("c1"), closing("c2")], mechanical: [], at: "t",
    evaluation: { verdict: "accept", winnerId: "c1", scores: [score("c1", 97), score("c2", 96, { action: 84 })], issues: [], suggestions: [], summary: "x" },
  };
  assert.equal(funnelAcceptedWinner(round.mechanical, round.evaluation!, CLOSING_GATE), "c1");
  const blocked = { ...round.evaluation!, issues: [{ code: "OVERCLAIMS" as const, candidateId: "c1", part: "last" as const, detail: "Drops could.", material: true }] };
  assert.equal(funnelAcceptedWinner(round.mechanical, blocked, CLOSING_GATE), undefined, "c2 misses the gate on its call to action");
  assert.equal(funnelVersions([round]).length, 2);
});

test("the requests name closings: new ones, revisions with their last headlines, and the judge's list", () => {
  assert.deepEqual(closingExploreRequest(8), { task: "closings", candidatesWanted: 8 });
  const first: Draft2ClosingRound = { round: 1, candidates: [closing("c1"), closing("c2")], mechanical: [], at: "t", evaluation: { verdict: "revise", winnerId: "c1", scores: [score("c1", 88), score("c2", 80)], issues: [], suggestions: ["Name who it is for."], summary: "x" } };
  const versions = funnelVersions([first]);
  const refine = closingRefineRequest(versions.slice(0, 1), versions, [], first, 0, [closing("p1")]);
  assert.deepEqual(Object.keys(refine), ["task", "closings", "develop", "suggestions", "instruction"]);
  assert.match(refine.instruction, /^Revise each closing in closings[^]*Edit each proposal in develop/);
  assert.equal(refine.closings[0].id, "c1");
  const judged = closingJudgeRequest(CLOSING_ROUND_PLAN, 1, [closing("c1")], [], []);
  assert.deepEqual([judged.task, judged.proposalsWanted], ["closings", 2]);
  assert.deepEqual(openingForClosing(opening), { cover: opening.cover, slide2: opening.slide2 });
});

test("the call-to-action brief carries the publication's style and emoji allowance", () => {
  assert.equal(callToActionBrief({ style: "Chaleureux,\n local. « Suis Salut Laval »", emojis: 2 }), [
    "# Calls to action",
    "- The publication's style (its voice and wording; the focus's goal decides the action): Chaleureux, local. « Suis Salut Laval »",
    "- Emojis: at most 2 in the whole closing.",
  ].join("\n"));
  assert.match(callToActionBrief({ style: " ", emojis: 0 }), /sets no style[^]*Emojis: none\./);
});

test("the closing never uses an abbreviation the facts had to spell out", () => {
  const explaining: Draft2Fact[] = [...facts, { id: "f4", claim: "Le Service de police de l'agglomération de Longueuil (SPAL) enquête.", evidence: "", kind: "event", status: "established", importance: 50 }];
  const issues = mechanicalClosingIssues([closing("c1", { last: { body: "Le SPAL veille sur tes soirées." } })], explaining, rules);
  assert.deepEqual(codes(issues), ["ABBREVIATION c1 last"]);
  assert.match(issues[0].detail, /^"SPAL" \(Service de police de l'agglomération de Longueuil\)/u);
});
