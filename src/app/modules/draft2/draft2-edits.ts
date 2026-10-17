import "server-only";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { mechanicalCaptionIssues, type Draft2Caption, type Draft2CaptionCandidate } from "./draft2-caption.types";
import { mechanicalClosingIssues, type Draft2Closing, type Draft2ClosingCandidate } from "./draft2-closing.types";
import { mechanicalDeckIssues, type Draft2Deck, type Draft2DeckCandidate } from "./draft2-deck.types";
import { nextEditId, parseHashtags, undoableEdit, type Draft2EditField, type Draft2EditInput, type Draft2EditStep, type Draft2OwnOpening } from "./draft2-edits.types";
import { Draft2BusyError, Draft2InputError, type Draft2Fact } from "./draft2-facts.types";
import { focusItemCount } from "./draft2-focus.types";
import { funnelVersions, funnelWithCandidate, numbersIn, statedNumbers, type FunnelCandidate, type FunnelEditorEdit, type FunnelRun } from "./draft2-funnel";
import { shownAttempt } from "./draft2-images.types";
import { mechanicalOpeningIssues, type Draft2Opening, type Draft2OpeningCandidate } from "./draft2-opening.types";
import { carouselWithText, deckIndex, patchedClosing, patchedDeck, patchedOpening, reviewCurrent, type Draft2ReviewPatchField } from "./draft2-review.types";
import { activeDraft2Session, getDraft2Session, updateDraft2Session, type Draft2SessionPatch } from "./draft2-session.repository";
import type { Draft2VisualCandidate } from "./draft2-visual.types";
import type { CreativeProfile } from "../stories/creative-content.types";
import type { Draft2SessionRow } from "@/db/schema";

const NOUN: Record<Draft2EditStep, string> = { opening: "opening", closing: "closing", deck: "deck", caption: "caption", visual: "visual script" };

type AnyRun = FunnelRun<FunnelCandidate & Record<string, unknown>>;

/** The run of a step, finished: a run being written is never edited under it. */
function runOf(session: Draft2SessionRow, step: Draft2EditStep): AnyRun {
  const run = session[step] as unknown as AnyRun | null;
  if (!run?.rounds?.length) throw new Draft2InputError(`This session has no ${NOUN[step]} to edit yet.`);
  if (run.status === "running" || run.status === "paused") throw new Draft2BusyError(`The ${NOUN[step]} is being written; edit it when it finishes.`);
  return run;
}

/** The version a step's later steps follow: the editor's choice, else the winner. */
function chosenOf(run: AnyRun, step: Draft2EditStep): FunnelCandidate & Record<string, unknown> {
  const id = run.editorChoiceId ?? run.winnerId;
  const version = id ? funnelVersions(run.rounds).find((entry) => entry.candidate.id === id) : undefined;
  if (!version) throw new Draft2InputError(`Choose a version of the ${NOUN[step]} before editing it.`);
  return version.candidate;
}

/** One text of a step's version, as the editor sees it. */
export function editableText(step: Draft2EditStep, candidate: FunnelCandidate, slide: string, field: Draft2EditField): string {
  if (step === "opening") {
    const opening = candidate as Draft2OpeningCandidate;
    if (slide === "cover" && field === "headline") return opening.cover.headline;
    if (slide === "cover" && field === "subheadline") return opening.cover.subheadline;
    if (slide === "slide2" && field === "headline") return opening.slide2.headline;
    if (slide === "slide2" && field === "body") return opening.slide2.body;
  } else if (step === "closing") {
    const closing = candidate as Draft2ClosingCandidate;
    const part = slide === "penultimate" ? closing.penultimate : slide === "last" ? closing.last : undefined;
    if (part && (field === "headline" || field === "body")) return part[field];
    if (slide === "last" && field === "cta") return closing.last.cta;
  } else if (step === "deck") {
    const entry = (candidate as Draft2DeckCandidate).slides[deckIndex(slide) ?? -1];
    if (entry && (field === "headline" || field === "body" || field === "practical")) return entry[field] ?? "";
  } else if (step === "caption") {
    const caption = candidate as Draft2CaptionCandidate;
    if (slide === "post" && field === "text") return caption.text;
    if (slide === "post" && field === "hashtags") return caption.hashtags.map((tag) => `#${tag}`).join(" ");
  } else {
    const entry = (candidate as Draft2VisualCandidate).slides.find((scripted) => scripted.slide === slide);
    if (entry && field === "direction") return entry.direction;
  }
  throw new Draft2InputError(`The ${NOUN[step]} has no ${field} on ${slide}.`);
}

/** The version with one of its texts replaced. */
function withText(step: Draft2EditStep, candidate: FunnelCandidate, slide: string, field: Draft2EditField, text: string): FunnelCandidate {
  editableText(step, candidate, slide, field);
  if (step === "opening") return patchedOpening(candidate as Draft2OpeningCandidate, slide, field as Draft2ReviewPatchField, text);
  if (step === "closing") return patchedClosing(candidate as Draft2ClosingCandidate, slide, field as Draft2ReviewPatchField, text);
  if (step === "deck") return patchedDeck(candidate as Draft2DeckCandidate, slide, field as Draft2ReviewPatchField, text);
  if (step === "caption") {
    const caption = candidate as Draft2CaptionCandidate;
    const edited: Draft2CaptionCandidate = field === "hashtags" ? { ...caption, hashtags: parseHashtags(text) } : { ...caption, text };
    return edited;
  }
  const script = candidate as Draft2VisualCandidate;
  const edited: Draft2VisualCandidate = { ...script, slides: script.slides.map((entry) => entry.slide === slide ? { ...entry, direction: text } : entry) };
  return edited;
}

/** The facts a slide of a step's version cites; none for a visual script's direction. */
function slideFactIds(step: Draft2EditStep, candidate: FunnelCandidate, slide: string): string[] | undefined {
  if (step === "opening") { const opening = candidate as Draft2OpeningCandidate; return slide === "cover" ? opening.cover.factIds : opening.slide2.factIds; }
  if (step === "closing") { const closing = candidate as Draft2ClosingCandidate; return slide === "penultimate" ? closing.penultimate?.factIds : closing.last.factIds; }
  if (step === "deck") return (candidate as Draft2DeckCandidate).slides[deckIndex(slide) ?? -1]?.factIds;
  if (step === "caption") return (candidate as Draft2CaptionCandidate).factIds;
  return undefined;
}

/** The version with one slide's facts replaced. */
function withFactIds(step: Draft2EditStep, candidate: FunnelCandidate, slide: string, factIds: string[]): FunnelCandidate {
  if (step === "opening") {
    const opening = candidate as Draft2OpeningCandidate;
    const edited: Draft2OpeningCandidate = slide === "cover" ? { ...opening, cover: { ...opening.cover, factIds } } : { ...opening, slide2: { ...opening.slide2, factIds } };
    return edited;
  }
  if (step === "closing") {
    const closing = candidate as Draft2ClosingCandidate;
    const edited: Draft2ClosingCandidate = slide === "penultimate" && closing.penultimate ? { ...closing, penultimate: { ...closing.penultimate, factIds } } : { ...closing, last: { ...closing.last, factIds } };
    return edited;
  }
  if (step === "deck") {
    const index = deckIndex(slide);
    const deck = candidate as Draft2DeckCandidate;
    const edited: Draft2DeckCandidate = { ...deck, slides: deck.slides.map((entry, at) => at === index ? { ...entry, factIds } : entry) };
    return edited;
  }
  if (step === "caption") {
    const edited: Draft2CaptionCandidate = { ...(candidate as Draft2CaptionCandidate), factIds };
    return edited;
  }
  return candidate;
}

/** How many facts a hand edit cites on its own. */
export const CITED_BY_HAND_MAX = 3;

/**
 * The verified facts that state the numbers a hand-written text brings and
 * the slide's cited facts do not (a phone number, a date, an age): cited with
 * the edit, three at most, so the words rest on the facts the way the
 * writer's do and the number is no finding. The editor's other words cite
 * nothing: a claim without a figure stays theirs. A hand edit of the
 * Saint-Jean closing wrote the police line no cited fact gave (2026-10-17).
 */
export function factsCitedByHand(text: string, cited: readonly string[], facts: readonly Draft2Fact[]): string[] {
  const added: string[] = [];
  const stated = () => statedNumbers(facts.filter((fact) => cited.includes(fact.id) || added.includes(fact.id)));
  for (const { digits } of numbersIn(text)) {
    if (added.length >= CITED_BY_HAND_MAX || stated().has(digits)) continue;
    const fact = facts.find((entry) => entry.status !== "disputed" && !cited.includes(entry.id) && !added.includes(entry.id) && statedNumbers([entry]).has(digits));
    if (fact) added.push(fact.id);
  }
  return added;
}

const chosenId = (run: { editorChoiceId?: string; winnerId?: string } | null | undefined) => run?.editorChoiceId ?? run?.winnerId;

/**
 * The session with a step's chosen version changed: in place in its run, in
 * the copies the later steps keep (the closing and the deck record the
 * opening they follow, the deck the closing it leads to), and in the review's
 * and the visual script's carousels when they read these versions, so later
 * steps and new images take the words as they now stand.
 */
function changed(session: Draft2SessionRow, step: Draft2EditStep, run: AnyRun, candidate: FunnelCandidate, slide: string, field: Draft2EditField, text: string, edits: FunnelEditorEdit[]): Draft2SessionPatch {
  const changes: Record<string, unknown> = { [step]: { ...funnelWithCandidate(run, candidate as FunnelCandidate & Record<string, unknown>), edits } };
  if (step === "opening") {
    const opening = candidate as Draft2OpeningCandidate;
    if (session.closing?.opening?.id === opening.id) changes.closing = { ...session.closing, opening: { ...session.closing.opening, cover: opening.cover, slide2: opening.slide2 } };
    if (session.deck?.opening?.id === opening.id) changes.deck = { ...session.deck, opening: { ...session.deck.opening, cover: opening.cover, slide2: opening.slide2 } };
  } else if (step === "closing") {
    const closing = candidate as Draft2ClosingCandidate;
    if (session.deck?.closing?.id === closing.id) changes.deck = { ...session.deck, closing: { ...session.deck.closing, penultimate: closing.penultimate, last: closing.last } };
  }
  if (step === "opening" || step === "closing" || step === "deck") {
    const ids = { openingId: chosenId(session.opening), closingId: chosenId(session.closing), deckId: chosenId(session.deck) };
    if (session.review && reviewCurrent(session.review, ids)) changes.review = { ...session.review, carousel: carouselWithText(session.review.carousel, slide, field, text) };
    const visual = session.visual;
    if (visual?.carousel && visual.openingId === ids.openingId && visual.closingId === ids.closingId && visual.deckId === ids.deckId) {
      changes.visual = { ...visual, carousel: carouselWithText(visual.carousel, slide, field, text) };
    }
  }
  return changes as Draft2SessionPatch;
}

/** What the step's own checks find on the edited version, for the slide edited; shown to the editor, never blocking. */
function findingsOf(session: Draft2SessionRow, step: Draft2EditStep, candidate: FunnelCandidate, slide: string, profile: Pick<CreativeProfile, "allowEmojis" | "maxEmojis" | "readerAddress" | "language">): string[] {
  const facts = session.facts ?? [];
  const reader = { address: profile.readerAddress, language: profile.language };
  const emojis = profile.allowEmojis ? Math.max(0, profile.maxEmojis) : 0;
  const mine = (issue: { part?: string; code: string }) => (!issue.part || issue.part === slide) && issue.code !== "DUPLICATE_CANDIDATE";
  let findings: string[] = [];
  if (step === "opening") {
    const run = session.opening as Draft2Opening;
    const values = run.focus?.values;
    findings = mechanicalOpeningIssues([candidate as Draft2OpeningCandidate], facts, { itemCount: values ? focusItemCount(values) : undefined, guards: values?.guards, reader }).filter(mine).map((issue) => issue.detail);
  } else if (step === "closing") {
    const run = session.closing as Draft2Closing;
    if (run.opening && run.shape) {
      findings = mechanicalClosingIssues([candidate as Draft2ClosingCandidate], facts, { opening: run.opening, shape: run.shape, grave: run.focus?.values.voice.gravity === "grave", itemCount: run.focus ? focusItemCount(run.focus.values) : undefined, emojis, reader }).filter(mine).map((issue) => issue.detail);
    }
  } else if (step === "deck") {
    const run = session.deck as Draft2Deck;
    if (run.opening && run.closing && run.shape) {
      findings = mechanicalDeckIssues([candidate as Draft2DeckCandidate], facts, { opening: run.opening, closing: run.closing, shape: run.shape, itemCount: run.focus ? focusItemCount(run.focus.values) : undefined, emojis, reader }).filter(mine).map((issue) => issue.detail);
    }
  } else if (step === "caption") {
    const run = session.caption as Draft2Caption;
    if (run.rules) findings = mechanicalCaptionIssues([candidate as Draft2CaptionCandidate], facts, { source: run.source, credits: run.credits ?? [], mentions: run.mentions ?? [], rules: run.rules, reader }).filter(mine).map((issue) => issue.detail);
  }
  // An image already made shows the words or follows the direction it was made with.
  const image = session.images?.slides.find((entry) => entry.slide === slide);
  if (image && shownAttempt(image) && step !== "caption") {
    findings.push(step === "visual" ? "The image of this slide was made from the earlier direction: make another image to follow this one." : "The image of this slide shows the earlier words: make another image to show these.");
  }
  return findings;
}

/** The editor's change to one text of a step's chosen version, recorded so it can be undone. */
async function applyEdit(session: Draft2SessionRow, step: Draft2EditStep, slide: string, field: Draft2EditField, text: string): Promise<Draft2SessionPatch> {
  const run = runOf(session, step);
  const candidate = chosenOf(run, step);
  const before = editableText(step, candidate, slide, field);
  if (before.replace(/\s+/g, " ").trim() === text.replace(/\s+/g, " ").trim()) throw new Draft2InputError("This text already says that.");
  const written = withText(step, candidate, slide, field, text);
  // The numbers the editor writes rest on the facts that state them: cited with the edit, so the slide carries its sources as the writer's would.
  const cited = field === "hashtags" ? undefined : slideFactIds(step, written, slide);
  const citedFactIds = cited ? factsCitedByHand(text, cited, session.facts ?? []) : [];
  const next = cited && citedFactIds.length ? withFactIds(step, written, slide, [...cited, ...citedFactIds]) : written;
  const profile = await getCreativeProfile(session.topicId);
  const findings = findingsOf(session, step, next, slide, profile);
  const edit: FunnelEditorEdit = { id: nextEditId(run.edits), candidateId: candidate.id, slide, field, before, after: editableText(step, next, slide, field), at: new Date().toISOString(), findings, ...(citedFactIds.length ? { citedFactIds } : {}) };
  return changed(session, step, run, next, slide, field, edit.after, [...(run.edits ?? []), edit]);
}

/** A change undone: the text as it was, while the version still says what the change wrote. */
function undoEdit(session: Draft2SessionRow, step: Draft2EditStep, editId: string): Draft2SessionPatch {
  const run = runOf(session, step);
  const edit = undoableEdit(run.edits, editId);
  const version = funnelVersions(run.rounds).find((entry) => entry.candidate.id === edit.candidateId);
  if (!version) throw new Draft2InputError("The version this change edited is no longer in the run.");
  const field = edit.field as Draft2EditField;
  if (editableText(step, version.candidate, edit.slide, field).replace(/\s+/g, " ").trim() !== edit.after.replace(/\s+/g, " ").trim()) {
    throw new Draft2InputError("The text no longer says what this change wrote; undo is not possible.");
  }
  const written = withText(step, version.candidate, edit.slide, field, edit.before);
  // The facts the edit cited for its numbers go with it.
  const cited = edit.citedFactIds?.length ? slideFactIds(step, written, edit.slide) : undefined;
  const restored = cited ? withFactIds(step, written, edit.slide, cited.filter((id) => !edit.citedFactIds!.includes(id))) : written;
  const edits = (run.edits ?? []).map((entry) => entry.id === edit.id ? { ...entry, undoneAt: new Date().toISOString() } : entry);
  return changed(session, step, run, restored, edit.slide, field, edit.before, edits);
}

/**
 * The editor's own opening. "use": it joins the run's versions (e1, e2…),
 * with what the program finds on it, and becomes the chosen one. "develop":
 * it joins the last round's proposals (p…), so one more round has the writer
 * develop it, citing the facts, beside the judge's proposals, and it competes
 * as the editor wrote it and as the writer edited it; the canvas runs that
 * round. An idea may be a hook alone: the writer writes the rest.
 */
async function ownOpening(session: Draft2SessionRow, mode: "use" | "develop", own: Draft2OwnOpening): Promise<Draft2SessionPatch> {
  const run = runOf(session, "opening") as unknown as Draft2Opening;
  const candidate: Draft2OpeningCandidate = {
    id: "", angle: "The editor's own opening", byEditor: true,
    cover: { headline: own.cover.headline, subheadline: own.cover.subheadline, factIds: [] },
    slide2: { headline: own.slide2.headline, body: own.slide2.body, factIds: [] },
  };
  const rounds = [...run.rounds];
  const last = rounds[rounds.length - 1];
  if (mode === "use") {
    const mine = funnelVersions(run.rounds).filter((version) => version.candidate.byEditor).length;
    const yours = { ...candidate, id: `e${mine + 1}` };
    const profile = await getCreativeProfile(session.topicId);
    const values = run.focus?.values;
    const mechanical = mechanicalOpeningIssues([yours], session.facts ?? [], { itemCount: values ? focusItemCount(values) : undefined, guards: values?.guards, reader: { address: profile.readerAddress, language: profile.language } });
    rounds[rounds.length - 1] = { ...last, candidates: [...last.candidates, yours], mechanical: [...last.mechanical, ...mechanical] };
    return { opening: { ...run, rounds, candidates: [...run.candidates, yours], editorChoiceId: yours.id, editorChoiceAt: new Date().toISOString() } } as Draft2SessionPatch;
  }
  if (!last.evaluation) throw new Draft2InputError("The opening's last round has not been judged yet; continue it first.");
  const proposals = run.rounds.reduce((count, round) => count + (round.evaluation?.proposals?.length ?? 0), 0);
  const idea = { ...candidate, id: `p${proposals + 1}` };
  rounds[rounds.length - 1] = { ...last, evaluation: { ...last.evaluation, proposals: [...(last.evaluation.proposals ?? []), idea] } };
  // A finished run takes one more round for the idea; the canvas starts it.
  return { opening: { ...run, rounds, status: "needs-review" } } as Draft2SessionPatch;
}

/** The editor's hand on a finished step: a text changed or a change undone, or their own opening used or set to be developed. No provider call. */
export async function editDraft2({ topicId, sessionId, input }: { topicId: string; sessionId: string; input: Draft2EditInput }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  if (await activeDraft2Session(topicId, session.storyId)) throw new Draft2BusyError("A Draft 2 run is in progress for this story; edit when it finishes.");
  const changes = input.action === "own-opening" ? await ownOpening(session, input.mode, input.opening)
    : input.action === "undo" ? undoEdit(session, input.step, input.editId)
      : await applyEdit(session, input.step, input.slide, input.field, input.text);
  const updated = await updateDraft2Session(session.id, changes);
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
