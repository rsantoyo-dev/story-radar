import "server-only";
import { recordFunnelChoice, runFunnelStep, type FunnelStep, type FunnelStepInput } from "./draft2-funnel-run";
import { DRAFT2_CLOSING_ROLES } from "./draft2-models";
import { Draft2InputError } from "./draft2-facts.types";
import { focusForModels, focusItemCount, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { openingVersions } from "./draft2-opening.types";
import {
  CLOSING_GATE, CLOSING_ROUND_PLAN, callToActionBrief, closingEvaluationSchema, closingExploreRequest, closingJudgeRequest, closingFixRequest, closingRefineRequest, closingSchema,
  closingShape, mechanicalClosingIssues, openingForClosing, parseClosingCandidates, parseClosingEvaluation, sameClosing,
  type Draft2Closing, type Draft2ClosingCandidate, type Draft2ClosingIssue, type Draft2ClosingOpening, type Draft2ClosingScore, type Draft2ClosingShape,
} from "./draft2-closing.types";
import { brandBrief, composeInstructions, creativeSkills } from "./skills/draft2-skills";
import { CLOSINGS_SKILL } from "./skills/closings";
import { FAIRNESS_SKILL } from "./skills/fairness";
import { READER_SKILL } from "./skills/reader";
import type { Draft2SessionRow } from "@/db/schema";

/** What a closing run ends and follows: the opening as the editor chose it, the focus that opening followed, and the shape its structure asks for. */
type ClosingSnapshot = { opening: Draft2ClosingOpening; focus: Draft2FocusSnapshot; shape: Draft2ClosingShape };

/**
 * The opening a run ends: a continued run keeps the one it started with; a
 * new run takes the opening as it stands (the editor's choice, else the
 * judge's winner), once its run has finished, and follows the focus that
 * opening followed, so the story is told to one brief from start to end.
 */
function closingTarget(session: Draft2SessionRow, stopped: Draft2Closing | undefined): ClosingSnapshot {
  if (stopped) {
    if (!stopped.opening || !stopped.focus || !stopped.shape) throw new Draft2InputError("This closing run does not record the opening it ends. Write the closing again.");
    return { opening: stopped.opening, focus: stopped.focus, shape: stopped.shape };
  }
  const opening = session.opening;
  if (!opening || opening.status === "running" || opening.status === "paused") throw new Draft2InputError("The closing ends the opening. Finish the opening first.");
  const chosenId = opening.editorChoiceId ?? opening.winnerId;
  const chosen = chosenId ? openingVersions(opening.rounds).find((version) => version.candidate.id === chosenId) : undefined;
  if (!chosen) throw new Draft2InputError("The opening has no version to end yet. Choose an opening first.");
  if (!opening.focus) throw new Draft2InputError("This opening was written before the Focus step. Write the opening again first.");
  const { id, cover, slide2, lever } = chosen.candidate;
  return { opening: { id, cover, slide2, ...(lever ? { lever } : {}) }, focus: opening.focus, shape: closingShape(opening.focus.values.structure.kind) };
}

/** The Closing on the shared funnel: its plan, gate, roles, prompts and contract. */
const CLOSING_STEP: FunnelStep<Draft2ClosingCandidate, Draft2ClosingScore, Draft2ClosingIssue, Draft2Closing, ClosingSnapshot> = {
  step: "closing",
  noun: "closing",
  article: "a closing",
  plural: "closings",
  plan: CLOSING_ROUND_PLAN,
  gate: CLOSING_GATE,
  operations: { writer: "draft2_closing", judge: "draft2_closing_review" },
  roles: DRAFT2_CLOSING_ROLES,
  snapshot: closingTarget,
  newRun: ({ opening, focus, shape }) => ({ opening, focus, shape }),
  setup: ({ snapshot: { opening, focus, shape }, profile, facts }) => {
    const emojis = profile.allowEmojis ? Math.max(0, profile.maxEmojis) : 0;
    const brief = `${brandBrief(profile)}\n\n${callToActionBrief({ style: profile.callToActionStyle, emojis })}`;
    const values = focus.values;
    return {
      writer: composeInstructions("closing-writer", [CLOSINGS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...creativeSkills(values)], brief),
      judge: composeInstructions("closing-judge", [CLOSINGS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...creativeSkills(values)], brief),
      context: { focus: focusForModels(values), opening: openingForClosing(opening), shape },
      schemas: { writer: closingSchema(shape), judge: closingEvaluationSchema(shape) },
      parseCandidates: (text) => parseClosingCandidates(text, shape),
      parseEvaluation: (text, ids) => parseClosingEvaluation(text, ids, shape),
      mechanical: (candidates) => mechanicalClosingIssues(candidates, facts, { opening, shape, grave: values.voice.gravity === "grave", itemCount: focusItemCount(values), emojis, reader: { address: profile.readerAddress, language: profile.language } }),
      explore: closingExploreRequest,
      refine: closingRefineRequest,
      fix: closingFixRequest,
      judgeRequest: closingJudgeRequest,
      same: sameClosing,
    };
  },
};

/**
 * Runs the Closing step on a session whose opening is finished: the ending
 * of the opening the editor chose (else the judge's winner), following the
 * focus that opening followed. Claude writes eight closings in the shape the
 * focus's structure asks for (penultimate and last for an arc, the last
 * alone for a list or steps); Sol scores them and proposes two of its own;
 * Claude revises the two best and edits the proposals, which also compete as
 * Sol wrote them, for Sol's pick. Pausing, continuing and the heartbeat are
 * the funnel's (draft2-funnel-run.ts).
 */
export function runDraft2Closing(input: FunnelStepInput): Promise<Draft2SessionRow> {
  return runFunnelStep(CLOSING_STEP, input);
}

/** Records the editor's pick among every closing the run scored, beside the judge's scores. */
export function recordClosingChoice(input: { topicId: string; sessionId: string; candidateId: string }): Promise<Draft2SessionRow> {
  return recordFunnelChoice(CLOSING_STEP, input);
}
