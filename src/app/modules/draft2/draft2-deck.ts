import "server-only";
import { recordFunnelChoice, runFunnelStep, type FunnelStep, type FunnelStepInput } from "./draft2-funnel-run";
import { DRAFT2_DECK_ROLES } from "./draft2-models";
import { Draft2InputError } from "./draft2-facts.types";
import { focusForModels, focusItemCount, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { funnelVersions } from "./draft2-funnel";
import { openingForClosing, type Draft2ClosingOpening } from "./draft2-closing.types";
import {
  DECK_GATE, DRAFT2_DECK_EVALUATION_SCHEMA, DRAFT2_DECK_SCHEMA, closingForDeck, deckExploreRequest, deckJudgeRequest, deckFixRequest, deckPlan, deckRefineRequest, deckShape,
  mechanicalDeckIssues, parseDeckCandidates, parseDeckEvaluation, sameDeck, shapeForModels,
  type Draft2Deck, type Draft2DeckCandidate, type Draft2DeckClosing, type Draft2DeckIssue, type Draft2DeckScore, type Draft2DeckShape,
} from "./draft2-deck.types";
import { brandBrief, composeInstructions, creativeSkills } from "./skills/draft2-skills";
import { DECKS_SKILL } from "./skills/decks";
import { FAIRNESS_SKILL } from "./skills/fairness";
import { READER_SKILL } from "./skills/reader";
import type { Draft2SessionRow } from "@/db/schema";

/** What a deck run connects and follows: the opening and the closing as the editor chose them, the focus they followed, and the deck's shape. */
type DeckSnapshot = { opening: Draft2ClosingOpening; closing: Draft2DeckClosing; focus: Draft2FocusSnapshot; shape: Draft2DeckShape };

/**
 * What a run connects: a continued run keeps what it started with; a new run
 * takes the closing as it stands (the editor's choice, else the judge's
 * winner), once its run has finished, with the opening that closing ends,
 * which must still be the opening chosen, and the focus both followed.
 */
function deckTarget(session: Draft2SessionRow, stopped: Draft2Deck | undefined): DeckSnapshot {
  if (stopped) {
    if (!stopped.opening || !stopped.closing || !stopped.focus || !stopped.shape) throw new Draft2InputError("This deck run does not record what it connects. Write the deck again.");
    return { opening: stopped.opening, closing: stopped.closing, focus: stopped.focus, shape: stopped.shape };
  }
  const closing = session.closing;
  if (!closing || closing.status === "running" || closing.status === "paused") throw new Draft2InputError("The deck leads to the closing. Finish the closing first.");
  const chosenId = closing.editorChoiceId ?? closing.winnerId;
  const chosen = chosenId ? funnelVersions(closing.rounds).find((version) => version.candidate.id === chosenId) : undefined;
  if (!chosen) throw new Draft2InputError("The closing has no version to lead to yet. Choose a closing first.");
  if (!closing.opening || !closing.focus) throw new Draft2InputError("This closing does not record the opening it ends. Write the closing again first.");
  const openingNow = session.opening?.editorChoiceId ?? session.opening?.winnerId;
  if (openingNow && openingNow !== closing.opening.id) throw new Draft2InputError(`The closing ends ${closing.opening.id}, and the opening chosen now is ${openingNow}. Write the closing again first.`);
  const { id, penultimate, last } = chosen.candidate;
  return {
    opening: closing.opening,
    closing: { id, ...(penultimate ? { penultimate } : {}), last },
    focus: closing.focus,
    shape: deckShape(closing.focus.values.structure, closing.opening.slide2.factIds, closing.focus.values.spine),
  };
}

/** The Deck on the shared funnel: its plan (by shape), gate, roles, prompts and contract. */
const DECK_STEP: FunnelStep<Draft2DeckCandidate, Draft2DeckScore, Draft2DeckIssue, Draft2Deck, DeckSnapshot> = {
  step: "deck",
  noun: "deck",
  article: "a deck",
  plural: "decks",
  plan: ({ shape }) => deckPlan(shape),
  gate: DECK_GATE,
  operations: { writer: "draft2_deck", judge: "draft2_deck_review" },
  roles: DRAFT2_DECK_ROLES,
  snapshot: deckTarget,
  newRun: ({ opening, closing, focus, shape }) => ({ opening, closing, focus, shape }),
  setup: ({ snapshot: { opening, closing, focus, shape }, profile, facts, plan }) => {
    const emojis = profile.allowEmojis ? Math.max(0, profile.maxEmojis) : 0;
    const brief = brandBrief(profile);
    const values = focus.values;
    return {
      writer: composeInstructions("deck-writer", [DECKS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...creativeSkills(values)], brief),
      judge: composeInstructions("deck-judge", [DECKS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...creativeSkills(values)], brief),
      context: { focus: focusForModels(values), opening: openingForClosing(opening), closing: closingForDeck(closing), deck: shapeForModels(shape), emojis },
      schemas: { writer: DRAFT2_DECK_SCHEMA, judge: DRAFT2_DECK_EVALUATION_SCHEMA },
      parseCandidates: parseDeckCandidates,
      parseEvaluation: parseDeckEvaluation,
      mechanical: (candidates) => mechanicalDeckIssues(candidates, facts, { opening, closing, shape, itemCount: focusItemCount(values), emojis, reader: { address: profile.readerAddress, language: profile.language } }),
      explore: deckExploreRequest,
      refine: deckRefineRequest,
      fix: deckFixRequest,
      judgeRequest: (round, candidates, mechanical, revised) => deckJudgeRequest(plan, round, candidates, mechanical, revised),
      same: sameDeck,
    };
  },
};

/**
 * Runs the Deck step on a session whose closing is finished: the slides
 * between slide 2 and the closing the editor chose (else the judge's
 * winner), following the focus both ends followed. For an arc, Claude
 * writes four decks of two to five slides; for a list or steps, two decks
 * carrying the items slide 2 did not cover, one per slide. Sol scores them
 * and proposes a deck of its own; Claude revises the best (two, or one) and
 * edits Sol's, which also competes as Sol wrote it, for Sol's pick. Pausing,
 * continuing and the heartbeat are the funnel's (draft2-funnel-run.ts).
 */
export function runDraft2Deck(input: FunnelStepInput): Promise<Draft2SessionRow> {
  return runFunnelStep(DECK_STEP, input);
}

/** Records the editor's pick among every deck the run scored, beside the judge's scores. */
export function recordDeckChoice(input: { topicId: string; sessionId: string; candidateId: string }): Promise<Draft2SessionRow> {
  return recordFunnelChoice(DECK_STEP, input);
}
