import "server-only";
import { recordFunnelChoice, runFunnelStep, type FunnelStep, type FunnelStepInput } from "./draft2-funnel-run";
import { getDraft2Session } from "./draft2-session.repository";
import { DRAFT2_OPENING_EARLIER_ROLES, DRAFT2_OPENING_ROLES } from "./draft2-models";
import { Draft2InputError } from "./draft2-facts.types";
import { focusFindings, focusForModels, focusItemCount, focusMaterial, focusToday, spineBeatFactIds, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { storyDeadline } from "./draft2-data-marks";
import type { Draft2InventoryEntity } from "./draft2-inventory.types";
import { eligibleLevers, leverSpread } from "./draft2-levers.types";
import {
  DRAFT2_OPENING_EVALUATION_SCHEMA, DRAFT2_OPENING_SCHEMA, OPENING_DISTINCT_INSTRUCTION, OPENING_GATE, openingPlan, mechanicalOpeningIssues, OPENING_WORD_LIMITS, openingExploreRequest, openingFixRequest,
  openingJudgeRequest, openingRefineRequest, parseOpeningCandidates, parseOpeningEvaluation, sameOpening,
  type Draft2Opening, type Draft2OpeningCandidate, type Draft2OpeningIssue, type Draft2OpeningScore,
} from "./draft2-opening.types";
import { brandBrief, composeInstructions, creativeSkills } from "./skills/draft2-skills";
import { HOOKS_SKILL } from "./skills/hooks";
import { FAIRNESS_SKILL } from "./skills/fairness";
import { READER_SKILL } from "./skills/reader";
import { LEVERS_SKILL } from "./skills/levers";
import type { Draft2SessionRow } from "@/db/schema";

export type Draft2OpeningInput = FunnelStepInput;

/**
 * The focus a run follows: a continued run keeps the one it started with; a
 * new run takes the session's focus as it stands, which must be decided, not
 * being decided, and free of program findings.
 */
/** The focus a run follows and, for a new run, People and places' names (two that read alike on one slide are a finding). */
type OpeningSnapshot = Draft2FocusSnapshot & { entities?: Pick<Draft2InventoryEntity, "name" | "kind">[] };

function openingFocus(session: Draft2SessionRow, stopped: Draft2Opening | undefined): OpeningSnapshot {
  if (stopped) {
    if (!stopped.focus) throw new Draft2InputError("This run started before the Focus step and cannot continue. Write the opening again.");
    return stopped.focus;
  }
  const focus = session.focus;
  if (!focus?.values) throw new Draft2InputError("The opening follows the story's focus. Decide the focus first.");
  if (focus.status === "running") throw new Draft2InputError("The focus was still being decided when its request ended. Decide it again first.");
  // The narrative's anchor is checked against People and places as they stand now.
  const findings = focusFindings(focus.values, session.inventory ? focusMaterial(session.inventory) : undefined, session.facts ?? undefined);
  if (findings.length) throw new Draft2InputError(`Fix the focus first: ${findings.map((finding) => finding.detail).join(" ")}`);
  return { version: focus.version, values: focus.values, entities: (session.inventory?.entities ?? []).map(({ name, kind }) => ({ name, kind })) };
}

/** The Opening on the shared funnel: its plan, gate, roles, prompts and contract. */
const OPENING_STEP: FunnelStep<Draft2OpeningCandidate, Draft2OpeningScore, Draft2OpeningIssue, Draft2Opening, OpeningSnapshot> = {
  step: "opening",
  noun: "opening",
  article: "an opening",
  plural: "openings",
  plan: (_focus, pipeline) => openingPlan(pipeline),
  gate: OPENING_GATE,
  operations: { writer: "draft2_opening", judge: "draft2_opening_review" },
  roles: DRAFT2_OPENING_ROLES,
  earlierRoles: DRAFT2_OPENING_EARLIER_ROLES,
  snapshot: openingFocus,
  newRun: ({ version, values }) => ({ focus: { version, values } }),
  setup: ({ snapshot: focus, profile, facts, plan, pipeline }) => {
    const brief = brandBrief(profile);
    // The end of the story's event, against the day of writing (UTC: the window of three days tolerates the publication's offset).
    const deadline = storyDeadline(facts, focusToday(undefined, new Date()));
    const itemCount = focusItemCount(focus.values);
    // The levers this story can carry; the plan's choice spreads the new openings over them, and a free hook always competes.
    const levers = eligibleLevers(facts, focus.values);
    // v3: five openings that differ in angle, not in wording alone (the program's SIMILAR_CANDIDATE, fixed in the fix pass).
    const distinct = pipeline === "v3";
    return {
      writer: composeInstructions("opening-writer", [HOOKS_SKILL, LEVERS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...creativeSkills(focus.values)], brief),
      judge: composeInstructions("opening-judge", [HOOKS_SKILL, LEVERS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...creativeSkills(focus.values)], brief),
      context: { focus: focusForModels(focus.values), eligibleLevers: levers },
      schemas: { writer: DRAFT2_OPENING_SCHEMA, judge: DRAFT2_OPENING_EVALUATION_SCHEMA },
      parseCandidates: parseOpeningCandidates,
      parseEvaluation: parseOpeningEvaluation,
      mechanical: (candidates) => mechanicalOpeningIssues(candidates, facts, { itemCount, eligibleLevers: levers, guards: focus.values.guards, reader: { address: profile.readerAddress, language: profile.language }, distinct, beats: { cover: spineBeatFactIds(focus.values.spine, "cover"), slide2: spineBeatFactIds(focus.values.spine, "slide2") }, deadline, entities: focus.entities }),
      explore: (wanted, last, versions) => ({ ...openingExploreRequest(wanted, last, versions), levers: { spread: leverSpread(focus.values.levers, wanted) }, ...(distinct ? { instruction: OPENING_DISTINCT_INSTRUCTION } : {}) }),
      refine: openingRefineRequest,
      fix: openingFixRequest,
      wordLimits: OPENING_WORD_LIMITS,
      judgeRequest: (round, candidates, mechanical, revised) => openingJudgeRequest(plan, round, candidates, mechanical, revised),
      same: sameOpening,
    };
  },
};

/**
 * Runs the Opening step on a session whose facts are verified and whose
 * focus is decided, as a funnel (OPENING_ROUND_PLAN). Claude writes and Sol
 * judges (DRAFT2_OPENING_ROLES); both follow the focus the run started with.
 * Round 1: the writer writes fifteen openings (cover + slide 2); the judge
 * scores them and proposes three of its own. Round 2: the writer revises the
 * three best clean versions against their own issues and edits the
 * proposals, which also compete as the judge wrote them; the judge scores
 * the nine, not told which ones are its own, and proposes one more. Round 3:
 * the writer revises the two best and edits the last proposal for the
 * judge's final pick. The program keeps the better of each version and its
 * revision, so a round never loses the best opening so far. Pausing,
 * continuing and the heartbeat are the funnel's (draft2-funnel-run.ts).
 */
export async function runDraft2Opening(input: Draft2OpeningInput): Promise<Draft2SessionRow> {
  // v4 (docs/features/draft2-v4.md): the Opening step drafts the whole carousel's words in one call; a v4 draft paused for time is drafted again.
  if (!input.more) {
    const session = await getDraft2Session(input.topicId, input.sessionId);
    if (session?.pipeline === "v4" && (!input.resume || session.opening?.pipeline === "v4")) return (await import("./draft2-draft")).runDraft2Draft(input);
  }
  return runFunnelStep(OPENING_STEP, input);
}

/**
 * Records the editor's pick among every version the run scored; downstream
 * steps use it over the judge's winner. The choice is kept beside the
 * judge's scores so it can later calibrate the judge.
 */
export function recordOpeningChoice(input: { topicId: string; sessionId: string; candidateId: string }): Promise<Draft2SessionRow> {
  return recordFunnelChoice(OPENING_STEP, input);
}
