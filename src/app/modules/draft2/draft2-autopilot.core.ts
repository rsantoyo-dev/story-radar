import type { Draft2Caption } from "./draft2-caption.types";
import type { Draft2Closing } from "./draft2-closing.types";
import type { Draft2Deck } from "./draft2-deck.types";
import type { Draft2Fact, Draft2SessionStatus, Draft2Step, Draft2TraceEntry } from "./draft2-facts.types";
import { focusFindings, focusMaterial, visualDirectionChanged, wordsFollowFocus, type Draft2Focus } from "./draft2-focus.types";
import { shownAttempt, slideSettled, type Draft2Images } from "./draft2-images.types";
import { awaitsConfirmation, type Draft2Inventory } from "./draft2-inventory.types";
import { confirmedMentions, sameMentions, type Draft2Mentions } from "./draft2-mentions.types";
import { OPENING_STALL_MS, type Draft2Opening } from "./draft2-opening.types";
import { proposedPatches, reviewCurrent, type Draft2Review } from "./draft2-review.types";
import { deckCarousel, sameCarouselWords, type Draft2Visual } from "./draft2-visual.types";

/**
 * The autopilot's decisions, pure, shared by the editor's tab and the server
 * (2026-10-22: "lo mismo que tenemos, pero desde el servidor, cosa que
 * siempre se recupera y lo podemos reactivar"). The tab ran these rules in
 * the canvas since 2026-10-10; a job on the server runs them step after step
 * for one pass of a route's time, saves where it stands, and the next pass
 * (chained by the pass itself, kicked by a read of the story, or the worker's
 * cron) goes on from the session as it is. Nothing here touches a provider or
 * the database: the runners come in as dependencies.
 */

/** A step the autopilot can run; the publish approval stays the editor's. */
export type Draft2AutopilotStep = Exclude<Draft2Step, "publication">;

/** The steps in the order the autopilot runs them: the accounts to tag (a run of the caption's screen) come after the spine, before the words; the caption after the images. */
export const AUTOPILOT_STEPS: readonly Draft2AutopilotStep[] = ["facts", "inventory", "focus", "spine", "mentions", "opening", "closing", "deck", "review", "visual", "images", "caption"];

/** Whether the autopilot runs a step on its way to a target: every step up to the target, the target included. */
export function autopilotStepRuns(step: Draft2AutopilotStep, until: Draft2AutopilotStep): boolean {
  return AUTOPILOT_STEPS.indexOf(step) <= AUTOPILOT_STEPS.indexOf(until);
}

export const AUTOPILOT_STEP_TITLE: Record<Draft2Step, string> = {
  facts: "Facts", focus: "Focus", spine: "Spine", inventory: "People and places", mentions: "Accounts to tag", opening: "Opening", closing: "Closing", deck: "Deck", review: "Review", visual: "Visual script", images: "Images", caption: "Caption", publication: "Publish",
};

/** The reason the autopilot writes again a funnel step whose last run ended with nothing that may win. */
export const NO_CLEAN_VERSION = "its last run ended with no clean version";

/** The session as the decisions read it: the row, or the canvas's view of it (its dates as strings). */
export type AutopilotSession = {
  id: string;
  /** The row keeps it as text; the decisions compare it to the session statuses. */
  status: Draft2SessionStatus | string;
  step: string;
  facts: Draft2Fact[] | null;
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
  trace: Draft2TraceEntry[];
  error: string | null;
  updatedAt: string | Date;
};

export type AutopilotNext =
  | { step: Draft2AutopilotStep; continuing?: boolean; /** Why a step that had run is written again. */ reason?: string }
  | { done: true }
  | { blocked: string };

/** A funnel run as the autopilot reads it: nothing yet, stopped (to continue), failed (stop), finished for something that changed since (write again), or finished. */
export function runNeeds(step: Draft2AutopilotStep, run: { status: string; winnerId?: string; editorChoiceId?: string; error?: string } | null | undefined, changed: boolean, noun: string): AutopilotNext | undefined {
  if (!run) return { step };
  if (run.status === "paused" || run.status === "running") return { step, continuing: true };
  if (run.status === "failed") return { blocked: `The ${noun} failed${run.error ? `: ${run.error}` : "."} Run it again once it is fixed.` };
  // Written again, and the log says why: a run with no version that may win, or one written for what changed since.
  if (!(run.editorChoiceId ?? run.winnerId)) return { step, reason: NO_CLEAN_VERSION };
  if (changed) return { step, reason: "what it follows changed since" };
  return undefined;
}

const time = (value: string | Date) => typeof value === "string" ? Date.parse(value) : value.getTime();

/**
 * The next step the autopilot runs, from the session as it stands: the first
 * step not finished, stopped, or finished for something that changed since
 * (the same rules the canvas shows on each step), through the caption. A
 * step that needs the editor blocks the run; a run marked running whose
 * heartbeat stopped is continued. The caller cuts the list at its target
 * (`autopilotStepRuns`).
 */
export function nextAutopilotStep(session: AutopilotSession | null | undefined, now: number): AutopilotNext {
  if (!session) return { step: "facts" };
  const stale = now - time(session.updatedAt) > OPENING_STALL_MS;
  const factsVerified = Boolean(session.facts?.length) && (session.step !== "facts" || session.status === "ready");
  if (!factsVerified) {
    if (session.step === "facts" && session.status === "running" && !stale) return { blocked: "The facts are still being verified." };
    if (session.step === "facts" && session.status === "needs-review" && session.facts?.length) return { blocked: "The reviewer did not accept the facts after three extractions: review them, then run the facts again or use them as they stand." };
    return { step: "facts" };
  }
  // People and places come first: the focus chooses the narrative form with them.
  const inventory = session.inventory;
  if (!inventory || inventory.status === "failed" || (inventory.status === "running" && stale)) return { step: "inventory" };
  if (inventory.status === "running") return { blocked: "The people and places are being found." };
  const focus = session.focus;
  const waiting = inventory.entities.filter(awaitsConfirmation).length;
  if (waiting && !focus?.values) return { blocked: `${waiting} ${waiting === 1 ? "person waits" : "people wait"} for you in People and places: confirm or reject ${waiting === 1 ? "them" : "each"}, then run the autopilot again.` };
  if (!focus?.values || (focus.status === "running" && stale)) return { step: "focus" };
  if (focus.status === "running") return { blocked: "The focus is being decided." };
  const findings = focusFindings(focus.values, focusMaterial(inventory), session.facts ?? undefined);
  const focusOwn = findings.filter((finding) => finding.field !== "spine");
  if (focusOwn.length) return { blocked: `Fix the focus first: ${focusOwn.map((finding) => finding.detail).join(" ")}` };
  // The spine: the plan the words and the images follow, written from the focus; a focus decided or changed since needs it again.
  const spineRunning = session.step === "spine" && session.status === "running";
  if (spineRunning && !stale) return { blocked: "The spine is being written." };
  if (session.step === "spine" && session.status === "failed") return { blocked: `The spine failed${session.error ? `: ${session.error}` : "."} Write it again once it is fixed.` };
  if (!focus.values.spine || focus.staleDirections || spineRunning) return { step: "spine" };
  const spineFindings = findings.filter((finding) => finding.field === "spine");
  if (spineFindings.length) return { blocked: `Fix the spine first: ${spineFindings.map((finding) => finding.detail).join(" ")}` };
  const mentions = session.mentions;
  if (!mentions || mentions.status === "failed" || (mentions.status === "running" && stale)) return { step: "mentions" };
  const opening = session.opening;
  const openingNeeds = runNeeds("opening", opening, Boolean(opening && !wordsFollowFocus(opening.focus, focus)), "opening");
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
  // The script pictures the carousel's words and the images letter them: a review patch or an edit applied since asks for a new script, as does a new visual direction.
  const carouselNow = deckCarousel(deck!);
  const visualNeeds = runNeeds("visual", visual, Boolean(visual && (visual.deckId !== deckId || visual.inventoryVersion !== inventory.version || (visual.carousel && carouselNow && !sameCarouselWords(visual.carousel, carouselNow)) || visualDirectionChanged(visual.focus, focus))), "visual script");
  if (visualNeeds) return visualNeeds;
  const visualId = visual!.editorChoiceId ?? visual!.winnerId;
  const images = session.images;
  if (!images || images.visualId !== visualId) return { step: "images" };
  const pending = images.slides.some((slide) => !slideSettled(slide));
  if (pending && (images.status === "paused" || images.status === "failed" || (images.status === "running" && stale))) return { step: "images", continuing: true };
  if (images.status === "running" && !stale) return { blocked: "The images are being made." };
  if (images.status === "failed") return { blocked: `The images failed${images.error ? `: ${images.error}` : "."}` };
  if (images.slides.some((slide) => !shownAttempt(slide))) return { blocked: "Some slides have no image: make them from their cards, then go on." };
  // The caption follows the finished images and tags the accounts confirmed now; one written for other images or other accounts is written again.
  const caption = session.caption;
  const captionNeeds = runNeeds("caption", caption, Boolean(caption && (caption.imagesRunId !== images.runId || !sameMentions(caption.mentions, confirmedMentions(mentions)))), "caption");
  if (captionNeeds) return captionNeeds;
  return { done: true };
}

/** How a step ended for the autopilot's log. */
export type AutopilotStepStatus = "ready" | "needs-review" | "failed";
export function stepOutcome(session: AutopilotSession, step: Draft2AutopilotStep): AutopilotStepStatus {
  if (step === "facts") return session.step !== "facts" || session.status === "ready" ? "ready" : session.status === "failed" ? "failed" : "needs-review";
  const status = (session as unknown as Record<string, { status?: string } | null>)[step]?.status;
  return status === "failed" ? "failed" : status === "needs-review" ? "needs-review" : "ready";
}

/** The best score a funnel run reached, across its rounds. */
export function bestScoreOf(run: { rounds?: readonly { evaluation?: { scores?: readonly { overall: number }[] } }[] } | null | undefined): number | undefined {
  let best: number | undefined;
  for (const round of run?.rounds ?? []) for (const score of round.evaluation?.scores ?? []) if (best === undefined || score.overall > best) best = score.overall;
  return best;
}

/** What a session has cost so far: every provider call on the trace and the images' charges. */
export function sessionCostMicros(session: Pick<AutopilotSession, "trace" | "images">): number {
  const calls = session.trace.reduce((sum, entry) => sum + (entry.costMicros ?? 0), 0);
  const images = session.images as unknown as { slides?: { attempts?: { costMicros?: number }[] }[]; anchorPlate?: { costMicros?: number }; masterPlate?: { costMicros?: number } } | null;
  const attempts = (images?.slides ?? []).reduce((sum, slide) => sum + (slide.attempts ?? []).reduce((inner, attempt) => inner + (attempt.costMicros ?? 0), 0), 0);
  return calls + attempts + (images?.anchorPlate?.costMicros ?? 0) + (images?.masterPlate?.costMicros ?? 0);
}

// --- A job on the server --------------------------------------------------

export const AUTOPILOT_JOB_STATUSES = ["running", "blocked", "done", "failed", "stopped"] as const;
export type AutopilotJobStatus = (typeof AUTOPILOT_JOB_STATUSES)[number];

/** One step a job ran, how it ended, and what it took. */
export type AutopilotJobEntry = { step: Draft2AutopilotStep; status: AutopilotStepStatus; ms: number; startedAt: string; /** The best score a funnel step reached. */ score?: number; /** Why a step that had run was written again. */ reason?: string };

/** A job as the canvas and Today read it. */
export type AutopilotJobView = {
  id: string;
  storyId: string;
  sessionId: string | null;
  status: AutopilotJobStatus;
  /** The step the job stops after. */
  until: Draft2AutopilotStep;
  /** The step running now, while a pass runs one. */
  currentStep: Draft2AutopilotStep | null;
  steps: AutopilotJobEntry[];
  /** Why the job stopped: blocked, failed, stopped, or done. */
  outcome: string | null;
  passes: number;
  startedBy: string;
  /** The job started over from the facts, in a new session. */
  fresh: boolean;
  /** The editor asked it to stop; the step running finishes first. */
  stopRequested: boolean;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

/** How long one pass drives a job before it starts no new step: the routes allow 300 s. */
export const AUTOPILOT_PASS_BUDGET_MS = 270_000;
/** A budgeted step (the funnel's, the images', the facts') starts only with this much left: the funnel's shortest useful call is a minute. */
export const AUTOPILOT_MIN_STEP_MS = 90_000;
/** What a step without its own budget is expected to take, so a pass never starts one it cannot finish. */
export const AUTOPILOT_STEP_ESTIMATE_MS: Partial<Record<Draft2AutopilotStep, number>> = { inventory: 150_000, focus: 150_000, spine: 150_000, mentions: 120_000, review: 200_000 };
/** Steps that read a deadline and pause themselves before it. */
export const AUTOPILOT_BUDGETED_STEPS: readonly Draft2AutopilotStep[] = ["facts", "opening", "closing", "deck", "visual", "images", "caption"];
/** How many step runs one job may make: a story takes about twelve; a run that loops is stopped. */
export const AUTOPILOT_MAX_STEP_RUNS = 24;
/** What a job may spend on its session before it stops to ask, in micro-dollars (DRAFT2_AUTOPILOT_MAX_USD). */
export const AUTOPILOT_DEFAULT_MAX_COST_MICROS = 6_000_000;

/** What the pass found when it decided whether to start a step. */
export type AutopilotPassEnd =
  | { kind: "done" }
  | { kind: "blocked"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "stopped" }
  | { kind: "out-of-time"; next: Draft2AutopilotStep }
  | { kind: "spent"; costMicros: number };

export type AutopilotPassDependencies = {
  /** The session as it stands now (the latest of the story). */
  loadSession: () => Promise<AutopilotSession | null>;
  /** Runs one step on the session to a deadline (epoch ms) and returns the session it ended on; a step that pauses returns it paused. */
  runStep: (step: Draft2AutopilotStep, options: { session: AutopilotSession | null; continuing: boolean; deadline: number }) => Promise<AutopilotSession>;
  /** Applies the review's necessary patches the way the autopilot does, and returns the session. */
  applyReviewPatches: (session: AutopilotSession) => Promise<AutopilotSession>;
  /** Whether the editor asked the job to stop; read between steps. */
  stopRequested: () => Promise<boolean>;
  /** Records the step running now (or none) and the log so far. */
  progress: (patch: { currentStep: Draft2AutopilotStep | null; steps: AutopilotJobEntry[]; sessionId?: string }) => Promise<void>;
  until: Draft2AutopilotStep;
  steps: AutopilotJobEntry[];
  /** How many step runs the job made before this pass. */
  stepRuns: number;
  deadline: number;
  maxCostMicros: number;
  now: () => number;
  /** The decision itself; the tests give their own. */
  next?: (session: AutopilotSession | null, now: number) => AutopilotNext;
  /** Start over: the job's first step is the facts, which open a new session; the steps then follow from it. */
  fresh?: boolean;
};

/**
 * One pass of a job: from the session as it stands, step after step, until
 * the target is done, a step blocks, fails or does not advance, the editor
 * stops the job, the session has spent its allowance, or the pass has no
 * time for the next step (the next pass goes on). Each step gets the pass's
 * deadline; a step that pauses before it is continued at once. The review's
 * necessary patches are applied as in the tab; unlike the tab, a review's
 * score never stops the job (every one of 33 reviews scored under 90 and the
 * editor went on in 24 of them without a change): the score is in the log.
 */
export async function runAutopilotPass(deps: AutopilotPassDependencies): Promise<{ end: AutopilotPassEnd; steps: AutopilotJobEntry[] }> {
  const steps = [...deps.steps];
  let session = await deps.loadSession();
  let previous: Draft2AutopilotStep | undefined;
  let runs = deps.stepRuns;
  for (;;) {
    if (await deps.stopRequested()) return { end: { kind: "stopped" }, steps };
    // A fresh job's first step is the facts: a new session, whatever the story's latest one says; from then on the decisions read that session.
    const next: AutopilotNext = deps.fresh && steps.length === 0 && runs === 0 ? { step: "facts" } : (deps.next ?? nextAutopilotStep)(session, deps.now());
    if ("done" in next) return { end: { kind: "done" }, steps };
    if ("blocked" in next) return { end: { kind: "blocked", reason: next.blocked }, steps };
    if (!autopilotStepRuns(next.step, deps.until)) return { end: { kind: "done" }, steps };
    if (next.step === previous) {
      return { end: { kind: "blocked", reason: next.reason === NO_CLEAN_VERSION
        ? `The ${AUTOPILOT_STEP_TITLE[next.step].toLowerCase()} ended again with no clean version: every version has a program finding or a factual error. Choose one, edit it by hand, or write it again.`
        : `The ${AUTOPILOT_STEP_TITLE[next.step].toLowerCase()} step did not advance; look at it before going on.` }, steps };
    }
    if (session) {
      const cost = sessionCostMicros(session);
      if (cost > deps.maxCostMicros) return { end: { kind: "spent", costMicros: cost }, steps };
    }
    if (runs >= AUTOPILOT_MAX_STEP_RUNS) return { end: { kind: "failed", reason: `The job ran ${runs} steps without finishing; look at the story before going on.` }, steps };
    const left = deps.deadline - deps.now();
    const needed = AUTOPILOT_BUDGETED_STEPS.includes(next.step) ? AUTOPILOT_MIN_STEP_MS : AUTOPILOT_STEP_ESTIMATE_MS[next.step] ?? AUTOPILOT_MIN_STEP_MS;
    if (left < needed) return { end: { kind: "out-of-time", next: next.step }, steps };
    previous = next.step;
    runs += 1;
    await deps.progress({ currentStep: next.step, steps, ...(session ? { sessionId: session.id } : {}) });
    const begin = deps.now();
    let result: AutopilotSession;
    try {
      result = await deps.runStep(next.step, { session, continuing: next.continuing ?? false, deadline: deps.deadline });
    } catch (error) {
      const reason = error instanceof Error ? error.message : `The ${AUTOPILOT_STEP_TITLE[next.step].toLowerCase()} step failed.`;
      steps.push({ step: next.step, status: "failed", ms: deps.now() - begin, startedAt: new Date(begin).toISOString(), ...(next.reason ? { reason: next.reason } : {}) });
      await deps.progress({ currentStep: null, steps });
      return { end: { kind: "failed", reason: `The ${AUTOPILOT_STEP_TITLE[next.step].toLowerCase()} step failed: ${reason}` }, steps };
    }
    session = result;
    // A step that paused for time is continued, not logged: the log shows the step once it ended.
    const paused = (result as unknown as Record<string, { status?: string } | null>)[next.step]?.status;
    if (next.step !== "facts" && (paused === "paused" || paused === "running")) {
      previous = undefined;
      await deps.progress({ currentStep: null, steps, sessionId: result.id });
      continue;
    }
    const status = stepOutcome(result, next.step);
    const score = next.step === "opening" || next.step === "closing" || next.step === "deck" || next.step === "visual" || next.step === "caption"
      ? bestScoreOf((result as unknown as Record<string, { rounds?: readonly { evaluation?: { scores?: readonly { overall: number }[] } }[] } | null>)[next.step])
      : next.step === "review" ? result.review?.editor?.scores.overall : undefined;
    steps.push({ step: next.step, status, ms: deps.now() - begin, startedAt: new Date(begin).toISOString(), ...(score !== undefined ? { score } : {}), ...(next.reason ? { reason: next.reason } : {}) });
    await deps.progress({ currentStep: null, steps, sessionId: result.id });
    if (status === "failed") return { end: { kind: "failed", reason: `The ${AUTOPILOT_STEP_TITLE[next.step].toLowerCase()} step failed; the job stopped there.` }, steps };
    // The review's patches are applied as the editor wrote them (the necessary kinds); the Review screen shows each and undoes any.
    if (next.step === "review" && proposedPatches(result.review).length) session = await deps.applyReviewPatches(result);
  }
}

/** What a pass's end means for the job: its status and what the editor reads. */
export function autopilotJobEnd(end: AutopilotPassEnd, until: Draft2AutopilotStep): { status: AutopilotJobStatus; outcome: string } | undefined {
  switch (end.kind) {
    case "done": return { status: "done", outcome: until === "caption"
      ? "The caption is written. Confirm the accounts to tag if any wait, choose the caption, and approve the carousel for publishing."
      : `Reached the ${AUTOPILOT_STEP_TITLE[until].toLowerCase()}, as you asked; the steps after it wait for you.` };
    case "blocked": return { status: "blocked", outcome: end.reason };
    case "failed": return { status: "failed", outcome: end.reason };
    case "stopped": return { status: "stopped", outcome: "Stopped at your request; every step so far is kept." };
    case "spent": return { status: "blocked", outcome: `This story has spent ${(end.costMicros / 1e6).toFixed(2)} USD, over the job's allowance; look at it before going on.` };
    case "out-of-time": return undefined;
  }
}

/** The step a job runs to, from what a request names; the caption by default. */
export function parseAutopilotUntil(value: unknown): Draft2AutopilotStep | undefined {
  if (value === undefined || value === null || value === "") return "caption";
  return (AUTOPILOT_STEPS as readonly string[]).includes(String(value)) ? value as Draft2AutopilotStep : undefined;
}
