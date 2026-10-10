import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { draft2Sessions, type Draft2SessionRow } from "@/db/schema";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2SessionStatus, Draft2Threads, Draft2TraceEntry } from "./draft2-facts.types";

/** A session still running has been checkpointed within this window; older "running" rows were lost mid-request. */
const ACTIVE_WINDOW_MINUTES = 10;

export async function createDraft2Session(input: { topicId: string; storyId: string; step: "facts" }): Promise<Draft2SessionRow> {
  const [row] = await db.insert(draft2Sessions).values({ topicId: input.topicId, storyId: input.storyId, step: input.step, status: "running" }).returning();
  return row;
}

export type Draft2SessionPatch = Partial<{
  status: Draft2SessionStatus;
  facts: Draft2Fact[] | null;
  evaluation: Draft2FactsEvaluation | null;
  rounds: Draft2FactsRound[];
  threads: Draft2Threads;
  trace: Draft2TraceEntry[];
  error: string | null;
}>;

/** A checkpoint after a provider call; the row keeps the conversations a later step continues. */
export async function updateDraft2Session(id: string, patch: Draft2SessionPatch): Promise<Draft2SessionRow | undefined> {
  const [row] = await db.update(draft2Sessions).set({ ...patch, updatedAt: new Date() }).where(eq(draft2Sessions.id, id)).returning();
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
