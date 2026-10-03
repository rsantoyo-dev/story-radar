import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHookToDraft,
  buildHookJudgeContents,
  coverAllowedFactIds,
  CreativeHookTournamentResponseError,
  hookTasteExample,
  hookTotal,
  keepTournamentCover,
  parseHookCandidates,
  parseHookRanking,
  parseHookScores,
  selectHook,
  type CreativeHookTournament,
  type HookCandidate,
  type HookScore,
} from "./creative-hook-tournament";
import type { CreativeQualityIssue, GeneratedCreativeDraft } from "./creative-content.types";

const draft = {
  concept: "c", caption: "c", hashtags: [], altText: "a",
  units: [
    { order: 1, type: "carousel-slide", role: "cover", headline: "Writer cover", subheadline: "Writer context", factIds: ["fact-1"], visualDirection: "v", assetRequest: "generated-image", aspectRatio: "4:5" },
    { order: 2, type: "carousel-slide", role: "content", headline: "Inside", body: "Body", factIds: ["fact-2"], visualDirection: "v", assetRequest: "generated-image", aspectRatio: "4:5" },
    { order: 3, type: "carousel-slide", role: "conclusion", headline: "End", body: "Body", factIds: ["fact-1", "fact-2"], visualDirection: "v", assetRequest: "generated-image", aspectRatio: "4:5" },
  ],
} as unknown as GeneratedCreativeDraft;

const candidate = (headline: string, extra: Partial<HookCandidate> = {}): HookCandidate => ({
  headline, subheadline: "", mechanism: "recognition", segment: "families", factIds: ["fact-1"], payoffUnitOrder: 2, ...extra,
});
const score = (value: number, extra: Partial<HookScore> = {}): HookScore => ({
  recognition: value, clarity: value, pull: value, fidelity: value, payoff: value, naturalness: value, reason: "", ...extra,
});

test("only distinct, well-formed covers that cite the cover's facts survive", () => {
  const parsed = parseHookCandidates(JSON.stringify({ candidates: [
    candidate("Vous étiez au DIX30 dimanche ?"),
    candidate("vous etiez au dix30 dimanche"),
    candidate("Writer cover"),
    candidate("Un titre beaucoup trop long qui dépasse largement la limite de mots fixée pour une couverture lisible"),
    candidate("Fait d'ailleurs", { factIds: ["fact-9"] }),
    candidate("Sans relais", { payoffUnitOrder: 1 }),
    { ...candidate("Mauvais mécanisme"), mechanism: "clickbait" },
    candidate("La plus grande foule ? C'était ici.", { mechanism: "pride", factIds: ["fact-1", "fact-9"] }),
  ] }), { allowedFactIds: ["fact-1"], slideCount: 3, incumbentHeadline: "Writer cover" });
  assert.deepEqual(parsed.map((entry) => entry.headline), ["Vous étiez au DIX30 dimanche ?", "La plus grande foule ? C'était ici."]);
  assert.deepEqual(parsed[1].factIds, ["fact-1"], "facts outside the cover are dropped");
  assert.throws(() => parseHookCandidates("nope", { allowedFactIds: ["fact-1"], slideCount: 3, incumbentHeadline: "" }), CreativeHookTournamentResponseError);
});

test("every option must be scored, in range", () => {
  const scores = parseHookScores(JSON.stringify({ scores: [
    { option: 2, recognition: 120, clarity: 90, pull: 90, fidelity: 95, payoff: 90, naturalness: 90, reason: "ok" },
    { option: 1, recognition: 80, clarity: 80, pull: 80, fidelity: 80, payoff: 80, naturalness: 80, reason: "ok" },
  ] }), 2);
  assert.equal(scores[0].recognition, 80);
  assert.equal(scores[1].recognition, 100, "clamped to 100");
  assert.throws(() => parseHookScores(JSON.stringify({ scores: [{ option: 1, recognition: 80, clarity: 80, pull: 80, fidelity: 80, payoff: 80, naturalness: 80, reason: "" }] }), 2), CreativeHookTournamentResponseError);
});

test("the writer's cover is replaced only by a clearly better cover that passes the gates", () => {
  const incumbent = { ...candidate("Writer cover"), mechanism: "incumbent" as const, score: score(85) };
  assert.deepEqual(selectHook([incumbent, { ...candidate("A"), score: score(86) }]), { selectedIndex: 0, replaced: false }, "a one-point gain is noise");
  assert.deepEqual(selectHook([incumbent, { ...candidate("B"), score: score(92) }]), { selectedIndex: 1, replaced: true });
  assert.deepEqual(selectHook([incumbent, { ...candidate("C"), score: score(97, { fidelity: 80 }) }]), { selectedIndex: 0, replaced: false }, "fidelity is a gate, not a trade-off");
  assert.deepEqual(selectHook([incumbent, { ...candidate("D"), score: score(97), rejected: "Introduces validation blockers" }]), { selectedIndex: 0, replaced: false });
  // An incumbent that fails the gates loses to any eligible cover.
  assert.deepEqual(selectHook([{ ...incumbent, score: score(95, { clarity: 60 }) }, { ...candidate("E"), score: score(91) }]), { selectedIndex: 1, replaced: true });
  assert.equal(hookTotal(score(90, { recognition: 100 })), 92.5);
});

test("a cover may cite any fact the deck carries, never one it does not", () => {
  const brief = { keyFacts: [{ id: "fact-1" }, { id: "fact-2" }, { id: "fact-3" }, { id: "fact-4" }], carouselPlan: { slides: [{ allowedFactIds: ["fact-3"] }, { allowedFactIds: ["fact-9"] }] } };
  assert.deepEqual(coverAllowedFactIds(brief as never, draft).sort(), ["fact-1", "fact-2", "fact-3"], "fact-4 is in no slide; fact-9 is not a known fact");
});

test("the judge sees the options blind, without mechanisms or which one the writer wrote", () => {
  const contents = JSON.parse(buildHookJudgeContents({ publication: "Salut", language: "fr", audience: "a", facts: [], draft, options: [{ ...candidate("Writer cover"), mechanism: "incumbent" }, candidate("Autre")] }));
  assert.deepEqual(Object.keys(contents.options[0]).sort(), ["factIds", "headline", "option", "payoffUnitOrder", "subheadline"]);
  assert.equal(contents.slides[0].order, 2, "the cover itself is not shown as a slide");
});

test("later passes keep the tournament's cover unless facts or rules require the change", () => {
  const winner = candidate("Vous étiez au DIX30 dimanche ?", { subheadline: "Environ 15 000 personnes, selon le bilan." });
  const tournament: CreativeHookTournament = { promptVersion: "t", model: "m", judgeModel: "m", at: "", candidates: [{ ...candidate("Writer cover"), mechanism: "incumbent" }, winner], selectedIndex: 1, replaced: true };
  const rewritten = applyHookToDraft(draft, candidate("Style rewrite"));
  const notFactual = () => false;
  assert.equal(keepTournamentCover(rewritten, tournament, [], notFactual).units[0].headline, winner.headline, "a style rewrite is undone");
  assert.equal(keepTournamentCover(rewritten, tournament, [], notFactual).units[1], draft.units[1], "the interior is untouched");
  const factual: CreativeQualityIssue = { code: "UNSUPPORTED_CLAIM", severity: "blocker", unitOrder: 1, message: "m" };
  assert.equal(keepTournamentCover(rewritten, tournament, [factual], () => true).units[0].headline, "Style rewrite", "a factual fix on the cover stands");
  const deckLevel: CreativeQualityIssue = { code: "FACT_OVERUSE", severity: "warning", message: "m" };
  assert.equal(keepTournamentCover(rewritten, tournament, [deckLevel], () => true).units[0].headline, winner.headline, "deck-level findings do not reopen the cover");
  const blockers = (value: GeneratedCreativeDraft) => (value.units[0].headline === winner.headline ? 1 : 0);
  assert.equal(keepTournamentCover(rewritten, tournament, [], notFactual, blockers).units[0].headline, "Style rewrite", "a rewrite that clears a rule blocker stands");
  assert.equal(keepTournamentCover(rewritten, { ...tournament, replaced: false }, [], notFactual).units[0].headline, "Style rewrite", "nothing to protect when the writer's cover won");
});

test("the judge's ranking decides among eligible covers; the writer's cover keeps its place unless outranked", () => {
  const incumbent = { ...candidate("Writer cover"), mechanism: "incumbent" as const, score: score(90) };
  const strong = { ...candidate("Strong"), score: score(92) };
  const unsafe = { ...candidate("Unsafe"), score: score(99, { fidelity: 70 }) };
  assert.deepEqual(selectHook([incumbent, strong, unsafe], [2, 1, 0]), { selectedIndex: 1, replaced: true }, "an ineligible favourite is skipped");
  assert.deepEqual(selectHook([incumbent, strong], [0, 1]), { selectedIndex: 0, replaced: false });
  assert.deepEqual(parseHookRanking(JSON.stringify({ ranking: [2, 1, 3] }), 3), [2, 1, 3]);
  assert.equal(parseHookRanking(JSON.stringify({ ranking: [2, 2, 3] }), 3), undefined, "not a permutation");
  assert.equal(parseHookRanking("nope", 2), undefined);
});

test("an editor's pick becomes a taste example: the chosen cover over the best alternatives", () => {
  const tournament: CreativeHookTournament = {
    promptVersion: "t", model: "m", judgeModel: "m", at: "",
    candidates: [
      { ...candidate("Writer cover"), mechanism: "incumbent", total: 88 },
      { ...candidate("Picked", { subheadline: "Context" }), total: 90 },
      { ...candidate("Best scored"), total: 95 },
      { ...candidate("Rejected"), total: 99, rejected: "blocker" },
    ],
    selectedIndex: 1,
    replaced: true,
    editorChoice: { index: 1, at: "2026-10-02" },
  };
  assert.deepEqual(hookTasteExample(tournament), { chosen: "Picked — Context", over: ["Best scored", "Writer cover"] });
  assert.equal(hookTasteExample({ ...tournament, editorChoice: undefined }), undefined);
});
