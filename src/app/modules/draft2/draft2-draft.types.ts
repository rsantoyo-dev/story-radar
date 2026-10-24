import { closingShape, closingWordLimits, mechanicalClosingIssues, parseClosingCandidates, type Draft2Closing, type Draft2ClosingCandidate, type Draft2ClosingIssue, type Draft2ClosingOpening, type Draft2ClosingShape } from "./draft2-closing.types";
import { deckShape, deckWordLimits, mechanicalDeckIssues, parseDeckCandidates, shapeForModels, type Draft2Deck, type Draft2DeckCandidate, type Draft2DeckClosing, type Draft2DeckIssue, type Draft2DeckShape } from "./draft2-deck.types";
import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import { focusItemCount, spineBeatFactIds, spineMiddleFactIds, type Draft2FocusSnapshot } from "./draft2-focus.types";
import type { FunnelRole } from "./draft2-funnel";
import type { Draft2InventoryEntity } from "./draft2-inventory.types";
import { parseCaptionCandidates } from "./draft2-caption.types";
import { mechanicalOpeningIssues, OPENING_WORD_LIMITS, parseOpeningCandidates, type Draft2DraftExtras, type Draft2Opening, type Draft2OpeningCandidate, type Draft2OpeningIssue } from "./draft2-opening.types";
import type { Draft2Reader } from "./draft2-address.types";

/**
 * The v4 recipe's draft (2026-10-23, docs/features/draft2-v4.md): the whole
 * carousel's words in one call, stored as the Opening, the Closing and the
 * Deck the later steps already read. Pure: the request, the contract, the
 * program's checks on the whole draft and the runs it becomes.
 */

/** Three covers: the writer's own, and two on other levers for a real choice. */
export const DRAFT_COVERS = 3;
/** A slide's image intent: what is seen and why, tied to the slide's words; the visual script writes the direction from it. */
export const DRAFT_IMAGE_MAX_CHARACTERS = 400;

const text = { type: "string" };
const factIds = { type: "array", items: { type: "string" } };
/** A slide's words with its facts and, since the draft writes the whole carousel (2026-10-23), its image intent. */
const part = (fields: readonly string[]) => ({ type: "object", additionalProperties: false, required: [...fields, "factIds", "image"], properties: { ...Object.fromEntries(fields.map((field) => [field, text])), factIds, image: text } });

/** The writer's answer: the angle, three covers and the cover's image, slide 2, the middle slides and the closing (each with its image intent), and the caption with its first comment. */
export const DRAFT2_DRAFT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["angle", "covers", "coverImage", "slide2", "deck", "closing", "caption"],
  properties: {
    angle: text,
    covers: { type: "array", items: { type: "object", additionalProperties: false, required: ["headline", "subheadline", "factIds", "lever"], properties: { headline: text, subheadline: text, factIds, lever: text } } },
    coverImage: text,
    slide2: part(["headline", "body"]),
    deck: { type: "object", additionalProperties: false, required: ["slides"], properties: { slides: { type: "array", items: part(["headline", "body", "practical"]) } } },
    closing: { type: "object", additionalProperties: false, required: ["penultimate", "last"], properties: { penultimate: part(["headline", "body"]), last: part(["headline", "body", "cta"]) } },
    caption: { type: "object", additionalProperties: false, required: ["text", "hashtags", "factIds", "comment"], properties: { text, hashtags: { type: "array", items: text }, factIds, comment: text } },
  },
} as const;

/** What the draft follows: the focus as decided, its shapes and the program's numbers. */
export type DraftPlan = {
  focus: Draft2FocusSnapshot;
  closingShape: Draft2ClosingShape;
  /** The deck's shape as the spine plans it (slide 2 covering the spine's slide 2 facts); the deck's own is computed from the answer's slide 2. */
  plannedDeck: Draft2DeckShape;
  levers: readonly string[];
  emojis: number;
};

export function draftPlan(focus: Draft2FocusSnapshot, levers: readonly string[], emojis: number): DraftPlan {
  const values = focus.values;
  return {
    focus,
    closingShape: closingShape(values.structure.kind),
    plannedDeck: deckShape(values.structure, spineBeatFactIds(values.spine, "slide2") ?? [], values.spine),
    levers,
    emojis,
  };
}

/** The writer's request: the task, the deck it must fill, the closing's shape and every text's limits. */
export function draftRequest(plan: DraftPlan): Record<string, unknown> {
  return {
    task: "draft",
    coversWanted: DRAFT_COVERS,
    deck: shapeForModels(plan.plannedDeck),
    closingShape: plan.closingShape,
    emojis: plan.emojis,
    wordLimits: { opening: OPENING_WORD_LIMITS, deck: deckWordLimits(plan.plannedDeck), closing: closingWordLimits(plan.closingShape) },
  };
}

/** One more call with the program's findings: the whole draft again, those fixed. */
export function draftFixRequest(plan: DraftPlan, draft: string, findings: readonly string[]): Record<string, unknown> {
  let parsed: unknown = draft;
  try { parsed = JSON.parse(draft); } catch { /* the writer reads it as text */ }
  return { ...draftRequest(plan), task: "fix", draft: parsed, findings };
}

/** The draft as the three steps store it, with what it wrote beside the words. */
export type Draft = {
  angle: string;
  openings: Draft2OpeningCandidate[];
  closing: Draft2ClosingCandidate;
  deck: Draft2DeckCandidate;
  extras: Draft2DraftExtras;
};

/** A slide's image intent as the draft wrote it; missing or over its length is a response error. */
function imageIntent(value: unknown, slide: string): string {
  const intent = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!intent || intent.length > DRAFT_IMAGE_MAX_CHARACTERS) throw new Draft2ResponseError(`${slide} needs its image intent (what is seen and why), in 1 to ${DRAFT_IMAGE_MAX_CHARACTERS} characters`);
  return intent;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * The writer's answer as the steps' own candidates, each read by its own
 * parser (the same contract the funnels hold): the covers become openings c1,
 * c2, c3 sharing slide 2, the closing and the deck c1. A broken part is a
 * response error, asked for again with the rule.
 */
export function parseDraft(answer: string, shape: Draft2ClosingShape, ids: { round: number } = { round: 1 }): Draft {
  let body: Record<string, unknown>;
  try { body = record(JSON.parse(answer)); } catch { throw new Draft2ResponseError("The draft is not valid JSON"); }
  const angle = typeof body.angle === "string" && body.angle.trim() ? body.angle.trim().slice(0, 300) : "The whole carousel, drafted at once";
  const suffix = ids.round > 1 ? `.${ids.round}` : "";
  const covers = (Array.isArray(body.covers) ? body.covers : []).slice(0, DRAFT_COVERS).map(record);
  if (!covers.length) throw new Draft2ResponseError("The draft needs its covers: three, the first the one you would publish");
  const slide2 = record(body.slide2);
  const openings = parseOpeningCandidates(JSON.stringify({ candidates: covers.map((cover, index) => ({
    id: `c${index + 1}${suffix}`, angle,
    cover: { headline: cover.headline, subheadline: cover.subheadline, factIds: cover.factIds },
    slide2: { headline: slide2.headline, body: slide2.body, factIds: slide2.factIds },
    ...(typeof cover.lever === "string" && cover.lever.trim() ? { lever: cover.lever.trim() } : {}),
  })) }));
  if (!openings.length) throw new Draft2ResponseError("The draft's covers and slide 2 are incomplete");
  const closingBody = record(body.closing);
  const [closing] = parseClosingCandidates(JSON.stringify({ candidates: [{ id: `c1${suffix}`, angle, ...(shape === "two-slides" ? { penultimate: closingBody.penultimate } : {}), last: closingBody.last }] }), shape);
  const deckSlides = Array.isArray(record(body.deck).slides) ? record(body.deck).slides as unknown[] : [];
  const [deck] = parseDeckCandidates(JSON.stringify({ candidates: [{ id: `c1${suffix}`, angle, slides: deckSlides }] }));
  if (!closing || !deck) throw new Draft2ResponseError("The draft needs its closing and its middle slides");
  // Each slide's image intent, by the slide ids the carousel will have; the caption through the caption's own parser.
  const images = [
    { slide: "cover", intent: imageIntent(body.coverImage, "The cover") },
    { slide: "slide2", intent: imageIntent(slide2.image, "Slide 2") },
    ...deck.slides.map((_, index) => ({ slide: `s${index + 1}`, intent: imageIntent(record(deckSlides[index]).image, `Middle slide ${index + 1}`) })),
    ...(shape === "two-slides" ? [{ slide: "penultimate", intent: imageIntent(record(closingBody.penultimate).image, "The penultimate slide") }] : []),
    { slide: "last", intent: imageIntent(record(closingBody.last).image, "The last slide") },
  ];
  let caption: ReturnType<typeof parseCaptionCandidates>[number] | undefined;
  try { [caption] = parseCaptionCandidates(JSON.stringify({ candidates: [{ id: "d1", angle, ...record(body.caption) }] })); } catch (error) { if (!(error instanceof Draft2ResponseError)) throw error; }
  if (!caption) throw new Draft2ResponseError("The draft needs its caption: the text, 5 to 8 hashtags, the facts it rests on and the first comment");
  return { angle, openings, closing, deck, extras: { images, caption: { text: caption.text, hashtags: caption.hashtags, factIds: caption.factIds, comment: caption.comment ?? "" } } };
}

/** The context the program checks the draft with, as each step's funnel checks its own part. */
export type DraftChecks = {
  facts: readonly Draft2Fact[];
  reader?: Draft2Reader;
  entities?: readonly Pick<Draft2InventoryEntity, "name" | "kind" | "factIds">[];
};

/** The program's findings on a draft, part by part, with the cover the draft goes on with. */
export type DraftFindings = {
  chosenId: string;
  opening: Draft2OpeningIssue[];
  closing: Draft2ClosingIssue[];
  deck: Draft2DeckIssue[];
  /** The closing's view of the chosen opening and the deck's of the closing, as the runs record them. */
  openingSnapshot: Draft2ClosingOpening;
  closingSnapshot: Draft2DeckClosing;
  deckShape: Draft2DeckShape;
};

/**
 * Every part checked as its funnel checks it (draft2-opening.ts,
 * draft2-closing.ts, draft2-deck.ts setups). The cover the draft goes on with
 * is the first one the program finds nothing on, else the writer's first.
 */
export function draftFindings(draft: Draft, plan: DraftPlan, checks: DraftChecks): DraftFindings {
  const values = plan.focus.values;
  const itemCount = focusItemCount(values);
  const opening = mechanicalOpeningIssues(draft.openings, checks.facts, { itemCount, eligibleLevers: plan.levers, guards: values.guards, reader: checks.reader, beats: { cover: spineBeatFactIds(values.spine, "cover"), slide2: spineBeatFactIds(values.spine, "slide2") } });
  const clean = draft.openings.find((candidate) => !opening.some((issue) => issue.candidateId === candidate.id));
  const chosen = clean ?? draft.openings[0];
  const openingSnapshot: Draft2ClosingOpening = { id: chosen.id, cover: chosen.cover, slide2: chosen.slide2, ...(chosen.lever ? { lever: chosen.lever } : {}) };
  const closing = mechanicalClosingIssues([draft.closing], checks.facts, { opening: openingSnapshot, shape: plan.closingShape, grave: values.voice.gravity === "grave", itemCount, emojis: plan.emojis, reader: checks.reader, beats: { penultimate: spineBeatFactIds(values.spine, "penultimate"), last: spineBeatFactIds(values.spine, "last") } });
  const closingSnapshot: Draft2DeckClosing = { id: draft.closing.id, ...(draft.closing.penultimate ? { penultimate: draft.closing.penultimate } : {}), last: draft.closing.last };
  const shape = deckShape(values.structure, chosen.slide2.factIds, values.spine);
  const deck = mechanicalDeckIssues([draft.deck], checks.facts, { opening: openingSnapshot, closing: closingSnapshot, shape, itemCount, emojis: plan.emojis, reader: checks.reader, entities: checks.entities, guards: values.guards, beats: spineMiddleFactIds(values.spine) });
  return { chosenId: chosen.id, opening: opening.filter((issue) => issue.candidateId === chosen.id), closing, deck, openingSnapshot, closingSnapshot, deckShape: shape };
}

/** How many findings a draft carries on the parts it goes on with: the program keeps the draft with fewer. */
export const findingCount = (findings: DraftFindings): number => findings.opening.length + findings.closing.length + findings.deck.length;

/** The findings as the writer reads them in the fix call, each with its slide. */
export function findingLines(findings: DraftFindings): string[] {
  return [
    ...findings.opening.map((issue) => `${issue.part ?? "opening"} (${findings.chosenId}): ${issue.detail}`),
    ...findings.closing.map((issue) => `${issue.part ?? "closing"}: ${issue.detail}`),
    ...findings.deck.map((issue) => `middle slides: ${issue.detail}`),
  ];
}

/** One round of a run the draft writes. */
type DraftRound<C, I> = { round: number; kind: "explore" | "refine"; candidates: C[]; mechanical: I[]; at: string };

/** The Opening, the Closing and the Deck as the draft stores them: one round each (two when the fix call stood), the chosen versions marked. */
export function draftRuns({ rounds, plan, writer, at }: {
  rounds: readonly { draft: Draft; findings: DraftFindings }[];
  plan: DraftPlan;
  writer: FunnelRole;
  at: string;
}): { opening: Draft2Opening; closing: Draft2Closing; deck: Draft2Deck } {
  const kept = rounds.reduce((best, entry) => findingCount(entry.findings) < findingCount(best.findings) ? entry : best, rounds[0]);
  const note = (count: number, noun: string) => count ? `The program found ${count} issue${count === 1 ? "" : "s"} on the drafted ${noun}; the whole-carousel review reads it next, and the editor may edit it by hand.` : undefined;
  const run = <C, I>(made: (entry: (typeof rounds)[number]) => { candidates: C[]; mechanical: I[] }) => rounds.map((entry, index): DraftRound<C, I> => ({ round: index + 1, kind: index === 0 ? "explore" : "refine", ...made(entry), at }));
  const base = { writer, pipeline: "v4" as const, plannedRounds: rounds.length };
  const openingCount = kept.findings.opening.length;
  const closingCount = kept.findings.closing.length;
  const deckCount = kept.findings.deck.length;
  const opening: Draft2Opening = {
    ...base,
    status: openingCount ? "needs-review" : "ready",
    rounds: run((entry) => ({ candidates: entry.draft.openings, mechanical: entry.findings.opening })),
    candidates: kept.draft.openings,
    winnerId: kept.findings.chosenId,
    focus: plan.focus,
    draft: kept.draft.extras,
    ...(note(openingCount, "opening") ? { error: note(openingCount, "opening") } : {}),
  } as Draft2Opening;
  const closing: Draft2Closing = {
    ...base,
    status: closingCount ? "needs-review" : "ready",
    rounds: run((entry) => ({ candidates: [entry.draft.closing], mechanical: entry.findings.closing })),
    candidates: [kept.draft.closing],
    winnerId: kept.draft.closing.id,
    opening: kept.findings.openingSnapshot,
    focus: plan.focus,
    shape: plan.closingShape,
    ...(note(closingCount, "closing") ? { error: note(closingCount, "closing") } : {}),
  } as Draft2Closing;
  const deck: Draft2Deck = {
    ...base,
    status: deckCount ? "needs-review" : "ready",
    rounds: run((entry) => ({ candidates: [entry.draft.deck], mechanical: entry.findings.deck })),
    candidates: [kept.draft.deck],
    winnerId: kept.draft.deck.id,
    opening: kept.findings.openingSnapshot,
    closing: kept.findings.closingSnapshot,
    focus: plan.focus,
    shape: kept.findings.deckShape,
    ...(note(deckCount, "middle slides") ? { error: note(deckCount, "middle slides") } : {}),
  } as Draft2Deck;
  return { opening, closing, deck };
}
