import "server-only";
import { and, desc, eq, gt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { draft2Sessions, type Draft2SessionRow } from "@/db/schema";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2SessionStatus, Draft2Step, Draft2Threads, Draft2TraceEntry } from "./draft2-facts.types";
import type { Draft2Closing } from "./draft2-closing.types";
import type { Draft2Deck } from "./draft2-deck.types";
import type { Draft2Review } from "./draft2-review.types";
import type { Draft2Inventory } from "./draft2-inventory.types";
import type { Draft2Visual } from "./draft2-visual.types";
import type { Draft2Images } from "./draft2-images.types";
import type { Draft2Mentions } from "./draft2-mentions.types";
import { draft2ChoiceIsEmpty, type Draft2ModelChoice, type Draft2Pipeline } from "./draft2-models";
import type { Draft2Caption } from "./draft2-caption.types";
import type { Draft2Publication } from "./draft2-publication.types";
import type { Draft2Focus } from "./draft2-focus.types";
import { OPENING_STALL_MS, type Draft2Opening } from "./draft2-opening.types";

/** A session still running has been checkpointed within this window; older "running" rows were lost mid-request. */
const ACTIVE_WINDOW_MINUTES = 10;

/**
 * When a running session was last seen alive. Every step but Facts sends a
 * heartbeat, so it counts as stopped after OPENING_STALL_MS of silence; a
 * facts run checkpoints only between calls, so it keeps the longer window.
 */
const aliveSince = () => sql`CASE WHEN ${draft2Sessions.step} IN ('opening', 'focus', 'closing', 'deck', 'inventory', 'visual', 'images', 'mentions', 'caption', 'publication')
  THEN now() - make_interval(secs => ${OPENING_STALL_MS / 1_000})
  ELSE now() - make_interval(mins => ${ACTIVE_WINDOW_MINUTES}) END`;

export async function createDraft2Session(input: { topicId: string; storyId: string; step: "facts"; models?: Draft2ModelChoice; pipeline?: Draft2Pipeline }): Promise<Draft2SessionRow> {
  const models = draft2ChoiceIsEmpty(input.models) ? null : input.models ?? null;
  const [row] = await db.insert(draft2Sessions).values({ topicId: input.topicId, storyId: input.storyId, step: input.step, status: "running", models, ...(input.pipeline ? { pipeline: input.pipeline } : {}) }).returning();
  return row;
}

export type Draft2SessionPatch = Partial<{
  step: Draft2Step;
  status: Draft2SessionStatus;
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
  models: Draft2ModelChoice | null;
  pipeline: Draft2Pipeline;
  publication: Draft2Publication | null;
  threads: Draft2Threads;
  trace: Draft2TraceEntry[];
  error: string | null;
}>;

/** A checkpoint after a provider call; the row keeps the conversations a later step continues. */
export async function updateDraft2Session(id: string, patch: Draft2SessionPatch): Promise<Draft2SessionRow | undefined> {
  const [row] = await db.update(draft2Sessions).set({ ...patch, updatedAt: new Date() }).where(eq(draft2Sessions.id, id)).returning();
  return row;
}

/**
 * Starts a step on an existing session. The update only lands when no other
 * request is working on the row (status "running" and checkpointed within the
 * active window), so two clicks never run one session's step twice.
 */
export async function claimDraft2Session(id: string, patch: Draft2SessionPatch): Promise<Draft2SessionRow | undefined> {
  const [row] = await db.update(draft2Sessions).set({ ...patch, status: "running", updatedAt: new Date() })
    .where(and(
      eq(draft2Sessions.id, id),
      or(ne(draft2Sessions.status, "running"), lte(draft2Sessions.updatedAt, aliveSince())),
    ))
    .returning();
  return row;
}

/** The heartbeat of a long run: shows the run is alive between checkpoints. A session no longer running is left alone. */
export async function touchDraft2Session(id: string): Promise<void> {
  await db.update(draft2Sessions).set({ updatedAt: new Date() }).where(and(eq(draft2Sessions.id, id), eq(draft2Sessions.status, "running")));
}

/**
 * The levers of the Topic's last approved Draft 2 carousels, newest first,
 * without this session's own: the Focus plan prefers another lever when one
 * fits as well, so a brand does not repeat itself.
 */
export async function recentDraft2Levers(topicId: string, exceptSessionId: string, limit = 5): Promise<string[]> {
  const lever = sql<string>`${draft2Sessions.publication}->>'lever'`;
  const rows = await db.select({ lever }).from(draft2Sessions)
    .where(and(eq(draft2Sessions.topicId, topicId), ne(draft2Sessions.id, exceptSessionId), sql`${draft2Sessions.publication}->>'lever' is not null`))
    .orderBy(desc(sql`${draft2Sessions.publication}->>'approvedAt'`))
    .limit(limit);
  return rows.map((row) => row.lever);
}

/** The Topic's other sessions with a visual script, newest first, for the variety between posts (draft2-cover-variety.ts reads one cover per story). */
export async function recentDraft2CoverRows(topicId: string, exceptSessionId: string, limit = 20): Promise<{ storyId: string; createdAt: Date; visual: Draft2Visual | null }[]> {
  return db.select({ storyId: draft2Sessions.storyId, createdAt: draft2Sessions.createdAt, visual: draft2Sessions.visual }).from(draft2Sessions)
    .where(and(eq(draft2Sessions.topicId, topicId), ne(draft2Sessions.id, exceptSessionId), sql`${draft2Sessions.visual} is not null`))
    .orderBy(desc(draft2Sessions.createdAt))
    .limit(limit);
}

/** One session, only within the topic the request may use. */
export async function getDraft2Session(topicId: string, id: string): Promise<Draft2SessionRow | undefined> {
  const [row] = await db.select().from(draft2Sessions)
    .where(and(eq(draft2Sessions.id, id), eq(draft2Sessions.topicId, topicId)))
    .limit(1);
  return row;
}

export async function latestDraft2Session(topicId: string, storyId: string): Promise<Draft2SessionRow | undefined> {
  const [row] = await db.select().from(draft2Sessions)
    .where(and(eq(draft2Sessions.topicId, topicId), eq(draft2Sessions.storyId, storyId)))
    .orderBy(desc(draft2Sessions.createdAt)).limit(1);
  return row;
}

/** The session another request is still working on, if any; one at a time per story. */
export async function activeDraft2Session(topicId: string, storyId: string): Promise<Draft2SessionRow | undefined> {
  const [row] = await db.select().from(draft2Sessions)
    .where(and(
      eq(draft2Sessions.topicId, topicId), eq(draft2Sessions.storyId, storyId), eq(draft2Sessions.status, "running"),
      gt(draft2Sessions.updatedAt, aliveSince()),
    ))
    .orderBy(desc(draft2Sessions.createdAt)).limit(1);
  return row;
}
