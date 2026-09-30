import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { storyEditorFacts } from "@/db/schema";

import type { CreativeKeyFact } from "./creative-content.types";

/**
 * Editor-provided evidence (story_editor_facts). A human adds a fact the
 * sources lack; it joins every brief of the story as a CreativeKeyFact with
 * provenance "editor". Retraction keeps the row for history.
 */

export const EDITOR_FACT_ID_PREFIX = "editor-";
const MAX_STATEMENT_LENGTH = 500;

export class StoryEditorFactValidationError extends Error {}

type EditorFactRow = typeof storyEditorFacts.$inferSelect;

export type StoryEditorFact = {
  id: string;
  factId: string;
  statement: string;
  sourceUrl?: string;
  note?: string;
  createdBy?: string;
  createdAt: string;
};

/** Stable, short and prompt-readable; derived from the immutable row id. */
export function editorFactId(rowId: string): string {
  return `${EDITOR_FACT_ID_PREFIX}${rowId.replaceAll("-", "").slice(0, 8)}`;
}

export function editorFactToKeyFact(row: Pick<EditorFactRow, "id" | "statement" | "sourceUrl">): CreativeKeyFact {
  return {
    id: editorFactId(row.id),
    statement: row.statement,
    // The editor's own words are the evidence; guards that compare a
    // statement with its excerpt must see them agree.
    sourceExcerpt: row.statement,
    provenance: "editor",
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
  };
}

export async function listActiveEditorFacts(topicId: string, storyId: string): Promise<EditorFactRow[]> {
  return db
    .select()
    .from(storyEditorFacts)
    .where(and(eq(storyEditorFacts.topicId, topicId), eq(storyEditorFacts.storyId, storyId), eq(storyEditorFacts.active, true)))
    .orderBy(asc(storyEditorFacts.createdAt));
}

export async function listStoryEditorFacts(topicId: string, storyId: string): Promise<StoryEditorFact[]> {
  return (await listActiveEditorFacts(topicId, storyId)).map((row) => ({
    id: row.id,
    factId: editorFactId(row.id),
    statement: row.statement,
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.createdBy ? { createdBy: row.createdBy } : {}),
    createdAt: row.createdAt.toISOString(),
  }));
}

export function parseEditorFactInput(input: unknown): { statement: string; sourceUrl?: string; note?: string } {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const statement = typeof value.statement === "string" ? value.statement.trim().replace(/\s+/g, " ") : "";
  if (!statement) throw new StoryEditorFactValidationError("Write the fact to add.");
  if (statement.length > MAX_STATEMENT_LENGTH) {
    throw new StoryEditorFactValidationError(`Keep the fact under ${MAX_STATEMENT_LENGTH} characters.`);
  }
  const rawUrl = typeof value.sourceUrl === "string" ? value.sourceUrl.trim() : "";
  let sourceUrl: string | undefined;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
      sourceUrl = url.toString();
    } catch {
      throw new StoryEditorFactValidationError("The source must be a web address (http or https).");
    }
  }
  const note = typeof value.note === "string" && value.note.trim() ? value.note.trim().slice(0, 500) : undefined;
  return { statement, ...(sourceUrl ? { sourceUrl } : {}), ...(note ? { note } : {}) };
}

export async function addStoryEditorFact(
  topicId: string,
  storyId: string,
  input: { statement: string; sourceUrl?: string; note?: string },
  createdBy?: string,
): Promise<StoryEditorFact> {
  const [row] = await db
    .insert(storyEditorFacts)
    .values({ topicId, storyId, statement: input.statement, sourceUrl: input.sourceUrl ?? null, note: input.note ?? null, createdBy: createdBy ?? null })
    .returning();
  return {
    id: row.id,
    factId: editorFactId(row.id),
    statement: row.statement,
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.createdBy ? { createdBy: row.createdBy } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Returns false when no active fact with this id exists for the story. */
export async function retractStoryEditorFact(topicId: string, storyId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(storyEditorFacts)
    .set({ active: false, retractedAt: new Date() })
    .where(and(eq(storyEditorFacts.id, id), eq(storyEditorFacts.topicId, topicId), eq(storyEditorFacts.storyId, storyId), eq(storyEditorFacts.active, true)))
    .returning({ id: storyEditorFacts.id });
  return rows.length > 0;
}
