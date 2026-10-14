import assert from "node:assert/strict";
import test from "node:test";
import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  DRAFT2_LEVER_GROUPS, DRAFT2_LEVERS, FREE_LEVER, editedLevers, eligibleLevers, leverForModels, leverSpread, leverSupported, leversForModels, parsePlanLevers, stockPhraseIn,
} from "./draft2-levers.types";
import { chosenOpeningLever, openingVersions } from "./draft2-opening.types";
import { openingForClosing } from "./draft2-closing.types";
import { LEVERS_SKILL } from "./skills/levers";

const fact = (id: string, claim: string, kind: Draft2Fact["kind"] = "event"): Draft2Fact => ({ id, claim, evidence: claim, kind, status: "established", importance: 80 });
const ordinaryArc = { voice: { gravity: "ordinary" }, structure: { kind: "arc" } };

test("the catalog: the editor's 35 levers, numbered once, in seven groups; five are off by default", () => {
  assert.equal(DRAFT2_LEVERS.length, 35);
  assert.deepEqual(DRAFT2_LEVERS.map((lever) => lever.number), Array.from({ length: 35 }, (_, index) => index + 1));
  assert.equal(new Set(DRAFT2_LEVERS.map((lever) => lever.id)).size, 35);
  assert.ok(!DRAFT2_LEVERS.some((lever) => lever.id === FREE_LEVER), "free is not a lever: it is the absence of one");
  assert.ok(DRAFT2_LEVERS.every((lever) => DRAFT2_LEVER_GROUPS.some((group) => group.id === lever.group)));
  assert.deepEqual(DRAFT2_LEVERS.filter((lever) => lever.off).map((lever) => lever.number), [5, 8, 10, 12, 17], "concealment, a confession, an opinion, a first-person experiment, outrage");
});

test("the levers skill lists every lever on by default, by group, and none that is off", () => {
  for (const lever of DRAFT2_LEVERS) assert.equal(LEVERS_SKILL.text.includes(`- ${lever.id} (`), !lever.off, lever.id);
  for (const group of DRAFT2_LEVER_GROUPS) assert.ok(LEVERS_SKILL.text.includes(`### ${group.label}`), group.label);
  assert.match(LEVERS_SKILL.text, /never formulas/);
  assert.ok(LEVERS_SKILL.roleText?.["focus-planner"]?.includes("recentLevers"));
});

test("a story's levers come from its facts, its gravity and its structure; the judge checks the rest", () => {
  const words = [fact("f1", "The vote is open to every resident.")];
  const figures = [...words, fact("f2", "The vote closes on 16 October.", "date")];
  const plain = eligibleLevers(words, ordinaryArc);
  assert.ok(!plain.includes("stat") && !plain.includes("deadline-agency") && !plain.includes("social-proof"), "no figure in the facts: no statistic, no deadline, no count");
  assert.ok(!plain.includes("quick-list") && !plain.includes("signs"), "an arc: no list");
  assert.ok(!plain.some((id) => ["forbidden", "confession", "unpopular", "experiment", "outrage"].includes(id)), "off by default");
  const dated = eligibleLevers(figures, { ...ordinaryArc, structure: { kind: "list" } });
  assert.ok(dated.includes("deadline-agency") && dated.includes("stat") && dated.includes("quick-list"));
  assert.ok(eligibleLevers([fact("f3", "Seats cost 22 $.")], ordinaryArc).includes("stat"), "a claim written with a digit carries a figure");
  const grave = eligibleLevers(figures, { voice: { gravity: "grave" }, structure: { kind: "arc" } });
  assert.deepEqual(grave, ["stat", "comparison", "right-now", "heads-up", "authority", "common-mistake", "direct-benefit"], "a grave story keeps only the direct levers");
  assert.equal(leverSupported("deadline-agency", words), false, "the cover must cite the date it promises");
  assert.equal(leverSupported("deadline-agency", figures), true);
  assert.equal(leverSupported("pride", words), true, "the program checks only figures; the judge checks the rest");
});

test("stock formulas are found in any case, with or without accents, in English, French and Spanish", () => {
  assert.equal(stockPhraseIn("Ce que PERSONNE ne vous dit sur le budget"), "personne ne vous dit");
  assert.equal(stockPhraseIn("Vous n’allez pas croire ce vote"), "vous n'allez pas croire");
  assert.equal(stockPhraseIn("No creerás lo que votaron"), "no creeras");
  assert.equal(stockPhraseIn("You won't believe this vote"), "you won't believe");
  assert.equal(stockPhraseIn("Six projets, votre vote décide, jusqu'au 16 octobre"), undefined);
});

test("the first round spreads over the plan's levers: a third, a fifth each, at least a quarter free; free or none means all free", () => {
  const levers = { primary: "deadline-agency", alternatives: ["last-chance", "pride"], factIds: [], paidBy: "slide2" as const };
  assert.deepEqual(leverSpread(levers, 15), [{ lever: "deadline-agency", count: 5 }, { lever: "last-chance", count: 3 }, { lever: "pride", count: 3 }, { lever: FREE_LEVER, count: 4 }]);
  assert.deepEqual(leverSpread({ ...levers, alternatives: ["pride"] }, 15), [{ lever: "deadline-agency", count: 5 }, { lever: "pride", count: 3 }, { lever: FREE_LEVER, count: 7 }]);
  assert.deepEqual(leverSpread({ ...levers, primary: FREE_LEVER, alternatives: [] }, 15), [{ lever: FREE_LEVER, count: 15 }]);
  assert.deepEqual(leverSpread(undefined, 15), [{ lever: FREE_LEVER, count: 15 }]);
  for (const wanted of [3, 4, 5, 9, 15]) {
    const spread = leverSpread(levers, wanted);
    assert.equal(spread.reduce((sum, entry) => sum + entry.count, 0), wanted, `${wanted} in all`);
    assert.ok(spread.at(-1)!.lever === FREE_LEVER && spread.at(-1)!.count >= 1, `${wanted}: a free opening always competes`);
  }
});

test("the plan's levers: a primary the story cannot carry is asked for again; the rest is resolved quietly", () => {
  const known = new Set(["f1", "f2"]);
  const eligible = ["deadline-agency", "last-chance", "pride"];
  assert.deepEqual(
    parsePlanLevers({ primary: " Deadline-Agency ", alternatives: ["pride", "stat", "deadline-agency", "last-chance", "pride"], factIds: ["f2", "f9"], paidBy: "the end" }, { eligible, known }),
    { primary: "deadline-agency", alternatives: ["pride", "last-chance"], factIds: ["f2"], paidBy: "slide2" },
    "ids in any case; alternatives this story's, distinct, two at most; known facts; slide 2 when the position is not one",
  );
  assert.deepEqual(parsePlanLevers({ primary: "free", alternatives: ["pride"], factIds: [], paidBy: "last" }, { eligible, known }), { primary: FREE_LEVER, alternatives: [], factIds: [], paidBy: "last" }, "a free primary has no alternatives");
  assert.throws(() => parsePlanLevers({ primary: "stat" }, { eligible, known }), (error: Error) => error instanceof Draft2ResponseError && /deadline-agency, last-chance, pride/.test(error.message));
});

test("the editor's levers: any lever on by default, up to two alternatives, a position; Claude's facts stay while the primary does", () => {
  const current = { primary: "pride", alternatives: [], factIds: ["f1"], paidBy: "slide2" as const };
  assert.deepEqual(editedLevers({ primary: "pride", alternatives: ["nostalgia"], paidBy: "last" }, current), { primary: "pride", alternatives: ["nostalgia"], factIds: ["f1"], paidBy: "last" });
  assert.deepEqual(editedLevers({ primary: "stat", alternatives: [], paidBy: "slide2" }, current).factIds, [], "another primary: its facts are Claude's to find");
  assert.throws(() => editedLevers({ primary: "outrage", alternatives: [], paidBy: "slide2" }, current), (error: Error) => error instanceof Draft2InputError, "off by default");
  assert.throws(() => editedLevers({ primary: "pride", alternatives: ["stat", "myth", "twist"], paidBy: "slide2" }, current), /up to 2 other levers/);
  assert.throws(() => editedLevers({ primary: "pride", alternatives: [], paidBy: "cover" }, current), /kept on one of slide2, middle, penultimate, last/);
});

test("the steps after the plan read each lever with its promise, and the chosen opening's lever travels to the closing and the publication", () => {
  assert.deepEqual(leverForModels("deadline-agency"), { id: "deadline-agency", name: "Your call, until a date", promise: "You decide something, until a date", pays: "Slide 2: what you decide, how, until when" });
  assert.deepEqual(leverForModels(FREE_LEVER), { id: FREE_LEVER, name: "Free", promise: "No lever: the story's own tension" });
  assert.deepEqual(Object.keys(leversForModels({ primary: "pride", alternatives: [], factIds: [], paidBy: "slide2" })), ["primary", "paidBy"]);
  const candidate = { id: "c1", angle: "", cover: { headline: "h", subheadline: "s", factIds: ["f1"] }, slide2: { headline: "h2", body: "b", factIds: ["f2"] }, lever: "pride" };
  assert.deepEqual((openingForClosing(candidate) as { lever?: unknown }).lever, leverForModels("pride"));
  assert.equal((openingForClosing({ ...candidate, lever: undefined }) as { lever?: unknown }).lever, undefined, "an opening written before levers names none");
  const rounds = [{ round: 1, kind: "explore", candidates: [candidate, { ...candidate, id: "c2", lever: "free" }], mechanical: [] }] as never;
  assert.equal(openingVersions(rounds).length, 2);
  assert.equal(chosenOpeningLever({ winnerId: "c1", rounds }), "pride");
  assert.equal(chosenOpeningLever({ winnerId: "c1", editorChoiceId: "c2", rounds }), "free", "the editor's choice wins");
  assert.equal(chosenOpeningLever(null), undefined);
});
