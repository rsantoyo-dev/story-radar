import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import { numbersIn, statedNumbers, type FunnelRole } from "./draft2-funnel";
import type { Draft2CarouselSlide } from "./draft2-visual.types";
import type { Draft2OpeningCandidate } from "./draft2-opening.types";
import type { Draft2ClosingCandidate } from "./draft2-closing.types";
import type { Draft2DeckCandidate } from "./draft2-deck.types";

/**
 * Review, the step between the Deck and the visual script: the whole
 * carousel's words read from the cover to the last slide, first by a reader
 * (a member of the publication's audience, on a phone, with no rubric: would
 * they swipe, what do they think after each slide, would they follow or
 * comment) and then by an editor who reads the reader's reactions beside the
 * slides and names what works, what fails and the smallest change that fixes
 * it, slide by slide. A patch names the exact text it replaces; the program
 * refuses one that no longer matches the slide or that breaks the owning
 * step's rules, and applying one edits the chosen candidate in place while
 * the review keeps the text it replaced, so an undo restores it. Everything
 * here is pure: contracts, schemas, parsers and the patched candidates.
 */
export const REVIEW_CRITERIA = ["tension", "clarity", "grace", "flow", "turn", "truth"] as const;
export type Draft2ReviewCriterion = (typeof REVIEW_CRITERIA)[number];
export const REVIEW_MAX_PATCHES = 6;
export const REVIEW_MAX_STRENGTHS = 6;
export const REVIEW_PATCH_MAX_CHARACTERS = 400;
export const REVIEW_LINE_MAX_CHARACTERS = 300;
export const REVIEW_SUMMARY_MAX_CHARACTERS = 600;
/** The slide texts a patch may replace; the parser keeps only those a slide has. */
export const REVIEW_PATCH_FIELDS = ["headline", "subheadline", "body", "practical", "cta"] as const;
export type Draft2ReviewPatchField = (typeof REVIEW_PATCH_FIELDS)[number];
/**
 * Why a patch changes a text. The review fixes what must change: a claim the
 * facts do not carry (truth), a word or a fact repeated without purpose
 * (repetition), a detail the reader needs that the facts give (detail).
 * Anything else is style: proposed for the editor, never applied by the
 * autopilot.
 */
export const REVIEW_PATCH_KINDS = ["truth", "repetition", "detail", "style"] as const;
export type Draft2ReviewPatchKind = (typeof REVIEW_PATCH_KINDS)[number];
/** The kinds the autopilot applies on its own; a style patch waits for the editor. */
export const REVIEW_NECESSARY_KINDS: readonly Draft2ReviewPatchKind[] = ["truth", "repetition", "detail"];
/** The step whose chosen candidate a slide belongs to. */
export type Draft2ReviewOwner = "opening" | "closing" | "deck";

export type Draft2ReviewReaction = { slide: string; swipe: boolean; thought: string };
export type Draft2ReviewReader = {
  reactions: Draft2ReviewReaction[];
  follow: boolean;
  /** The comment the reader would leave, in their words; empty when they would not comment. */
  comment: string;
  share: boolean;
  /** The slide where the reader would have stopped, if any. */
  stoppedAt: string | null;
  verdict: string;
};
export type Draft2ReviewScore = Record<Draft2ReviewCriterion, number> & { overall: number };
export type Draft2ReviewPatchStatus = "proposed" | "applied" | "declined" | "refused";
export type Draft2ReviewPatch = {
  id: string;
  slide: string;
  owner: Draft2ReviewOwner;
  field: Draft2ReviewPatchField;
  /** Why it changes the text; absent on a patch written before kinds (read as style). */
  kind?: Draft2ReviewPatchKind;
  /** The slide's text as the review read it; an apply checks it still is. */
  before: string;
  after: string;
  reason: string;
  status: Draft2ReviewPatchStatus;
  /** Why the program refused it, or what an apply found. */
  note?: string;
  appliedAt?: string;
  appliedBy?: "editor" | "autopilot";
};
export type Draft2ReviewEditor = {
  scores: Draft2ReviewScore;
  verdict: "ready" | "patch";
  summary: string;
  /** What works and must survive any change, in the editor's words. */
  strengths: string[];
  patches: Draft2ReviewPatch[];
};
export type Draft2Review = {
  status: "running" | "ready" | "failed";
  /** One more on every run, apply, decline and undo. */
  version: number;
  /** The versions the review read: the chosen opening, closing and deck, and the focus they followed. */
  openingId: string;
  closingId: string;
  deckId: string;
  focusVersion: number;
  /** The carousel's words as the review read them. */
  carousel: Draft2CarouselSlide[];
  reader?: Draft2ReviewReader;
  readerBy?: FunnelRole;
  editor?: Draft2ReviewEditor;
  editorBy?: FunnelRole;
  error?: string;
  startedAt: string;
  updatedAt: string;
  /** Earlier reviews on this session, oldest first, without the carousel they read. */
  previousRuns?: Draft2ReviewRun[];
};
export type Draft2ReviewRun = Omit<Draft2Review, "previousRuns" | "carousel">;

const score = { type: "integer", minimum: 1, maximum: 100 };

/** The reader's answer: one reaction per slide, and what they would do at the end. */
export const DRAFT2_READER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    reactions: {
      type: "array",
      items: { type: "object", properties: { slide: { type: "string" }, swipe: { type: "boolean" }, thought: { type: "string" } }, required: ["slide", "swipe", "thought"], additionalProperties: false },
    },
    follow: { type: "boolean" },
    comment: { type: "string" },
    share: { type: "boolean" },
    stoppedAt: { type: ["string", "null"] },
    verdict: { type: "string" },
  },
  required: ["reactions", "follow", "comment", "share", "stoppedAt", "verdict"],
  additionalProperties: false,
};

/** The editor's answer: the scores, the verdict, what works, and the patches (no enum inside an array: the parser checks slide and field). */
export const DRAFT2_REVIEW_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: { ...Object.fromEntries(REVIEW_CRITERIA.map((criterion) => [criterion, score])), overall: score },
      required: [...REVIEW_CRITERIA, "overall"],
      additionalProperties: false,
    },
    verdict: { type: "string", enum: ["ready", "patch"] },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    patches: {
      type: "array",
      items: {
        type: "object",
        // The kind is a string the parser checks: no enum inside an array, for Claude's compiled grammar.
        properties: { slide: { type: "string" }, field: { type: "string" }, kind: { type: "string" }, before: { type: "string" }, after: { type: "string" }, reason: { type: "string" } },
        required: ["slide", "field", "kind", "before", "after", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["scores", "verdict", "summary", "strengths", "patches"],
  additionalProperties: false,
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number): string | undefined => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
const parseObject = (answer: string, what: string): Record<string, unknown> => {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError(`The ${what} answer is not valid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Draft2ResponseError(`The ${what} answer is not an object`);
  return parsed as Record<string, unknown>;
};

/** A line cut to a limit (the reader knows no rules: a long line is kept, not dropped), one space between words. */
const clip = (value: unknown, max: number): string => {
  const line = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
};
const normal = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
/** A slide named by its position: "3", "#3", "slide 3", "slide 3 of 7", "3/7", in English, French or Spanish. */
const POSITION_NAME = /^(?:slide|diapo(?:sitiva)?|#|n[°o]\.?)?\s*(\d{1,2})(?:\s*(?:\/|of|de|sur)\s*\d{1,2})?$/;

/**
 * The carousel slide a model named, however it named it: by its id (cover,
 * slide2, s1…, in any case), by its label ("Slide 3"), by its position ("3",
 * "#3", "slide 3 of 7": the third slide) or by its headline. Undefined when
 * nothing fits. A cheap reader names slides its own way; the meaning is clear.
 */
export function resolveSlide(name: unknown, carousel: readonly Pick<Draft2CarouselSlide, "slide" | "label" | "headline">[]): string | undefined {
  if (typeof name !== "string") return undefined;
  const wanted = normal(name);
  if (!wanted) return undefined;
  const found = carousel.find((slide) => normal(slide.slide) === wanted) ?? carousel.find((slide) => normal(slide.label) === wanted) ?? carousel.find((slide) => normal(slide.headline) === wanted);
  if (found) return found.slide;
  const position = POSITION_NAME.exec(wanted);
  return position ? carousel[Number(position[1]) - 1]?.slide : undefined;
}

/**
 * The reader's answer as the review keeps it: a reaction per known slide in
 * the carousel's order, the slides resolved however the reader named them (a
 * reader who named none but answered once per slide is read in order); long
 * lines are cut, never dropped.
 */
export function parseReaderAnswer(answer: string, carousel: readonly Pick<Draft2CarouselSlide, "slide" | "label" | "headline">[]): Draft2ReviewReader {
  const body = parseObject(answer, "reader");
  const entries = (Array.isArray(body.reactions) ? body.reactions : []).map(record);
  const resolved = entries.map((reaction) => resolveSlide(reaction.slide, carousel));
  const inOrder = entries.length === carousel.length && resolved.every((slide) => slide === undefined);
  const given = new Map<string, Draft2ReviewReaction>();
  entries.forEach((reaction, index) => {
    const slide = inOrder ? carousel[index]?.slide : resolved[index];
    const thought = clip(reaction.thought, REVIEW_LINE_MAX_CHARACTERS);
    if (slide && thought && !given.has(slide)) given.set(slide, { slide, swipe: reaction.swipe === true, thought });
  });
  const reactions = carousel.flatMap(({ slide }) => { const reaction = given.get(slide); return reaction ? [reaction] : []; });
  if (!reactions.length) {
    const named = entries.map((reaction) => JSON.stringify(clip(reaction.slide, 30))).slice(0, 8).join(", ");
    throw new Draft2ResponseError(`The reader answered for none of the carousel's slides: it named ${named || "nothing"}; the slides are ${carousel.map((slide) => slide.slide).join(", ")}`);
  }
  const verdict = clip(body.verdict, REVIEW_LINE_MAX_CHARACTERS);
  if (!verdict) throw new Draft2ResponseError("The reader's verdict is missing");
  return { reactions, follow: body.follow === true, comment: clip(body.comment, REVIEW_LINE_MAX_CHARACTERS), share: body.share === true, stoppedAt: resolveSlide(body.stoppedAt, carousel) ?? null, verdict };
}

/** The step a slide's words belong to: the Opening's two, the Closing's last two, the Deck's between. */
export function patchOwner(slide: string): Draft2ReviewOwner {
  if (slide === "cover" || slide === "slide2") return "opening";
  if (slide === "penultimate" || slide === "last") return "closing";
  return "deck";
}

/** The index of a deck slide ("s1" is the first) or undefined for any other position. */
export function deckIndex(slide: string): number | undefined {
  const match = /^s(\d+)$/.exec(slide);
  return match ? Number(match[1]) - 1 : undefined;
}

/** The texts a slide has, by patch field: the cover has a subheadline, the others a body; a list item its practical line; the last its call to action. */
export function slideFields(slide: Draft2CarouselSlide): Draft2ReviewPatchField[] {
  return ["headline", slide.slide === "cover" ? "subheadline" : "body", ...(slide.practical !== undefined ? ["practical" as const] : []), ...(slide.slide === "last" ? ["cta" as const] : [])];
}

/** A slide's text for a patch field, as the carousel carries it. */
export function slideText(slide: Draft2CarouselSlide, field: Draft2ReviewPatchField): string {
  switch (field) {
    case "headline": return slide.headline;
    case "subheadline": case "body": return slide.text;
    case "practical": return slide.practical ?? "";
    case "cta": return slide.cta ?? "";
  }
}

/** Two texts are the same words when only spacing differs. */
export const sameWords = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

/** The patch field a model named: the contract's names, or the slide's "text" (the cover's subheadline, every other slide's body), "subtitle", "call to action", "practical line". */
export function patchField(name: unknown, slide: Pick<Draft2CarouselSlide, "slide">): Draft2ReviewPatchField | undefined {
  const key = typeof name === "string" ? name.toLowerCase().replace(/[^a-z]/g, "") : "";
  if (key === "text" || key === "copy") return slide.slide === "cover" ? "subheadline" : "body";
  if (key === "subtitle" || key === "subhead" || key === "subheading") return "subheadline";
  if (key === "calltoaction") return "cta";
  if (key === "practicalline") return "practical";
  return REVIEW_PATCH_FIELDS.find((candidate) => candidate === key);
}

export type Draft2ReviewAnswer = Omit<Draft2ReviewEditor, "patches"> & { patches: Omit<Draft2ReviewPatch, "id" | "owner" | "status" | "note">[] };

/**
 * The editor's answer, checked against the contract and the carousel it read:
 * integer scores clamped to 1–100, a verdict, a summary, up to six strengths,
 * and up to six patches whose slide the carousel has (named by id, label,
 * position or headline) and whose field that slide has ("text" is the body,
 * or the cover's subheadline); a patch for a text the slide lacks is dropped,
 * never fatal.
 */
export function parseReviewAnswer(answer: string, carousel: readonly Draft2CarouselSlide[]): Draft2ReviewAnswer {
  const body = parseObject(answer, "review");
  const scores = record(body.scores);
  const value = (key: string) => {
    const number = scores[key];
    if (typeof number !== "number" || !Number.isInteger(number)) throw new Draft2ResponseError(`The review's ${key} score is not an integer`);
    return Math.min(100, Math.max(1, number));
  };
  const verdict = body.verdict === "ready" || body.verdict === "patch" ? body.verdict : undefined;
  const summary = text(body.summary, REVIEW_SUMMARY_MAX_CHARACTERS);
  if (!verdict || !summary) throw new Draft2ResponseError("The review's verdict or summary is missing");
  const strengths = (Array.isArray(body.strengths) ? body.strengths : []).flatMap((entry) => { const line = text(entry, REVIEW_LINE_MAX_CHARACTERS); return line ? [line] : []; }).slice(0, REVIEW_MAX_STRENGTHS);
  const patches: Draft2ReviewAnswer["patches"] = [];
  for (const entry of Array.isArray(body.patches) ? body.patches : []) {
    const patch = record(entry);
    const slideId = resolveSlide(patch.slide, carousel);
    const slide = carousel.find((candidate) => candidate.slide === slideId);
    const field = slide ? patchField(patch.field, slide) : undefined;
    const before = typeof patch.before === "string" ? patch.before.trim() : "";
    const after = text(patch.after, REVIEW_PATCH_MAX_CHARACTERS);
    const reason = clip(patch.reason, REVIEW_LINE_MAX_CHARACTERS);
    // A patch that names no kind the review knows claims no necessity: it is style.
    const kind = REVIEW_PATCH_KINDS.find((entry) => entry === (typeof patch.kind === "string" ? patch.kind.trim().toLowerCase() : "")) ?? "style";
    if (!slide || !field || !slideFields(slide).includes(field) || !after || !reason) continue;
    if (patches.some((existing) => existing.slide === slide.slide && existing.field === field)) continue;
    patches.push({ slide: slide.slide, field, kind, before, after, reason });
  }
  return {
    scores: { ...Object.fromEntries(REVIEW_CRITERIA.map((criterion) => [criterion, value(criterion)])), overall: value("overall") } as Draft2ReviewScore,
    verdict, summary, strengths, patches: patches.slice(0, REVIEW_MAX_PATCHES),
  };
}

/**
 * The patches as the review keeps them: numbered, each with its owner, and
 * refused at once when the text it replaces is not the slide's (the editor
 * misquoted it) or when its replacement is the same text.
 */
export function reviewPatches(answer: Draft2ReviewAnswer, carousel: readonly Draft2CarouselSlide[]): Draft2ReviewPatch[] {
  return answer.patches.map((patch, index) => {
    const slide = carousel.find((candidate) => candidate.slide === patch.slide)!;
    const current = slideText(slide, patch.field);
    const base: Draft2ReviewPatch = { id: `p${index + 1}`, owner: patchOwner(patch.slide), status: "proposed", ...patch, before: current };
    if (!sameWords(patch.before, current)) return { ...base, status: "refused", note: `The review quoted "${patch.before.slice(0, 80)}", and the slide says "${current.slice(0, 80)}".` };
    if (sameWords(patch.after, current)) return { ...base, status: "refused", note: "The replacement is the same text." };
    return base;
  });
}

/**
 * The review's own rules on a patch, beside the owning step's: the cover's
 * headline passed the Opening's gate, so the review changes it only to fix a
 * fact; and a patch never drops a figure the facts give (a date, a time, a
 * price), the reader's plan. Each broken rule is a line.
 */
export function reviewPatchRules(patch: Pick<Draft2ReviewPatch, "slide" | "field" | "kind" | "before" | "after">, facts: readonly Draft2Fact[]): string[] {
  const rules: string[] = [];
  if (patch.slide === "cover" && patch.field === "headline" && patch.kind !== "truth") {
    rules.push("The cover's headline passed the Opening's gate: the review changes it only to fix a fact; a missing name or detail goes in the subheadline.");
  }
  const stated = statedNumbers(facts);
  const kept = new Set(numbersIn(patch.after).map((number) => number.digits));
  const dropped = [...new Set(numbersIn(patch.before).filter((number) => stated.has(number.digits) && !kept.has(number.digits)).map((number) => number.written))];
  if (dropped.length) rules.push(`It drops ${dropped.join(", ")}, which the facts give: a patch keeps the dates, times and prices a slide carries.`);
  return rules;
}

/** The opening with one of its texts replaced. */
export function patchedOpening(candidate: Draft2OpeningCandidate, slide: string, field: Draft2ReviewPatchField, after: string): Draft2OpeningCandidate {
  if (slide === "cover" && field === "headline") return { ...candidate, cover: { ...candidate.cover, headline: after } };
  if (slide === "cover" && field === "subheadline") return { ...candidate, cover: { ...candidate.cover, subheadline: after } };
  if (slide === "slide2" && field === "headline") return { ...candidate, slide2: { ...candidate.slide2, headline: after } };
  if (slide === "slide2" && field === "body") return { ...candidate, slide2: { ...candidate.slide2, body: after } };
  throw new Draft2ResponseError(`An opening has no ${field} on ${slide}`);
}

/** The closing with one of its texts replaced. */
export function patchedClosing(candidate: Draft2ClosingCandidate, slide: string, field: Draft2ReviewPatchField, after: string): Draft2ClosingCandidate {
  if (slide === "penultimate" && candidate.penultimate && (field === "headline" || field === "body")) return { ...candidate, penultimate: { ...candidate.penultimate, [field]: after } };
  if (slide === "last" && (field === "headline" || field === "body" || field === "cta")) return { ...candidate, last: { ...candidate.last, [field]: after } };
  throw new Draft2ResponseError(`A closing has no ${field} on ${slide}`);
}

/** The deck with one of its slides' texts replaced. */
export function patchedDeck(candidate: Draft2DeckCandidate, slide: string, field: Draft2ReviewPatchField, after: string): Draft2DeckCandidate {
  const index = deckIndex(slide);
  if (index === undefined || !candidate.slides[index] || !(field === "headline" || field === "body" || field === "practical")) throw new Draft2ResponseError(`A deck has no ${field} on ${slide}`);
  return { ...candidate, slides: candidate.slides.map((entry, position) => position === index ? { ...entry, [field]: after } : entry) };
}

/** Whether a review read the versions chosen now and the focus they follow. */
export function reviewCurrent(review: Pick<Draft2Review, "openingId" | "closingId" | "deckId"> | null | undefined, ids: { openingId?: string; closingId?: string; deckId?: string }): boolean {
  return Boolean(review && review.openingId === ids.openingId && review.closingId === ids.closingId && review.deckId === ids.deckId);
}

/** The patches still waiting for a decision. */
export const proposedPatches = (review: Pick<Draft2Review, "editor"> | null | undefined): Draft2ReviewPatch[] => (review?.editor?.patches ?? []).filter((patch) => patch.status === "proposed");
