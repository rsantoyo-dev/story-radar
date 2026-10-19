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

/** One story's latest Draft 2 session at a glance, for the dashboard's Today: where it stands, whether it is still running, what it cost. */
export type Draft2SessionSummary = {
  id: string;
  storyId: string;
  step: Draft2Step;
  status: Draft2SessionStatus;
  pipeline: Draft2Pipeline;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  /** Running and seen alive within its window; a running row past it was lost mid-request. */
  alive: boolean;
  /** When the editor approved the carousel for publishing, if they did. */
  approvedAt: string | null;
  /** The meter's estimate of every provider call and image charge, in micro-dollars, and the time inside the calls. */
  costMicros: number;
  ms: number;
  calls: number;
};

/**
 * The latest session of every story of a Topic (2026-10-19, Today gathers
 * Draft 2): one row per story, its cost and time summed in the database from
 * the trace and the images' charges, so the dashboard never downloads a
 * trace.
 */
export async function listDraft2SessionSummaries(topicId: string): Promise<Draft2SessionSummary[]> {
  // No table alias: aliveSince() names draft2_sessions' own columns, and Postgres refuses a table's name once it is aliased (the board read nothing until 2026-10-19).
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (draft2_sessions.story_id)
      draft2_sessions.id, draft2_sessions.story_id AS "storyId", draft2_sessions.step, draft2_sessions.status, draft2_sessions.pipeline, draft2_sessions.error,
      draft2_sessions.created_at AS "createdAt", draft2_sessions.updated_at AS "updatedAt",
      draft2_sessions.publication->>'approvedAt' AS "approvedAt",
      (draft2_sessions.status = 'running' AND draft2_sessions.updated_at > ${aliveSince()}) AS alive,
      (COALESCE((SELECT SUM(COALESCE((e->>'costMicros')::numeric, 0)) FROM jsonb_array_elements(draft2_sessions.trace) e), 0)
        + COALESCE((SELECT SUM(COALESCE((a->>'costMicros')::numeric, 0)) FROM jsonb_array_elements(COALESCE(draft2_sessions.images->'slides', '[]'::jsonb)) sl, jsonb_array_elements(COALESCE(sl->'attempts', '[]'::jsonb)) a), 0)
        + COALESCE((draft2_sessions.images->'anchorPlate'->>'costMicros')::numeric, 0)
        + COALESCE((draft2_sessions.images->'masterPlate'->>'costMicros')::numeric, 0))::bigint AS "costMicros",
      COALESCE((SELECT SUM(COALESCE((e->>'durationMs')::numeric, 0)) FROM jsonb_array_elements(draft2_sessions.trace) e WHERE e->>'step' IS NOT NULL), 0)::bigint AS ms,
      (SELECT COUNT(*) FROM jsonb_array_elements(draft2_sessions.trace) e WHERE e->>'step' IS NOT NULL)::int AS calls
    FROM draft2_sessions
    WHERE draft2_sessions.topic_id = ${topicId}::uuid
    ORDER BY draft2_sessions.story_id, draft2_sessions.created_at DESC
  `);
  return (rows.rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id), storyId: String(row.storyId), step: row.step as Draft2Step, status: row.status as Draft2SessionStatus, pipeline: row.pipeline as Draft2Pipeline,
    createdAt: new Date(row.createdAt as string).toISOString(), updatedAt: new Date(row.updatedAt as string).toISOString(),
    error: typeof row.error === "string" ? row.error : null, alive: row.alive === true, approvedAt: typeof row.approvedAt === "string" ? row.approvedAt : null,
    costMicros: Number(row.costMicros ?? 0), ms: Number(row.ms ?? 0), calls: Number(row.calls ?? 0),
  }));
}
