import "server-only";
import { and, desc, eq, gt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { draft2Sessions, type Draft2SessionRow } from "@/db/schema";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2SessionStatus, Draft2Step, Draft2Threads, Draft2TraceEntry } from "./draft2-facts.types";
import type { Draft2Opening } from "./draft2-opening.types";

/** A session still running has been checkpointed within this window; older "running" rows were lost mid-request. */
const ACTIVE_WINDOW_MINUTES = 10;

export async function createDraft2Session(input: { topicId: string; storyId: string; step: "facts" }): Promise<Draft2SessionRow> {
  const [row] = await db.insert(draft2Sessions).values({ topicId: input.topicId, storyId: input.storyId, step: input.step, status: "running" }).returning();
  return row;
}

export type Draft2SessionPatch = Partial<{
  step: Draft2Step;
  status: Draft2SessionStatus;
  facts: Draft2Fact[] | null;
  evaluation: Draft2FactsEvaluation | null;
  rounds: Draft2FactsRound[];
  opening: Draft2Opening | null;
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
      or(ne(draft2Sessions.status, "running"), lte(draft2Sessions.updatedAt, sql`now() - make_interval(mins => ${ACTIVE_WINDOW_MINUTES})`)),
    ))
    .returning();
  return row;
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
      gt(draft2Sessions.updatedAt, sql`now() - make_interval(mins => ${ACTIVE_WINDOW_MINUTES})`),
    ))
    .orderBy(desc(draft2Sessions.createdAt)).limit(1);
  return row;
}
