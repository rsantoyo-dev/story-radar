import assert from "node:assert/strict";
import test from "node:test";

import {
  admitHookCandidate,
  applyHookToDraft,
  buildHookJudgeContents,
  checkHookOpening,
  coverAllowedFactIds,
  CreativeHookTournamentResponseError,
  hookOpeningForDraft,
  hookTasteExample,
  hookTotal,
  keepTournamentCover,
  normalizeCoverPunctuation,
  openingOnDraft,
  sameCoverText,
  tournamentOwnsSecondSlide,
  parseHookCandidates,
  parseHookRanking,
  parseHookScores,
  secondPassesGates,
  selectHook,
  type CreativeHookTournament,
  type HookCandidate,
  type HookScore,
  buildHookGeneratorInstructions,
  buildHookJudgeInstructions,
  buildHookRefineInstructions,
  coverPromisesList,
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
    { option: 2, recognition: 120, clarity: 90, pull: 90, fidelity: 95, payoff: 90, naturalness: 90, slide2: 85, slide2Fidelity: 95, reason: "ok" },
    { option: 1, recognition: 80, clarity: 80, pull: 80, fidelity: 80, payoff: 80, naturalness: 80, reason: "ok" },
  ] }), 2);
  assert.equal(scores[0].recognition, 80);
  assert.equal(scores[1].recognition, 100, "clamped to 100");
  assert.equal(scores[1].slide2, 85);
  assert.ok(secondPassesGates(scores[1]));
  assert.ok(!secondPassesGates(scores[0]), "an unscored slide 2 is never applied");
  assert.ok(!secondPassesGates({ ...scores[1], slide2Fidelity: 85 }), "fidelity gates slide 2 too");
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
  const contents = JSON.parse(buildHookJudgeContents({ publication: "Salut", language: "fr", audience: "a", facts: [], draft, options: [{ ...candidate("Writer cover"), mechanism: "incumbent" }, candidate("Autre", { secondHeadline: "Ils étaient 15 000" })] }));
  assert.deepEqual(Object.keys(contents.options[0]).sort(), ["factIds", "headline", "option", "payoffUnitOrder", "slide2Headline", "slide2Subheadline", "subheadline"]);
  assert.equal(contents.slides[0].order, 2, "the cover itself is not shown as a slide");
  assert.equal(contents.slides[0].headline, undefined, "slide 2's headline comes from each option");
  assert.equal(contents.slides[0].body, "Body");
  assert.equal(contents.options[0].slide2Headline, "Inside", "an option without its own slide 2 keeps the current one");
  assert.equal(contents.options[1].slide2Headline, "Ils étaient 15 000");
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
  // A chosen cover citing a fact the plan keeps off the cover is never put back:
  // every review would reject the draft as citing an unplanned fact.
  const offPlan = keepTournamentCover(rewritten, tournament, [], notFactual, undefined, ["fact-9"]);
  assert.equal(offPlan, rewritten, "the rewrite's own, planned cover stands");
  assert.equal(keepTournamentCover(rewritten, tournament, [], notFactual, undefined, winner.factIds).units[0].headline, winner.headline, "a planned tournament cover is still kept");
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

test("French covers get the space before ? ! ; and :, without touching times", () => {
  assert.equal(normalizeCoverPunctuation("Vous y étiez dimanche? Et les retombées!", "French"), "Vous y étiez dimanche ? Et les retombées !");
  assert.equal(normalizeCoverPunctuation("DIX30: départ à 16:30", "fr"), "DIX30 : départ à 16:30");
  assert.equal(normalizeCoverPunctuation("Vraiment?!", "French"), "Vraiment ?!");
  assert.equal(normalizeCoverPunctuation("Were you there?", "English"), "Were you there?");
  assert.ok(sameCoverText("Vous y étiez dimanche?", "Vous y étiez dimanche ?"));
  assert.ok(!sameCoverText("Vous y étiez dimanche ?", "Vous y étiez samedi ?"));
});

test("each cover brings a short slide 2 headline; an overlong one is dropped and the cover still competes", () => {
  const parsed = parseHookCandidates(JSON.stringify({ candidates: [
    candidate("Vous étiez au DIX30 dimanche ?", { secondHeadline: "Vous étiez 15 000", secondSubheadline: "" }),
    candidate("La foule la plus grande ?", { secondHeadline: "Un titre de diapositive deux beaucoup trop long pour tenir dans la limite fixée", secondSubheadline: "" }),
  ] }), { allowedFactIds: ["fact-1"], slideCount: 3, incumbentHeadline: "Writer cover", language: "fr" });
  assert.equal(parsed[0].secondHeadline, "Vous étiez 15 000");
  assert.equal(parsed[1].headline, "La foule la plus grande ?");
  assert.equal(parsed[1].secondHeadline, "", "slide 2 keeps its headline");
});

test("the opening rewrites the cover and slide 2's headline only; slide 2 keeps its text and facts", () => {
  const opened = applyHookToDraft(draft, candidate("New cover", { secondHeadline: "New slide 2", secondSubheadline: "Short label" }));
  assert.equal(opened.units[0].headline, "New cover");
  assert.equal(opened.units[1].headline, "New slide 2");
  assert.equal(opened.units[1].subheadline, "Short label");
  assert.equal(opened.units[1].body, "Body");
  assert.deepEqual(opened.units[1].factIds, ["fact-2"]);
  assert.equal(opened.units[2], draft.units[2]);
  assert.equal(applyHookToDraft(draft, candidate("New cover")).units[1], draft.units[1], "no slide 2 headline, no change");
});

test("a slide 2 headline that adds any rule issue is dropped; a cover that adds a blocker is refused", () => {
  const issuesOf = (value: GeneratedCreativeDraft): CreativeQualityIssue[] => [
    ...(value.units[0].headline === "Unsafe cover" ? [{ code: "UNSUPPORTED_NUMBER", severity: "blocker" as const, unitOrder: 1, message: "m" }] : []),
    ...(value.units[1].headline === "Dense slide 2" ? [{ code: "SLIDE_TOO_DENSE", severity: "warning" as const, unitOrder: 2, message: "m" }] : []),
  ];
  const clean = checkHookOpening(draft, candidate("Cover", { secondHeadline: "Light slide 2" }), issuesOf);
  assert.deepEqual(clean.blockers, []);
  assert.equal(clean.candidate.secondHeadline, "Light slide 2");
  const dense = checkHookOpening(draft, candidate("Cover", { secondHeadline: "Dense slide 2" }), issuesOf);
  assert.equal(dense.candidate.secondHeadline, "", "the cover competes without its slide 2");
  assert.deepEqual(dense.secondDropped, ["SLIDE_TOO_DENSE:2"]);
  assert.deepEqual(checkHookOpening(draft, candidate("Unsafe cover", { secondHeadline: "Light slide 2" }), issuesOf).blockers, ["UNSUPPORTED_NUMBER:1"]);
});

test("later passes keep the tournament's slide 2 headline too, slide by slide", () => {
  const winner = candidate("Vous étiez au DIX30 dimanche ?", { secondHeadline: "Vous étiez 15 000" });
  const tournament: CreativeHookTournament = { promptVersion: "t", model: "m", judgeModel: "m", at: "", candidates: [{ ...candidate("Writer cover"), mechanism: "incumbent" }, winner], selectedIndex: 1, replaced: true };
  const rewritten = applyHookToDraft(draft, candidate("Style rewrite", { secondHeadline: "Slide 2 rewrite" }));
  const restored = keepTournamentCover(rewritten, tournament, [], () => false);
  assert.equal(restored.units[0].headline, winner.headline);
  assert.equal(restored.units[1].headline, "Vous étiez 15 000", "a style rewrite of slide 2 is undone");
  const onSecond: CreativeQualityIssue = { code: "UNSUPPORTED_CLAIM", severity: "blocker", unitOrder: 2, message: "m" };
  const factualSecond = keepTournamentCover(rewritten, tournament, [onSecond], () => true);
  assert.equal(factualSecond.units[1].headline, "Slide 2 rewrite", "a factual fix on slide 2 stands");
  assert.equal(factualSecond.units[0].headline, winner.headline, "and the cover is still restored");
  const onCover: CreativeQualityIssue = { code: "UNSUPPORTED_CLAIM", severity: "blocker", unitOrder: 1, message: "m" };
  const factualCover = keepTournamentCover(rewritten, tournament, [onCover], () => true);
  assert.equal(factualCover.units[0].headline, "Style rewrite");
  assert.equal(factualCover.units[1].headline, "Vous étiez 15 000");
});

test("choosing a cover changes slide 2 only while slide 2 is still the tournament's", () => {
  const tournament: CreativeHookTournament = {
    promptVersion: "t", model: "m", judgeModel: "m", at: "",
    candidates: [
      { ...candidate("Writer cover", { subheadline: "Writer context", secondHeadline: "Inside" }), mechanism: "incumbent" },
      candidate("Picked", { secondHeadline: "Picked slide 2" }),
    ],
    selectedIndex: 0,
    replaced: false,
  };
  assert.ok(tournamentOwnsSecondSlide(tournament, draft.units));
  assert.equal(hookOpeningForDraft(tournament, draft.units, tournament.candidates[1]).secondHeadline, "Picked slide 2");
  const edited = [draft.units[0], { ...draft.units[1], headline: "Editor's slide 2" }];
  assert.ok(!tournamentOwnsSecondSlide(tournament, edited));
  assert.equal(hookOpeningForDraft(tournament, edited, tournament.candidates[1]).secondHeadline, "", "the editor's slide 2 is kept");
  assert.ok(openingOnDraft(draft.units, tournament.candidates[0]), "the writer's opening is on the draft");
  assert.ok(!openingOnDraft(draft.units, candidate("Writer cover", { subheadline: "Writer context", secondHeadline: "Other" })), "same cover, different slide 2");
  const legacy: CreativeHookTournament = { ...tournament, candidates: [{ ...candidate("Writer cover"), mechanism: "incumbent" }, candidate("Old")] };
  assert.ok(!tournamentOwnsSecondSlide(legacy, draft.units), "tournaments before slide 2 pairing never change it");
});

test("a new cover cites its own facts, borrowing the writer's cover facts only as needed and within budget", () => {
  const twoFactCover = { ...draft, units: [{ ...draft.units[0], factIds: ["fact-1", "fact-2"] }, ...draft.units.slice(1)] } as GeneratedCreativeDraft;
  // Stand-in rules: a cover over two facts breaks the budget; "DIX30" needs fact-1.
  const issuesOf = (value: GeneratedCreativeDraft): CreativeQualityIssue[] => [
    ...(value.units[0].factIds.length > 2 ? [{ code: "FACT_BUDGET", severity: "blocker" as const, unitOrder: 1, message: "m" }] : []),
    ...(value.units[0].headline.includes("DIX30") && !value.units[0].factIds.includes("fact-1") ? [{ code: "UNSUPPORTED_NUMBER", severity: "blocker" as const, unitOrder: 1, message: "m" }] : []),
  ];
  assert.deepEqual(admitHookCandidate(twoFactCover, candidate("Mud at the park", { factIds: ["fact-3"] }), issuesOf).candidate.factIds, ["fact-3"], "its own fact is enough");
  const inherited = admitHookCandidate(twoFactCover, candidate("Au DIX30 dimanche", { factIds: ["fact-3"] }), issuesOf);
  assert.deepEqual(inherited.blockers, []);
  assert.deepEqual(inherited.candidate.factIds, ["fact-3", "fact-1"], "only the fact it needs is borrowed");
  const overBudget = admitHookCandidate(twoFactCover, candidate("Au DIX30 dimanche", { factIds: ["fact-3", "fact-4"] }), issuesOf);
  assert.ok(overBudget.blockers.length > 0, "no fact set satisfies both rules");
});

test("a list carousel's covers all promise the whole list; one item is never the cover", () => {
  const list = { itemCount: 8 };
  assert.match(buildHookGeneratorInstructions(list), /enumerated list of 8 items/);
  assert.match(buildHookGeneratorInstructions(list), /never make one item the cover's subject/);
  assert.match(buildHookRefineInstructions(list), /enumerated list of 8 items/);
  assert.match(buildHookJudgeInstructions(list), /scores below 60 on clarity and payoff/);
  assert.doesNotMatch(buildHookGeneratorInstructions(), /enumerated list/, "an ordinary carousel keeps its open field");
  // A verifiable draw (free, new, ending soon) is allowed from coverFacts and
  // preferred by the judge; a subset is counted only when each item is cited.
  assert.match(buildHookGeneratorInstructions(list), /Add one concrete draw when coverFacts give one/);
  assert.match(buildHookGeneratorInstructions(list), /only when coverFacts include a fact for every item in it/);
  assert.match(buildHookGeneratorInstructions(list), /Never put one item's price, venue or condition on the cover/);
  assert.match(buildHookJudgeInstructions(list), /concrete, verifiable draw — what is free, new or ending soon — scores higher on pull/);

  assert.equal(coverPromisesList({ headline: "Your weekend just got weirder: 8 things to do", subheadline: "Around Austin, Oct. 9–11" }, 8), true);
  assert.equal(coverPromisesList({ headline: "Eight ways to spend a weird Austin weekend" }, 8), true);
  assert.equal(coverPromisesList({ headline: "Huit sorties à Laval ce week-end" }, 8), true);
  assert.equal(coverPromisesList({ headline: "Dix-huit idées pour la fin de semaine" }, 18), true);
  assert.equal(coverPromisesList({ headline: "Free yoga can start your Sunday at Meanwhile" }, 8), false);
  assert.equal(coverPromisesList({ headline: "28 vendors and more this weekend" }, 8), false, "a different number is not the list's count");
});
