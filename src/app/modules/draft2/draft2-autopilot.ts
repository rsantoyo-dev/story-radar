import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { draft2AutopilotJobs, type Draft2AutopilotJobRow, type Draft2SessionRow } from "@/db/schema";
import { createLogger } from "../observability/logger";
import {
  AUTOPILOT_DEFAULT_MAX_COST_MICROS, AUTOPILOT_PASS_BUDGET_MS, AUTOPILOT_STEP_TITLE, autopilotJobEnd, runAutopilotPass,
  type AutopilotJobEntry, type AutopilotJobStatus, type AutopilotJobView, type AutopilotSession, type Draft2AutopilotStep,
} from "./draft2-autopilot.core";
import { runDraft2Caption } from "./draft2-caption";
import { runDraft2Closing } from "./draft2-closing";
import { runDraft2Deck } from "./draft2-deck";
import { runDraft2Facts } from "./draft2-facts";
import { Draft2BusyError, Draft2InputError } from "./draft2-facts.types";
import { decideDraft2Focus, planDraft2Spine } from "./draft2-focus";
import { runDraft2Images } from "./draft2-images";
import { findDraft2Inventory } from "./draft2-inventory";
import { findDraft2Mentions } from "./draft2-mentions";
import { runDraft2Opening } from "./draft2-opening";
import { decideDraft2ReviewPatch, reviewDraft2Carousel } from "./draft2-review";
import { activeDraft2Session, latestDraft2Session } from "./draft2-session.repository";
import { runDraft2Visual } from "./draft2-visual";

const log = createLogger("draft2-autopilot");

/** Longer than a pass and the route that runs it (300 s), so a lost pass frees its job soon after. */
const LEASE_MS = 330_000;
/** How many jobs one worker pass drives at once: each is a story's worth of model calls. */
const JOBS_PER_PASS = 2;
/** The route every pass goes through when it is not the editor's start: it runs the pass in its own request's time. */
export const DRAFT2_AUTOPILOT_RESUME_PATH = "/api/internal/draft2/resume";

/** The server credential a pass uses to chain the next one, and the worker to resume: the publication worker's, so nothing new is configured. */
export const draft2WorkerSecret = () => process.env.DRAFT2_WORKER_SECRET?.trim() || process.env.INSTAGRAM_PUBLISH_WORKER_SECRET?.trim() || undefined;

function maxCostMicros(): number {
  const usd = Number(process.env.DRAFT2_AUTOPILOT_MAX_USD);
  return Number.isFinite(usd) && usd > 0 && usd <= 100 ? Math.round(usd * 1_000_000) : AUTOPILOT_DEFAULT_MAX_COST_MICROS;
}

export function autopilotJobView(row: Draft2AutopilotJobRow): AutopilotJobView {
  return {
    id: row.id, storyId: row.storyId, sessionId: row.sessionId, status: row.status as AutopilotJobStatus, until: row.until as Draft2AutopilotStep,
    currentStep: (row.currentStep as Draft2AutopilotStep | null) ?? null, steps: Array.isArray(row.steps) ? row.steps : [], outcome: row.outcome, passes: row.passes, startedBy: row.startedBy,
    stopRequested: Boolean(row.stopRequestedAt),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

/** The latest job of a story, if any. */
export async function latestDraft2AutopilotJob(topicId: string, storyId: string): Promise<AutopilotJobView | undefined> {
  const [row] = await db.select().from(draft2AutopilotJobs)
    .where(and(eq(draft2AutopilotJobs.topicId, topicId), eq(draft2AutopilotJobs.storyId, storyId)))
    .orderBy(desc(draft2AutopilotJobs.createdAt)).limit(1);
  return row ? autopilotJobView(row) : undefined;
}

/** The latest job of every story of a Topic, for Today's board. */
export async function latestDraft2AutopilotJobs(topicId: string): Promise<Map<string, AutopilotJobView>> {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (story_id) * FROM draft2_autopilot_jobs WHERE topic_id = ${topicId}::uuid ORDER BY story_id, created_at DESC
  `);
  const jobs = new Map<string, AutopilotJobView>();
  for (const raw of rows.rows as Record<string, unknown>[]) {
    const row: Draft2AutopilotJobRow = {
      id: String(raw.id), topicId: String(raw.topic_id), storyId: String(raw.story_id), sessionId: raw.session_id ? String(raw.session_id) : null, status: String(raw.status), until: String(raw.until),
      currentStep: raw.current_step ? String(raw.current_step) : null, steps: (raw.steps as AutopilotJobEntry[]) ?? [], outcome: raw.outcome ? String(raw.outcome) : null, passes: Number(raw.passes ?? 0), startedBy: String(raw.started_by ?? "editor"),
      stopRequestedAt: raw.stop_requested_at ? new Date(raw.stop_requested_at as string) : null, leaseOwner: raw.lease_owner ? String(raw.lease_owner) : null, leaseUntil: raw.lease_until ? new Date(raw.lease_until as string) : null,
      createdAt: new Date(raw.created_at as string), updatedAt: new Date(raw.updated_at as string), finishedAt: raw.finished_at ? new Date(raw.finished_at as string) : null,
    };
    jobs.set(row.storyId, autopilotJobView(row));
  }
  return jobs;
}

/**
 * The editor starts the autopilot on the server for a story, to a step
 * (the caption by default): one running job per story, none while a run is
 * live in a tab. The first pass starts in this request's own time
 * (`after()`), so the job moves at once; later passes chain through the
 * resume route.
 */
export async function startDraft2Autopilot({ topicId, storyId, until, by = "editor", origin }: { topicId: string; storyId: string; until: Draft2AutopilotStep; by?: string; origin: string }): Promise<AutopilotJobView> {
  const [running] = await db.select().from(draft2AutopilotJobs)
    .where(and(eq(draft2AutopilotJobs.storyId, storyId), eq(draft2AutopilotJobs.status, "running"))).limit(1);
  if (running) return autopilotJobView(running);
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is in progress for this story; start the autopilot when it finishes.");
  const session = await latestDraft2Session(topicId, storyId);
  const [job] = await db.insert(draft2AutopilotJobs)
    .values({ topicId, storyId, sessionId: session?.id ?? null, until, startedBy: by })
    .onConflictDoNothing().returning();
  if (!job) {
    const [existing] = await db.select().from(draft2AutopilotJobs).where(and(eq(draft2AutopilotJobs.storyId, storyId), eq(draft2AutopilotJobs.status, "running"))).limit(1);
    if (existing) return autopilotJobView(existing);
    throw new Draft2InputError("The autopilot could not start; try again.");
  }
  log.info("Autopilot job started", { jobId: job.id, topicId, storyId, until, by });
  after(() => driveDraft2AutopilotJob(job.id, origin));
  return autopilotJobView(job);
}

/** The editor stops a running job: the pass running finishes its step and stops; a job between passes stops at once. */
export async function stopDraft2Autopilot({ topicId, storyId, jobId }: { topicId: string; storyId: string; jobId: string }): Promise<AutopilotJobView> {
  const now = new Date();
  const [job] = await db.select().from(draft2AutopilotJobs)
    .where(and(eq(draft2AutopilotJobs.id, jobId), eq(draft2AutopilotJobs.topicId, topicId), eq(draft2AutopilotJobs.storyId, storyId))).limit(1);
  if (!job) throw new Draft2InputError("This autopilot job was not found.");
  if (job.status !== "running") return autopilotJobView(job);
  const leased = job.leaseOwner && job.leaseUntil && job.leaseUntil.getTime() > now.getTime();
  const [updated] = await db.update(draft2AutopilotJobs)
    .set(leased
      ? { stopRequestedAt: now, updatedAt: now }
      : { status: "stopped", outcome: "Stopped at your request; every step so far is kept.", stopRequestedAt: now, finishedAt: now, updatedAt: now, currentStep: null })
    .where(and(eq(draft2AutopilotJobs.id, jobId), eq(draft2AutopilotJobs.status, "running"))).returning();
  return autopilotJobView(updated ?? job);
}

/** Runs one step on the server, as the step's route would, to the pass's deadline. */
async function runStepOnServer(step: Draft2AutopilotStep, { topicId, storyId, session, continuing, deadline }: { topicId: string; storyId: string; session: AutopilotSession | null; continuing: boolean; deadline: number }): Promise<Draft2SessionRow> {
  const row = session as unknown as Draft2SessionRow | null;
  if (step === "facts") return runDraft2Facts({ topicId, storyId, models: row?.models ?? undefined, pipeline: row?.pipeline ?? undefined, deadline });
  if (!session) throw new Draft2InputError(`The ${AUTOPILOT_STEP_TITLE[step].toLowerCase()} needs a session; the facts come first.`);
  const input = { topicId, storyId, sessionId: session.id };
  switch (step) {
    case "inventory": return findDraft2Inventory(input);
    case "focus": return decideDraft2Focus(input);
    case "spine": return planDraft2Spine(input);
    case "mentions": return findDraft2Mentions(input);
    case "review": return reviewDraft2Carousel(input);
    case "opening": return runDraft2Opening({ ...input, resume: continuing, deadline });
    case "closing": return runDraft2Closing({ ...input, resume: continuing, deadline });
    case "deck": return runDraft2Deck({ ...input, resume: continuing, deadline });
    case "visual": return runDraft2Visual({ ...input, resume: continuing, deadline });
    case "images": return runDraft2Images({ ...input, resume: continuing, deadline });
    case "caption": return runDraft2Caption({ ...input, resume: continuing, deadline });
  }
}

/**
 * One pass of a job under a lease: steps until the target is done, the job
 * blocks, fails or is stopped, or the pass's time is spent, in which case
 * the next pass is chained through the resume route (the worker's cron and a
 * read of the story also resume it). Nothing of the session is touched
 * outside the steps themselves.
 */
export async function driveDraft2AutopilotJob(jobId: string, origin: string): Promise<void> {
  const owner = randomUUID();
  const started = Date.now();
  const [claimed] = await db.update(draft2AutopilotJobs)
    .set({ leaseOwner: owner, leaseUntil: new Date(started + LEASE_MS), passes: sql`${draft2AutopilotJobs.passes} + 1`, updatedAt: new Date(started) })
    .where(and(eq(draft2AutopilotJobs.id, jobId), eq(draft2AutopilotJobs.status, "running"), or(isNull(draft2AutopilotJobs.leaseUntil), lt(draft2AutopilotJobs.leaseUntil, new Date(started)))))
    .returning();
  if (!claimed) return;
  const { topicId, storyId } = claimed;
  const deadline = started + AUTOPILOT_PASS_BUDGET_MS;
  const mine = () => and(eq(draft2AutopilotJobs.id, jobId), eq(draft2AutopilotJobs.leaseOwner, owner));
  let chain = false;
  try {
    if (claimed.stopRequestedAt) {
      await db.update(draft2AutopilotJobs).set({ status: "stopped", outcome: "Stopped at your request; every step so far is kept.", finishedAt: new Date(), updatedAt: new Date(), currentStep: null, leaseOwner: null, leaseUntil: null }).where(mine());
      return;
    }
    const { end, steps } = await runAutopilotPass({
      loadSession: async () => (await latestDraft2Session(topicId, storyId)) ?? null,
      runStep: (step, options) => runStepOnServer(step, { topicId, storyId, ...options }),
      applyReviewPatches: (session) => decideDraft2ReviewPatch({ topicId, sessionId: session.id, action: "apply-all", by: "autopilot" }),
      stopRequested: async () => {
        const [row] = await db.select({ stopRequestedAt: draft2AutopilotJobs.stopRequestedAt, status: draft2AutopilotJobs.status }).from(draft2AutopilotJobs).where(eq(draft2AutopilotJobs.id, jobId)).limit(1);
        return !row || row.status !== "running" || Boolean(row.stopRequestedAt);
      },
      progress: async (patch) => {
        await db.update(draft2AutopilotJobs).set({ currentStep: patch.currentStep, steps: patch.steps, ...(patch.sessionId ? { sessionId: patch.sessionId } : {}), updatedAt: new Date() }).where(mine());
      },
      until: claimed.until as Draft2AutopilotStep,
      steps: Array.isArray(claimed.steps) ? claimed.steps : [],
      stepRuns: Array.isArray(claimed.steps) ? claimed.steps.length : 0,
      deadline,
      maxCostMicros: maxCostMicros(),
      now: () => Date.now(),
    });
    const final = autopilotJobEnd(end, claimed.until as Draft2AutopilotStep);
    if (final) {
      await db.update(draft2AutopilotJobs).set({ status: final.status, outcome: final.outcome, steps, currentStep: null, finishedAt: new Date(), updatedAt: new Date(), leaseOwner: null, leaseUntil: null }).where(mine());
      log.info("Autopilot job ended", { jobId, topicId, storyId, status: final.status, steps: steps.length, passes: claimed.passes });
      return;
    }
    // Out of time with more to do: the lease goes and the next pass is chained.
    await db.update(draft2AutopilotJobs).set({ steps, currentStep: null, updatedAt: new Date(), leaseOwner: null, leaseUntil: null }).where(mine());
    chain = true;
  } catch (error) {
    // A step's own failure is recorded by the pass; this is the pass itself breaking (the database, a lost lease). The job stays running for the next pass.
    log.error("Autopilot pass failed", { jobId, topicId, storyId, error: error instanceof Error ? error.message : String(error) });
    await db.update(draft2AutopilotJobs).set({ currentStep: null, updatedAt: new Date(), leaseOwner: null, leaseUntil: null }).where(mine()).catch(() => undefined);
    chain = true;
  }
  if (chain) await chainDraft2AutopilotPass(origin);
}

/** Asks the resume route for one more pass, in its own request's time; a failure here is caught by the worker's next pass or a read of the story. */
async function chainDraft2AutopilotPass(origin: string): Promise<void> {
  const secret = draft2WorkerSecret();
  if (!secret || !/^https?:\/\//u.test(origin)) { log.warn("Autopilot pass not chained: no worker secret or origin", { origin: origin.slice(0, 40) }); return; }
  try {
    const response = await fetch(`${origin}${DRAFT2_AUTOPILOT_RESUME_PATH}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) log.warn("Autopilot pass not chained", { status: response.status });
  } catch (error) {
    log.warn("Autopilot pass not chained", { error: error instanceof Error ? error.message : String(error) });
  }
}

/** The running jobs whose lease is free, oldest first: the worker's pass and a chained pass take them. */
export async function resumeDraft2AutopilotJobs(origin: string): Promise<{ selected: number }> {
  const now = new Date();
  const rows = await db.select({ id: draft2AutopilotJobs.id }).from(draft2AutopilotJobs)
    .where(and(eq(draft2AutopilotJobs.status, "running"), or(isNull(draft2AutopilotJobs.leaseUntil), lt(draft2AutopilotJobs.leaseUntil, now))))
    .orderBy(draft2AutopilotJobs.updatedAt).limit(JOBS_PER_PASS);
  await Promise.allSettled(rows.map((row) => driveDraft2AutopilotJob(row.id, origin)));
  return { selected: rows.length };
}

/**
 * A read of a story whose job waits with a free lease (its pass died, or its
 * chain was lost) asks for a pass, without waiting for the worker's cron:
 * through the resume route, whose request has the time a pass needs.
 */
export function kickDraft2AutopilotIfDue(job: AutopilotJobView | undefined, leaseFree: boolean, origin: string): void {
  if (!job || job.status !== "running" || !leaseFree) return;
  after(() => chainDraft2AutopilotPass(origin));
}

/** Whether a story's running job has no live lease: nothing is driving it now. */
export async function draft2AutopilotLeaseFree(jobId: string): Promise<boolean> {
  const [row] = await db.select({ leaseUntil: draft2AutopilotJobs.leaseUntil, status: draft2AutopilotJobs.status }).from(draft2AutopilotJobs).where(eq(draft2AutopilotJobs.id, jobId)).limit(1);
  return Boolean(row && row.status === "running" && (!row.leaseUntil || row.leaseUntil.getTime() < Date.now()));
}
