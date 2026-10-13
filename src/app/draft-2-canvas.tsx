"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActionRow, Button, EmptyState, FormField, InlineNotice, LoadingState, SectionHeader, StatusBadge, type StatusTone } from "@/app/ui/primitives";
import type { StoryContentResponse } from "@/app/radar-dashboard";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2SessionStatus, Draft2TraceEntry } from "@/app/modules/draft2/draft2-facts.types";
import {
  CLASSIC_CONCEPT, CLASSIC_NARRATIVE, FOCUS_ANCHOR_MAX_CHARACTERS, FOCUS_CONCEPT_ARCS, FOCUS_MAX_REVEALS, FOCUS_PREMISE_MAX_CHARACTERS, FOCUS_REVEAL_MAX_CHARACTERS, focusConcept, FOCUS_AUDIENCE_MAX_CHARACTERS, FOCUS_CONSEQUENCE_MAX_CHARACTERS, FOCUS_DIRECTION_MAX_CHARACTERS, FOCUS_FRAMINGS, FOCUS_GOALS, FOCUS_GRAVITIES,
  FOCUS_NARRATIVE_ENDINGS, FOCUS_NARRATIVE_FORMS, FOCUS_PROGRESSION_MAX_CHARACTERS, FOCUS_STRUCTURES, FOCUS_VISUAL_DIRECTION_MAX_CHARACTERS, focusFindings, focusMaterial, focusNarrative,
  type Draft2Focus, type Draft2FocusField, type Draft2FocusFinding, type Draft2ConceptArc, type Draft2FocusConcept, type Draft2FocusMaterial, type Draft2FocusNarrative, type Draft2FocusValues, type Draft2FocusVoice, type Draft2NarrativeForm,
} from "@/app/modules/draft2/draft2-focus.types";
import { TONE_KEYS, toneWords, type ToneKey } from "@/app/modules/draft2/skills/tone";
import {
  OPENING_GATE, OPENING_MAX_ROUNDS, OPENING_STALL_MS, openingResumeRound,
  type Draft2Opening, type Draft2OpeningCandidate, type Draft2OpeningCriterion,
} from "@/app/modules/draft2/draft2-opening.types";
import { CLOSING_GATE, CLOSING_MAX_ROUNDS, type Draft2Closing, type Draft2ClosingCandidate, type Draft2ClosingCriterion } from "@/app/modules/draft2/draft2-closing.types";
import { DECK_GATE, DECK_MAX_ROUNDS, type Draft2Deck, type Draft2DeckCandidate, type Draft2DeckCriterion } from "@/app/modules/draft2/draft2-deck.types";
import { REVIEW_CRITERIA, proposedPatches, reviewCurrent, type Draft2Review } from "@/app/modules/draft2/draft2-review.types";
import { INVENTORY_CHARACTER_CHOICES, type Draft2CharacterChoice, type Draft2Inventory, type Draft2InventoryEntity, type Draft2InventoryStoryPhoto } from "@/app/modules/draft2/draft2-inventory.types";
import { VISUAL_GATE, VISUAL_MAX_ROUNDS, deckCarousel, sameCarouselWords, visualPlan, type Draft2Visual, type Draft2VisualCandidate, type Draft2VisualCriterion, type Draft2VisualRecurring, type Draft2VisualShot } from "@/app/modules/draft2/draft2-visual.types";
import { IMAGES_MAX_REQUESTS, draft2ImageDownloads, latestAttempt, shownAttempt, slideSettled, type Draft2ImageAttempt, type Draft2ImageReview, type Draft2Images, type Draft2SlideImage } from "@/app/modules/draft2/draft2-images.types";
import { CAPTION_GATE, CAPTION_MAX_CHARACTERS, CAPTION_MAX_ROUNDS, captionPostText, type Draft2Caption, type Draft2CaptionCandidate, type Draft2CaptionCriterion } from "@/app/modules/draft2/draft2-caption.types";
import { confirmedMentions, mentionEntities, sameMentions, type Draft2MentionAccount, type Draft2MentionStatus, type Draft2Mentions } from "@/app/modules/draft2/draft2-mentions.types";
import { publicationCurrent, publicationTarget, targetPostText, type Draft2Publication, type Draft2PublicationTarget } from "@/app/modules/draft2/draft2-publication.types";
import {
  FUNNEL_ACCEPTABLE_SCORE, FUNNEL_MAX_EXTRA_ROUNDS, criterionOf, funnelAcceptedWinner, funnelBestVersions, funnelExtendable, funnelResumeRound, funnelScorePasses, funnelVersions, hasMaterialError,
  type FunnelCandidate, type FunnelGate, type FunnelIssue, type FunnelRegression, type FunnelRound, type FunnelRun, type FunnelScore, type FunnelVersion,
} from "@/app/modules/draft2/draft2-funnel";
import { DRAFT2_OPENING_EARLIER_ROLES, DRAFT2_OPENING_ROLES, draft2ModelName, type Draft2Cast, type Draft2FunnelStepName } from "@/app/modules/draft2/draft2-models";
import {
  adjacentDraft2Steps, contentStatusLabel, DRAFT_2_STEPS, draft2RailState, draft2StepFromPath, draft2StepHref, draft2StepPhase, minutes, paragraphs, sessionMetrics, sourceHost, stepMetrics, storyHref, traceUsageLine, usd, wordCount,
  type Draft2StepKey,
} from "./draft-2-canvas.core";
import {
  Draft2Rail, OverviewBoard, PipelineStrip, Prerequisite, ScreenLink, SourcePanel, StepPager, StepScreen, screenStatusLabel, useScreenMemory, useScreenShortcuts, useScreenTitle,
  type ScreenStep,
} from "./draft-2-canvas-shell";
import { StoryPhotosPanel } from "./story-photos-panel";
import { RunPublishActions } from "./run-publish-actions";
import { PublicationChannelsPanel } from "./publication-channels-panel";
import styles from "./draft-2-canvas.generated.module.css";

/** The Draft 2 session as the API returns it. */
type Draft2SessionView = {
  id: string;
  status: Draft2SessionStatus;
  step: string;
  facts: Draft2Fact[] | null;
  evaluation: Draft2FactsEvaluation | null;
  rounds: Draft2FactsRound[];
  focus: Draft2Focus | null;
  opening: Draft2Opening | null;
  closing: Draft2Closing | null;
  deck: Draft2Deck | null;
  review: Draft2Review | null;
  inventory: Draft2Inventory | null;
  visual: Draft2Visual | null;
  images: Draft2Images | null;
  mentions: Draft2Mentions | null;
  caption: Draft2Caption | null;
  publication: Draft2Publication | null;
  trace: Draft2TraceEntry[];
  error: string | null;
  updatedAt: string;
};

type Draft2RunStep = "facts" | "focus" | "opening" | "closing" | "deck" | "review" | "inventory" | "visual" | "images" | "mentions" | "caption" | "publication";
/** The steps that run on the funnel, in rounds that can pause and continue. */
type Draft2FunnelStep = "opening" | "closing" | "deck" | "visual" | "caption";

/** Up to three rounds of two provider calls; the route itself allows 300 s. */
const STEP_REQUEST_TIMEOUT_MS = 540_000;
/** How often a run whose request was lost is checked, and how long the server may stay unreachable before the canvas stops waiting. */
const FOLLOW_POLL_MS = 10_000;
const FOLLOW_UNREACHABLE_MS = 3 * 60_000;

/** A request that ended without telling how the run went: the connection dropped, it timed out, or a gateway answered for the server. The run may go on. */
class Draft2LostRequest extends Error {}

/** One step the autopilot ran, how it ended, and what it took. */
type AutopilotEntry = { step: Draft2RunStep; status: "ready" | "needs-review" | "failed"; ms: number; startedAt: string; /** The best score a funnel step reached. */ score?: number };
type Autopilot = { active: boolean; startedAt: string; current?: Draft2RunStep; steps: AutopilotEntry[]; outcome?: string; finishedAt?: string };
type AutopilotNext = { step: Exclude<Draft2RunStep, "publication">; continuing?: boolean } | { done: true } | { blocked: string };
const STEP_TITLE: Record<Draft2RunStep, string> = {
  facts: "Facts", focus: "Focus", inventory: "People and places", mentions: "Accounts to tag", opening: "Opening", closing: "Closing", deck: "Deck", review: "Review", visual: "Visual script", images: "Images", caption: "Caption", publication: "Publish",
};

/** The screen a run belongs to: the accounts to tag are part of the caption's screen, the approval of the publish screen. */
function screenOfRun(step: Draft2RunStep | undefined): Draft2StepKey | undefined {
  return step === "mentions" ? "caption" : step === "publication" ? "publish" : step;
}

/** Where the article panel's open or closed state is kept between visits, for this browser only. */
const SOURCE_PANEL_KEY = "press-craftor:draft2-source-panel";

/** A funnel run as the autopilot reads it: nothing yet, stopped (to continue), failed (stop), finished for something that changed since (write again), or finished. */
function runNeeds(step: Exclude<Draft2RunStep, "publication">, run: { status: string; winnerId?: string; editorChoiceId?: string; error?: string } | null | undefined, changed: boolean, noun: string): AutopilotNext | undefined {
  if (!run) return { step };
  if (run.status === "paused" || run.status === "running") return { step, continuing: true };
  if (run.status === "failed") return { blocked: `The ${noun} failed${run.error ? `: ${run.error}` : "."} Run it again once it is fixed.` };
  if (!(run.editorChoiceId ?? run.winnerId) || changed) return { step };
  return undefined;
}

/**
 * The next step the autopilot runs, from the session as it stands: the first
 * step not finished, stopped, or finished for something that changed since
 * (the same rules the canvas shows on each step). A step that needs the
 * editor blocks the run; a run marked running whose heartbeat stopped is
 * continued.
 */
function nextAutopilotStep(session: Draft2SessionView | null, now: number): AutopilotNext {
  if (!session) return { step: "facts" };
  const stale = now - Date.parse(session.updatedAt) > OPENING_STALL_MS;
  const factsVerified = Boolean(session.facts?.length) && (session.step !== "facts" || session.status === "ready");
  if (!factsVerified) {
    if (session.step === "facts" && session.status === "running" && !stale) return { blocked: "The facts are still being verified." };
    if (session.step === "facts" && session.status === "needs-review" && session.facts?.length) return { blocked: "The reviewer did not accept the facts after three extractions: review them, then run the facts again." };
    return { step: "facts" };
  }
  // People and places come first: the focus chooses the narrative form with them.
  const inventory = session.inventory;
  if (!inventory || inventory.status === "failed" || (inventory.status === "running" && stale)) return { step: "inventory" };
  if (inventory.status === "running") return { blocked: "The people and places are being found." };
  const focus = session.focus;
  const waiting = inventory.entities.filter((entity) => entity.person?.status === "candidates").length;
  if (waiting && !focus?.values) return { blocked: `${waiting} ${waiting === 1 ? "person waits" : "people wait"} for you in People and places: confirm or reject ${waiting === 1 ? "them" : "each"}, then run the autopilot again.` };
  if (!focus?.values || (focus.status === "running" && stale)) return { step: "focus" };
  if (focus.status === "running") return { blocked: "The focus is being decided." };
  const findings = focusFindings(focus.values, focusMaterial(inventory));
  if (findings.length) return { blocked: `Fix the focus first: ${findings.map((finding) => finding.detail).join(" ")}` };
  const mentions = session.mentions;
  if (!mentions || mentions.status === "failed" || (mentions.status === "running" && stale)) return { step: "mentions" };
  const opening = session.opening;
  const openingNeeds = runNeeds("opening", opening, Boolean(opening && (!opening.focus || opening.focus.version !== focus.version)), "opening");
  if (openingNeeds) return openingNeeds;
  const openingId = opening!.editorChoiceId ?? opening!.winnerId;
  const closing = session.closing;
  const closingNeeds = runNeeds("closing", closing, Boolean(closing?.opening && closing.opening.id !== openingId), "closing");
  if (closingNeeds) return closingNeeds;
  const closingId = closing!.editorChoiceId ?? closing!.winnerId;
  const deck = session.deck;
  const deckNeeds = runNeeds("deck", deck, Boolean(deck && ((deck.closing && deck.closing.id !== closingId) || (deck.opening && deck.opening.id !== openingId))), "deck");
  if (deckNeeds) return deckNeeds;
  const deckId = deck!.editorChoiceId ?? deck!.winnerId;
  // The review reads the chosen carousel before its images are planned; a new opening, closing or deck needs a new reading.
  const review = session.review;
  if (!review || review.status === "failed" || !reviewCurrent(review, { openingId, closingId, deckId }) || (review.status === "running" && stale)) return { step: "review" };
  if (review.status === "running") return { blocked: "The carousel is being read." };
  const visual = session.visual;
  // The script pictures the carousel's words and the images letter them: a review patch or an edit applied since asks for a new script.
  const carouselNow = deckCarousel(deck);
  const visualNeeds = runNeeds("visual", visual, Boolean(visual && (visual.deckId !== deckId || visual.inventoryVersion !== inventory.version || (visual.carousel && carouselNow && !sameCarouselWords(visual.carousel, carouselNow)))), "visual script");
  if (visualNeeds) return visualNeeds;
  const visualId = visual!.editorChoiceId ?? visual!.winnerId;
  const images = session.images;
  if (!images || images.visualId !== visualId) return { step: "images" };
  const pending = images.slides.some((slide) => !slideSettled(slide));
  if (pending && (images.status === "paused" || images.status === "failed" || (images.status === "running" && stale))) return { step: "images", continuing: true };
  if (images.status === "running" && !stale) return { blocked: "The images are being made." };
  if (images.status === "failed") return { blocked: `The images failed${images.error ? `: ${images.error}` : "."}` };
  if (images.slides.some((slide) => !shownAttempt(slide))) return { blocked: "Some slides have no image: make them from their cards, then go on." };
  return { done: true };
}

/** How a step ended for the autopilot's log. */
function stepOutcome(session: Draft2SessionView, step: Draft2RunStep): AutopilotEntry["status"] {
  if (step === "facts") return session.step !== "facts" || session.status === "ready" ? "ready" : session.status === "failed" ? "failed" : "needs-review";
  const status = (session as unknown as Record<string, { status?: string } | null>)[step]?.status;
  return status === "failed" ? "failed" : status === "needs-review" ? "needs-review" : "ready";
}

/** The best score a run reached, across its rounds. */
const bestScoreOf = <C extends FunnelCandidate>(run: FunnelRun<C> | null | undefined): number | undefined => run ? funnelBestVersions(funnelVersions(run.rounds))[0]?.score?.overall : undefined;

/**
 * The last round a paused or stopped run can be continued from: its plan's
 * rounds and its own extra rounds (the floor's and the editor's), and one
 * past them, which the server closes with the run's best version.
 */
const continuableUpTo = (run: { extraRounds?: number }, planRounds: number) => planRounds + (run.extraRounds ?? 0) + 1;

/** The version the next steps build on: the editor's choice, else the judge's winner. */
const chosenVersion = <C extends FunnelCandidate>(run: FunnelRun<C> | null | undefined) =>
  run ? funnelVersions(run.rounds).find((version) => version.candidate.id === (run.editorChoiceId ?? run.winnerId)) : undefined;

/** A funnel run's status as the canvas shows it: an unaccepted run is acceptable from the floor the funnel works to, and under it once its extra rounds are spent. */
function funnelStatusOf<C extends FunnelCandidate>(run: FunnelRun<C> | null | undefined): { label: string; tone: StatusTone } | undefined {
  if (!run) return undefined;
  if (run.status !== "needs-review") return OPENING_STATUS[run.status];
  const best = bestScoreOf(run);
  if (best === undefined) return OPENING_STATUS["needs-review"];
  return best >= FUNNEL_ACCEPTABLE_SCORE ? { label: `Acceptable · ${best}`, tone: "info" } : { label: `Under ${FUNNEL_ACCEPTABLE_SCORE} · ${best}`, tone: "warning" };
}

/** Whether a run that ended unaccepted with its rounds spent may take one more (FUNNEL_EXTRA_ROUND), up to the cap. */
const moreRoundAvailable = (run: { status: string; rounds: readonly { evaluation?: unknown }[]; extraRounds?: number } | null | undefined, planRounds: number) =>
  Boolean(run && run.status === "needs-review" && run.rounds.length > 0 && run.rounds.every((round) => round.evaluation) && run.rounds.length >= planRounds + (run.extraRounds ?? 0) && (run.extraRounds ?? 0) < FUNNEL_MAX_EXTRA_ROUNDS);

const SESSION_STATUS: Record<Draft2SessionStatus, { label: string; tone: StatusTone }> = {
  running: { label: "Running", tone: "info" },
  ready: { label: "Verified", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
};

const FOCUS_STATUS: Record<Draft2Focus["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Deciding", tone: "info" },
  ready: { label: "Decided", tone: "success" },
  failed: { label: "Failed", tone: "error" },
};

const OPENING_STATUS: Record<Draft2Opening["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Running", tone: "info" },
  paused: { label: "Paused", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
};

const FACT_STATUS: Record<Draft2Fact["status"], { label: string; tone: StatusTone }> = {
  established: { label: "Established", tone: "success" },
  attributed: { label: "Attributed", tone: "info" },
  disputed: { label: "Disputed", tone: "warning" },
};

const CRITERION_LABEL: Record<Draft2OpeningCriterion, string> = { tension: "Tension", payoff: "Payoff", clarity: "Clarity", grounding: "Grounding", voice: "Voice", focus: "Focus" };
const CLOSING_CRITERION_LABEL: Record<Draft2ClosingCriterion, string> = { resolution: "Resolution", meaning: "Meaning", action: "Action", continuity: "Continuity", grounding: "Grounding", voice: "Voice", focus: "Focus" };
const DECK_CRITERION_LABEL: Record<Draft2DeckCriterion, string> = { flow: "Flow", coverage: "Coverage", pacing: "Pacing", clarity: "Clarity", grounding: "Grounding", voice: "Voice", focus: "Focus" };
const VISUAL_CRITERION_LABEL: Record<Draft2VisualCriterion, string> = { narrative: "Narrative", progression: "Progression", beat: "Beat", continuity: "Identity", brand: "Brand", truth: "Truth", craft: "Craft", focus: "Focus" };
const RECURRING_LABEL: Record<Draft2VisualRecurring, string> = { none: "", accent: "Recurring element as an accent", focus: "Recurring element leads", callback: "The recurring element returns" };
const CHARACTER_CHOICE_LABEL: Record<Draft2CharacterChoice, string> = { auto: "Claude decides in each script", on: "A brand character narrates", off: "No brand character" };
const SHOT_LABEL: Record<Draft2VisualShot, string> = { wide: "Wide shot", medium: "Medium shot", close: "Close-up", overhead: "Overhead", typography: "Typography" };
const IMAGES_STATUS: Record<Draft2Images["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Generating", tone: "info" }, paused: { label: "Paused", tone: "warning" }, ready: { label: "Ready", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" }, failed: { label: "Failed", tone: "error" },
};
const CAPTION_CRITERION_LABEL: Record<Draft2CaptionCriterion, string> = { hook: "Hook", scan: "Scan", grounding: "Grounding", voice: "Voice", action: "Action", hashtags: "Hashtags", fit: "Fit" };
const MENTION_STATUS: Record<Draft2MentionStatus, { label: string; tone: StatusTone }> = {
  verified: { label: "On Instagram", tone: "info" }, confirmed: { label: "Tagged", tone: "success" }, rejected: { label: "Not them", tone: "neutral" },
  "not-found": { label: "Not found", tone: "neutral" }, unavailable: { label: "Not checked", tone: "warning" },
};
const NEED_LABEL: Record<string, string> = { "generic-illustration": "Illustration", "character-reference": "Brand character", "real-photo": "Verified photo", "verified-map": "Verified map", typography: "Typography" };

const FRAMING_LABEL: Record<Draft2FocusValues["framing"], string> = { "reader-consequence": "Reader consequence", explainer: "Explainer", authority: "Authority" };
const STRUCTURE_LABEL: Record<Draft2FocusValues["structure"]["kind"], string> = { arc: "Arc: one story, one tension", steps: "Steps: an ordered procedure", list: "List: “N things to…”" };
const GOAL_LABEL: Record<Draft2FocusValues["goal"], string> = { followers: "Followers", discussion: "Discussion", saves: "Saves", shares: "Shares" };
const CONCEPT_LABEL: Record<Draft2ConceptArc, string> = {
  classic: "Classic: the news, told straight",
  discovery: "Discovery: the reader discovers the news",
  "progressive-reveal": "Progressive reveal: the answer, piece by piece",
  "problem-solution": "Problem → solution: what it costs, what solves it",
  "cause-effect": "Cause → effect: one link of the chain per slide",
  escalation: "Escalation: each slide bigger than the last",
  comparison: "Comparison: two alternatives, the same criteria",
};
/** What a beat arc's lines are, as the field asks for them. */
const BEATS_LABEL: Record<Exclude<Draft2ConceptArc, "classic" | "discovery">, string> = {
  "progressive-reveal": "The pieces of the answer, one per line, in order",
  "problem-solution": "Problem, what it costs, solution: one per line",
  "cause-effect": "The chain, one link per line",
  escalation: "The steps, smallest first, one per line",
  comparison: "The criteria, one per line",
};
const conceptName = (arc: Draft2ConceptArc) => CONCEPT_LABEL[arc].split(":")[0];
const NARRATIVE_LABEL: Record<Draft2NarrativeForm, string> = {
  classic: "Classic: one story, slide by slide",
  "character-guide": "Character guide: a guide leads the reader through it",
  "traveling-object": "Traveling object: one object crosses the story",
  panorama: "Panorama: one wide scene runs across every slide",
  "follow-the-line": "Follow the line: a real line leads from slide to slide",
};
/** The anchor each form starts from when the editor describes one, and what the field calls it. */
const FORM_ANCHOR: Record<Exclude<Draft2NarrativeForm, "classic">, { kind: "figure" | "object" | "scene" | "line"; label: string; describe: string }> = {
  "character-guide": { kind: "figure", label: "Guide", describe: "A figure from the story or an anonymous one, as it will look on every slide; never a real person of the story." },
  "traveling-object": { kind: "object", label: "Object", describe: "One object, as it will look on every slide; nothing that suggests what the facts do not say." },
  panorama: { kind: "scene", label: "Scene", describe: "The one wide scene every slide is a section of, generic, never a named real place." },
  "follow-the-line": { kind: "line", label: "Line", describe: "The line from the story (a trail, a route, a street, a river) that runs through every slide." },
};
const ENDING_LABEL: Record<Draft2FocusNarrative["ending"], string> = { resolves: "Resolves the story", returns: "Returns to the cover" };
const GRAVITY_LABEL: Record<Draft2FocusVoice["gravity"], string> = { light: "Light", ordinary: "Ordinary", serious: "Serious", grave: "Grave" };
const TONE_LABEL: Record<ToneKey, string> = { formality: "Formality", humor: "Humor", energy: "Energy", optimism: "Optimism", provocation: "Provocation" };

type RoleNames = { writer: string; judge: string };
const FUNNEL_STEPS: readonly Draft2FunnelStepName[] = ["opening", "closing", "deck", "visual", "caption"];
/** Who writes and who judges each step's next run, as today's cast names them (the server reads the environment); until it answers, the providers' names. */
const todayNames = (cast: Draft2Cast | undefined): Record<Draft2FunnelStepName, RoleNames> => Object.fromEntries(FUNNEL_STEPS.map((step) => {
  const roles = cast?.funnel[step];
  return [step, {
    writer: draft2ModelName(roles?.writer.model, roles?.writer.provider ?? DRAFT2_OPENING_ROLES.writer),
    judge: draft2ModelName(roles?.judge.model, roles?.judge.provider ?? DRAFT2_OPENING_ROLES.judge),
  }];
})) as Record<Draft2FunnelStepName, RoleNames>;
/** Who wrote and who judged a run, by the models it recorded (gpt-6-luna is Luna); one stored before the swap records no roles and had Sol writing and Claude judging. */
const roleNames = (run: Pick<Draft2Opening, "writer" | "judge">): RoleNames => ({
  writer: draft2ModelName(run.writer?.model, run.writer?.provider ?? DRAFT2_OPENING_EARLIER_ROLES.writer),
  judge: draft2ModelName(run.judge?.model, run.judge?.provider ?? DRAFT2_OPENING_EARLIER_ROLES.judge),
});
/** The model that played a provider's part in a session's facts, as its trace recorded it. */
const factsModel = (trace: readonly Draft2TraceEntry[], provider: Draft2TraceEntry["provider"]) => trace.find((entry) => entry.step === "facts" && entry.provider === provider)?.model;

/** Where a version comes from: its round, and the version it revises or the judge's proposal it is (as written) or edits. */
const versionOrigin = ({ round, candidate }: FunnelVersion, names: RoleNames) => {
  const proposal = candidate.proposalOf ? (candidate.asProposed ? ` · ${names.judge}’s ${candidate.proposalOf} as written` : ` · ${names.writer}’s edit of ${names.judge}’s ${candidate.proposalOf}`) : "";
  return `round ${round}${candidate.revisionOf ? ` · revises ${candidate.revisionOf}` : ""}${proposal}`;
};

/** Why a revision did not replace its version: a lower score, or the same or a higher one with a loss the score does not show. */
function regressionNote({ candidateId, previousId, from, to, worse }: FunnelRegression): string {
  const losses = worse.length ? ` (${worse.join(", ")})` : "";
  const lead = to < from ? `${candidateId} scored ${to}, below ${previousId}’s ${from}${losses}`
    : to === from ? `${candidateId} matched ${previousId}’s ${from} but did worse${losses}`
      : `${candidateId} scored ${to} to ${previousId}’s ${from} but did worse${losses}`;
  return `${lead}; ${previousId} stays the better version.`;
}

const listed = (items: readonly string[]) => items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items.join("");
const PART_LABEL: Record<string, string> = { cover: "cover", slide2: "slide 2", penultimate: "penultimate", last: "last slide" };
/** A part as the editor reads it: a slide of the opening or closing, or "deck slide 2" for the deck's s2 (the visual script names slides the same way). */
const partLabel = (part: string) => PART_LABEL[part] ?? (/^s(\d+)$/.exec(part) ? `deck slide ${part.slice(1)}` : part);
const issueTarget = (issue: FunnelIssue) => issue.candidateId ? ` · ${issue.candidateId}${issue.part ? ` · ${partLabel(issue.part)}` : ""}` : "";

/**
 * Draft 2: the second creative pipeline, beside the current studio, which it
 * never touches. The canvas brings in the selected story and runs each step
 * on it, one screen per step (`/draft-2/<step>`) behind an overview
 * (`/draft-2`): the rail, the pager and the keys move between screens in the
 * browser, so the session, a step running and the autopilot carry on.
 */
export function Draft2Canvas({ signedIn = false, topicId, topicName, themeStyle, storyId, from, returnContext }: {
  /** A signed-in session authorizes every request; the collector secret is not needed. */
  signedIn?: boolean;
  topicId: string;
  topicName: string;
  themeStyle: CSSProperties;
  storyId: string;
  from?: string;
  returnContext?: string;
}) {
  const [secret] = useState(() => {
    if (typeof window === "undefined" || signedIn) return "";
    try { return window.sessionStorage.getItem("story-radar:collector-secret") ?? ""; }
    catch { return ""; }
  });
  const [content, setContent] = useState<StoryContentResponse>();
  const [error, setError] = useState<string>();
  const [session, setSession] = useState<Draft2SessionView | null>();
  // Who plays each part in a run started now, as the server names them with the session it loads first.
  const [cast, setCast] = useState<Draft2Cast>();
  const [running, setRunning] = useState<Draft2RunStep>();
  const [runError, setRunError] = useState<{ step: Draft2RunStep; message: string }>();
  const [choosing, setChoosing] = useState<{ step: Draft2FunnelStep; id: string }>();
  const [choiceError, setChoiceError] = useState<{ step: Draft2FunnelStep; message: string }>();
  const [savingFocus, setSavingFocus] = useState<Draft2FocusField>();
  const [savingReview, setSavingReview] = useState<string>();
  const [reviewError, setReviewError] = useState<string>();
  const [savingInventory, setSavingInventory] = useState<string>();
  const [inventoryError, setInventoryError] = useState<string>();
  const [savingImage, setSavingImage] = useState<string>();
  const [imageError, setImageError] = useState<string>();
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [imagesDownload, setImagesDownload] = useState<{ tone: "success" | "error"; text: string }>();
  const [savingMention, setSavingMention] = useState<string>();
  const [mentionError, setMentionError] = useState<string>();
  const [acknowledged, setAcknowledged] = useState(false);
  // The step running now, readable from a loop that outlives the render that started it (the autopilot).
  const runningRef = useRef<Draft2RunStep | undefined>(undefined);
  const [autopilot, setAutopilot] = useState<Autopilot>();
  const stopRequested = useRef(false);
  const [focusError, setFocusError] = useState<string>();
  const [following, setFollowing] = useState<string>();
  // The clock a run is measured against, to tell a run that went silent from one still working.
  const [now, setNow] = useState(0);
  const back = storyHref(topicId, storyId, { from, returnContext });
  const headers = { Authorization: `Bearer ${secret}` };

  useEffect(() => {
    if (!secret && !signedIn) {
      Promise.resolve().then(() => setError("Connect with the collector secret on the dashboard to open this story."));
      return;
    }
    const controller = new AbortController();
    fetch(`/api/radar/stories/${encodeURIComponent(storyId)}/content?topicId=${encodeURIComponent(topicId)}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${secret}` },
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not open the story.");
      return body as StoryContentResponse;
    }).then((result) => {
      if (!controller.signal.aborted) setContent(result);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not open the story.");
    });
    return () => controller.abort();
  }, [secret, signedIn, storyId, topicId]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    void Promise.resolve().then(tick);
    const clock = setInterval(tick, 30_000);
    return () => clearInterval(clock);
  }, []);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/radar/draft2/session?topicId=${encodeURIComponent(topicId)}&storyId=${encodeURIComponent(storyId)}`, { cache: "no-store", signal, headers: { Authorization: `Bearer ${secret}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not read the Draft 2 session.");
    return { session: (body.session ?? null) as Draft2SessionView | null, cast: body.cast as Draft2Cast | undefined };
  }, [secret, storyId, topicId]);

  useEffect(() => {
    if (!content) return;
    const controller = new AbortController();
    loadSession(controller.signal).then((value) => { if (!controller.signal.aborted) { setSession(value.session); setCast(value.cast); } }).catch(() => { if (!controller.signal.aborted) setSession(null); });
    return () => controller.abort();
  }, [content, loadSession]);

  /** Runs one step: Facts starts a new session, the Opening continues the current one. */
  /** One step request; each has its own timeout, since an opening continues in further requests. */
  async function postStep(step: Draft2RunStep, payload: Record<string, unknown>): Promise<Draft2SessionView> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STEP_REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(`/api/radar/draft2/${step}?topicId=${encodeURIComponent(topicId)}`, {
          method: "POST", cache: "no-store", signal: controller.signal, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      } catch (cause) {
        throw new Draft2LostRequest(cause instanceof Error && cause.name === "AbortError" ? "The request took too long." : "The connection to the server dropped.");
      }
      const body = await response.json().catch(() => undefined) as { session?: Draft2SessionView; error?: string } | undefined;
      if (response.ok && body?.session) return body.session;
      // A gateway's page instead of the route's answer: the run may still be going.
      if (!body?.error) throw new Draft2LostRequest(`The server answered ${response.status} without a result.`);
      throw new Error(body.error);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Follows a run whose request was lost until it finishes, pauses or goes silent; undefined when the server stays unreachable. */
  async function followRun(step: Draft2FunnelStep | "images"): Promise<Draft2SessionView | undefined> {
    let unreachableSince: number | undefined;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, FOLLOW_POLL_MS));
      let current: Draft2SessionView | null;
      try {
        current = (await loadSession()).session;
        unreachableSince = undefined;
      } catch {
        unreachableSince ??= Date.now();
        if (Date.now() - unreachableSince > FOLLOW_UNREACHABLE_MS) return undefined;
        continue;
      }
      const run = current?.[step];
      if (!current || !run) return current ?? undefined;
      setSession(current);
      if (run.status !== "running" || Date.now() - Date.parse(current.updatedAt) > OPENING_STALL_MS) return current;
    }
  }

  /**
   * Runs one step: Facts starts a new session, the others continue the
   * current one; `continuing` picks a paused or stopped opening or closing
   * up. A run that pauses, or whose request is lost, goes on from its last
   * checkpoint in a new request until it finishes.
   */
  async function runStep(step: Exclude<Draft2RunStep, "publication">, { continuing = false, more = false, on = session }: { continuing?: boolean; more?: boolean; on?: Draft2SessionView | null } = {}): Promise<Draft2SessionView | undefined> {
    if (runningRef.current || (step !== "facts" && !on)) return undefined;
    runningRef.current = step;
    setRunning(step); setRunError(undefined); setChoiceError(undefined); setFocusError(undefined); setMentionError(undefined);
    try {
      if (step === "facts") {
        const next = await postStep("facts", { storyId });
        setSession(next);
        return next;
      }
      if (step === "focus" || step === "inventory" || step === "mentions" || step === "review") {
        const next = await postStep(step, { storyId, sessionId: on?.id });
        setSession(next);
        return next;
      }
      let payload: Record<string, unknown> = { storyId, sessionId: on?.id, ...(continuing ? { continue: true } : {}), ...(more ? { more: true } : {}) };
      // Each request advances at least one round or judgment; a round can pause once before its writer and once before its judge. An images run pauses while fal works.
      const maxRounds = step === "caption" ? CAPTION_MAX_ROUNDS : step === "visual" ? VISUAL_MAX_ROUNDS : step === "deck" ? DECK_MAX_ROUNDS : step === "closing" ? CLOSING_MAX_ROUNDS : OPENING_MAX_ROUNDS;
      const maxRequests = step === "images" ? IMAGES_MAX_REQUESTS : maxRounds * 2;
      for (let request = 0; request <= maxRequests; request++) {
        let next: Draft2SessionView | undefined;
        try {
          next = await postStep(step, payload);
        } catch (cause) {
          if (!(cause instanceof Draft2LostRequest)) throw cause;
          setFollowing(cause.message);
          next = await followRun(step);
          setFollowing(undefined);
          if (!next) throw new Error(`${cause.message} The server has not answered since; when it is back, reload and continue the run from where it stopped.`);
        }
        setSession(next);
        // Paused, or silent since its request was lost: pick it up again.
        const status = next[step]?.status;
        if (status !== "paused" && status !== "running") return next;
        payload = { storyId, sessionId: next.id, continue: true };
      }
      return undefined;
    } catch (cause) {
      const failure = `The ${step} step failed.`;
      const message = cause instanceof Draft2LostRequest ? `${cause.message} The server may still finish the step; reload to see it.` : cause instanceof Error ? cause.message : failure;
      setRunError({ step, message });
      // A failed run keeps its trace on the session; show it.
      loadSession().then((value) => setSession(value.session)).catch(() => undefined);
      return undefined;
    } finally {
      setFollowing(undefined);
      runningRef.current = undefined;
      setRunning(undefined);
    }
  }

  /**
   * Runs every step to the images without stopping, from wherever the session
   * stands: each step keeps the judge's winner; a step that ends under the
   * gate is marked and the run goes on; a failure, or a step that needs the
   * editor, stops it. The editor reviews at the end: re-runs or chooses in
   * any step, confirms the accounts, writes the caption and approves.
   */
  async function runAutopilot() {
    if (runningRef.current || autopilot?.active) return;
    stopRequested.current = false;
    let state: Autopilot = { active: true, startedAt: new Date().toISOString(), steps: [] };
    const show = (change: Partial<Autopilot>) => { state = { ...state, ...change }; setAutopilot(state); };
    show({});
    let current: Draft2SessionView | null = session ?? null;
    let previous: Draft2RunStep | undefined;
    for (let guard = 0; guard < 14; guard++) {
      if (stopRequested.current) { show({ outcome: "Stopped at your request; every step so far is kept." }); break; }
      const next = nextAutopilotStep(current, Date.now());
      if ("done" in next) { show({ outcome: "The images are made. Confirm the accounts to tag, write the caption and approve the carousel for publishing." }); break; }
      if ("blocked" in next) { show({ outcome: next.blocked }); break; }
      if (next.step === previous) { show({ outcome: `The ${STEP_TITLE[next.step].toLowerCase()} step did not advance; look at it before going on.` }); break; }
      previous = next.step;
      show({ current: next.step });
      const begin = Date.now();
      const result = await runStep(next.step, { continuing: next.continuing, on: current });
      const status: AutopilotEntry["status"] = result ? stepOutcome(result, next.step) : "failed";
      const score = result && (next.step === "opening" || next.step === "closing" || next.step === "deck" || next.step === "visual") ? bestScoreOf(result[next.step] as FunnelRun | null) : undefined;
      show({ current: undefined, steps: [...state.steps, { step: next.step, status, ms: Date.now() - begin, startedAt: new Date(begin).toISOString(), ...(score !== undefined ? { score } : {}) }] });
      if (!result || status === "failed") { show({ outcome: `The ${STEP_TITLE[next.step].toLowerCase()} step failed; the run stopped there.` }); break; }
      current = result;
      // The review's patches are applied as the editor wrote them; the Review screen shows each and undoes any.
      if (next.step === "review" && proposedPatches(result.review).length) {
        const patchedSession = await decideReviewPatch("apply-all", undefined, "autopilot", result);
        if (patchedSession) current = patchedSession;
      }
    }
    show({ active: false, current: undefined, finishedAt: new Date().toISOString() });
  }

  /** Saves one focus field the editor changed, or gives it back to Claude's value; one change at a time. */
  async function saveFocus(field: Draft2FocusField, change: { value: unknown } | { reset: true }) {
    if (!session || running || savingFocus) return;
    setSavingFocus(field); setFocusError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/focus?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, field, ...change }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the focus.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setFocusError(cause instanceof Error ? cause.message : "Could not save the focus.");
    } finally {
      setSavingFocus(undefined);
    }
  }

  /** The plan (the spine and the two directions) rewritten from how the story is now told, after the editor changed its concept, form or spine: one Claude call. */
  async function rewritePlan() {
    if (!session || running || savingFocus) return;
    setSavingFocus("direction"); setFocusError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/focus?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, storyId, rewrite: "plan" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not rewrite the plan.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setFocusError(cause instanceof Error ? cause.message : "Could not rewrite the plan.");
    } finally {
      setSavingFocus(undefined);
    }
  }

  /** One decision on a review patch (apply, decline, undo), or every proposed patch applied for the autopilot. No model call. */
  async function decideReviewPatch(action: "apply" | "decline" | "undo" | "apply-all", patchId?: string, by: "editor" | "autopilot" = "editor", on: Draft2SessionView | null | undefined = session): Promise<Draft2SessionView | undefined> {
    if (!on || savingReview) return undefined;
    setSavingReview(patchId ?? action); setReviewError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/review?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: on.id, action, ...(patchId ? { patchId } : {}), by }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the decision.");
      setSession(body.session as Draft2SessionView);
      return body.session as Draft2SessionView;
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : "Could not save the decision.");
      return undefined;
    } finally {
      setSavingReview(undefined);
    }
  }

  /** One people-and-places decision: a person's photo, a place's match, a story photo for either, the story's photos read again, or the characters choice. */
  async function decideInventory(input: Record<string, unknown>) {
    if (!session || running || savingInventory) return;
    setSavingInventory(String(input.entityId ?? input.action)); setInventoryError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/inventory?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, ...input }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the decision.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setInventoryError(cause instanceof Error ? cause.message : "Could not save the decision.");
    } finally {
      setSavingInventory(undefined);
    }
  }

  /** Every slide's shown image as one ZIP, built on the server, so the browser never learns where the images are stored. */
  async function downloadImages(count: number, reviewCopies: number) {
    if (!session || downloadingImages) return;
    setDownloadingImages(true); setImagesDownload(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/images/download?topicId=${encodeURIComponent(topicId)}&sessionId=${encodeURIComponent(session.id)}`, { cache: "no-store", headers });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "The images could not be downloaded.");
      }
      const fileName = /filename="([^"]+)"/u.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "carousel-draft2.zip";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setImagesDownload({ tone: "success", text: `${count} ${count === 1 ? "image" : "images"} downloaded as ${fileName}${reviewCopies ? ` (${reviewCopies} not yet approved, named “-review”)` : ""}.` });
    } catch (cause) {
      setImagesDownload({ tone: "error", text: cause instanceof Error ? cause.message : "The images could not be downloaded." });
    } finally {
      setDownloadingImages(false);
    }
  }

  /** One image decision: another image of a slide, made at once, or the version a slide shows. */
  async function decideImage(input: Record<string, unknown>) {
    if (!session || running || savingImage) return;
    setSavingImage(String(input.slide)); setImageError(undefined);
    let queued = false;
    try {
      const response = await fetch(`/api/radar/draft2/images?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, ...input }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the decision.");
      const next = body.session as Draft2SessionView;
      setSession(next);
      queued = next.images?.status === "paused";
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "Could not save the decision.");
    } finally {
      setSavingImage(undefined);
    }
    if (queued) void runStep("images", { continuing: true });
  }

  /** One decision on the accounts to tag: tag one, say it is not them, take that back, or add one of the editor's (checked on Instagram). */
  async function decideMention(input: Record<string, unknown>): Promise<boolean> {
    if (!session || running || savingMention) return false;
    setSavingMention(String(input.accountId ?? input.action)); setMentionError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/mentions?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, ...input }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the decision.");
      setSession(body.session as Draft2SessionView);
      return true;
    } catch (cause) {
      setMentionError(cause instanceof Error ? cause.message : "Could not save the decision.");
      return false;
    } finally {
      setSavingMention(undefined);
    }
  }

  /** Approves the carousel as it stands for publishing; nothing is published until the editor confirms a channel below. */
  async function approvePublication(acknowledgeIssues = acknowledged) {
    if (!session || running) return;
    setRunning("publication"); setRunError(undefined);
    try {
      setSession(await postStep("publication", { storyId, sessionId: session.id, acknowledgeIssues }));
      setAcknowledged(false);
    } catch (cause) {
      setRunError({ step: "publication", message: cause instanceof Error ? cause.message : "Could not approve the carousel." });
    } finally {
      setRunning(undefined);
    }
  }

  /** Records the editor's pick among the versions of an opening or a closing. */
  async function choose(step: Draft2FunnelStep, candidateId: string) {
    if (!session || choosing || running) return;
    setChoosing({ step, id: candidateId }); setChoiceError(undefined);
    try {
      const response = await fetch(`/api/radar/draft2/${step}?topicId=${encodeURIComponent(topicId)}`, {
        method: "PATCH", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, candidateId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not record your choice.");
      setSession(body.session as Draft2SessionView);
    } catch (cause) {
      setChoiceError({ step, message: cause instanceof Error ? cause.message : "Could not record your choice." });
    } finally {
      setChoosing(undefined);
    }
  }

  const host = content ? sourceHost(content.url) : "";
  const words = wordCount(content?.text);
  const text = paragraphs(content?.text);
  const contentReady = content?.contentStatus === "full" || content?.contentStatus === "likely-full";
  // Later steps only start on verified facts, so a session past Facts has them.
  const factsVerified = Boolean(session?.facts) && (session?.step !== "facts" || session?.status === "ready");
  const factsStatus = running === "facts" ? SESSION_STATUS.running : session ? (factsVerified ? SESSION_STATUS.ready : SESSION_STATUS[session.status]) : undefined;
  // A run still marked running whose heartbeat stopped: its request or the server ended, and it can be continued.
  const stalled = !running && session?.opening?.status === "running" && now > 0 && now - Date.parse(session.updatedAt) > OPENING_STALL_MS;
  const openingStatus = running === "opening" ? OPENING_STATUS.running : stalled ? { label: "Stopped", tone: "warning" as const } : funnelStatusOf(session?.opening);
  // The focus the opening would follow: decided, not being decided, and free of program findings.
  const focus = session?.focus ?? undefined;
  // People and places as the focus reads them: the narrative's anchor is checked against them as they stand now.
  const focusInventory = session?.inventory ?? undefined;
  const material = focusInventory?.status === "ready" ? focusMaterial(focusInventory) : undefined;
  const focusProblems = focus?.values ? focusFindings(focus.values, material) : [];
  const focusStalled = !running && focus?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const focusReady = Boolean(focus?.values) && focus?.status !== "running" && focusProblems.length === 0;
  const focusStatus = running === "focus" ? FOCUS_STATUS.running : focusStalled ? { label: "Stopped", tone: "warning" as const }
    : focus?.values && focusProblems.length && focus.status !== "running" ? { label: "Needs a fix", tone: "warning" as const } : focus ? FOCUS_STATUS[focus.status] : undefined;
  // An opening written with another version of the focus, or before the Focus step.
  const openingFocusVersion = session?.opening?.focus?.version;
  const focusChanged = Boolean(session?.opening && focus?.values) && openingFocusVersion !== focus?.version;
  // The closing ends the opening the editor chose (else the judge's winner), once that run has finished and followed a focus.
  const closing = session?.closing ?? undefined;
  const closingStalled = !running && closing?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const closingStatus = running === "closing" ? OPENING_STATUS.running : closingStalled ? { label: "Stopped", tone: "warning" as const } : funnelStatusOf(closing);
  const chosenOpeningId = session?.opening?.editorChoiceId ?? session?.opening?.winnerId;
  const openingFinished = Boolean(session?.opening && chosenOpeningId && session.opening.status !== "running" && session.opening.status !== "paused");
  const closingReady = openingFinished && Boolean(session?.opening?.focus);
  const closingResumable = closing && (closing.status === "paused" || closingStalled) && funnelResumeRound(closing) <= continuableUpTo(closing, CLOSING_MAX_ROUNDS);
  const closingResumeRound = closingResumable && closing ? funnelResumeRound(closing) : undefined;
  const closingPausedRound = closing?.status === "paused" ? funnelResumeRound(closing) : undefined;
  // A closing written for another opening than the one chosen now.
  const closingOpeningChanged = Boolean(closing?.opening && chosenOpeningId && closing.opening.id !== chosenOpeningId);
  // The deck connects the chosen opening and the closing that ends it, once the closing's run has finished.
  const deck = session?.deck ?? undefined;
  const deckStalled = !running && deck?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const deckStatus = running === "deck" ? OPENING_STATUS.running : deckStalled ? { label: "Stopped", tone: "warning" as const } : funnelStatusOf(deck);
  const chosenClosingId = closing?.editorChoiceId ?? closing?.winnerId;
  const closingFinished = Boolean(closing && chosenClosingId && closing.status !== "running" && closing.status !== "paused");
  const deckReady = closingFinished && !closingOpeningChanged;
  const deckResumable = deck && (deck.status === "paused" || deckStalled) && funnelResumeRound(deck) <= continuableUpTo(deck, DECK_MAX_ROUNDS);
  const deckResumeRound = deckResumable && deck ? funnelResumeRound(deck) : undefined;
  const deckPausedRound = deck?.status === "paused" ? funnelResumeRound(deck) : undefined;
  // A deck written for another closing or opening than the ones chosen now.
  const deckEndsChanged = Boolean(deck?.closing && deck.opening && ((chosenClosingId && deck.closing.id !== chosenClosingId) || (chosenOpeningId && deck.opening.id !== chosenOpeningId)));
  // People and places: found once the facts are verified; the people Commons matched wait for the editor.
  const inventory = session?.inventory ?? undefined;
  const inventoryStalled = !running && inventory?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const peopleToConfirm = inventory?.entities.filter((entity) => entity.person?.status === "candidates").length ?? 0;
  const inventoryStatus = running === "inventory" ? { label: "Searching", tone: "info" as const } : inventoryStalled ? { label: "Stopped", tone: "warning" as const }
    : inventory?.status === "failed" ? { label: "Failed", tone: "error" as const } : inventory?.status === "ready" ? (peopleToConfirm ? { label: `${peopleToConfirm} to confirm`, tone: "warning" as const } : { label: "Found", tone: "success" as const }) : undefined;
  // The visual script pictures the chosen deck between the chosen opening and closing, once the people and places are found.
  const visual = session?.visual ?? undefined;
  const visualStalled = !running && visual?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const visualStatus = running === "visual" ? OPENING_STATUS.running : visualStalled ? { label: "Stopped", tone: "warning" as const } : funnelStatusOf(visual);
  const chosenDeckId = deck?.editorChoiceId ?? deck?.winnerId;
  const deckFinished = Boolean(deck && chosenDeckId && deck.status !== "running" && deck.status !== "paused");
  // The review: read for the versions chosen now, or to read again.
  const review = session?.review ?? undefined;
  const reviewStalled = !running && review?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const reviewCurrentNow = reviewCurrent(review, { openingId: chosenOpeningId, closingId: chosenClosingId, deckId: chosenDeckId });
  const reviewStatus = running === "review" ? OPENING_STATUS.running
    : reviewStalled ? { label: "Stopped", tone: "warning" as const }
    : !review ? undefined
    : review.status === "failed" ? OPENING_STATUS.failed
    : review.status === "running" ? OPENING_STATUS.running
    : !reviewCurrentNow ? { label: "Changed since", tone: "warning" as const }
    : review.editor?.verdict === "ready" ? { label: `Ready · ${review.editor.scores.overall}`, tone: "success" as const }
    : { label: `${proposedPatches(review).length} to decide · ${review.editor?.scores.overall ?? "?"}`, tone: "info" as const };
  const reviewReady = deckFinished && !deckEndsChanged;
  const visualReady = deckFinished && !deckEndsChanged && inventory?.status === "ready";
  // A visual script of another deck, of people and places found or decided since, or of words a review patch or an edit changed since (the images letter them).
  const carouselNow = deckFinished && !deckEndsChanged ? deckCarousel(deck) : undefined;
  const visualWordsChanged = Boolean(visual?.carousel && carouselNow && !sameCarouselWords(visual.carousel, carouselNow));
  const visualChanged = Boolean(visual?.deckId && ((chosenDeckId && visual.deckId !== chosenDeckId) || (inventory && visual.inventoryVersion !== inventory.version) || visualWordsChanged));
  const visualResumable = visual && (visual.status === "paused" || visualStalled) && funnelResumeRound(visual) <= continuableUpTo(visual, VISUAL_MAX_ROUNDS);
  // A run that ended unaccepted before the step had its third round takes it, while it still follows the deck and the people and places.
  const visualExtendable = Boolean(visual && !visualChanged && funnelExtendable(visual, visualPlan(visual.carousel ?? []).length + (visual.extraRounds ?? 0)));
  const visualResumeRound = (visualResumable || visualExtendable) && visual ? funnelResumeRound(visual) : undefined;
  const visualPausedRound = visual?.status === "paused" ? funnelResumeRound(visual) : undefined;
  const visualDisplay = visualDisplayFor(inventory);
  // The images picture the chosen visual script once its run has finished, while it still follows the deck and the people and places.
  const images = session?.images ?? undefined;
  // What "Download all" puts in the archive: each slide's shown image; one not approved as it stands is a "-review" copy.
  const imageDownloads = images ? draft2ImageDownloads(images, session?.publication) : [];
  const imageReviewCopies = imageDownloads.filter((entry) => !entry.approved).length;
  const imagesStalled = !running && images?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const imagesPending = Boolean(images?.slides.some((slide) => !slideSettled(slide)));
  const imagesResumable = Boolean(images && imagesPending && (images.status === "paused" || images.status === "failed" || imagesStalled));
  const imagesStatus = running === "images" ? { label: "Generating", tone: "info" as const } : imagesStalled ? { label: "Stopped", tone: "warning" as const } : images ? IMAGES_STATUS[images.status] : undefined;
  const chosenVisualId = visual?.editorChoiceId ?? visual?.winnerId;
  const visualFinished = Boolean(visual && chosenVisualId && visual.status !== "running" && visual.status !== "paused");
  const imagesReady = visualFinished && !visualChanged;
  const imagesChanged = Boolean(images && chosenVisualId && images.visualId !== chosenVisualId);
  // The accounts the caption may tag: proposed for the people, places and organizations, checked on Instagram, tagged only once the editor confirms them.
  const mentions = session?.mentions ?? undefined;
  const mentionsStalled = !running && mentions?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const mentionsSearching = mentions?.status === "running" && !mentionsStalled;
  const tagged = confirmedMentions(mentions);
  const mentionsReady = inventory?.status === "ready";
  // The caption accompanies the finished images, while the visual script they picture is still in the session.
  const caption = session?.caption ?? undefined;
  const captionStalled = !running && caption?.status === "running" && now > 0 && now - Date.parse(session?.updatedAt ?? "") > OPENING_STALL_MS;
  const captionStatus = running === "caption" ? OPENING_STATUS.running : captionStalled ? { label: "Stopped", tone: "warning" as const } : funnelStatusOf(caption);
  const imagesFinished = Boolean(images && images.status !== "running" && images.status !== "paused" && images.slides.every((slide) => slideSettled(slide) && shownAttempt(slide)));
  const imagesScriptGone = Boolean(images && !funnelVersions(visual?.rounds ?? []).some((version) => version.candidate.id === images.visualId));
  const captionReady = imagesFinished && !imagesScriptGone;
  const captionResumable = caption && (caption.status === "paused" || captionStalled) && funnelResumeRound(caption) <= continuableUpTo(caption, CAPTION_MAX_ROUNDS);
  const captionResumeRound = captionResumable && caption ? funnelResumeRound(caption) : undefined;
  const captionPausedRound = caption?.status === "paused" ? funnelResumeRound(caption) : undefined;
  // A caption written for other images, or tagging other accounts, than the ones now.
  const captionImagesChanged = Boolean(caption?.imagesRunId && images && caption.imagesRunId !== images.runId);
  const captionMentionsChanged = Boolean(caption && caption.status !== "running" && !sameMentions(caption.mentions, tagged));
  const captionDisplay = captionDisplayFor(caption);
  // Publish: the carousel as it stands, approved once and copied for v1's publication.
  const publication = session?.publication ?? undefined;
  const { target: publishable, blocker: publishBlocker } = publicationState(session);
  const approvedCurrent = publicationCurrent(publication, publishable);
  const publishStatus = running === "publication" ? { label: "Approving", tone: "info" as const } : approvedCurrent ? { label: "Approved", tone: "success" as const } : publication ? { label: "Changed since", tone: "warning" as const } : undefined;
  const stepStatus: Partial<Record<string, { label: string; tone: StatusTone }>> = { facts: factsStatus, focus: focusStatus, opening: openingStatus, closing: closingStatus, deck: deckStatus, review: reviewStatus, inventory: inventoryStatus, visual: visualStatus, images: imagesStatus, caption: captionStatus, publish: publishStatus };
  // What each step took so far, this run's and earlier ones: time inside calls and the meter's cost.
  const metrics = stepMetrics(session?.trace ?? [], session?.images);
  const totals = sessionMetrics(session?.trace ?? [], session?.images);
  const resumable = session?.opening && (session.opening.status === "paused" || stalled) && openingResumeRound(session.opening) <= continuableUpTo(session.opening, OPENING_MAX_ROUNDS);
  const resumeRound = resumable && session?.opening ? openingResumeRound(session.opening) : undefined;
  const pausedRound = session?.opening?.status === "paused" ? openingResumeRound(session.opening) : undefined;

  // Screens: the overview, and one screen per step, each with its own URL.
  const pathname = usePathname();
  const current = draft2StepFromPath(pathname ?? "");
  const hrefOf = (screen: Draft2StepKey | undefined) => draft2StepHref(topicId, storyId, screen, { from, returnContext });
  const navigate = useCallback((screen: Draft2StepKey | undefined) => {
    const href = draft2StepHref(topicId, storyId, screen, { from, returnContext });
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, "", href);
  }, [topicId, storyId, from, returnContext]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useScreenShortcuts(current, navigate, Boolean(content));
  useScreenMemory(current ?? "overview", headingRef);
  useScreenTitle(current ? DRAFT_2_STEPS.find((step) => step.key === current)?.title : undefined, content?.title);
  // The article beside the screens: kept open between visits on a wide window, where it docks.
  const [sourceOpen, setSourceOpen] = useState(false);
  useEffect(() => {
    let stored = false;
    try { stored = window.localStorage.getItem(SOURCE_PANEL_KEY) === "open" && window.matchMedia("(min-width: 1280px)").matches; } catch { /* storage unavailable */ }
    if (stored) void Promise.resolve().then(() => setSourceOpen(true));
  }, []);
  const showSource = useCallback((open: boolean) => {
    setSourceOpen(open);
    try { window.localStorage.setItem(SOURCE_PANEL_KEY, open ? "open" : "closed"); } catch { /* storage unavailable */ }
  }, []);
  const closeSource = useCallback(() => showSource(false), [showSource]);
  const sourceShown = sourceOpen && current !== "facts";

  // Each step as the rail, the board and the pager show it: its state, what it produced, what it took.
  const liveScreen = screenOfRun(running ?? autopilot?.current);
  const available: Record<Draft2StepKey, boolean> = {
    facts: text.length > 0,
    focus: factsVerified && inventory?.status === "ready",
    opening: factsVerified && focusReady,
    closing: factsVerified && closingReady,
    deck: factsVerified && deckReady,
    review: factsVerified && reviewReady,
    inventory: factsVerified,
    visual: factsVerified && visualReady,
    images: factsVerified && imagesReady,
    caption: factsVerified && (captionReady || mentionsReady),
    publish: Boolean(publishable),
  };
  const openingChosen = chosenVersion(session?.opening);
  const closingChosen = chosenVersion(closing);
  const deckChosen = chosenVersion(deck);
  const visualChosen = chosenVersion(visual);
  const captionChosen = chosenVersion(caption);
  const scored = (version: { score?: FunnelScore } | undefined) => version?.score ? ` · ${version.score.overall}/100` : "";
  const shownImages = images?.slides.filter((slide) => shownAttempt(slide)).length ?? 0;
  const summaries: Partial<Record<Draft2StepKey, string>> = {
    facts: session?.facts?.length ? `${session.facts.length} facts${factsVerified ? ", verified" : ", not verified yet"}` : undefined,
    focus: focus?.values ? [focus.values.line?.name, FRAMING_LABEL[focus.values.framing], STRUCTURE_LABEL[focus.values.structure.kind].split(":")[0], `goal: ${GOAL_LABEL[focus.values.goal].toLowerCase()}`].filter(Boolean).join(" · ") : undefined,
    opening: openingChosen ? `“${openingChosen.candidate.cover.headline}”${scored(openingChosen)}` : undefined,
    closing: closingChosen ? `“${closingChosen.candidate.last.headline}”${scored(closingChosen)}` : undefined,
    deck: deckChosen ? `${deckChosen.candidate.slides.length} ${deckChosen.candidate.slides.length === 1 ? "slide" : "slides"} between slide 2 and the closing${scored(deckChosen)}` : undefined,
    inventory: inventory?.entities.length ? `${inventory.entities.length} ${inventory.entities.length === 1 ? "person, place or organization" : "people, places and organizations"}${peopleToConfirm ? ` · ${peopleToConfirm} to confirm` : ""}` : inventory?.status === "ready" ? "Nobody and nowhere to show" : undefined,
    visual: visualChosen ? `${visualChosen.candidate.concept}${scored(visualChosen)}` : undefined,
    images: images ? `${shownImages} of ${images.slides.length} slides with an image` : undefined,
    caption: captionChosen ? `${captionChosen.candidate.text.split("\n")[0]}${scored(captionChosen)}` : tagged.length ? `${tagged.length} ${tagged.length === 1 ? "account" : "accounts"} to tag` : undefined,
    publish: publication && approvedCurrent ? `Approved ${new Date(publication.approvedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}` : publication ? "Changed since you approved it" : undefined,
  };
  const screenSteps: ScreenStep[] = DRAFT_2_STEPS.map((step) => {
    const metric = metrics[step.key];
    return {
      key: step.key,
      title: step.title,
      detail: step.detail,
      status: stepStatus[step.key],
      state: draft2RailState(stepStatus[step.key], { live: liveScreen === step.key, available: available[step.key] }),
      summary: summaries[step.key],
      vitals: metric ? [metric.calls ? `${minutes(metric.ms)} in ${metric.calls} ${metric.calls === 1 ? "call" : "calls"}` : "", usd(metric.costMicros)].filter(Boolean).join(" · ") : undefined,
      cost: metric ? usd(metric.costMicros) : undefined,
      href: hrefOf(step.key),
    };
  });
  const doneSteps = screenSteps.filter((step) => step.state === "done").length;
  const stepOf = (key: Draft2StepKey) => screenSteps.find((step) => step.key === key)!;
  /** What a step waits for, with the way to the step that provides it. */
  const needs = (to: Draft2StepKey, message: string) => <Prerequisite to={to} title={stepOf(to).title} href={hrefOf(to)} onNavigate={navigate}>{message}</Prerequisite>;
  const stoppedAt = session ? new Date(session.updatedAt).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" }) : "";
  const traceOf = (screen: Draft2StepKey) => (session?.trace ?? []).filter((entry) => entry.step === screen || (screen === "caption" && entry.step === "mentions"));

  const autopilotButtons = <>
    {autopilot?.active ? <Button variant="secondary" size="compact" disabled={stopRequested.current} onClick={() => { stopRequested.current = true; }}>Stop after this step</Button> : null}
    <Button variant="primary" size="compact" busy={autopilot?.active} disabled={!text.length || session === undefined || running !== undefined || autopilot?.active} onClick={() => { void runAutopilot(); }}>
      {autopilot?.active ? `Running ${autopilot.current ? STEP_TITLE[autopilot.current].toLowerCase() : ""}…` : "Run to images"}
    </Button>
  </>;

  // The names a run started now goes by: the funnel steps' writers and judges, the facts' extractor and reviewer, the images' reviewer.
  const today = todayNames(cast);
  const factsCast = { extractor: draft2ModelName(cast?.facts.extractor.model, "openai"), reviewer: draft2ModelName(cast?.facts.reviewer.model, "anthropic") };
  const imageReviewer = draft2ModelName(cast?.imageReview.model, "openai");
  const focusReviewer = draft2ModelName(cast?.focusReview?.model, "openai");
  const commonJudge = new Set(FUNNEL_STEPS.map((step) => today[step].judge)).size === 1 ? today.opening.judge : undefined;
  const screens: Record<Draft2StepKey, { actions?: ReactNode; how: ReactNode; body: ReactNode }> = {
    facts: {
      actions: <Button variant="primary" size="compact" busy={running === "facts"} disabled={!text.length || session === undefined || running !== undefined} onClick={() => { void runStep("facts"); }}>
        {running === "facts" ? "Extracting and verifying…" : session ? "Run the facts again" : "Extract and verify facts"}
      </Button>,
      how: <p>{factsCast.extractor} extracts the facts; {factsCast.reviewer} checks them against the article; they loop on {factsCast.reviewer}’s suggestions, at most three extractions. Running the facts again starts a new session: every later step starts over from the new facts, and the earlier session stays as history.</p>,
      body: <>
        {running === "facts" ? <LoadingState>{factsCast.extractor} is extracting; {factsCast.reviewer} reviews each round. This can take a minute or two.</LoadingState> : null}
        {runError?.step === "facts" ? <InlineNotice tone="error" title="The facts step stopped">{runError.message}</InlineNotice> : null}
        {session?.step === "facts" && session.error && running !== "facts" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
        {session && running !== "facts" ? <p className={styles.factMeta}>Running the facts again starts a new session; the steps after it start over from the new facts.</p> : null}
        <div className={styles.factsColumns}>
          <section className={styles.factsSource} aria-label="Source material">
            <SectionHeader level={2} eyebrow="Source material" title="What the story says" description="The stored text, exactly as every step reads it." />
            {text.length
              ? <div className={styles.reading}>{text.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
              : <EmptyState title="No article text yet">Prepare the content in the studio first; the canvas reads the same stored text. <Link href={back}>Open the story</Link></EmptyState>}
          </section>
          <section className={styles.factsResult} aria-label="The facts">
            {session && running !== "facts" ? <FactsSessionView session={session} verified={factsVerified} /> : null}
            {session === null && running !== "facts" && text.length ? <EmptyState title="No facts yet">Extract and verify the facts: {factsCast.extractor} reads the article and lists every fact the story depends on; {factsCast.reviewer} checks each one against it.</EmptyState> : null}
          </section>
        </div>
      </>,
    },
    focus: {
      actions: <Button variant="primary" size="compact" busy={running === "focus"} disabled={!factsVerified || inventory?.status !== "ready" || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("focus"); }}>
        {running === "focus" ? "Deciding…" : focus?.values ? "Decide again" : "Decide the focus"}
      </Button>,
      how: <p>Claude reads the verified facts, the Topic’s creative profile, its visual identity, its editorial lines and what People and places found, and decides what the story is for and how it is told: the line it serves, its audience, framing, reader consequence, structure, goal, voice and direction, the narrative form, and the visual direction the images follow. A narrative form gives every swipe a reason: a guide (the brand’s character, a figure from the story or an anonymous one) leads the reader through it, or one object crosses it; classic tells it slide by slide, as before. The concept decides how the reader meets the news: straight, or discovered through a premise invented for the story (an SOS from the park’s animals, a message found on a trail), each slide answering one question and opening the next, the news itself the last reveal. When Claude chooses a narrative form or a premise, {focusReviewer} reviews it and may send it back to classic. Change any field; your changes stay yours when Claude decides again, and every step after follows the result.</p>,
      body: <>
        {!factsVerified && !running ? needs("facts", "The focus builds only on verified facts; verify them first.") : null}
        {factsVerified && inventory?.status !== "ready" && !running ? needs("inventory", "The focus chooses the narrative form with the story’s people, places and the brand’s characters; find them first.") : null}
        {focus?.values && inventory && focus.inventoryVersion !== undefined && focus.inventoryVersion !== inventory.version && focusNarrative(focus.values).form !== "classic" && running !== "focus"
          ? <InlineNotice tone="info" title="People and places changed">The narrative form was chosen with an earlier version of People and places. Decide again to choose it with what you confirmed since; your changes stay yours.</InlineNotice> : null}
        {running === "focus" ? <LoadingState>Claude is deciding the focus{focus?.edited.length ? `, keeping your ${focus.edited.length === 1 ? "change" : `${focus.edited.length} changes`}` : ""}. This can take a minute.</LoadingState> : null}
        {focusStalled ? <InlineNotice tone="warning" title="This decision stopped">Its request or the server ended before Claude answered. Decide the focus again.</InlineNotice> : null}
        {runError?.step === "focus" ? <InlineNotice tone="error" title="The focus step stopped">{runError.message}</InlineNotice> : null}
        {focus?.status === "failed" && focus.error && running !== "focus" ? <InlineNotice tone="error" title="The last decision failed">{focus.error}{focus.values ? " The focus below is the one from before it." : ""}</InlineNotice> : null}
        {focusError ? <InlineNotice tone="error" title="Your change was not saved">{focusError}</InlineNotice> : null}
        {focus?.values && running !== "focus" ? <FocusView
          focus={focus}
          findings={focusProblems}
          material={material}
          saving={savingFocus}
          locked={running !== undefined || savingFocus !== undefined}
          onSave={(field, value) => { void saveFocus(field, { value }); }}
          onReset={(field) => { void saveFocus(field, { reset: true }); }}
          onRewritePlan={() => { void rewritePlan(); }}
        /> : null}
        {!focus?.values && factsVerified && running !== "focus" ? <EmptyState title="No focus yet">Decide the focus: Claude proposes what the story is for, and every field stays yours to change.</EmptyState> : null}
      </>,
    },
    opening: {
      actions: <>
        {resumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("opening", { continuing: true }); }}>Continue from round {resumeRound}</Button> : null}
        {moreRoundAvailable(session?.opening, OPENING_MAX_ROUNDS) && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("opening", { continuing: true, more: true }); }}>One more round</Button> : null}
        <Button variant="primary" size="compact" busy={running === "opening"} disabled={!factsVerified || !focusReady || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("opening"); }}>
          {running === "opening" ? "Writing and judging…" : session?.opening ? "Write the opening again" : "Write the opening"}
        </Button>
      </>,
      how: <p>{today.opening.writer} writes fifteen openings (cover and slide 2) from the verified facts, following the focus; {today.opening.judge} scores them and proposes three of its own. {today.opening.writer} revises the three best and edits {today.opening.judge}’s proposals, which also compete as {today.opening.judge} wrote them; {today.opening.judge} scores all nine without knowing which are its own, and proposes one more, which competes the same way beside {today.opening.writer}’s two best for {today.opening.judge}’s final pick. The better version always stays, and an opening that says what the facts do not never wins. Accepted at 95/100 with no criterion below 85, how well it follows the focus included.</p>,
      body: <>
        {!factsVerified && !running ? needs("facts", "The opening builds only on verified facts; verify them first.") : null}
        {factsVerified && !focusReady && !running ? needs("focus", focus?.values && focus.status !== "running" ? "The opening waits until the focus is fixed: see its notes." : "The opening follows the story’s focus; decide it first.") : null}
        {focusChanged && running !== "opening" && focus ? <InlineNotice tone="info" title="The focus changed">{openingFocusVersion ? `This opening followed focus v${openingFocusVersion}; the focus is now v${focus.version}.` : "This opening was written before the Focus step."} Write it again to follow the focus as it stands.</InlineNotice> : null}
        {running === "opening" ? <LoadingState>{following ? `${following} Following the run on the server…` : pausedRound ? `Continuing with round ${pausedRound} in a new request…` : `${today.opening.writer} writes fifteen openings; ${today.opening.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
        {stalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {stoppedAt}: its request or the server ended. Continue from round {resumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
        {runError?.step === "opening" ? <InlineNotice tone="error" title="The opening step stopped">{runError.message}</InlineNotice> : null}
        {session?.step === "opening" && session.error && running !== "opening" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
        {choiceError?.step === "opening" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
        {session?.opening && running !== "opening" ? <FunnelRunView
          run={session.opening}
          display={OPENING_DISPLAY}
          choosing={choosing?.step === "opening" ? choosing.id : undefined}
          locked={running !== undefined || session.opening.status === "running"}
          onChoose={(candidateId) => { void choose("opening", candidateId); }}
        /> : null}
        {!session?.opening && available.opening && !running ? <EmptyState title="No opening yet">Write the opening: the cover and slide 2, the promise and its first payoff, judged as one.</EmptyState> : null}
      </>,
    },
    closing: {
      actions: <>
        {closingResumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("closing", { continuing: true }); }}>Continue from round {closingResumeRound}</Button> : null}
        {moreRoundAvailable(closing, CLOSING_MAX_ROUNDS) && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("closing", { continuing: true, more: true }); }}>One more round</Button> : null}
        <Button variant="primary" size="compact" busy={running === "closing"} disabled={!factsVerified || !closingReady || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("closing"); }}>
          {running === "closing" ? "Writing and judging…" : closing ? "Write the closing again" : "Write the closing"}
        </Button>
      </>,
      how: <p>{today.closing.writer} writes eight endings for the opening you chose, following the focus that opening followed. For an arc, the penultimate slide pays the cover’s promise in full and the last says what it means for the reader, with the one call to action the focus’s goal asks for, in the publication’s call-to-action style; for a list or steps, the last slide alone, with the plan or the result. {today.closing.judge} scores them and proposes two of its own; {today.closing.writer} revises the two best and edits {today.closing.judge}’s proposals, which also compete as {today.closing.judge} wrote them, for {today.closing.judge}’s pick. Accepted at 95/100 with no criterion below 85.</p>,
      body: <>
        {factsVerified && !closingReady && !running ? needs("opening", openingFinished ? "The opening was written before the Focus step; write it again first." : "The closing ends the opening you choose; finish the opening first.") : null}
        {closingOpeningChanged && running !== "closing" && closing?.opening ? <InlineNotice tone="info" title="The opening changed">This closing ends {closing.opening.id}; the opening chosen now is {chosenOpeningId}. Write the closing again to end it.</InlineNotice> : null}
        {running === "closing" ? <LoadingState>{following ? `${following} Following the run on the server…` : closingPausedRound ? `Continuing with round ${closingPausedRound} in a new request…` : `${today.closing.writer} writes eight endings; ${today.closing.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
        {closingStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {stoppedAt}: its request or the server ended. Continue from round {closingResumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
        {runError?.step === "closing" ? <InlineNotice tone="error" title="The closing step stopped">{runError.message}</InlineNotice> : null}
        {session?.step === "closing" && session.error && running !== "closing" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
        {choiceError?.step === "closing" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
        {closing && running !== "closing" ? <FunnelRunView
          run={closing}
          display={CLOSING_DISPLAY}
          choosing={choosing?.step === "closing" ? choosing.id : undefined}
          locked={running !== undefined || closing.status === "running"}
          onChoose={(candidateId) => { void choose("closing", candidateId); }}
        /> : null}
        {!closing && available.closing && !running ? <EmptyState title="No closing yet">Write the closing: the ending that pays the cover’s promise and gives the reader one thing to do.</EmptyState> : null}
      </>,
    },
    deck: {
      actions: <>
        {deckResumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("deck", { continuing: true }); }}>Continue from round {deckResumeRound}</Button> : null}
        {moreRoundAvailable(deck, DECK_MAX_ROUNDS) && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("deck", { continuing: true, more: true }); }}>One more round</Button> : null}
        <Button variant="primary" size="compact" busy={running === "deck"} disabled={!factsVerified || !deckReady || running !== undefined || savingFocus !== undefined} onClick={() => { void runStep("deck"); }}>
          {running === "deck" ? "Writing and judging…" : deck ? "Write the deck again" : "Write the deck"}
        </Button>
      </>,
      how: <p>{today.deck.writer} writes the slides between slide 2 and the closing you chose, one idea each, so the carousel reads as one story: for an arc, four decks of two to five slides; for a list or steps, two decks with the items slide 2 did not cover, one per slide, in order. {today.deck.judge} scores them and proposes a deck of its own; {today.deck.writer} revises the best, touching only the slides the issues name, and edits {today.deck.judge}’s deck, which also competes as {today.deck.judge} wrote it, for {today.deck.judge}’s pick. Accepted at 95/100 with no criterion below 85.</p>,
      body: <>
        {factsVerified && !deckReady && !running ? needs("closing", closingOpeningChanged ? "The closing ends another opening than the one chosen now; write the closing again first." : "The deck leads to the closing you choose; finish the closing first.") : null}
        {deckEndsChanged && running !== "deck" ? <InlineNotice tone="info" title="The opening or the closing changed">This deck connects {deck?.opening?.id} and {deck?.closing?.id}; the ones chosen now are {chosenOpeningId} and {chosenClosingId}. Write the deck again to connect them.</InlineNotice> : null}
        {running === "deck" ? <LoadingState>{following ? `${following} Following the run on the server…` : deckPausedRound ? `Continuing with round ${deckPausedRound} in a new request…` : `${today.deck.writer} writes the decks; ${today.deck.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
        {deckStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {stoppedAt}: its request or the server ended. Continue from round {deckResumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
        {runError?.step === "deck" ? <InlineNotice tone="error" title="The deck step stopped">{runError.message}</InlineNotice> : null}
        {session?.step === "deck" && session.error && running !== "deck" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
        {choiceError?.step === "deck" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
        {deck && running !== "deck" ? <FunnelRunView
          run={deck}
          display={DECK_DISPLAY}
          choosing={choosing?.step === "deck" ? choosing.id : undefined}
          locked={running !== undefined || deck.status === "running"}
          onChoose={(candidateId) => { void choose("deck", candidateId); }}
        /> : null}
        {!deck && available.deck && !running ? <EmptyState title="No deck yet">Write the deck: the slides between slide 2 and the closing, one idea each.</EmptyState> : null}
      </>,
    },
    review: {
      actions: <Button variant="primary" size="compact" busy={running === "review"} disabled={!factsVerified || !reviewReady || running !== undefined || savingReview !== undefined} onClick={() => { void runStep("review"); }}>
        {running === "review" ? "Reading…" : review ? "Read the carousel again" : "Read the carousel"}
      </Button>,
      how: <p>A reader of the publication’s audience reads the carousel on a phone, slide by slide, with no rules: would they swipe, what do they think, would they follow or comment. Then {review?.editorBy ? draft2ModelName(review.editorBy.model, review.editorBy.provider) : "the editor"} reads it whole beside those reactions, the focus and the facts, scores tension, clarity, grace, flow, the turn and truth, names what works, and writes the exact patches that would make the reader want more. The program refuses a patch that misquotes a slide or breaks a step’s rules; an applied patch edits the chosen version in place and keeps what it replaced, so you can undo it. In the autopilot the proposed patches are applied as the editor wrote them.</p>,
      body: <>
        {factsVerified && !reviewReady && !running ? needs("deck", deckEndsChanged ? "The deck connects another opening or closing than the ones chosen now; write the deck again first." : "The review reads the whole carousel; finish the deck first.") : null}
        {running === "review" ? <LoadingState>The reader reads the slides; then the editor scores the carousel and writes its patches. About a minute.</LoadingState> : null}
        {reviewStalled ? <InlineNotice tone="warning" title="This reading stopped">Its request or the server ended before it finished. Read the carousel again.</InlineNotice> : null}
        {runError?.step === "review" ? <InlineNotice tone="error" title="The review stopped">{runError.message}</InlineNotice> : null}
        {review?.status === "failed" && review.error && running !== "review" ? <InlineNotice tone="error" title="The last reading failed">{review.error}</InlineNotice> : null}
        {reviewError ? <InlineNotice tone="error" title="Your decision was not saved">{reviewError}</InlineNotice> : null}
        {review && review.status !== "running" && running !== "review" ? <ReviewView review={review} current={reviewCurrentNow} saving={savingReview} locked={running !== undefined || savingReview !== undefined} onDecide={(action, patchId) => { void decideReviewPatch(action, patchId); }} /> : null}
        {!review && available.review && !running ? <EmptyState title="Not read yet">Read the carousel: a reader reacts slide by slide, the editor scores it and proposes the exact changes.</EmptyState> : null}
      </>,
    },
    inventory: {
      actions: <Button variant="primary" size="compact" busy={running === "inventory"} disabled={!factsVerified || running !== undefined || savingInventory !== undefined} onClick={() => { void runStep("inventory"); }}>
        {running === "inventory" ? "Searching…" : inventory ? "Search again" : "Find people and places"}
      </Button>,
      how: <p>Claude lists the people, places and organizations the verified facts name; the program looks them up as v1 does. A person is never generated: if Commons has a licensed photo of them and you confirm it is them, it can appear as a documentary portrait, pasted unchanged. A place appears only through its verified photo or map, within the Topic’s geo scope: Wikidata first, then Google Maps for the map when Wikidata has no match. When a lookup finds nothing, give the person or place one of the story’s photos: upload it, or find it on Commons under another name. Organizations are never drawn. You also say whether the brand’s characters may narrate. The focus comes after this step: it chooses the narrative form with what it finds here.</p>,
      body: <>
        {!factsVerified && !running ? needs("facts", "People and places are found only in verified facts; verify them first.") : null}
        {running === "inventory" ? <LoadingState>Claude lists who and where; Wikidata, Commons, Openverse and Google Maps are checked for each. This can take a minute or two.</LoadingState> : null}
        {inventoryStalled ? <InlineNotice tone="warning" title="This search stopped">Its request or the server ended before it finished. Search again.</InlineNotice> : null}
        {runError?.step === "inventory" ? <InlineNotice tone="error" title="The search stopped">{runError.message}</InlineNotice> : null}
        {inventory?.status === "failed" && inventory.error && running !== "inventory" ? <InlineNotice tone="error" title="The last search failed">{inventory.error}</InlineNotice> : null}
        {inventoryError ? <InlineNotice tone="error" title="Your decision was not saved">{inventoryError}</InlineNotice> : null}
        {inventory && inventory.status !== "running" && running !== "inventory" ? <InventoryView
          inventory={inventory}
          story={{ topicId, storyId, secret }}
          saving={savingInventory}
          locked={running !== undefined || savingInventory !== undefined}
          onDecide={(input) => { void decideInventory(input); }}
        /> : null}
        {!inventory && available.inventory && !running ? <EmptyState title="Nobody and nowhere found yet">Find the people and places the facts name, with the verified photos and maps the images may show.</EmptyState> : null}
      </>,
    },
    visual: {
      actions: <>
        {visualResumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("visual", { continuing: true }); }}>{visualExtendable ? `Continue with round ${visualResumeRound}` : `Continue from round ${visualResumeRound}`}</Button> : null}
        {!visualResumeRound && moreRoundAvailable(visual, visualPlan(visual?.carousel ?? []).length) && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("visual", { continuing: true, more: true }); }}>One more round</Button> : null}
        <Button variant="primary" size="compact" busy={running === "visual"} disabled={!factsVerified || !visualReady || running !== undefined || savingInventory !== undefined} onClick={() => { void runStep("visual"); }}>
          {running === "visual" ? "Writing and judging…" : visual ? "Write the visual script again" : "Write the visual script"}
        </Button>
      </>,
      how: <p>{today.visual.writer} writes the carousel’s images as one visual story, in the brand’s identity: a concept, a recurring cast, a motif that evolves from slide to slide and, for each slide, the beat its image adds (never its words again), a reproducible art direction and the verified material or characters it uses. {today.visual.judge} scores two scripts, written to the focus’s visual direction, and proposes one of its own; {today.visual.writer} revises the best and edits {today.visual.judge}’s, which also competes as {today.visual.judge} wrote it; a third round revises the best once more, for {today.visual.judge}’s pick. Accepted at 95/100 with no criterion below 85. The images themselves come in a later step.</p>,
      body: <>
        {factsVerified && !visualReady && !running ? (!deckFinished ? needs("deck", "The visual script pictures the whole carousel; finish the deck first.")
          : deckEndsChanged ? needs("deck", "The deck connects another opening or closing than the ones chosen now; write the deck again first.")
            : needs("inventory", "Find the people and places first: the script shows only what is verified.")) : null}
        {visualExtendable && visual && !running ? <p className={styles.factMeta}>This run ended after {visual.rounds.length} rounds, before the visual script had a third. Continue with round {visualResumeRound} revises its best version once more against the remaining issues: one write and one judgment.</p> : null}
        {peopleToConfirm && visualReady && !running ? needs("inventory", `${peopleToConfirm} ${peopleToConfirm === 1 ? "person waits" : "people wait"} for your confirmation; until then the script tells the story without showing them.`) : null}
        {visualChanged && running !== "visual" ? (visualWordsChanged && visual?.deckId === chosenDeckId && visual?.inventoryVersion === inventory?.version
          ? <InlineNotice tone="info" title="The carousel’s words changed since this script">A review patch or an edit changed words this script pictures, and the images letter them. Write the visual script again to follow the words as they stand.</InlineNotice>
          : <InlineNotice tone="info" title="The deck or the people and places changed">This script pictures {visual?.deckId} with people and places v{visual?.inventoryVersion}; the deck chosen now is {chosenDeckId} and the people and places are v{inventory?.version}. Write the visual script again to follow them.</InlineNotice>) : null}
        {running === "visual" ? <LoadingState>{following ? `${following} Following the run on the server…` : visualPausedRound ? `Continuing with round ${visualPausedRound} in a new request…` : `${today.visual.writer} writes the scripts; ${today.visual.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
        {visualStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {stoppedAt}: its request or the server ended. Continue from round {visualResumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
        {runError?.step === "visual" ? <InlineNotice tone="error" title="The visual script stopped">{runError.message}</InlineNotice> : null}
        {session?.step === "visual" && session.error && running !== "visual" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
        {choiceError?.step === "visual" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
        {visual && running !== "visual" ? <FunnelRunView
          run={visual}
          display={visualDisplay}
          choosing={choosing?.step === "visual" ? choosing.id : undefined}
          locked={running !== undefined || visual.status === "running"}
          onChoose={(candidateId) => { void choose("visual", candidateId); }}
        /> : null}
        {!visual && available.visual && !running ? <EmptyState title="No visual script yet">Write the visual script: the carousel’s images as one visual story, before any image is made.</EmptyState> : null}
      </>,
    },
    images: {
      actions: <>
        {imagesResumable && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("images", { continuing: true }); }}>Continue</Button> : null}
        {imageDownloads.length && running !== "images" ? <Button variant="secondary" size="compact" busy={downloadingImages} title={imageReviewCopies ? "Images not yet approved are included as review copies, named “-review”." : undefined} onClick={() => { void downloadImages(imageDownloads.length, imageReviewCopies); }}>
          {downloadingImages ? "Preparing the download…" : imageDownloads.length === 1 ? "Download the image" : `Download all ${imageDownloads.length} images`}
        </Button> : null}
        <Button variant="primary" size="compact" busy={running === "images"} disabled={!factsVerified || !imagesReady || running !== undefined || savingImage !== undefined} onClick={() => { void runStep("images"); }}>
          {running === "images" ? "Making the images…" : images ? "Make the images again" : "Make the images"}
        </Button>
      </>,
      how: <p>GPT Image makes each slide from the chosen visual script and the brand’s identity, and letters the slide’s words itself; the page number and the logo are added afterwards where the brand puts them, and a verified photo or map is pasted unchanged. {imageReviewer} reviews each image: the words as they appear, what covers them, real people, other brands’ logos, what the brand avoids and the facts. A slide it flags is corrected once, from its image before the logo and the page number. Low quality, three calls a slide at most.</p>,
      body: <>
        {factsVerified && !imagesReady && !running ? needs("visual", !visualFinished ? "The images picture the visual script; finish it first." : "The carousel’s words, the deck or the people and places changed since the visual script; write the visual script again first.") : null}
        {imagesChanged && running !== "images" ? <InlineNotice tone="info" title="The visual script changed">These images picture {images?.visualId}; the visual script chosen now is {chosenVisualId}. Make the images again to follow it.</InlineNotice> : null}
        {running === "images" ? <LoadingState>{following ? `${following} Following the run on the server…` : images?.status === "paused" ? "Continuing in a new request while fal works…" : `GPT Image makes the slides; ${imageReviewer} reviews each one. This can take a few minutes.`}</LoadingState> : null}
        {imagesStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {stoppedAt}: its request or the server ended. Continue picks it up; an image already asked for is not asked for again.</InlineNotice> : null}
        {runError?.step === "images" ? <InlineNotice tone="error" title="The images stopped">{runError.message}</InlineNotice> : null}
        {session?.step === "images" && session.error && running !== "images" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
        {imageError ? <InlineNotice tone="error" title="Your decision was not saved">{imageError}</InlineNotice> : null}
        {imagesDownload ? <InlineNotice tone={imagesDownload.tone} title={imagesDownload.tone === "error" ? "The download failed" : undefined}>{imagesDownload.text}</InlineNotice> : null}
        {images && session && running !== "images" ? <ImagesView images={images} story={{ topicId, sessionId: session.id, secret }} saving={savingImage} locked={running !== undefined || savingImage !== undefined} onDecide={(input) => { void decideImage(input); }} /> : null}
        {!images && available.images && !running ? <EmptyState title="No images yet">Make the images: each slide from the chosen visual script, reviewed one by one.</EmptyState> : null}
      </>,
    },
    caption: {
      actions: <>
        {captionResumeRound && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("caption", { continuing: true }); }}>Continue from round {captionResumeRound}</Button> : null}
        {moreRoundAvailable(caption, CAPTION_MAX_ROUNDS) && !running ? <Button variant="secondary" size="compact" onClick={() => { void runStep("caption", { continuing: true, more: true }); }}>One more round</Button> : null}
        <Button variant="primary" size="compact" busy={running === "caption"} disabled={!factsVerified || !captionReady || running !== undefined || savingMention !== undefined || mentionsSearching} onClick={() => { void runStep("caption"); }}>
          {running === "caption" ? "Writing and judging…" : caption ? "Write the caption again" : "Write the caption"}
        </Button>
      </>,
      how: <p>The post’s text for the finished carousel, in the publication’s voice: an opening line that stops the reader, short lines with blank lines between them, the emojis the brand allows, the closing’s one call to action, the accounts you tag and 5 to 8 hashtags at the end. The program adds the photo credits after the text. {today.caption.writer} writes three captions; {today.caption.judge} scores them and proposes one of its own; {today.caption.writer} revises the best and edits {today.caption.judge}’s, which also competes as {today.caption.judge} wrote it, for {today.caption.judge}’s pick. Accepted at 95/100 with no criterion below 85.</p>,
      body: <>
        <section className={styles.screenSection} aria-label="Accounts to tag">
          <SectionHeader level={2} title="Accounts to tag" description="Claude proposes the Instagram accounts of the story’s people, places and organizations; Instagram says which exist and what they are called; only the accounts you tag reach the caption. On Facebook an @username stays plain text." actions={
            <Button variant="secondary" size="compact" busy={running === "mentions"} disabled={!factsVerified || !mentionsReady || running !== undefined || savingMention !== undefined || mentionsSearching} onClick={() => { void runStep("mentions"); }}>
              {running === "mentions" ? "Finding…" : mentions ? "Find again" : "Find accounts to tag"}
            </Button>
          } />
          {factsVerified && !mentionsReady && !running ? needs("inventory", "The accounts are those of the people and places; find them first.") : null}
          {running === "mentions" ? <LoadingState>Claude proposes the accounts; each one is checked on Instagram. This can take a minute.</LoadingState> : null}
          {mentionsStalled ? <InlineNotice tone="warning" title="This search stopped">Its request or the server ended before it finished. Find the accounts again.</InlineNotice> : null}
          {runError?.step === "mentions" ? <InlineNotice tone="error" title="The search stopped">{runError.message}</InlineNotice> : null}
          {mentions?.status === "failed" && mentions.error && running !== "mentions" ? <InlineNotice tone="error" title="The last search failed">{mentions.error}</InlineNotice> : null}
          {mentionError ? <InlineNotice tone="error" title="Your decision was not saved">{mentionError}</InlineNotice> : null}
          {inventory && running !== "mentions" && !mentionsSearching ? <MentionsView mentions={mentions} entities={mentionEntities(inventory)} saving={savingMention} locked={running !== undefined || savingMention !== undefined} onDecide={decideMention} /> : null}
        </section>
        <section className={styles.screenSection} aria-label="The caption">
          <SectionHeader level={2} title="The caption" description="The post as it will read, with the credits the program adds and its hashtags." />
          {factsVerified && !captionReady && !running ? needs("images", imagesScriptGone ? "The visual script these images picture is no longer in the session; make the images again first." : "The caption accompanies the finished carousel; finish the images first, with an image on every slide.") : null}
          {captionImagesChanged && running !== "caption" ? <InlineNotice tone="info" title="The images changed">This caption was written for an earlier images run. Write it again for the images as they are now.</InlineNotice> : null}
          {captionMentionsChanged && !captionImagesChanged && running !== "caption" ? <InlineNotice tone="info" title="The accounts to tag changed">This caption tags {caption?.mentions?.length ? listed(caption.mentions.map((mention) => mention.handle)) : "no account"}; you tag {tagged.length ? listed(tagged.map((mention) => mention.handle)) : "none"} now. Write it again to tag them.</InlineNotice> : null}
          {running === "caption" ? <LoadingState>{following ? `${following} Following the run on the server…` : captionPausedRound ? `Continuing with round ${captionPausedRound} in a new request…` : `${today.caption.writer} writes three captions; ${today.caption.judge} judges each round. This can take a few minutes.`}</LoadingState> : null}
          {captionStalled && session ? <InlineNotice tone="warning" title="This run stopped">It has not answered since {stoppedAt}: its request or the server ended. Continue from round {captionResumeRound} picks it up at its last checkpoint; a round already written is judged, not written again.</InlineNotice> : null}
          {runError?.step === "caption" ? <InlineNotice tone="error" title="The caption step stopped">{runError.message}</InlineNotice> : null}
          {session?.step === "caption" && session.error && running !== "caption" ? <InlineNotice tone={session.status === "failed" ? "error" : "warning"}>{session.error}</InlineNotice> : null}
          {choiceError?.step === "caption" ? <InlineNotice tone="error" title="Your choice was not saved">{choiceError.message}</InlineNotice> : null}
          {caption && running !== "caption" ? <FunnelRunView
            run={caption}
            display={captionDisplay}
            choosing={choosing?.step === "caption" ? choosing.id : undefined}
            locked={running !== undefined || caption.status === "running"}
            onChoose={(candidateId) => { void choose("caption", candidateId); }}
          /> : null}
          {!caption && captionReady && !running ? <EmptyState title="No caption yet">Write the caption: the post’s text, in the publication’s voice, with the accounts you tag.</EmptyState> : null}
        </section>
      </>,
    },
    publish: {
      actions: <Button variant="primary" size="compact" busy={running === "publication"} disabled={!publishable || approvedCurrent || running !== undefined || Boolean(publishable?.issues.length && !acknowledged)} onClick={() => { void approvePublication(); }}>
        {running === "publication" ? "Approving…" : approvedCurrent ? "Approved" : publication ? "Approve it again" : "Approve for publishing"}
      </Button>,
      how: <p>You approve the carousel as it stands: each slide’s image and the chosen caption, with its credits and hashtags. v1’s publication then freezes it as one exact package and publishes it to the Topic’s Facebook Page, its Instagram account, or both at once, with its queue, retries and links to the posts. Nothing is published until you confirm the exact post. A carousel publishes 2 to 10 images.</p>,
      body: <>
        {factsVerified && !running && !caption ? needs("caption", "The post needs its caption; write it first.") : null}
        {factsVerified && !running && publishBlocker ? <InlineNotice tone="warning" title="Not ready to approve">{publishBlocker}</InlineNotice> : null}
        {publication && !approvedCurrent && publishable && running !== "publication" ? <InlineNotice tone="info" title="The carousel changed since you approved it">The approved copy is the one from {new Date(publication.approvedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}. Approve it again to publish the carousel as it stands now; what was already published stays as it is.</InlineNotice> : null}
        {runError?.step === "publication" ? <InlineNotice tone="error" title="The carousel was not approved">{runError.message}</InlineNotice> : null}
        {publishable ? <PublishPreview target={publishable} approved={approvedCurrent} acknowledged={acknowledged} locked={running !== undefined} onAcknowledge={setAcknowledged} /> : null}
        {publication && approvedCurrent ? <PublishedCopy publication={publication} topicId={topicId} secret={secret} locked={running !== undefined} approving={running === "publication"} onApprove={() => { void approvePublication(publication.acknowledgedIssues.length > 0); }} /> : null}
      </>,
    },
  };

  const adjacent = adjacentDraft2Steps(current);
  const pagerTarget = (screen: Draft2StepKey | "overview" | undefined) => screen === undefined ? undefined
    : screen === "overview" ? { screen: undefined, title: "Overview", href: hrefOf(undefined), status: `${doneSteps} of ${DRAFT_2_STEPS.length} steps done` }
      : { screen, title: stepOf(screen).title, href: hrefOf(screen), status: screenStatusLabel(stepOf(screen)) };
  const pager = <StepPager previous={pagerTarget(adjacent.previous)} next={pagerTarget(adjacent.next)} onNavigate={navigate} />;
  const sourceMeta = content ? [host, contentStatusLabel(content.contentStatus), `${words.toLocaleString("en-CA")} words`].filter(Boolean).join(" · ") : "";

  return <main className={styles.shell} style={themeStyle}>
    <header className={styles.topbar}>
      <Link href={back} className={styles.topbarBack} aria-label="Back to the story">← <span>Story</span></Link>
      <div className={styles.topbarTitle}>
        <span className={styles.topbarTopic}>{topicName} · Draft 2</span>
        <span className={styles.topbarStory}>{content?.title ?? (error ? "Could not open the story" : "Loading the story…")}</span>
      </div>
      {content ? <div className={styles.topbarActions}>
        {totals.calls ? <span className={styles.topbarVitals}>{minutes(totals.ms)} in calls · {usd(totals.costMicros)}</span> : null}
        {liveScreen && liveScreen !== current ? <ScreenLink href={hrefOf(liveScreen)} onNavigate={() => navigate(liveScreen)} className={styles.livePill}>{stepOf(liveScreen).title} running</ScreenLink> : null}
        {current !== "facts" ? <Button variant="quiet" size="compact" aria-expanded={sourceShown} aria-controls="draft2-source" onClick={() => showSource(!sourceOpen)}>Article</Button> : null}
        {/* The overview has the autopilot's own card; a narrow window keeps the bar to the article and the way back. */}
        {current ? <span className={styles.topbarAutopilot}>{autopilotButtons}</span> : null}
      </div> : null}
    </header>
    {error ? <InlineNotice tone="error" title="Could not open the canvas" className={styles.notice}>{error} <Link href={back}>Back to the story</Link></InlineNotice> : null}
    {!content && !error ? <LoadingState className={styles.notice}>Loading the story…</LoadingState> : null}
    {content ? <div className={styles.workspace} data-source={sourceShown ? "open" : undefined}>
      <Draft2Rail current={current} overviewHref={hrefOf(undefined)} steps={screenSteps} onNavigate={navigate} />
      <div className={styles.stage} key={current ?? "overview"}>
        {current ? <StepScreen
          step={stepOf(current)}
          phase={draft2StepPhase(current).title}
          total={DRAFT_2_STEPS.length}
          headingRef={headingRef}
          actions={screens[current].actions}
          how={screens[current].how}
          trace={<TraceDetails entries={traceOf(current)} />}
          pager={pager}
        >{screens[current].body}</StepScreen> : <article className={styles.screen} aria-labelledby="draft2-screen-title">
          <header className={styles.overviewHero}>
            <p className={styles.screenKicker}>Draft 2 · {topicName}</p>
            <h1 id="draft2-screen-title" ref={headingRef} tabIndex={-1} className={styles.overviewTitle}>{content.title}</h1>
            <p className={styles.meta}>
              {host ? <span>{host}</span> : null}
              <StatusBadge tone={contentReady ? "success" : "warning"}>{contentStatusLabel(content.contentStatus)}</StatusBadge>
              <span>{words.toLocaleString("en-CA")} words</span>
              {content.enrichment?.byline ? <span>{content.enrichment.byline}</span> : null}
              <a href={content.url} target="_blank" rel="noreferrer">Open the original ↗</a>
            </p>
            <PipelineStrip steps={screenSteps} />
            <p className={styles.screenVitals}>{doneSteps} of {DRAFT_2_STEPS.length} steps done{totals.calls ? ` · ${minutes(totals.ms)} in ${totals.calls} provider calls · ${usd(totals.costMicros)}` : ""}</p>
          </header>
          <section className={styles.autopilotCard} aria-labelledby="draft2-autopilot-title">
            <div className={styles.autopilotHead}>
              <div>
                <h2 id="draft2-autopilot-title" className={styles.autopilotTitle}>Autopilot</h2>
                <p className={styles.autopilotIntro}>Runs every step to the images, from where the story stands: the facts if they are not verified, the people and places, the focus, the accounts to tag, the opening, the closing, the deck, the visual script and the images. Before the focus chooses the narrative form, it waits for you if people in People and places wait for your confirmation. Each step keeps {commonJudge ? `${commonJudge}’s` : "its judge’s"} winner; 95 is the goal, a step that ends from {FUNNEL_ACCEPTABLE_SCORE} is acceptable and marked for you, and one under {FUNNEL_ACCEPTABLE_SCORE} takes up to {FUNNEL_MAX_EXTRA_ROUNDS} extra rounds on its own before the run goes on; a failure, or a step that needs you, stops it. You review at the end: re-run or choose in any step, confirm the accounts, write the caption and approve.</p>
              </div>
              <ActionRow>{autopilotButtons}</ActionRow>
            </div>
            {autopilot ? <AutopilotView autopilot={autopilot} trace={session?.trace ?? []} now={now} /> : null}
          </section>
          <OverviewBoard steps={screenSteps} onNavigate={navigate} />
          <TraceDetails entries={session?.trace ?? []} label={totals.calls ? `OpenAI ${Math.round(totals.openaiShare * 100)}% of the time` : undefined} />
          {pager}
        </article>}
      </div>
      <SourcePanel id="draft2-source" open={sourceShown} title={content.title} meta={sourceMeta} onClose={closeSource}>
        {text.length ? text.map((paragraph, index) => <p key={index}>{paragraph}</p>) : <EmptyState title="No article text yet">Prepare the content in the studio first.</EmptyState>}
      </SourcePanel>
    </div> : null}
  </main>;
}

/** Provider calls, folded: how many, the time inside them and their cost; opened, each call's model, effort, tokens and outcome. */
function TraceDetails({ entries, label }: { entries: readonly Draft2TraceEntry[]; label?: string }) {
  if (!entries.length) return null;
  const ms = entries.reduce((sum, entry) => sum + entry.durationMs, 0);
  const costMicros = entries.reduce((sum, entry) => sum + (entry.costMicros ?? 0), 0);
  return <details className={styles.trace}>
    <summary>{entries.length} provider {entries.length === 1 ? "call" : "calls"} · {minutes(ms)} in calls · {usd(costMicros)}{label ? ` · ${label}` : ""}</summary>
    <ol className={styles.traceList}>
      {entries.map((entry, index) => <li key={index} data-outcome={entry.outcome}>
        <span>{draft2ModelName(entry.model, entry.provider)} · {entry.model}{entry.effort ? ` · ${entry.effort}` : ""} · {entry.operation} · {entry.step} round {entry.round}</span>
        <span>{traceUsageLine(entry)}</span>
      </li>)}
    </ol>
  </details>;
}

function FactsSessionView({ session, verified }: { session: Draft2SessionView; verified: boolean }) {
  // Named by the models this session's facts ran on, not today's.
  const extractor = draft2ModelName(factsModel(session.trace, "openai"), "openai");
  const reviewer = draft2ModelName(factsModel(session.trace, "anthropic"), "anthropic");
  return <>
    {session.rounds.length ? <ol className={styles.roundList} aria-label="Rounds">
      {session.rounds.map((round) => <li key={round.round} className={styles.roundCard}>
        <div className={styles.factHead}>
          <strong>Round {round.round}</strong>
          <span>{extractor} extracted {round.facts.length} {round.facts.length === 1 ? "fact" : "facts"}</span>
          {round.evaluation
            ? <StatusBadge tone={round.evaluation.verdict === "valid" && round.mechanical.length === 0 ? "success" : "warning"}>{reviewer}: {round.evaluation.verdict} · {round.evaluation.score}/100</StatusBadge>
            : <StatusBadge tone="neutral">{reviewer} did not answer</StatusBadge>}
        </div>
        {round.restored?.length ? <p className={styles.factMeta}>{extractor} dropped {round.restored.length} valid {round.restored.length === 1 ? "fact" : "facts"} without a reason ({round.restored.join(", ")}); the program put them back before the review.</p> : null}
        {round.evaluation ? <p className={styles.factMeta}>{round.evaluation.summary}</p> : null}
        {round.mechanical.length || round.evaluation?.issues.length ? <ul className={styles.issueList}>
          {round.mechanical.map((issue, index) => <li key={`m${index}`}><strong>Program · {issue.code}</strong>{issue.factId ? ` · ${issue.factId}` : ""}: {issue.detail}</li>)}
          {(round.evaluation?.issues ?? []).map((issue, index) => <li key={`r${index}`}><strong>{issue.code}</strong>{issue.factId ? ` · ${issue.factId}` : ""}: {issue.detail}</li>)}
        </ul> : null}
        {round.evaluation?.suggestions.length ? <details><summary>{round.evaluation.suggestions.length} {round.evaluation.suggestions.length === 1 ? "suggestion" : "suggestions"} for the next pass</summary>
          <ul className={styles.issueList}>{round.evaluation.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
        </details> : null}
      </li>)}
    </ol> : null}
    {session.facts?.length ? <div>
      <SectionHeader level={3} title={`${session.facts.length} facts`} description={verified ? "Verified: the next steps build only on these." : "The latest list; not verified yet."} />
      <ol className={styles.factList}>
        {session.facts.map((fact) => <li key={fact.id} className={styles.factItem}>
          <div className={styles.factHead}>
            <span className={styles.factId}>{fact.id}</span>
            <StatusBadge tone={FACT_STATUS[fact.status].tone}>{FACT_STATUS[fact.status].label}</StatusBadge>
            <span className={styles.factMeta}>{fact.kind} · importance {fact.importance}</span>
          </div>
          <p className={styles.factClaim}>{fact.claim}</p>
          {fact.qualifier || fact.attribution ? <p className={styles.factMeta}>{[
            fact.qualifier,
            // "according to X" already names the source; do not say it twice.
            fact.attribution && !fact.qualifier?.toLowerCase().includes(fact.attribution.toLowerCase()) ? `attributed to ${fact.attribution}` : undefined,
          ].filter(Boolean).join(" · ")}</p> : null}
          <details><summary>Evidence</summary><blockquote>{fact.evidence}</blockquote></details>
        </li>)}
      </ol>
    </div> : null}
  </>;
}

/** What a funnel step shows of its runs: its names, its gate and criteria, and how its candidates read. */
type FunnelDisplay<C extends FunnelCandidate> = {
  noun: string;
  plural: string;
  gate: FunnelGate;
  labels: Record<string, string>;
  /** A version in the list of every version: its main line and the lines under it. */
  lines: (candidate: C) => { title: string; details: string[] };
  /** One of the judge's proposals, in one line. */
  proposal: (candidate: C) => string;
  /** The chosen version, as the slides it will be; the run says what it connects (the deck shows the whole carousel). */
  cards: (candidate: C, run: FunnelRun<C, FunnelScore, FunnelIssue> & Partial<Pick<Draft2Deck, "opening" | "closing">> & Partial<Pick<Draft2Visual, "carousel" | "characters">>) => ReactNode;
};

const OPENING_DISPLAY: FunnelDisplay<Draft2OpeningCandidate> = {
  noun: "opening",
  plural: "openings",
  gate: OPENING_GATE,
  labels: CRITERION_LABEL,
  lines: (candidate) => ({ title: candidate.cover.headline, details: [candidate.cover.subheadline, `Slide 2 · ${candidate.slide2.headline}`] }),
  proposal: (candidate) => `${candidate.cover.headline} · slide 2: ${candidate.slide2.headline}`,
  cards: (candidate) => <div className={styles.openingCards}>
    <SlideCard label="Cover" headline={candidate.cover.headline} text={candidate.cover.subheadline} factIds={candidate.cover.factIds} />
    <SlideCard label="Slide 2" headline={candidate.slide2.headline} text={candidate.slide2.body} factIds={candidate.slide2.factIds} />
  </div>,
};

const DECK_DISPLAY: FunnelDisplay<Draft2DeckCandidate> = {
  noun: "deck",
  plural: "decks",
  gate: DECK_GATE,
  labels: DECK_CRITERION_LABEL,
  lines: (candidate) => ({ title: candidate.slides[0]?.headline ?? "", details: [`${candidate.slides.length} ${candidate.slides.length === 1 ? "slide" : "slides"}: ${candidate.slides.map((slide) => slide.headline).join(" / ")}`] }),
  proposal: (candidate) => candidate.slides.map((slide) => slide.headline).join(" / "),
  cards: (candidate, run) => <div className={styles.carouselCards}>
    {run.opening ? <SlideCard label="Cover" headline={run.opening.cover.headline} text={run.opening.cover.subheadline} factIds={run.opening.cover.factIds} quiet /> : null}
    {run.opening ? <SlideCard label="Slide 2" headline={run.opening.slide2.headline} text={run.opening.slide2.body} factIds={run.opening.slide2.factIds} quiet /> : null}
    {candidate.slides.map((slide, index) => <SlideCard key={index} label={`Slide ${index + 3} · deck`} headline={slide.headline} text={slide.body} practical={slide.practical || undefined} factIds={slide.factIds} />)}
    {run.closing?.penultimate ? <SlideCard label="Penultimate" headline={run.closing.penultimate.headline} text={run.closing.penultimate.body} factIds={run.closing.penultimate.factIds} quiet /> : null}
    {run.closing ? <SlideCard label="Last slide" headline={run.closing.last.headline} text={run.closing.last.body} cta={run.closing.last.cta || undefined} factIds={run.closing.last.factIds} quiet /> : null}
  </div>,
};

/** The visual script's display: each slide's words beside its beat and direction; reference ids read as the names of the people and places they stand for. */
function visualDisplayFor(inventory: Draft2Inventory | undefined): FunnelDisplay<Draft2VisualCandidate> {
  const nameOf = (id: string) => inventory?.entities.find((entity) => entity.id === id)?.name ?? inventory?.storyPhotos.find((photo) => photo.id === id)?.name ?? id;
  return {
    noun: "visual script",
    plural: "visual scripts",
    gate: VISUAL_GATE,
    labels: VISUAL_CRITERION_LABEL,
    lines: (candidate) => ({
      title: candidate.concept,
      details: [...(candidate.protagonist ? [`Protagonist · ${candidate.protagonist}`] : []), `Motif · ${candidate.motif}`, `Cast · ${candidate.cast}`, candidate.characterPlan.use ? `Character narrates · ${candidate.characterPlan.role}` : "No brand character"],
    }),
    proposal: (candidate) => candidate.concept,
    cards: (candidate, run) => <div className={styles.visualBody}>
      <p className={styles.factClaim}>{candidate.concept}</p>
      {candidate.protagonist ? <p className={styles.factMeta}>Protagonist · {candidate.protagonist}</p> : null}
      <p className={styles.factMeta}>Motif · {candidate.motif}</p>
      <p className={styles.factMeta}>Cast · {candidate.cast}</p>
      <p className={styles.factMeta}>{candidate.characterPlan.use
        ? `Narrated by ${candidate.characterPlan.characterIds.map((id) => run.characters?.find((character) => character.id === id)?.name ?? id).join(" and ")}: ${candidate.characterPlan.role}`
        : "No brand character narrates."}</p>
      <ol className={styles.carouselCards}>
        {candidate.slides.map((slide) => {
          const words = run.carousel?.find((entry) => entry.slide === slide.slide);
          return <li key={slide.slide} className={styles.visualSlide}>
            <div className={styles.factHead}>
              <strong>{words?.label ?? slide.slide}</strong>
              <StatusBadge tone={slide.need === "real-photo" || slide.need === "verified-map" ? "info" : "neutral"}>{NEED_LABEL[slide.need] ?? slide.need}</StatusBadge>
              {slide.shot ? <span className={styles.factMeta}>{SHOT_LABEL[slide.shot]}</span> : null}
            </div>
            {words ? <p className={styles.visualWords}>{words.headline}</p> : null}
            <p className={styles.factMeta}>Beat · {slide.beat}</p>
            {slide.subject ? <p className={styles.factMeta}>Subject · {slide.subject}{slide.recurring && RECURRING_LABEL[slide.recurring] ? ` · ${RECURRING_LABEL[slide.recurring]}` : ""}</p> : null}
            {slide.discovery ? <p className={styles.factMeta}>New here · {slide.discovery}</p> : null}
            {slide.headlineLink ? <p className={styles.factMeta}>With the headline · {slide.headlineLink}</p> : null}
            <p className={styles.openingText}>{slide.direction}</p>
            {slide.characterIds.length ? <p className={styles.factMeta}>Characters · {slide.characterIds.map((id) => run.characters?.find((character) => character.id === id)?.name ?? id).join(", ")}</p> : null}
            {slide.references.length ? <p className={styles.factMeta}>Verified material · {slide.references.map(nameOf).join(", ")}</p> : null}
          </li>;
        })}
      </ol>
    </div>,
  };
}

const CLOSING_DISPLAY: FunnelDisplay<Draft2ClosingCandidate> = {
  noun: "closing",
  plural: "closings",
  gate: CLOSING_GATE,
  labels: CLOSING_CRITERION_LABEL,
  lines: (candidate) => ({
    title: candidate.penultimate?.headline ?? candidate.last.headline,
    details: [
      ...(candidate.penultimate ? [candidate.penultimate.body, `Last slide · ${candidate.last.headline}`] : [candidate.last.body]),
      candidate.last.cta ? `Call to action · ${candidate.last.cta}` : "No call to action",
    ],
  }),
  proposal: (candidate) => `${candidate.penultimate ? `${candidate.penultimate.headline} · last: ` : ""}${candidate.last.headline}`,
  cards: (candidate) => <div className={styles.openingCards}>
    {candidate.penultimate ? <SlideCard label="Penultimate" headline={candidate.penultimate.headline} text={candidate.penultimate.body} factIds={candidate.penultimate.factIds} /> : null}
    <SlideCard label="Last slide" headline={candidate.last.headline} text={candidate.last.body} cta={candidate.last.cta || undefined} factIds={candidate.last.factIds} />
  </div>,
};

/** The caption's display: each caption by its opening line, and the chosen one as the post will read, with the credits the program adds and its hashtags. */
function captionDisplayFor(caption: Draft2Caption | undefined): FunnelDisplay<Draft2CaptionCandidate> {
  const credits = caption?.credits ?? [];
  const opening = (candidate: Draft2CaptionCandidate) => candidate.text.split("\n")[0] ?? "";
  return {
    noun: "caption",
    plural: "captions",
    gate: CAPTION_GATE,
    labels: CAPTION_CRITERION_LABEL,
    lines: (candidate) => ({ title: opening(candidate), details: [`${[...candidate.text].length} characters · ${candidate.hashtags.map((tag) => `#${tag}`).join(" ")}`] }),
    proposal: opening,
    cards: (candidate) => <CaptionPost text={captionPostText({ text: candidate.text, credits, hashtags: candidate.hashtags })} factIds={candidate.factIds} />,
  };
}

/** The carousel as it can be approved now, or what it still needs. */
function publicationState(session: Draft2SessionView | null | undefined): { target?: Draft2PublicationTarget; blocker?: string } {
  if (!session?.caption) return {};
  try {
    return { target: publicationTarget(session) };
  } catch (cause) {
    return { blocker: cause instanceof Error ? cause.message : "The carousel cannot be approved yet." };
  }
}

/** A funnel step's run: every round's verdict, the version the next steps build on, and every other version to choose from. */
function FunnelRunView<C extends FunnelCandidate>({ run, display, choosing, locked, onChoose }: {
  run: FunnelRun<C, FunnelScore, FunnelIssue> & { writer?: Draft2Opening["writer"]; judge?: Draft2Opening["judge"] } & Partial<Pick<Draft2Deck, "opening" | "closing">> & Partial<Pick<Draft2Visual, "carousel" | "characters">>;
  display: FunnelDisplay<C>;
  choosing?: string;
  locked: boolean;
  onChoose: (candidateId: string) => void;
}) {
  const names = roleNames(run);
  const versions = funnelVersions(run.rounds);
  const chosen = versions.find((version) => version.candidate.id === (run.editorChoiceId ?? run.winnerId));
  const others = versions.filter((version) => version !== chosen).sort((a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0));
  const winnerLabel = run.status === "ready" ? "Accepted" : "Best so far";
  return <>
    {run.rounds.length ? <ol className={styles.roundList} aria-label={`${display.noun[0].toUpperCase()}${display.noun.slice(1)} rounds`}>
      {run.rounds.map((round) => <FunnelRoundView key={round.round} round={round} names={names} display={display} />)}
    </ol> : null}
    {chosen ? <ChosenVersion
      version={chosen}
      run={run}
      names={names}
      display={display}
      label={run.editorChoiceId ? "Your choice" : winnerLabel}
      tone={run.editorChoiceId || run.status === "ready" ? "success" : "warning"}
    /> : null}
    {others.length ? <div className={styles.openingGroup}>
      <SectionHeader level={3} title={chosen ? "Every other version" : "Every version"} description={`All the ${display.plural} of this run, as ${names.judge} scored them. The one you choose is what the next steps build on.`} />
      <ol className={styles.factList}>
        {others.map((version) => {
          const { title, details } = display.lines(version.candidate);
          return <li key={version.candidate.id} className={styles.factItem}>
            <div className={styles.factHead}>
              <span className={styles.factId}>{version.candidate.id}</span>
              {version.score ? <StatusBadge tone={funnelScorePasses(version.score, display.gate) ? "success" : "neutral"}>{version.score.overall}/100</StatusBadge> : null}
              {version.findings.length ? <StatusBadge tone="warning">{version.findings.length} program {version.findings.length === 1 ? "finding" : "findings"}</StatusBadge> : null}
              {hasMaterialError(version) ? <StatusBadge tone="error">Factual error</StatusBadge> : null}
              {version.candidate.id === run.winnerId ? <StatusBadge tone="info">{winnerLabel}</StatusBadge> : null}
              <span className={styles.factMeta}>{versionOrigin(version, names)}</span>
            </div>
            <p className={styles.factClaim}>{title}</p>
            {details.map((detail, index) => <p key={index} className={styles.factMeta}>{detail}</p>)}
            <div>
              <Button variant="quiet" size="compact" busy={choosing === version.candidate.id} disabled={locked || choosing !== undefined} onClick={() => onChoose(version.candidate.id)}>Choose this {display.noun}</Button>
            </div>
          </li>;
        })}
      </ol>
    </div> : null}
  </>;
}

function FunnelRoundView<C extends FunnelCandidate>({ round, names, display }: { round: FunnelRound<C, FunnelScore, FunnelIssue>; names: RoleNames; display: FunnelDisplay<C> }) {
  const evaluation = round.evaluation;
  const programWinner = evaluation ? funnelAcceptedWinner(round.mechanical, evaluation, display.gate) : undefined;
  const winnerId = programWinner ?? evaluation?.winnerId;
  const winner = evaluation?.scores.find((score) => score.candidateId === winnerId);
  const revised = round.candidates.flatMap((candidate) => candidate.revisionOf ? [candidate.revisionOf] : []);
  const edited = round.candidates.filter((candidate) => candidate.proposalOf && !candidate.asProposed).map((candidate) => candidate.id);
  const originals = round.candidates.filter((candidate) => candidate.asProposed);
  const fresh = round.candidates.filter((candidate) => !candidate.revisionOf && !candidate.proposalOf).map((candidate) => candidate.id);
  const wrote = listed([
    revised.length ? `revised ${listed(revised)}` : "",
    edited.length ? `edited ${edited.length} of ${names.judge}’s proposals (${edited.join(", ")})` : "",
    fresh.length ? (revised.length || edited.length || originals.length ? `tried ${fresh.length} new ${fresh.length === 1 ? "angle" : "angles"} (${fresh.join(", ")})` : `wrote ${fresh.length} ${fresh.length === 1 ? display.noun : display.plural}`) : "",
  ].filter(Boolean));
  const proposals = evaluation?.proposals ?? [];
  // Each proposal as the judge wrote it against the writer's edit: whose version scored higher.
  const scoreOf = (id?: string) => evaluation?.scores.find((score) => score.candidateId === id)?.overall;
  const duels = originals.map((original) => {
    const edit = round.candidates.find((candidate) => candidate.proposalOf === original.proposalOf && !candidate.asProposed);
    return `${original.proposalOf} ${scoreOf(original.id) ?? "–"} as written / ${edit ? `${scoreOf(edit.id) ?? "–"} edited` : "not edited"}`;
  });
  return <li className={styles.roundCard}>
    <div className={styles.factHead}>
      <strong>Round {round.round}</strong>
      <span>{wrote ? `${names.writer} ${wrote}` : ""}{originals.length ? `${wrote ? "; " : ""}${names.judge}’s ${originals.length === 1 ? "proposal competes" : "proposals compete"} as written too (${originals.map((original) => original.id).join(", ")})` : ""}</span>
      {evaluation
        ? <StatusBadge tone={programWinner ? "success" : "warning"}>{names.judge}: {evaluation.verdict} · {winnerId} {winner?.overall}/100</StatusBadge>
        : <StatusBadge tone="neutral">{names.judge} did not answer</StatusBadge>}
    </div>
    {duels.length ? <p className={styles.factMeta}>{names.judge}’s proposals, as written against {names.writer}’s edits: {duels.join(" · ")}.</p> : null}
    {(round.regressions ?? []).map((regression) => <p key={regression.candidateId} className={styles.factMeta}>{regressionNote(regression)}</p>)}
    {evaluation && programWinner && programWinner !== evaluation.winnerId ? <p className={styles.factMeta}>{names.judge} picked {evaluation.winnerId}, which has a program finding; {programWinner}, the best clean candidate, meets the thresholds and wins.</p> : null}
    {evaluation ? <p className={styles.factMeta}>{evaluation.summary}</p> : null}
    {round.shadow ? <p className={styles.factMeta}>Shadow judgment by {round.shadow.model} at {round.shadow.effort}{round.shadow.error
      ? ` failed: ${round.shadow.error}`
      : `: ${round.shadow.verdict} · ${round.shadow.winnerId} ${round.shadow.scores?.find((score) => score.candidateId === round.shadow?.winnerId)?.overall ?? "–"}/100 · ${round.shadow.agrees ? "the same winner as the judgment that counts" : "another winner than the judgment that counts"} · ${(round.shadow.durationMs / 1000).toFixed(0)} s${round.shadow.scores?.length ? ` · ${round.shadow.scores.map((score) => `${score.candidateId} ${score.overall}`).join(", ")}` : ""}${round.shadow.issues ? ` · ${round.shadow.issues.length} ${round.shadow.issues.length === 1 ? "issue" : "issues"}${round.shadow.issues.length ? ` (${[...new Set(round.shadow.issues.map((issue) => issue.code))].join(", ")})` : ""}` : ""}${round.shadow.proposals ? ` · ${round.shadow.proposals} ${round.shadow.proposals === 1 ? "proposal" : "proposals"}` : ""}`}</p> : null}
    {round.shadow?.issues?.length ? <details><summary>What the shadow judgment found</summary>
      <ul className={styles.issueList}>{round.shadow.issues.map((issue, index) => <li key={index}><strong>{issue.code}</strong>{issue.candidateId ? ` · ${issue.candidateId}` : ""}: {issue.detail}</li>)}</ul>
    </details> : null}
    {winner ? <ScoreRow score={winner} display={display} /> : null}
    {round.mechanical.length || evaluation?.issues.length ? <ul className={styles.issueList}>
      {round.mechanical.map((issue, index) => <li key={`m${index}`}><strong>Program · {issue.code}</strong>{issueTarget(issue)}: {issue.detail}</li>)}
      {(evaluation?.issues ?? []).map((issue, index) => <li key={`j${index}`}><strong>{issue.material ? `Material · ${issue.code}` : issue.code}</strong>{issueTarget(issue)}: {issue.detail}</li>)}
    </ul> : null}
    {evaluation?.suggestions.length ? <details><summary>{evaluation.suggestions.length} {evaluation.suggestions.length === 1 ? "suggestion" : "suggestions"} for the next round</summary>
      <ul className={styles.issueList}>{evaluation.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
    </details> : null}
    {proposals.length ? <details><summary>{names.judge} proposed {proposals.length} {proposals.length === 1 ? display.noun : display.plural} for the next round</summary>
      <ul className={styles.issueList}>{proposals.map((proposal) => <li key={proposal.id}><strong>{proposal.id}</strong>: {display.proposal(proposal)}</li>)}</ul>
    </details> : null}
  </li>;
}

/** The version the next steps build on, with its scores, as the slides it will be. */
function ChosenVersion<C extends FunnelCandidate>({ version, run, names, display, label, tone }: {
  version: FunnelVersion<C, FunnelScore, FunnelIssue>;
  run: Parameters<FunnelDisplay<C>["cards"]>[1];
  names: RoleNames;
  display: FunnelDisplay<C>;
  label: string;
  tone: StatusTone;
}) {
  const { candidate, score } = version;
  return <div className={styles.openingGroup}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{candidate.id}</span>
      <StatusBadge tone={tone}>{label}</StatusBadge>
      {score ? <strong>{score.overall}/100</strong> : null}
      {candidate.angle ? <span>{candidate.angle}</span> : null}
      <span className={styles.factMeta}>{versionOrigin(version, names)}</span>
    </div>
    {score ? <ScoreRow score={score} display={display} /> : null}
    {score?.note ? <p className={styles.factMeta}>{score.note}</p> : null}
    {display.cards(candidate, run)}
  </div>;
}

/**
 * One slide as a 4:5 card: its headline, its text, a list item's practical
 * line, the call to action on the last, and the facts it cites. A quiet card
 * is a slide another step wrote, shown for context.
 */
function SlideCard({ label, headline, text, practical, cta, factIds, quiet = false }: { label: string; headline: string; text: string; practical?: string; cta?: string; factIds: readonly string[]; quiet?: boolean }) {
  return <article className={styles.openingCard} aria-label={label} data-quiet={quiet ? "" : undefined}>
    <p className={styles.eyebrow}>{label}</p>
    <p className={styles.openingHeadline}>{headline}</p>
    <p className={styles.openingText}>{text}</p>
    {practical ? <p className={styles.openingPractical}>{practical}</p> : null}
    {cta ? <p className={styles.openingCta}>{cta}</p> : null}
    <p className={styles.openingFacts}>Facts · {factIds.join(", ")}</p>
  </article>;
}

function ScoreRow<C extends FunnelCandidate>({ score, display }: { score: FunnelScore; display: FunnelDisplay<C> }) {
  return <p className={styles.scoreRow}>
    {display.gate.criteria.map((criterion) => {
      // A score stored before a criterion existed (the opening's focus) has none.
      const value = criterionOf(score, criterion);
      return value === undefined ? null : <span key={criterion} data-low={value < display.gate.floor ? "" : undefined}>{display.labels[criterion] ?? criterion} <strong>{value}</strong></span>;
    })}
    <span>Overall <strong>{score.overall}</strong></span>
  </p>;
}

/**
 * The people, places and organizations the facts name, with what verified
 * material each has: Commons candidates a person waits on the editor for, a
 * place's photo and map, and the story's own photos, which the editor gives
 * to a person or place the lookups could not show. The characters choice
 * says whether the brand's characters may narrate.
 */
function InventoryView({ inventory, story, saving, locked, onDecide }: {
  inventory: Draft2Inventory;
  /** For the story's photos panel: the editor adds a photo there, then gives it to a person or place. */
  story: { topicId: string; storyId: string; secret: string };
  saving?: string;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
}) {
  const people = inventory.entities.filter((entity) => entity.kind === "person");
  const places = inventory.entities.filter((entity) => entity.kind === "place");
  const organizations = inventory.entities.filter((entity) => entity.kind === "organization");
  return <div className={styles.focusBody}>
    <p className={styles.factMeta}>People and places v{inventory.version}{inventory.foundAt ? ` · found ${new Date(inventory.foundAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}` : ""}. The visual script uses only what is verified here.</p>
    <FormField label="The brand’s characters" description={inventory.roster.length ? `${inventory.roster.map((character) => character.name).join(" and ")}, the Topic’s ${inventory.roster.length === 1 ? "character" : "characters"} with a reference image.` : "The Topic has no character with a reference image; none can narrate."}>
      <select value={inventory.characters} disabled={locked || !inventory.roster.length} onChange={(event) => onDecide({ action: "characters", characters: event.target.value })}>
        {INVENTORY_CHARACTER_CHOICES.map((choice) => <option key={choice} value={choice}>{CHARACTER_CHOICE_LABEL[choice]}</option>)}
      </select>
    </FormField>
    {inventory.entities.length ? null : <p className={styles.factMeta}>The facts name no person, place or organization.</p>}
    {people.length ? <div className={styles.openingGroup}>
      <SectionHeader level={3} title="People" description="Never generated. A confirmed Commons photo, or one of the story’s photos you give them, can appear as a documentary portrait, pasted unchanged; anyone else is told without being shown." />
      <ol className={styles.factList}>{people.map((entity) => <PersonItem key={entity.id} entity={entity} photos={inventory.storyPhotos} saving={saving === entity.id} locked={locked} onDecide={onDecide} />)}</ol>
    </div> : null}
    {places.length ? <div className={styles.openingGroup}>
      <SectionHeader level={3} title="Places" description="A real place appears only through its verified photo or map, or one of the story’s photos you give it; otherwise as a generic scene of its kind." />
      <ol className={styles.factList}>{places.map((entity) => <PlaceItem key={entity.id} entity={entity} photos={inventory.storyPhotos} locked={locked} onDecide={onDecide} />)}</ol>
    </div> : null}
    {organizations.length ? <p className={styles.factMeta}>Organizations, never drawn and never named in an image (no logos): {organizations.map((entity) => entity.name).join(", ")}.</p> : null}
    {inventory.storyPhotos.length ? <p className={styles.factMeta}>The story’s photos: {inventory.storyPhotos.map((photo) => `${photo.name}${photo.transmissionAllowed ? "" : " (documentary portrait only)"}`).join(", ")}.</p> : null}
    <details>
      <summary>Add a photo, or find one on Commons under another name</summary>
      <p className={styles.factMeta}>For a person or place the lookups could not show: upload a photo you have the rights to, or search Commons (a person by their exact full name, a place by the larger place it belongs to). Then give it to the person or place above.</p>
      <StoryPhotosPanel topicId={story.topicId} storyId={story.storyId} secret={story.secret} onChanged={() => onDecide({ action: "photos" })} />
    </details>
  </div>;
}

/** One of the story's photos for a person or place: a person's appears only as their documentary portrait, pasted unchanged. */
function StoryPhotoChoice({ entity, photos, locked, onDecide }: { entity: Draft2InventoryEntity; photos: readonly Draft2InventoryStoryPhoto[]; locked: boolean; onDecide: (input: Record<string, unknown>) => void }) {
  if (!photos.length && !entity.storyPhoto) return null;
  const person = entity.kind === "person";
  return <FormField label={person ? "Their photo from the story" : "Its photo from the story"} description={person ? "Pasted unchanged as a documentary portrait, never redrawn. Check it is them." : "Shows this place. Check it is the place."}>
    <select value={entity.storyPhoto?.id ?? ""} disabled={locked} onChange={(event) => onDecide({ action: "photo", entityId: entity.id, storyPhotoId: event.target.value || null })}>
      <option value="">No story photo</option>
      {photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.name}{photo.transmissionAllowed ? "" : " · documentary only"}</option>)}
      {entity.storyPhoto && !photos.some((photo) => photo.id === entity.storyPhoto?.id) ? <option value={entity.storyPhoto.id}>{entity.storyPhoto.name} · removed</option> : null}
    </select>
  </FormField>;
}

/** A person and their Commons candidates: confirm the one that is them, or say none is; or give them one of the story's photos. */
function PersonItem({ entity, photos, saving, locked, onDecide }: { entity: Draft2InventoryEntity; photos: readonly Draft2InventoryStoryPhoto[]; saving: boolean; locked: boolean; onDecide: (input: Record<string, unknown>) => void }) {
  const person = entity.person;
  const status = person?.status;
  return <li className={styles.factItem}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{entity.id}</span>
      <strong>{entity.name}</strong>
      <StatusBadge tone={status === "confirmed" || entity.storyPhoto ? "success" : status === "candidates" ? "warning" : "neutral"}>{status === "confirmed" ? "Portrait confirmed" : entity.storyPhoto ? "Story photo" : status === "candidates" ? "Confirm the photo" : status === "rejected" ? "No photo" : status === "none" ? "Not on Commons" : "Not checked"}</StatusBadge>
      <span className={styles.factMeta}>{entity.role} · {entity.factIds.join(", ")}</span>
    </div>
    {entity.description ? <p className={styles.factMeta}>{entity.description}</p> : null}
    {person?.note ? <p className={styles.factMeta}>{person.note}</p> : null}
    {status === "confirmed" && person?.confirmed ? <p className={styles.factMeta}>{person.confirmed.name}{person.confirmed.description ? ` · ${person.confirmed.description}` : ""} · {person.confirmed.author} · {person.confirmed.license}</p> : null}
    {entity.storyPhoto ? <p className={styles.factMeta}>Story photo · {entity.storyPhoto.name} · {entity.storyPhoto.provenance}</p> : null}
    {status === "candidates" ? <ul className={styles.candidateList}>
      {person!.candidates.map((candidate) => <li key={candidate.entityId} className={styles.candidate}>
        <Image className={styles.candidateThumb} src={candidate.thumbnailUrl} alt={`Wikimedia Commons photo of ${candidate.name}`} width={160} height={120} unoptimized />
        <div>
          <p className={styles.factClaim}>{candidate.name}{candidate.birthYear ? ` (born ${candidate.birthYear})` : ""}</p>
          {candidate.description ? <p className={styles.factMeta}>{candidate.description}</p> : null}
          <p className={styles.factMeta}>{candidate.author} · {candidate.license} · <a href={candidate.commonsUrl} target="_blank" rel="noreferrer">Commons ↗</a></p>
          <Button variant="secondary" size="compact" busy={saving} disabled={locked} onClick={() => onDecide({ action: "confirm", entityId: entity.id, candidateId: candidate.entityId })}>This is them</Button>
        </div>
      </li>)}
    </ul> : null}
    {status !== "confirmed" ? <StoryPhotoChoice entity={entity} photos={photos} locked={locked} onDecide={onDecide} /> : null}
    <ActionRow>
      {status === "candidates" ? <Button variant="quiet" size="compact" disabled={locked} onClick={() => onDecide({ action: "reject", entityId: entity.id })}>None of these</Button> : null}
      {status === "confirmed" || status === "rejected" ? <Button variant="quiet" size="compact" disabled={locked} onClick={() => onDecide({ action: "reopen", entityId: entity.id })}>Change</Button> : null}
    </ActionRow>
  </li>;
}

const PLACE_STATUS_LABEL = { verified: "Verified", "not-found": "Not found", unavailable: "Not checked", rejected: "Set aside" } as const;

/**
 * A place and what the lookups found: its Wikidata item with a photo, or
 * Google Maps' match for its map. The editor sets a wrong match aside, or
 * gives the place one of the story's photos.
 */
function PlaceItem({ entity, photos, locked, onDecide }: { entity: Draft2InventoryEntity; photos: readonly Draft2InventoryStoryPhoto[]; locked: boolean; onDecide: (input: Record<string, unknown>) => void }) {
  const place = entity.place;
  const status = place?.status;
  const found = status === "verified" || status === "rejected";
  return <li className={styles.factItem}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{entity.id}</span>
      <strong>{entity.name}</strong>
      <StatusBadge tone={status === "verified" || entity.storyPhoto ? "success" : status === "unavailable" ? "warning" : "neutral"}>{status !== "verified" && entity.storyPhoto ? "Story photo" : status ? PLACE_STATUS_LABEL[status] : "Not checked"}</StatusBadge>
      <span className={styles.factMeta}>{entity.role} · {entity.factIds.join(", ")}</span>
    </div>
    {entity.description ? <p className={styles.factMeta}>{entity.description}</p> : null}
    {found && place?.wikidataId ? <p className={styles.factMeta}>Wikidata <a href={place.sourceUrl} target="_blank" rel="noreferrer">{place.wikidataId} ↗</a> · {place.photo ? `photo · ${place.photo.author} · ${place.photo.license} · ${place.photo.source === "openverse" ? "Openverse" : "Wikimedia Commons"}` : "no eligible photo"}</p> : null}
    {found && place?.google ? <p className={styles.factMeta}>Google Maps · {place.google.name} · {place.google.address} · <a href={place.google.sourceUrl} target="_blank" rel="noreferrer">Map ↗</a>{place.google.exactName ? "" : " · Google’s name differs from the story’s: check it is the same place"}</p> : null}
    {found ? <p className={styles.factMeta}>{place?.map ? "A map can be drawn." : "No coordinates for a map."}{status === "rejected" ? " Set aside: the script shows nothing of this match." : ""}</p> : null}
    {place?.note ? <p className={styles.factMeta}>{place.note}</p> : null}
    {entity.storyPhoto ? <p className={styles.factMeta}>Story photo · {entity.storyPhoto.name} · {entity.storyPhoto.provenance}</p> : null}
    <StoryPhotoChoice entity={entity} photos={photos} locked={locked} onDecide={onDecide} />
    <ActionRow>
      {status === "verified" ? <Button variant="quiet" size="compact" disabled={locked} onClick={() => onDecide({ action: "reject", entityId: entity.id })}>Not this place</Button> : null}
      {status === "rejected" ? <Button variant="quiet" size="compact" disabled={locked} onClick={() => onDecide({ action: "reopen", entityId: entity.id })}>It is this place</Button> : null}
    </ActionRow>
  </li>;
}

/**
 * The carousel's images in order, each with the version it shows and its
 * review, and the editor's choices: another image (with what to
 * change, optionally as an edit of the one shown), or another version.
 */
function ImagesView({ images, story, saving, locked, onDecide }: {
  images: Draft2Images;
  /** Where the images are read from; the secret authorizes it when the editor is not signed in. */
  story: { topicId: string; sessionId: string; secret: string };
  saving?: string;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
}) {
  const shown = images.slides.filter((slide) => shownAttempt(slide)).length;
  const costMicros = images.slides.flatMap((slide) => slide.attempts).reduce((sum, attempt) => sum + (attempt.costMicros ?? 0), 0) + (images.anchorPlate?.costMicros ?? 0) + (images.masterPlate?.costMicros ?? 0);
  const plate = images.anchorPlate;
  const master = images.masterPlate;
  return <div className={styles.focusBody}>
    <p className={styles.factMeta}>{shown} of {images.slides.length} slides · from visual script {images.visualId} · {images.quality} quality · {images.model}{costMicros ? ` · ≈US$${(costMicros / 1_000_000).toFixed(2)} in images` : ""}</p>
    {plate ? <p className={styles.factMeta}>Anchor plate · {plate.anchor} · {plate.status === "generated" ? "drawn once without words; every slide that carries the anchor takes it as a reference" : plate.status === "failed" ? `could not be made${plate.error ? ` (${clip(plate.error, 120)})` : ""}; the slides keep the anchor by the script’s words alone` : "being drawn before the slides"}</p> : null}
    {master ? <p className={styles.factMeta}>Master scene · {master.anchor} · {master.status === "generated" ? `drawn once, ${master.width}×${master.height}, without words; each slide is redrawn from its section` : master.status === "failed" ? `could not be made${master.error ? ` (${clip(master.error, 120)})` : ""}; each slide is drawn on its own from the script` : "being drawn before the slides"}</p> : null}
    <ol className={styles.imageGrid}>{images.slides.map((slide) => <SlideImageCard key={slide.slide} slide={slide} runId={images.runId} story={story} saving={saving === slide.slide} locked={locked} onDecide={onDecide} />)}</ol>
  </div>;
}

const IMAGE_STATUS_LABEL: Record<Draft2ImageAttempt["status"], string> = { queued: "Waiting", submitting: "Sending", generating: "Generating", generated: "Made", failed: "Failed" };

/** What the reviewer found on an image (named by its model): passed, its blocking issues, or why it could not look. */
function ImageReviewLines({ review }: { review: Draft2ImageReview }) {
  if (review.status === "passed") return <p className={styles.factMeta}>{draft2ModelName(review.model, "openai")}: passed.{review.note ? ` ${review.note}` : ""}</p>;
  if (review.status === "unavailable") return <p className={styles.factMeta}>{review.note}</p>;
  return <>
    <ul className={styles.issueList}>{review.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
    {review.note ? <p className={styles.factMeta}>{review.note}</p> : null}
  </>;
}

/** One slide: its image, its versions, the review, what it could not show, and another image. */
function SlideImageCard({ slide, runId, story, saving, locked, onDecide }: {
  slide: Draft2SlideImage;
  runId: string;
  story: { topicId: string; sessionId: string; secret: string };
  saving: boolean;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [edit, setEdit] = useState(false);
  const shown = shownAttempt(slide);
  const latest = latestAttempt(slide);
  const generated = slide.attempts.filter((attempt) => attempt.status === "generated");
  const pending = !slideSettled(slide);
  const corrected = shown?.kind === "correct" ? slide.attempts.find((attempt) => attempt.version === shown.baseVersion) : undefined;
  const tone: StatusTone = !shown ? (latest?.status === "failed" ? "error" : "info") : shown.review?.status === "passed" ? "success" : "warning";
  const url = shown ? `/api/radar/draft2/images/file?topicId=${encodeURIComponent(story.topicId)}&sessionId=${encodeURIComponent(story.sessionId)}&run=${encodeURIComponent(runId)}&slide=${encodeURIComponent(slide.slide)}&version=${shown.version}` : undefined;
  return <li className={styles.imageCard}>
    <div className={styles.factHead}>
      <strong>{slide.label}</strong>
      <StatusBadge tone={tone}>{shown ? (shown.review?.status === "passed" ? "Passed" : shown.kind === "correct" ? "Corrected" : shown.review?.status === "issues" ? "Issues" : "Made") : latest ? IMAGE_STATUS_LABEL[latest.status] : "No image"}</StatusBadge>
      {shown ? <span className={styles.factMeta}>v{shown.version}</span> : null}
    </div>
    {url ? <PrivateDraft2Image url={url} secret={story.secret} alt={`${slide.label}, version ${shown?.version}`} /> : <div className={styles.imageFrame}><p className={styles.factMeta}>{latest?.status === "failed" ? latest.error : pending ? "Being made…" : "No image"}</p></div>}
    {generated.length > 1 ? <div className={styles.imageVersions} role="group" aria-label={`${slide.label}: versions`}>
      {generated.map((attempt) => <Button key={attempt.version} size="compact" variant={attempt.version === shown?.version ? "secondary" : "quiet"} disabled={locked || attempt.version === shown?.version} onClick={() => onDecide({ action: "choose", slide: slide.slide, version: attempt.version })}>
        v{attempt.version}{attempt.kind === "correct" ? " · corrected" : attempt.kind === "regenerate" ? " · yours" : ""}
      </Button>)}
    </div> : null}
    {shown?.review ? <ImageReviewLines review={shown.review} /> : null}
    {corrected?.review ? <p className={styles.factMeta}>Corrected from v{corrected.version} for: {corrected.review.issues.join(" ")} Not reviewed again: look at it yourself.</p> : null}
    {latest && latest !== shown && latest.status === "failed" ? <p className={styles.factMeta}>v{latest.version} failed: {latest.error}</p> : null}
    {slide.notes.map((entry) => <p key={entry} className={styles.factMeta}>{entry}</p>)}
    <details>
      <summary>Another image</summary>
      <FormField label="What to change" description="Optional for a new image; needed to edit this one.">
        <textarea value={instruction} maxLength={600} rows={2} disabled={locked || pending} onChange={(event) => setInstruction(event.target.value)} />
      </FormField>
      <label className={styles.factMeta}><input type="checkbox" checked={edit} disabled={locked || pending || !shown} onChange={(event) => setEdit(event.target.checked)} /> Edit this image, keeping its layout</label>
      <ActionRow>
        <Button size="compact" variant="secondary" busy={saving} disabled={locked || pending || (edit && !instruction.trim())} onClick={() => onDecide({ action: "regenerate", slide: slide.slide, instruction, edit })}>{edit ? "Edit the image" : "Make another image"}</Button>
      </ActionRow>
    </details>
  </li>;
}

/** A private image: fetched with the editor's credentials and shown from memory. */
function PrivateDraft2Image({ url, secret, alt }: { url: string; secret: string; alt: string }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    fetch(url, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The image is unavailable.");
        const blob = await response.blob();
        if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); }
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, secret]);
  return <div className={styles.imageFrame}>
    {src ? <Image className={styles.imageFill} src={src} alt={alt} width={432} height={540} unoptimized /> : <p className={styles.factMeta}>{failed ? "Could not load the image." : "Loading…"}</p>}
  </div>;
}

/**
 * The Instagram accounts the caption may tag: Claude proposes usernames for
 * the story's people, places and organizations, Instagram says which exist
 * and what they are called, and the editor tags the ones that are them, or
 * adds an account of their own. Only tagged accounts reach the caption.
 */
function MentionsView({ mentions, entities, saving, locked, onDecide }: {
  mentions: Draft2Mentions | undefined;
  entities: readonly Draft2InventoryEntity[];
  saving?: string;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [entityId, setEntityId] = useState("");
  const accounts = mentions?.accounts ?? [];
  const nameOf = (id?: string) => entities.find((entity) => entity.id === id)?.name;
  async function add() {
    if (await onDecide({ action: "add", handle, name, ...(entityId ? { entityId } : {}) })) { setHandle(""); setName(""); setEntityId(""); }
  }
  return <div className={styles.focusBody}>
    {mentions ? <p className={styles.factMeta}>Accounts v{mentions.version}{mentions.foundAt ? ` · found ${new Date(mentions.foundAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}` : ""}{mentions.lookup === "instagram-page" ? " · checked on Instagram through the Topic’s Facebook Page" : ""}.</p> : null}
    {mentions?.note ? <p className={styles.factMeta}>{mentions.note}</p> : null}
    {accounts.length
      ? <ol className={styles.factList}>{accounts.map((account) => <MentionItem key={account.id} account={account} entityName={nameOf(account.entityId)} saving={saving === account.id} locked={locked} onDecide={onDecide} />)}</ol>
      : mentions?.status === "ready" ? <p className={styles.factMeta}>No account to tag was found.</p> : null}
    <details>
      <summary>Add an account</summary>
      <p className={styles.factMeta}>An Instagram account you know is theirs. It is checked on Instagram; tag it once it is found.</p>
      <div className={styles.mentionForm}>
        <FormField label="Instagram username">
          <input value={handle} maxLength={31} placeholder="@username" autoComplete="off" disabled={locked} onChange={(event) => setHandle(event.target.value)} />
        </FormField>
        <FormField label="Who it is">
          <input value={name} maxLength={120} disabled={locked} onChange={(event) => setName(event.target.value)} />
        </FormField>
        {entities.length ? <FormField label="In the story">
          <select value={entityId} disabled={locked} onChange={(event) => { setEntityId(event.target.value); if (!name.trim()) setName(nameOf(event.target.value) ?? ""); }}>
            <option value="">No one the story names</option>
            {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        </FormField> : null}
      </div>
      <ActionRow>
        <Button size="compact" variant="secondary" busy={saving === "add"} disabled={locked || !handle.trim() || !name.trim()} onClick={() => { void add(); }}>Check and add</Button>
      </ActionRow>
    </details>
  </div>;
}

/** One account: who it should be, what Instagram calls it, and the editor's decision. */
function MentionItem({ account, entityName, saving, locked, onDecide }: {
  account: Draft2MentionAccount;
  entityName?: string;
  saving: boolean;
  locked: boolean;
  onDecide: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const status = MENTION_STATUS[account.status];
  const found = account.account;
  return <li className={styles.factItem}>
    <div className={styles.factHead}>
      <span className={styles.factId}>{account.id}</span>
      <strong>@{found?.username ?? account.handle}</strong>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      <span className={styles.factMeta}>{account.name}{entityName && entityName !== account.name ? ` · ${entityName}` : ""}{account.source === "editor" ? " · added by you" : ""}</span>
    </div>
    {found ? <p className={styles.factMeta}>Instagram: {found.name || "no name"}{found.followers !== undefined ? ` · ${found.followers.toLocaleString("en-CA")} followers` : ""}{found.website ? ` · ${found.website}` : ""} · <a href={`https://www.instagram.com/${encodeURIComponent(found.username)}/`} target="_blank" rel="noreferrer">Profile ↗</a></p> : null}
    {found && account.match === "weak" && account.status === "verified" ? <p className={styles.factMeta}>Its name is not {account.name}’s: check it is them before you tag it.</p> : null}
    {account.note ? <p className={styles.factMeta}>{account.note}</p> : null}
    <ActionRow>
      {found && (account.status === "verified" || account.status === "rejected") ? <Button size="compact" variant="secondary" busy={saving} disabled={locked} onClick={() => { void onDecide({ action: "confirm", accountId: account.id }); }}>Tag this account</Button> : null}
      {account.status === "verified" ? <Button size="compact" variant="quiet" disabled={locked} onClick={() => { void onDecide({ action: "reject", accountId: account.id }); }}>Not them</Button> : null}
      {account.status === "confirmed" ? <Button size="compact" variant="quiet" busy={saving} disabled={locked} onClick={() => { void onDecide({ action: "reopen", accountId: account.id }); }}>Untag</Button> : null}
    </ActionRow>
  </li>;
}

/** The post as Facebook and Instagram will show it: its line breaks and blank lines kept, then the credits and the hashtags. */
function CaptionPost({ text, factIds }: { text: string; factIds: readonly string[] }) {
  return <div className={styles.captionPost}>
    <p className={styles.captionText}>{text}</p>
    <p className={styles.openingFacts}>{[...text].length.toLocaleString("en-CA")} of {CAPTION_MAX_CHARACTERS.toLocaleString("en-CA")} characters · Facts · {factIds.join(", ")}</p>
  </div>;
}

/** What approving publishes: the images in order and the post as it will read, with what the review left for the editor to look at. */
function PublishPreview({ target, approved, acknowledged, locked, onAcknowledge }: {
  target: Draft2PublicationTarget;
  approved: boolean;
  acknowledged: boolean;
  locked: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const one = target.issues.length === 1;
  return <div className={styles.openingGroup}>
    <p className={styles.factMeta}>{target.slides.length} images, in order: {target.slides.map((slide) => `${slide.label} v${slide.version}`).join(" · ")}.</p>
    <CaptionPost text={targetPostText(target)} factIds={target.caption.factIds} />
    {target.issues.length ? <InlineNotice tone={approved ? "info" : "warning"} title={approved ? `Approved as ${one ? "it is" : "they are"}` : `Look at ${one ? "this image" : "these images"} before publishing`}>
      <ul className={styles.issueList}>{target.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
      {approved ? null : <label className={styles.factMeta}><input type="checkbox" checked={acknowledged} disabled={locked} onChange={(event) => onAcknowledge(event.target.checked)} /> I looked at {one ? "it" : "them"}: publish {one ? "it" : "them"} as {one ? "it is" : "they are"}</label>}
    </InlineNotice> : null}
  </div>;
}

/**
 * The approved copy and v1's publication on it: one confirmation for the
 * Facebook Page, its Instagram account or both, then each channel in detail,
 * with its checks, the exact post, its orders and their retries.
 */
function PublishedCopy({ publication, topicId, secret, locked, approving, onApprove }: {
  publication: Draft2Publication;
  topicId: string;
  secret: string;
  locked: boolean;
  approving: boolean;
  onApprove: () => void;
}) {
  return <div className={styles.openingGroup}>
    <p className={styles.factMeta}>Approved {new Date(publication.approvedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })} · {publication.slides.length} images{publication.acknowledgedIssues.length ? ` · ${publication.acknowledgedIssues.length} ${publication.acknowledgedIssues.length === 1 ? "image" : "images"} you looked at yourself` : ""}.</p>
    <RunPublishActions topicId={topicId} draftId={publication.draftId} batchId={publication.batchId} secret={secret} disabled={locked} />
    <details>
      <summary>Each channel in detail: its checks, the exact post, its orders and retries</summary>
      <PublicationChannelsPanel topicId={topicId} draftId={publication.draftId} batchId={publication.batchId} secret={secret} disabled={locked} />
    </details>
    <details>
      <summary>Publishing says the approval is no longer current?</summary>
      <p className={styles.factMeta}>A change to the Topic’s visual policy retires every approval. Approve the carousel again: it is copied once more for publishing, exactly as it stands.</p>
      <ActionRow>
        <Button variant="quiet" size="compact" busy={approving} disabled={locked} onClick={onApprove}>Approve it again</Button>
      </ActionRow>
    </details>
  </div>;
}

const clip = (value: string, max = 140) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

/** A field's value in a few words, for Claude's value beside the editor's choice. */
function focusValueText(field: Draft2FocusField, values: Draft2FocusValues): string {
  switch (field) {
    case "line": return values.line?.name ?? "no line";
    case "audience": return values.audience;
    case "framing": return FRAMING_LABEL[values.framing];
    case "readerConsequence": return values.readerConsequence?.text ?? "none";
    case "structure": return STRUCTURE_LABEL[values.structure.kind];
    case "goal": return GOAL_LABEL[values.goal];
    case "voice": return `${GRAVITY_LABEL[values.voice.gravity]} · ${TONE_KEYS.map((key) => `${key} ${values.voice[key]}`).join(" · ")}`;
    case "direction": return values.direction;
    case "concept": {
      const concept = focusConcept(values);
      return concept.arc === "classic" ? CONCEPT_LABEL.classic : concept.arc === "discovery" ? `Discovery · ${concept.premise}` : `${conceptName(concept.arc)} · ${concept.reveals.join(" · ") || "beats to be ordered"}`;
    }
    case "narrative": {
      const narrative = focusNarrative(values);
      return narrative.form === "classic" ? NARRATIVE_LABEL.classic : `${NARRATIVE_LABEL[narrative.form].split(":")[0]} · ${narrative.anchor}`;
    }
    case "visualDirection": return values.visualDirection ?? "";
    case "spine": return values.spine ? `${values.spine.beats.length} beats · ${values.spine.beats.map((beat) => beat.role).join(" › ")}` : "none";
  }
}

/**
 * The Focus step: every field with Claude's reason, or the editor's choice
 * beside Claude's value. Selects save when they change, text when it loses
 * focus; the controls wait while a change is saved or a step runs.
 */
function FocusView({ focus, findings, material, saving, locked, onSave, onReset, onRewritePlan }: {
  focus: Draft2Focus;
  findings: readonly Draft2FocusFinding[];
  /** People and places' material as it stands: the brand's characters the editor allows, the story's people. */
  material?: Draft2FocusMaterial;
  saving?: Draft2FocusField;
  locked: boolean;
  onSave: (field: Draft2FocusField, value: unknown) => void;
  onReset: (field: Draft2FocusField) => void;
  /** Claude rewrites the plan, the spine and the two directions, from the concept and the form as they now stand; a part the editor owns stays theirs. */
  onRewritePlan: () => void;
}) {
  const values = focus.values!;
  const decided = focus.decidedAt ? new Date(focus.decidedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : undefined;
  const edited = (field: Draft2FocusField) => focus.edited.includes(field);
  /** Claude's reason, or, for the editor's field, Claude's value beside it. */
  const about = (field: Draft2FocusField, detail?: string) => [
    edited(field) ? `Your choice. Claude’s: ${focus.ai ? clip(focusValueText(field, focus.ai)) : "none"}.` : focus.reasons?.[field],
    detail,
  ].filter(Boolean).join(" ") || undefined;
  const reset = (field: Draft2FocusField) => edited(field)
    ? <div><Button variant="quiet" size="compact" busy={saving === field} disabled={locked} onClick={() => onReset(field)}>Use Claude’s</Button></div>
    : null;
  const consequence = values.readerConsequence;
  const items = values.structure.itemFactIds;
  // Text fields start again from the saved value whenever the focus changes.
  const key = (field: Draft2FocusField) => `${field}-${focus.version}`;
  return <div className={styles.focusBody}>
    {focus.deliberation ? <div className={styles.focusField}>
      <p className={styles.factMeta}><strong>Interest:</strong> {focus.deliberation.interest}</p>
      <p className={styles.factMeta}><strong>Tellings Claude compared, the chosen one first:</strong></p>
      <ol>{focus.deliberation.approaches.map((approach, index) => <li key={index}>{approach}</li>)}</ol>
    </div> : null}
    <p className={styles.factMeta}>Focus v{focus.version}{decided ? ` · decided by Claude, ${decided}` : ""}{focus.edited.length ? ` · ${focus.edited.length} of your ${focus.edited.length === 1 ? "change" : "changes"} kept` : ""}. The opening follows this version.</p>
    {findings.length ? <InlineNotice tone="warning" title="The opening waits for this">{findings.map((finding) => finding.detail).join(" ")}</InlineNotice> : null}
    <div className={styles.focusGrid}>
      <div className={styles.focusField}>
        <FormField label="Editorial line" description={about("line", values.line?.objective ? `The line: ${clip(values.line.objective, 220)}` : undefined)}>
          <select value={values.line?.id ?? ""} disabled={locked || !focus.lineOptions.length} onChange={(event) => onSave("line", event.target.value)}>
            {focus.lineOptions.length
              ? focus.lineOptions.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)
              : <option value="">The Topic has no editorial line</option>}
          </select>
        </FormField>
        {reset("line")}
      </div>
      <div className={styles.focusField}>
        <FocusText key={key("audience")} label="Audience" description={about("audience")} value={values.audience} max={FOCUS_AUDIENCE_MAX_CHARACTERS} disabled={locked} onCommit={(value) => onSave("audience", value)} />
        {reset("audience")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Framing" description={about("framing")}>
          <select value={values.framing} disabled={locked} onChange={(event) => onSave("framing", event.target.value)}>
            {FOCUS_FRAMINGS.map((framing) => <option key={framing} value={framing}>{FRAMING_LABEL[framing]}</option>)}
          </select>
        </FormField>
        {reset("framing")}
      </div>
      <div className={styles.focusField}>
        <FocusText
          key={key("readerConsequence")}
          label="Reader consequence"
          description={about("readerConsequence", consequence?.factIds.length ? `Facts · ${consequence.factIds.join(", ")}` : consequence ? "Your words: guidance, not a fact." : "None: no fact establishes one.")}
          value={consequence?.text ?? ""}
          max={FOCUS_CONSEQUENCE_MAX_CHARACTERS}
          allowEmpty
          disabled={locked}
          onCommit={(value) => onSave("readerConsequence", value)}
        />
        {reset("readerConsequence")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Structure" description={about("structure", values.structure.kind === "arc" ? undefined : items.length ? `${items.length} ${values.structure.kind === "list" ? "items" : "steps"} · ${items.join(", ")}` : "No items yet: decide again for Claude to find them.")}>
          <select value={values.structure.kind} disabled={locked} onChange={(event) => onSave("structure", event.target.value)}>
            {FOCUS_STRUCTURES.map((kind) => <option key={kind} value={kind}>{STRUCTURE_LABEL[kind]}</option>)}
          </select>
        </FormField>
        {reset("structure")}
      </div>
      <div className={styles.focusField}>
        <FormField label="Goal" description={about("goal")}>
          <select value={values.goal} disabled={locked} onChange={(event) => onSave("goal", event.target.value)}>
            {FOCUS_GOALS.map((goal) => <option key={goal} value={goal}>{GOAL_LABEL[goal]}</option>)}
          </select>
        </FormField>
        {reset("goal")}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusVoice key={key("voice")} voice={values.voice} description={about("voice")} disabled={locked} onCommit={(voice) => onSave("voice", voice)} />
        {reset("voice")}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusText key={key("direction")} label="Direction" description={about("direction")} value={values.direction} max={FOCUS_DIRECTION_MAX_CHARACTERS} rows={5} disabled={locked} onCommit={(value) => onSave("direction", value)} />
        {reset("direction")}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusConcept key={key("concept")} focus={focus} description={about("concept", values.concept ? conceptReviewLine(focus) : "Decided before concepts: decide again for Claude to propose premises, or choose here.")} disabled={locked} onCommit={(concept) => onSave("concept", concept)} />
        {reset("concept")}
        {focus.conceptReview?.verdict === "classic" && focus.conceptReview.proposed && focusConcept(values).arc === "classic"
          ? <div><Button variant="quiet" size="compact" busy={saving === "concept"} disabled={locked} onClick={() => onSave("concept", focus.conceptReview!.proposed)}>Use Claude’s {focus.conceptReview.proposed.arc === "discovery" ? "premise" : conceptName(focus.conceptReview.proposed.arc).toLowerCase()}</Button></div> : null}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusNarrative key={key("narrative")} focus={focus} material={material} description={about("narrative", values.narrative ? narrativeReviewLine(focus) : "Decided before narrative forms: decide again for Claude to choose one, or choose one here.")} disabled={locked} onCommit={(narrative) => onSave("narrative", narrative)} />
        {reset("narrative")}
        {focus.narrativeReview?.verdict === "classic" && focus.narrativeReview.proposed && focusNarrative(values).form === "classic"
          ? <div><Button variant="quiet" size="compact" busy={saving === "narrative"} disabled={locked} onClick={() => onSave("narrative", focus.narrativeReview!.proposed)}>Use Claude’s {NARRATIVE_LABEL[focus.narrativeReview.proposed.form].split(":")[0].toLowerCase()}</Button></div> : null}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FormField label="Spine" description={about("spine", values.spine ? "One beat per slide, decided after the concept and the form: the words and the images both follow it, and the judges score each slide against its beat." : "Decided before spines: decide again for Claude to write the beats.")}>
          {values.spine ? <ol>
            {values.spine.beats.map((beat, index) => <li key={`${beat.slide}-${index}`}>
              <strong>{beat.slide} · {beat.role}</strong> {beat.scene}
              <br /><em>Words:</em> {beat.words} <em>Image:</em> {beat.image}{beat.withholds ? <> <em>Withholds:</em> {beat.withholds}</> : null}{beat.factIds.length ? <> <em>Facts:</em> {beat.factIds.join(", ")}</> : null}
            </li>)}
          </ol> : null}
        </FormField>
        {reset("spine")}
        {focus.staleDirections
          ? <InlineNotice tone="info" title="The plan was written for another telling">You changed how the story is told; the spine and the directions still follow what Claude decided before. <Button variant="quiet" size="compact" busy={saving === "direction"} disabled={locked} onClick={onRewritePlan}>Rewrite the plan</Button></InlineNotice>
          : null}
      </div>
      <div className={`${styles.focusField} ${styles.focusWide}`}>
        <FocusText key={key("visualDirection")} label="Visual direction" description={about("visualDirection", values.visualDirection ? "The visual script follows it: the world the images live in, who leads them, what recurs." : "Decided before this field existed: decide again for Claude to set it, or write it.")} value={values.visualDirection ?? ""} max={FOCUS_VISUAL_DIRECTION_MAX_CHARACTERS} rows={3} disabled={locked} onCommit={(value) => onSave("visualDirection", value)} />
        {reset("visualDirection")}
      </div>
    </div>
  </div>;
}

/** The judge's look at the premise, in one line for the field's description. */
function conceptReviewLine(focus: Draft2Focus): string | undefined {
  const review = focus.conceptReview;
  if (!review) return undefined;
  const judge = draft2ModelName(review.by.model, review.by.provider);
  if (review.verdict === "keep") return `${judge} kept it: ${review.reason}`;
  if (review.verdict === "classic") {
    const proposed = review.proposed;
    const what = !proposed ? "" : proposed.arc === "discovery" ? ` to Claude’s premise (${clip(proposed.premise, 80)})` : ` to Claude’s ${conceptName(proposed.arc).toLowerCase()}`;
    return `${judge} preferred classic${what}: ${review.reason}`;
  }
  return `Not reviewed: ${review.reason}`;
}

/**
 * The concept, saved as a whole: classic, or discovery with its premise (one
 * of Claude's, or the editor's own) and its chain of reveals, one question
 * per line, the news last. Discovery with no premise to start from waits for
 * the editor's before it is saved.
 */
function FocusConcept({ focus, description, disabled, onCommit }: {
  focus: Draft2Focus;
  description?: string;
  disabled: boolean;
  onCommit: (concept: Draft2FocusConcept) => void;
}) {
  const concept = focusConcept(focus.values!);
  const [pending, setPending] = useState(false);
  const [writing, setWriting] = useState(false);
  const arc: Draft2ConceptArc = pending ? "discovery" : concept.arc;
  // Claude's premises (its choice, the one the judge sent back, its others) and the one standing, once each.
  const premises = [...new Map([focus.ai?.concept, focus.conceptReview?.proposed, concept, ...(focus.conceptOptions ?? []).map((option) => ({ arc: "discovery" as const, ...option }))]
    .filter((entry): entry is Draft2FocusConcept => Boolean(entry && (entry.arc ?? "discovery") === "discovery" && entry.premise))
    .map((entry) => [entry.premise, entry] as const)).values()];
  const commit = (next: Draft2FocusConcept) => { setPending(false); setWriting(false); onCommit(next); };
  const switchArc = (next: Draft2ConceptArc) => {
    setWriting(false);
    if (next === concept.arc) { setPending(false); return; }
    if (next === "classic") { commit(CLASSIC_CONCEPT); return; }
    if (next !== "discovery") {
      // Claude's own concept for that arc, with its facts and beats; else the arc alone, for the writers to order.
      const claude = [focus.ai?.concept, focus.conceptReview?.proposed, ...(focus.conceptOptions ?? []).map((option) => ({ ...option, arc: option.arc ?? "discovery" as const }))].find((entry) => entry?.arc === next);
      commit(claude ? { arc: next, premise: "", premiseFactIds: claude.premiseFactIds, reveals: claude.reveals } : { arc: next, premise: "", premiseFactIds: [], reveals: [] });
      return;
    }
    if (premises[0]) { commit(premises[0]); return; }
    setPending(true);
    setWriting(true);
  };
  const settled = arc === "discovery" && !pending;
  const beatArc = arc !== "classic" && arc !== "discovery" ? arc : undefined;
  return <fieldset className={styles.focusVoice}>
    <legend className={styles.focusLegend}>Concept</legend>
    {description ? <p className={styles.factMeta}>{description}</p> : null}
    <div className={styles.focusGrid}>
      <FormField label="How the reader meets the news">
        <select value={arc} disabled={disabled} onChange={(event) => switchArc(event.target.value as Draft2ConceptArc)}>
          {FOCUS_CONCEPT_ARCS.map((entry) => <option key={entry} value={entry}>{CONCEPT_LABEL[entry]}</option>)}
        </select>
      </FormField>
      {settled ? <FormField label="Premise" description={concept.premiseFactIds.length ? `Dramatizes ${concept.premiseFactIds.join(", ")}` : "Your premise: it dramatizes the facts, it adds none."}>
        <select value={concept.premise} disabled={disabled} onChange={(event) => {
          if (event.target.value === "write") { setWriting(true); return; }
          const chosen = premises.find((entry) => entry.premise === event.target.value);
          if (chosen) commit(chosen);
        }}>
          {premises.map((entry) => <option key={entry.premise} value={entry.premise}>{clip(entry.premise, 110)}</option>)}
          <option value="write">Write your own…</option>
        </select>
      </FormField> : null}
    </div>
    {writing && arc === "discovery" ? <FocusText
      key="premise-own"
      label="Your premise"
      description="The story's own world in one line: what the reader finds, who asks, what the mission is. It invents the world, never the news."
      value=""
      max={FOCUS_PREMISE_MAX_CHARACTERS}
      disabled={disabled}
      onCommit={(value) => commit({ arc: "discovery", premise: value.trim(), premiseFactIds: [], reveals: concept.arc === "discovery" ? concept.reveals : [] })}
    /> : null}
    {settled ? <FocusText
      key={`reveals-${concept.premise}`}
      label="Discovery chain: one question per line, the news last"
      value={concept.reveals.join("\n")}
      max={FOCUS_MAX_REVEALS * (FOCUS_REVEAL_MAX_CHARACTERS + 1)}
      rows={4}
      allowEmpty
      disabled={disabled}
      onCommit={(value) => commit({ ...concept, reveals: value.split("\n").map((line) => line.trim()).filter(Boolean) })}
    /> : null}
    {beatArc && concept.arc === beatArc ? <FocusText
      key={`beats-${beatArc}-${concept.reveals.join("|")}`}
      label={BEATS_LABEL[beatArc]}
      description={concept.premiseFactIds.length ? `Rests on ${concept.premiseFactIds.join(", ")}` : "Your beats: they order the facts, they add none; empty, the writers order them."}
      value={concept.reveals.join("\n")}
      max={FOCUS_MAX_REVEALS * (FOCUS_REVEAL_MAX_CHARACTERS + 1)}
      rows={4}
      allowEmpty
      disabled={disabled}
      onCommit={(value) => commit({ ...concept, reveals: value.split("\n").map((line) => line.trim()).filter(Boolean) })}
    /> : null}
  </fieldset>;
}

/** The judge's look at the narrative form, in one line for the field's description. */
function narrativeReviewLine(focus: Draft2Focus): string | undefined {
  const review = focus.narrativeReview;
  if (!review) return undefined;
  const judge = draft2ModelName(review.by.model, review.by.provider);
  if (review.verdict === "keep") return `${judge} kept it: ${review.reason}`;
  if (review.verdict === "classic") return `${judge} preferred classic${review.proposed ? ` to Claude’s ${NARRATIVE_LABEL[review.proposed.form].split(":")[0].toLowerCase()} (${clip(review.proposed.anchor, 60)})` : ""}: ${review.reason}`;
  return `Not reviewed: ${review.reason}`;
}

/**
 * The narrative form, saved as a whole: the form, what stays (a guide or an
 * object), how it ends, and what changes from slide to slide. A guide is one
 * of the brand's characters (while People and places allows them), a figure
 * Claude saw, or one the editor describes; an object is one Claude saw or one
 * the editor describes. A form with nothing to start from waits for the
 * editor to say what stays before it is saved.
 */
function FocusNarrative({ focus, material, description, disabled, onCommit }: {
  focus: Draft2Focus;
  material?: Draft2FocusMaterial;
  description?: string;
  disabled: boolean;
  onCommit: (narrative: Draft2FocusNarrative) => void;
}) {
  const narrative = focusNarrative(focus.values!);
  const [pending, setPending] = useState<Draft2NarrativeForm>();
  const [describing, setDescribing] = useState(false);
  const form = pending ?? narrative.form;
  const wanted = form === "classic" ? "figure" : FORM_ANCHOR[form].kind;
  const characters = material?.characters ?? [];
  // The anchors Claude saw (its choice, the proposal the judge sent back, its alternatives) and the one standing, once each.
  const seen = [focus.ai?.narrative, focus.narrativeReview?.proposed, narrative, ...(focus.narrativeOptions ?? []).map((option) => ({ ...CLASSIC_NARRATIVE, anchorKind: option.kind, anchor: option.anchor, anchorFactIds: option.factIds }))]
    .filter((entry): entry is Draft2FocusNarrative => Boolean(entry && entry.anchor && ["figure", "object", "scene", "line"].includes(entry.anchorKind)));
  const anchors = [...new Map(seen.map((entry) => [`${entry.anchorKind}:${entry.anchor}`, entry])).values()].filter((entry) => entry.anchorKind === wanted);
  const commit = (next: Draft2FocusNarrative) => { setPending(undefined); setDescribing(false); onCommit(next); };
  const switchForm = (next: Draft2NarrativeForm) => {
    setDescribing(false);
    if (next === narrative.form) { setPending(undefined); return; }
    if (next === "classic") { commit(CLASSIC_NARRATIVE); return; }
    // Claude's own proposal for that form, else a brand character or an anchor Claude saw; else the editor says what stays.
    const proposal = [focus.narrativeReview?.proposed, focus.ai?.narrative].find((entry) => entry?.form === next);
    if (proposal) { commit(proposal); return; }
    const kind = FORM_ANCHOR[next].kind;
    const kept = { progression: narrative.progression, ending: narrative.form === "classic" ? "resolves" as const : narrative.ending };
    const character = next === "character-guide" ? characters[0] : undefined;
    if (character) { commit({ form: next, anchorKind: "character", characterId: character.id, anchor: character.name, anchorFactIds: [], ...kept }); return; }
    const anchor = seen.find((entry) => entry.anchorKind === kind);
    if (anchor) { commit({ form: next, anchorKind: kind, characterId: null, anchor: anchor.anchor, anchorFactIds: anchor.anchorFactIds, ...kept }); return; }
    setPending(next);
    setDescribing(true);
  };
  const anchorValue = narrative.anchorKind === "character" ? `character:${narrative.characterId}` : `anchor:${narrative.anchor}`;
  const chooseAnchor = (value: string) => {
    if (value === "describe") { setDescribing(true); return; }
    const character = characters.find((entry) => `character:${entry.id}` === value);
    if (character) { commit({ ...narrative, anchorKind: "character", characterId: character.id, anchor: character.name, anchorFactIds: [] }); return; }
    const anchor = anchors.find((entry) => `anchor:${entry.anchor}` === value);
    if (anchor) commit({ ...narrative, anchorKind: anchor.anchorKind, characterId: null, anchor: anchor.anchor, anchorFactIds: anchor.anchorFactIds });
  };
  const subject = form === "classic" ? "guide" : FORM_ANCHOR[form].label.toLowerCase();
  const settled = form !== "classic" && !pending;
  return <fieldset className={styles.focusVoice}>
    <legend className={styles.focusLegend}>Narrative form</legend>
    {description ? <p className={styles.factMeta}>{description}</p> : null}
    <div className={styles.focusGrid}>
      <FormField label="Form">
        <select value={form} disabled={disabled} onChange={(event) => switchForm(event.target.value as Draft2NarrativeForm)}>
          {FOCUS_NARRATIVE_FORMS.map((entry) => <option key={entry} value={entry}>{NARRATIVE_LABEL[entry]}</option>)}
        </select>
      </FormField>
      {settled ? <FormField label={FORM_ANCHOR[form].label} description={form === "character-guide" && material?.characterChoice === "off" ? "The brand’s characters are off in People and places." : undefined}>
        <select value={anchorValue} disabled={disabled} onChange={(event) => chooseAnchor(event.target.value)}>
          {form === "character-guide" ? characters.map((character) => <option key={character.id} value={`character:${character.id}`}>{character.name} · the brand’s character</option>) : null}
          {narrative.anchorKind === "character" && !characters.some((character) => character.id === narrative.characterId) ? <option value={anchorValue}>{narrative.anchor} · not available</option> : null}
          {anchors.map((entry) => <option key={entry.anchor} value={`anchor:${entry.anchor}`}>{clip(entry.anchor, 90)}{entry.anchorFactIds.length ? " · from the facts" : ""}</option>)}
          <option value="describe">Describe another…</option>
        </select>
      </FormField> : null}
      {settled ? <FormField label="Ending">
        <select value={narrative.ending} disabled={disabled} onChange={(event) => commit({ ...narrative, ending: event.target.value as Draft2FocusNarrative["ending"] })}>
          {FOCUS_NARRATIVE_ENDINGS.map((ending) => <option key={ending} value={ending}>{ENDING_LABEL[ending]}</option>)}
        </select>
      </FormField> : null}
    </div>
    {describing && form !== "classic" ? <FocusText
      key={`describe-${form}`}
      label={`Describe the ${subject}`}
      description={FORM_ANCHOR[form].describe}
      value=""
      max={FOCUS_ANCHOR_MAX_CHARACTERS}
      disabled={disabled}
      onCommit={(value) => commit({ form, anchorKind: wanted, characterId: null, anchor: value.trim(), anchorFactIds: [], progression: narrative.progression, ending: narrative.form === "classic" ? "resolves" : narrative.ending })}
    /> : null}
    {settled ? <FocusText key={`progression-${narrative.form}-${narrative.anchor}`} label="What changes from slide to slide" value={narrative.progression} max={FOCUS_PROGRESSION_MAX_CHARACTERS} allowEmpty disabled={disabled} onCommit={(value) => commit({ ...narrative, progression: value.trim() })} /> : null}
  </fieldset>;
}

/** The autopilot's log: each step it ran, how it ended, what it took in time and in the meter's cost, and where it stands. */
function AutopilotView({ autopilot, trace, now }: { autopilot: Autopilot; trace: readonly Draft2TraceEntry[]; now: number }) {
  // A step's cost: the calls of its trace step made while it ran (the accounts to tag have their own trace step).
  const costOf = (entry: AutopilotEntry) => {
    const begin = Date.parse(entry.startedAt);
    return trace.filter((call) => call.step === entry.step && Date.parse(call.at) >= begin - 1_000 && Date.parse(call.at) <= begin + entry.ms + 1_000).reduce((sum, call) => sum + (call.costMicros ?? 0), 0);
  };
  const spent = autopilot.steps.reduce((sum, entry) => sum + costOf(entry), 0);
  const elapsed = (autopilot.finishedAt ? Date.parse(autopilot.finishedAt) : Math.max(now, Date.parse(autopilot.startedAt))) - Date.parse(autopilot.startedAt);
  const failed = autopilot.steps.some((entry) => entry.status === "failed");
  return <div className={styles.focusBody}>
    {autopilot.steps.length ? <ol className={styles.autopilotList}>
      {autopilot.steps.map((entry) => <li key={entry.startedAt} data-status={entry.status}>
        <strong>{STEP_TITLE[entry.step]}</strong> · {entry.status === "ready" ? `done${entry.score !== undefined ? ` · ${entry.score}` : ""}` : entry.status === "needs-review" ? (entry.score === undefined ? "look at it" : entry.score >= FUNNEL_ACCEPTABLE_SCORE ? `acceptable · ${entry.score}` : `under ${FUNNEL_ACCEPTABLE_SCORE} · ${entry.score}, look at it`) : "failed"} · {minutes(entry.ms)} · {usd(costOf(entry))}
      </li>)}
    </ol> : null}
    {autopilot.current ? <LoadingState>{STEP_TITLE[autopilot.current]} is running; open its step on the rail to follow it.</LoadingState> : null}
    {autopilot.outcome ? <InlineNotice tone={failed ? "error" : "info"} title={autopilot.active ? "Autopilot" : `Autopilot finished · ${minutes(elapsed)} · ${usd(spent)}`}>{autopilot.outcome}</InlineNotice> : null}
  </div>;
}

/** A text field that saves when it loses focus and changed; an emptied required field goes back to the saved value. */
function FocusText({ label, description, value, max, rows = 2, allowEmpty = false, disabled, onCommit }: {
  label: string; description?: string; value: string; max: number; rows?: number; allowEmpty?: boolean; disabled: boolean; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return <FormField label={label} description={description}>
    <textarea
      value={draft}
      rows={rows}
      maxLength={max}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() === value.trim()) return;
        if (!draft.trim() && !allowEmpty) { setDraft(value); return; }
        onCommit(draft);
      }}
    />
  </FormField>;
}

/** The story's gravity and its five tone dials, saved together: the gravity when it changes, a dial when it loses focus. */
function FocusVoice({ voice, description, disabled, onCommit }: { voice: Draft2FocusVoice; description?: string; disabled: boolean; onCommit: (voice: Draft2FocusVoice) => void }) {
  const [draft, setDraft] = useState(voice);
  const commit = (next: Draft2FocusVoice) => { if (JSON.stringify(next) !== JSON.stringify(voice)) onCommit(next); };
  return <fieldset className={styles.focusVoice}>
    <legend className={styles.focusLegend}>Voice</legend>
    <div className={styles.voiceDials}>
      <FormField label="Gravity">
        <select value={draft.gravity} disabled={disabled} onChange={(event) => {
          const next = { ...draft, gravity: event.target.value as Draft2FocusVoice["gravity"] };
          setDraft(next);
          commit(next);
        }}>
          {FOCUS_GRAVITIES.map((gravity) => <option key={gravity} value={gravity}>{GRAVITY_LABEL[gravity]}</option>)}
        </select>
      </FormField>
      {TONE_KEYS.map((key) => <FormField key={key} label={TONE_LABEL[key]} description={toneWords(key, draft[key])}>
        <input
          type="number"
          min={1}
          max={100}
          step={1}
          value={Number.isFinite(draft[key]) ? draft[key] : ""}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.valueAsNumber })}
          onBlur={() => {
            const value = Math.round(draft[key]);
            if (Number.isInteger(value) && value >= 1 && value <= 100) commit({ ...draft, [key]: value });
            else setDraft(voice);
          }}
        />
      </FormField>)}
    </div>
    {description ? <p className={styles.factMeta}>{description}</p> : null}
  </fieldset>;
}

/** The Review step: the editor's scores, what works, the reader's reactions slide by slide, and the patches to apply, decline or undo. */
function ReviewView({ review, current, saving, locked, onDecide }: {
  review: Draft2Review;
  /** Whether the review read the versions chosen now; a patch applies only to those. */
  current: boolean;
  saving?: string;
  locked: boolean;
  onDecide: (action: "apply" | "decline" | "undo", patchId: string) => void;
}) {
  const editor = review.editor;
  const reader = review.reader;
  const by = (role?: { provider: "openai" | "anthropic"; model: string }) => role ? draft2ModelName(role.model, role.provider) : "";
  const read = new Date(review.updatedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
  return <div className={styles.focusBody}>
    <p className={styles.factMeta}>Review v{review.version} · {read}{reader ? ` · reader ${by(review.readerBy)}` : ""}{editor ? ` · editor ${by(review.editorBy)}` : ""}{current ? "" : " · the opening, the closing or the deck changed since: read the carousel again"}</p>
    {editor ? <>
      <p className={styles.factMeta}><strong>{editor.verdict === "ready" ? "Ready" : "Patch"} · {editor.scores.overall}/100</strong> · {REVIEW_CRITERIA.map((criterion) => `${criterion} ${editor.scores[criterion]}`).join(" · ")}</p>
      <p>{editor.summary}</p>
      {editor.strengths.length ? <><p className={styles.factMeta}><strong>What works, and must stay</strong></p><ul>{editor.strengths.map((strength, index) => <li key={index}>{strength}</li>)}</ul></> : null}
    </> : null}
    {reader ? <>
      <p className={styles.factMeta}><strong>The reader</strong> · {reader.verdict} · {reader.follow ? "would follow" : "would not follow"}{reader.share ? " · would share" : ""}{reader.comment ? ` · would comment: “${reader.comment}”` : ""}{reader.stoppedAt ? ` · stopped at ${reader.stoppedAt}` : ""}</p>
      <ol>{reader.reactions.map((reaction) => <li key={reaction.slide}><strong>{reaction.slide}</strong> {reaction.swipe ? "swipes:" : "stops:"} {reaction.thought}</li>)}</ol>
    </> : null}
    {editor?.patches.length ? <>
      <p className={styles.factMeta}><strong>Patches</strong> · {proposedPatches(review).length} to decide</p>
      <ol>{editor.patches.map((patch) => <li key={patch.id} className={styles.focusField}>
        <p><strong>{patch.slide} · {patch.field}</strong> · {patch.status}{patch.appliedBy ? ` by the ${patch.appliedBy}` : ""}</p>
        <p><del>{patch.before}</del></p>
        <p><ins>{patch.after}</ins></p>
        <p className={styles.factMeta}>{patch.reason}{patch.note ? ` · ${patch.note}` : ""}</p>
        {patch.status === "proposed" ? <div>
          <Button variant="primary" size="compact" busy={saving === patch.id} disabled={locked || !current} onClick={() => onDecide("apply", patch.id)}>Apply</Button>{" "}
          <Button variant="quiet" size="compact" busy={saving === patch.id} disabled={locked} onClick={() => onDecide("decline", patch.id)}>Decline</Button>
        </div> : null}
        {patch.status === "applied" ? <div><Button variant="quiet" size="compact" busy={saving === patch.id} disabled={locked || !current} onClick={() => onDecide("undo", patch.id)}>Undo</Button></div> : null}
      </li>)}</ol>
    </> : editor ? <p className={styles.factMeta}>No patches: the editor would change nothing.</p> : null}
  </div>;
}
