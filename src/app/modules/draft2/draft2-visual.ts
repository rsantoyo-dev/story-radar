import "server-only";
import { recordFunnelChoice, runFunnelStep, type FunnelStep, type FunnelStepInput } from "./draft2-funnel-run";
import { DRAFT2_VISUAL_ROLES } from "./draft2-models";
import { Draft2InputError } from "./draft2-facts.types";
import { focusForModels, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { funnelVersions } from "./draft2-funnel";
import { inventoryForModels, type Draft2CharacterChoice, type Draft2Inventory } from "./draft2-inventory.types";
import {
  VISUAL_GATE, avoidTerms, carouselSlides, mechanicalVisualIssues, parseVisualCandidates, parseVisualEvaluation, sameVisual, visualEvaluationSchema, visualExploreRequest,
  visualJudgeRequest, visualLayout, visualModeLine, visualPlan, visualRefineRequest, visualSchema,
  type Draft2CarouselSlide, type Draft2Visual, type Draft2VisualCandidate, type Draft2VisualCharacter, type Draft2VisualIssue, type Draft2VisualMode, type Draft2VisualScore,
} from "./draft2-visual.types";
import { brandBrief, composeInstructions, narrativeSkills } from "./skills/draft2-skills";
import { VISUALS_SKILL } from "./skills/visuals";
import { resolveCreativeVisualGuidance } from "../stories/creative-visual-guidance";
import type { Draft2SessionRow } from "@/db/schema";

/** What a visual script run pictures and follows: the carousel's words, where they came from, the focus, the people and places, the characters and the editor's choice on them. */
type VisualSnapshot = {
  carousel: Draft2CarouselSlide[];
  deckId: string;
  openingId: string;
  closingId: string;
  focus: Draft2FocusSnapshot;
  inventory: Draft2Inventory;
  characters: Draft2VisualCharacter[];
  characterChoice: Draft2CharacterChoice;
};

/**
 * What a run pictures: a continued run keeps what it started with, while the
 * people and places are still the version it read; a new run takes the deck
 * as it stands (the editor's choice, else the judge's winner), once its run
 * has finished, with the opening and closing it connects, which must still
 * be the ones chosen, and the people and places as last found.
 */
function visualTarget(session: Draft2SessionRow, stopped: Draft2Visual | undefined): VisualSnapshot {
  const inventory = session.inventory;
  if (stopped) {
    const { carousel, deckId, openingId, closingId, focus, characters, characterChoice } = stopped;
    if (!carousel || !deckId || !openingId || !closingId || !focus || !characters || !characterChoice) throw new Draft2InputError("This visual script run does not record what it pictures. Write the visual script again.");
    if (!inventory || inventory.version !== stopped.inventoryVersion) throw new Draft2InputError("The people and places changed since this run started. Write the visual script again.");
    return { carousel, deckId, openingId, closingId, focus, inventory, characters, characterChoice };
  }
  const deck = session.deck;
  if (!deck || deck.status === "running" || deck.status === "paused") throw new Draft2InputError("The visual script pictures the whole carousel. Finish the deck first.");
  const chosenId = deck.editorChoiceId ?? deck.winnerId;
  const chosen = chosenId ? funnelVersions(deck.rounds).find((version) => version.candidate.id === chosenId) : undefined;
  if (!chosen) throw new Draft2InputError("The deck has no version to picture yet. Choose a deck first.");
  if (!deck.opening || !deck.closing || !deck.focus) throw new Draft2InputError("This deck does not record the opening and closing it connects. Write the deck again first.");
  const openingNow = session.opening?.editorChoiceId ?? session.opening?.winnerId;
  const closingNow = session.closing?.editorChoiceId ?? session.closing?.winnerId;
  if ((openingNow && openingNow !== deck.opening.id) || (closingNow && closingNow !== deck.closing.id)) {
    throw new Draft2InputError(`The deck connects ${deck.opening.id} and ${deck.closing.id}; the opening and closing chosen now are ${openingNow} and ${closingNow}. Write the deck again first.`);
  }
  if (!inventory || inventory.status !== "ready") throw new Draft2InputError("Find the people and places first: the visual script shows only what is verified.");
  return {
    carousel: carouselSlides(deck.opening, chosen.candidate, deck.closing),
    deckId: chosen.candidate.id, openingId: deck.opening.id, closingId: deck.closing.id, focus: deck.focus,
    inventory, characters: inventory.roster, characterChoice: inventory.characters,
  };
}

/** The visual script on the shared funnel: its plan (by carousel length), gate, roles, prompts and contract. */
const VISUAL_STEP: FunnelStep<Draft2VisualCandidate, Draft2VisualScore, Draft2VisualIssue, Draft2Visual, VisualSnapshot> = {
  step: "visual",
  noun: "visual script",
  article: "a visual script",
  plural: "visual scripts",
  plan: ({ carousel }) => visualPlan(carousel),
  gate: VISUAL_GATE,
  operations: { writer: "draft2_visual", judge: "draft2_visual_review" },
  roles: DRAFT2_VISUAL_ROLES,
  snapshot: visualTarget,
  newRun: ({ carousel, deckId, openingId, closingId, focus, inventory, characters, characterChoice }, profile) => ({
    carousel, deckId, openingId, closingId, focus, inventoryVersion: inventory.version, characters, characterChoice, mode: profile.visualFidelityMode as Draft2VisualMode,
  }),
  setup: ({ snapshot: { carousel, focus, inventory, characters, characterChoice }, profile, plan }) => {
    const mode = profile.visualFidelityMode as Draft2VisualMode;
    // The identity in full (not v1's 1,400-character excerpt for text prompts): the script is where it is applied.
    const brief = [brandBrief(profile), `# Visual identity\n${resolveCreativeVisualGuidance(profile)}`, visualModeLine(mode)].join("\n\n");
    const positions = carousel.map((slide) => slide.slide);
    const avoid = avoidTerms(profile.creativeIdentity);
    return {
      writer: composeInstructions("visual-writer", [VISUALS_SKILL, ...narrativeSkills(focus.values.narrative)], brief),
      judge: composeInstructions("visual-judge", [VISUALS_SKILL, ...narrativeSkills(focus.values.narrative)], brief),
      // The layout: the image model letters the words, and the logo and the page number are added afterwards, where the Topic puts them.
      context: { focus: focusForModels(focus.values), carousel, layout: visualLayout(profile, carousel), peopleAndPlaces: inventoryForModels(inventory), characters, characterChoice },
      schemas: { writer: visualSchema(positions), judge: visualEvaluationSchema(positions) },
      parseCandidates: parseVisualCandidates,
      parseEvaluation: (text, ids) => parseVisualEvaluation(text, ids, positions),
      mechanical: (candidates) => mechanicalVisualIssues(candidates, { carousel, inventory, characters, characterChoice, mode, avoid }),
      explore: visualExploreRequest,
      refine: visualRefineRequest,
      judgeRequest: (round, candidates, mechanical, revised) => visualJudgeRequest(plan, round, candidates, mechanical, revised),
      same: sameVisual,
    };
  },
};

/**
 * Runs the visual script on a session whose deck is finished and whose
 * people and places are found: the carousel's images as one visual story,
 * in the brand's identity, with real people and places only through their
 * verified material. Claude writes three scripts (two for a long carousel);
 * Sol scores them and proposes one of its own; Claude revises the best and
 * edits Sol's, which also competes as Sol wrote it, for Sol's pick. Pausing,
 * continuing and the heartbeat are the funnel's (draft2-funnel-run.ts).
 */
export function runDraft2Visual(input: FunnelStepInput): Promise<Draft2SessionRow> {
  return runFunnelStep(VISUAL_STEP, input);
}

/** Records the editor's pick among every script the run scored, beside the judge's scores. */
export function recordVisualChoice(input: { topicId: string; sessionId: string; candidateId: string }): Promise<Draft2SessionRow> {
  return recordFunnelChoice(VISUAL_STEP, input);
}
