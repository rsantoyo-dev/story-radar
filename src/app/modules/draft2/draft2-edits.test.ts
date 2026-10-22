import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as focusTypes from "./draft2-focus.types";
import * as openingTypes from "./draft2-opening.types";
import * as closingTypes from "./draft2-closing.types";
import * as deckTypes from "./draft2-deck.types";
import * as captionTypes from "./draft2-caption.types";
import * as imagesTypes from "./draft2-images.types";
import * as reviewTypes from "./draft2-review.types";
import * as editsTypes from "./draft2-edits.types";
import { carouselSlides } from "./draft2-visual.types";
import { loadInSandbox } from "./draft2-test-sandbox";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const json = (value: unknown) => JSON.stringify(value);

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The Vieux-Longueuil library reopens Saturday.", evidence: "reopens Saturday", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "Admission is free for children under twelve.", evidence: "free for children under twelve", kind: "event", status: "established", importance: 70 },
  { id: "f3", claim: "The roof was rebuilt first, the mayor said.", evidence: "the roof was rebuilt first", kind: "event", status: "attributed", attribution: "the mayor", importance: 60 },
];
const VALUES: focusTypes.Draft2FocusValues = {
  line: null, audience: "Families in Vieux-Longueuil", framing: "explainer", readerConsequence: null, structure: { kind: "arc", itemFactIds: [] }, goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 40, energy: 60, optimism: 70, provocation: 20 }, direction: "Lead with the reopening.", visualDirection: "Doors and rooms.",
};
const FOCUS: focusTypes.Draft2FocusSnapshot = { version: 2, values: VALUES };
const profile = { name: "Salut Longueuil", language: "French", allowEmojis: true, maxEmojis: 3, readerAddress: "informal" };

const opening = { id: "c1", angle: "The doors", cover: { headline: "La bibliothèque rouvre ses portes", subheadline: "Samedi, dans le Vieux-Longueuil.", factIds: ["f1"] }, slide2: { headline: "Gratuit pour les enfants", body: "Moins de douze ans, l'entrée est gratuite.", factIds: ["f2"] } };
const closing = { id: "k1", angle: "The roof", penultimate: { headline: "Le toit d'abord", body: "Le toit a été refait en premier, selon le maire.", factIds: ["f3"] }, last: { headline: "On se voit samedi", body: "Viens avec les enfants.", cta: "Suis Salut Longueuil pour les sorties.", factIds: ["f1"] } };
const deck = { id: "d1", angle: "Rooms", slides: [{ headline: "Une salle de lecture", body: "Des tables calmes près des fenêtres.", practical: "", factIds: ["f1"] }, { headline: "Un atelier", body: "Des outils pour les petites mains.", practical: "", factIds: ["f2"] }] };
const run = <C extends { id: string }>(candidate: C, extra: Record<string, unknown>) => ({ status: "ready", winnerId: candidate.id, candidates: [candidate], rounds: [{ round: 1, candidates: [candidate], mechanical: [], at: "t", evaluation: { verdict: "accept", winnerId: candidate.id, scores: [], issues: [], suggestions: [], summary: "x", proposals: [{ ...candidate, id: "p1" }] } }], focus: FOCUS, ...extra });
const openingSnapshot = { id: opening.id, cover: opening.cover, slide2: opening.slide2 };
const closingSnapshot = { id: closing.id, penultimate: closing.penultimate, last: closing.last };
const carousel = carouselSlides(openingSnapshot, deck, closingSnapshot);
const script = { id: "v1", angle: "x", slides: carousel.map((slide) => ({ slide: slide.slide, direction: `Une image pour ${slide.slide}.`, need: "generic-illustration", references: [], characterIds: [] })) };
const caption = { id: "c2", angle: "x", text: "La bibliothèque rouvre samedi.\n\nViens avec les enfants.", hashtags: ["Longueuil", "Bibliotheque"], factIds: ["f1"] };

type Row = Record<string, unknown> & { updatedAt: Date };
function harness({ session, active = false }: { session?: Record<string, unknown>; active?: boolean } = {}) {
  let row: Row = {
    id: sessionId, topicId, storyId, step: "caption", status: "ready", facts, error: null, trace: [], updatedAt: new Date(),
    opening: run(opening, {}),
    closing: run(closing, { opening: openingSnapshot, shape: "two-slides" }),
    deck: run(deck, { opening: openingSnapshot, closing: closingSnapshot, shape: { kind: "arc", min: 2, max: 5, items: [] } }),
    review: { status: "ready", version: 1, openingId: "c1", closingId: "k1", deckId: "d1", carousel, editor: { patches: [] } },
    visual: { ...run(script, {}), carousel, openingId: "c1", closingId: "k1", deckId: "d1" },
    images: { status: "ready", slides: [{ slide: "cover", label: "Cover", order: 1, need: "generic-illustration", material: [], characterIds: [], attempts: [{ version: 1, kind: "generate", status: "generated", sha256: "a".repeat(64) }] }] },
    caption: run(caption, { rules: { emojis: 3, ctaStyle: "", cta: "", grave: false }, credits: [], mentions: [] }),
    ...session,
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types, "./draft2-funnel": funnel, "./draft2-focus.types": focusTypes, "./draft2-opening.types": openingTypes, "./draft2-closing.types": closingTypes,
    "./draft2-deck.types": deckTypes, "./draft2-caption.types": captionTypes, "./draft2-images.types": imagesTypes, "./draft2-review.types": reviewTypes, "./draft2-edits.types": editsTypes,
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "./draft2-session.repository": {
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      activeDraft2Session: async () => active ? row : undefined,
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch }; return row; },
    },
  };
  const exports = loadInSandbox("./draft2-edits.ts", mocks, { Date }) as Record<string, (...args: unknown[]) => unknown>;
  const edit = (input: unknown) => exports.editDraft2({ topicId, sessionId, input: editsTypes.parseDraft2EditInput(input) }) as Promise<Row>;
  return { edit, row: () => row };
}
const chosen = (row: Row, step: string) => {
  const stepRun = row[step] as funnel.FunnelRun;
  return funnel.funnelVersions(stepRun.rounds).find((version) => version.candidate.id === (stepRun.editorChoiceId ?? stepRun.winnerId))!.candidate as Record<string, unknown>;
};

test("what the canvas sends is checked: the step, the slide, the field and the text; an own opening needs a headline, and all of it to be used as it is", () => {
  assert.deepEqual(editsTypes.parseDraft2EditInput({ action: "edit", step: "deck", slide: "s2", field: "body", text: "  Des outils.  " }), { action: "edit", step: "deck", slide: "s2", field: "body", text: "Des outils." });
  assert.throws(() => editsTypes.parseDraft2EditInput({ action: "edit", step: "focus", slide: "cover", field: "headline", text: "x" }), /step must be one of/);
  assert.throws(() => editsTypes.parseDraft2EditInput({ action: "edit", step: "opening", slide: "cover", field: "headline", text: "  " }), /cannot be left empty/);
  assert.equal((editsTypes.parseDraft2EditInput({ action: "edit", step: "deck", slide: "s1", field: "practical", text: "" }) as { text: string }).text, "", "a practical line may be emptied");
  assert.equal((editsTypes.parseDraft2EditInput({ action: "edit", step: "caption", slide: "post", field: "comment", text: "" }) as { text: string }).text, "", "an emptied first comment posts none");
  assert.equal((editsTypes.parseDraft2EditInput({ action: "edit", step: "caption", slide: "post", field: "comment", text: "x".repeat(900) }) as { text: string }).text.length, 900, "a first comment of 95 French words fits");
  assert.throws(() => editsTypes.parseDraft2EditInput({ action: "edit", step: "caption", slide: "post", field: "text", text: "x".repeat(2_201) }), /under 2,200 characters/);
  assert.throws(() => editsTypes.parseDraft2EditInput({ action: "own-opening", mode: "use", cover: { headline: "Mon hook" } }), /write the cover's subheadline and slide 2 too/);
  assert.equal((editsTypes.parseDraft2EditInput({ action: "own-opening", mode: "develop", cover: { headline: "Mon hook" } }) as { opening: { cover: { headline: string } } }).opening.cover.headline, "Mon hook");
  assert.throws(() => editsTypes.parseDraft2EditInput({ action: "own-opening", mode: "develop", cover: { headline: "" } }), /at least the cover's headline/);
  assert.deepEqual(editsTypes.parseHashtags("#Brossard, #DIX30 brossard  Houston"), ["Brossard", "DIX30", "Houston"]);
});

test("a text of the chosen opening changed by hand: in place, in the copies the closing, the deck, the review and the visual script keep, with what the program finds; then undone", async () => {
  const h = harness();
  const edited = await h.edit({ action: "edit", step: "opening", slide: "cover", field: "headline", text: "Ta bibliothèque rouvre samedi" });
  assert.equal(chosen(edited, "opening").id, "c1");
  assert.equal((chosen(edited, "opening").cover as { headline: string }).headline, "Ta bibliothèque rouvre samedi");
  const copies = [(edited.closing as { opening: { cover: { headline: string } } }).opening.cover.headline, (edited.deck as { opening: { cover: { headline: string } } }).opening.cover.headline,
    (edited.review as { carousel: { slide: string; headline: string }[] }).carousel[0].headline, (edited.visual as { carousel: { headline: string }[] }).carousel[0].headline];
  assert.deepEqual(copies, Array(4).fill("Ta bibliothèque rouvre samedi"), "every later copy follows");
  const [record] = (edited.opening as funnel.FunnelRun).edits!;
  assert.deepEqual([record.id, record.candidateId, record.before, record.after], ["edit1", "c1", "La bibliothèque rouvre ses portes", "Ta bibliothèque rouvre samedi"]);
  assert.ok(record.findings.includes("The image of this slide shows the earlier words: make another image to show these."), "the image already made keeps the old words");
  await assert.rejects(h.edit({ action: "edit", step: "opening", slide: "cover", field: "headline", text: "Ta bibliothèque rouvre samedi" }), /already says that/);
  const undone = await h.edit({ action: "undo", step: "opening", editId: "edit1" });
  assert.equal((chosen(undone, "opening").cover as { headline: string }).headline, "La bibliothèque rouvre ses portes");
  assert.equal((undone.review as { carousel: { headline: string }[] }).carousel[0].headline, "La bibliothèque rouvre ses portes");
  assert.ok((undone.opening as funnel.FunnelRun).edits![0].undoneAt);
  await assert.rejects(h.edit({ action: "undo", step: "opening", editId: "edit1" }), /already undone/);
});

test("the program's findings come back with a change and never block it: the other form of address, a number the facts do not state", async () => {
  const h = harness();
  const edited = await h.edit({ action: "edit", step: "closing", slide: "last", field: "body", text: "Pour vos sorties, venez avec 3 enfants." });
  const [record] = (edited.closing as funnel.FunnelRun).edits!;
  assert.equal((chosen(edited, "closing").last as { body: string }).body, "Pour vos sorties, venez avec 3 enfants.", "saved all the same: the editor has the last word");
  assert.ok(record.findings.some((finding) => /addresses its reader as "tu"/.test(finding)));
  assert.ok(record.findings.some((finding) => /3 is not stated by the facts/.test(finding)));
  assert.equal((edited.deck as { closing: { last: { body: string } } }).closing.last.body, "Pour vos sorties, venez avec 3 enfants.", "the deck's copy of the closing follows");
});

test("the deck, the caption and the visual script are edited the same way; the caption's hashtags as the editor types them", async () => {
  const h = harness();
  const deckEdit = await h.edit({ action: "edit", step: "deck", slide: "s2", field: "body", text: "Des outils faits pour les petites mains." });
  assert.equal(((chosen(deckEdit, "deck").slides as { body: string }[])[1]).body, "Des outils faits pour les petites mains.");
  assert.equal((deckEdit.visual as { carousel: { slide: string; text: string }[] }).carousel.find((slide) => slide.slide === "s2")!.text, "Des outils faits pour les petites mains.");
  const tags = await h.edit({ action: "edit", step: "caption", slide: "post", field: "hashtags", text: "#Longueuil, #VieuxLongueuil #longueuil" });
  assert.deepEqual(chosen(tags, "caption").hashtags, ["Longueuil", "VieuxLongueuil"]);
  const comment = await h.edit({ action: "edit", step: "caption", slide: "post", field: "comment", text: "La bibliothèque rouvre samedi. Quel livre tes enfants vont-ils choisir en premier?" });
  assert.equal(chosen(comment, "caption").comment, "La bibliothèque rouvre samedi. Quel livre tes enfants vont-ils choisir en premier?", "the first comment, by hand");
  const removed = await h.edit({ action: "edit", step: "caption", slide: "post", field: "comment", text: "" });
  assert.equal("comment" in chosen(removed, "caption"), false, "emptied: the post has none");
  const direction = await h.edit({ action: "edit", step: "visual", slide: "cover", field: "direction", text: "Les portes ouvertes, de face, au matin." });
  assert.equal(((chosen(direction, "visual").slides as { slide: string; direction: string }[])[0]).direction, "Les portes ouvertes, de face, au matin.");
  assert.ok((direction.visual as funnel.FunnelRun).edits![0].findings.some((finding) => /made from the earlier direction/.test(finding)));
  await assert.rejects(h.edit({ action: "edit", step: "deck", slide: "s9", field: "body", text: "x" }), /has no body on s9/);
});

test("the editor's own opening, used as it is or set beside the judge's proposals to be developed in one more round", async () => {
  const h = harness();
  const used = await h.edit({ action: "own-opening", mode: "use", cover: { headline: "Ta bibliothèque est de retour", subheadline: "Samedi." }, slide2: { headline: "Gratuit", body: "Pour les moins de douze ans." } });
  const openingRun = used.opening as funnel.FunnelRun & { editorChoiceId: string };
  assert.equal(openingRun.editorChoiceId, "e1");
  assert.equal(json([chosen(used, "opening").byEditor, (chosen(used, "opening").cover as { headline: string }).headline]), json([true, "Ta bibliothèque est de retour"]));
  assert.ok(openingRun.rounds.at(-1)!.mechanical.some((issue) => issue.candidateId === "e1" && issue.code === "NO_FACTS"), "what the program finds on it is shown");
  const developed = await harness().edit({ action: "own-opening", mode: "develop", cover: { headline: "Deux ans plus tard, les portes s'ouvrent" } });
  const developing = developed.opening as funnel.FunnelRun;
  const idea = developing.rounds.at(-1)!.evaluation!.proposals!.at(-1)!;
  assert.equal(json([idea.id, idea.byEditor, developing.status]), json(["p2", true, "needs-review"]), "a proposal of its own, after the judge's; the run can take one more round");
});

test("nothing is edited while a run goes, or before the step has a chosen version", async () => {
  await assert.rejects(harness({ active: true }).edit({ action: "edit", step: "deck", slide: "s1", field: "headline", text: "x" }), (error: Error) => error instanceof types.Draft2BusyError);
  await assert.rejects(harness({ session: { deck: { ...run(deck, {}), status: "paused" } } }).edit({ action: "edit", step: "deck", slide: "s1", field: "headline", text: "x" }), /being written/);
  await assert.rejects(harness({ session: { caption: null } }).edit({ action: "edit", step: "caption", slide: "post", field: "text", text: "x" }), /no caption to edit yet/);
  await assert.rejects(harness({ session: { deck: { ...run(deck, {}), winnerId: undefined } } }).edit({ action: "edit", step: "deck", slide: "s1", field: "headline", text: "x" }), /Choose a version of the deck/);
});

test("a hand edit cites the verified facts that state its numbers, so the slide carries its sources and the number is no finding; an undo takes them off again", async () => {
  const line = { id: "f4", claim: "The police line is 450 3599222.", evidence: "450 3599222", kind: "event", status: "established", importance: 50 };
  const disputed = { id: "f5", claim: "Doors open at 9.", evidence: "", kind: "event", status: "disputed", importance: 50 };
  const h = harness({ session: { facts: [...facts, line, disputed] } });
  const edited = await h.edit({ action: "edit", step: "closing", slide: "last", field: "body", text: "Un doute ? Appelle le 450 3599222, dès 9 h." });
  const [record] = (edited.closing as funnel.FunnelRun).edits!;
  assert.equal(json([(chosen(edited, "closing").last as { factIds: string[] }).factIds, record.citedFactIds]), json([["f1", "f4"], ["f4"]]), "the line's fact is cited with the edit; a disputed fact never is");
  assert.ok(record.findings.some((finding) => /9 is not stated by the facts/.test(finding)), "the hour no verified fact gives stays a finding");
  assert.ok(!record.findings.some((finding) => /450/.test(finding)), "the line is no finding");
  assert.equal(json((edited.deck as { closing: { last: { factIds: string[] } } }).closing.last.factIds), json(["f1", "f4"]), "the deck's copy of the closing follows");
  const undone = await h.edit({ action: "undo", step: "closing", editId: "edit1" });
  assert.equal(json((chosen(undone, "closing").last as { factIds: string[] }).factIds), json(["f1"]));
  const deckEdit = await h.edit({ action: "edit", step: "deck", slide: "s1", field: "body", text: "Des tables calmes, et une ligne au 450 3599222." });
  assert.equal(json(((chosen(deckEdit, "deck").slides as { factIds: string[] }[])[0]).factIds), json(["f1", "f4"]), "a deck slide cites the same way");
  const tags = await h.edit({ action: "edit", step: "caption", slide: "post", field: "hashtags", text: "#Longueuil450" });
  assert.equal(json((chosen(tags, "caption") as { factIds: string[] }).factIds), json(["f1"]), "hashtags are not read for numbers");
});
