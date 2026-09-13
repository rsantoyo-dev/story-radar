import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { storyContentRevisions, storyReferencePhotos, topicStories } from "@/db/schema";
import { StoryMaterialConflictError, StoryMaterialValidationError, parseContentEdit, type StoryReferencePhoto } from "./story-materials.types";

export async function requireStoryMembership(topicId: string, storyId: string) {
  const [row] = await db.select({ id: topicStories.id }).from(topicStories).where(and(eq(topicStories.topicId, topicId), eq(topicStories.storyId, storyId))).limit(1);
  if (!row) throw new StoryMaterialValidationError("The story is not in this topic.");
}
export async function latestContentRevision(topicId: string, storyId: string) {
  const [row] = await db.select().from(storyContentRevisions).where(and(eq(storyContentRevisions.topicId, topicId), eq(storyContentRevisions.storyId, storyId))).orderBy(desc(storyContentRevisions.revision)).limit(1);
  return row;
}
export async function contentRevisionHistory(topicId: string, storyId: string) {
  await requireStoryMembership(topicId, storyId);
  return db.select({ revision: storyContentRevisions.revision, title: storyContentRevisions.title, text: storyContentRevisions.content, createdAt: storyContentRevisions.createdAt }).from(storyContentRevisions)
    .where(and(eq(storyContentRevisions.topicId, topicId), eq(storyContentRevisions.storyId, storyId))).orderBy(desc(storyContentRevisions.revision)).limit(20);
}
export async function saveStoryContentRevision(topicId: string, storyId: string, input: unknown, original: { title: string; text: string }) {
  const parsed = parseContentEdit(input);
  await requireStoryMembership(topicId, storyId);
  const latest = await latestContentRevision(topicId, storyId);
  if ((latest?.revision ?? 0) !== parsed.expectedRevision) throw new StoryMaterialConflictError("Content changed. Reopen it before saving your edits.");
  const [saved] = await db.insert(storyContentRevisions).values({ topicId, storyId, revision: parsed.expectedRevision + 1, title: parsed.title, content: parsed.text, original: latest?.original ?? original })
    .onConflictDoNothing().returning({ id: storyContentRevisions.id });
  if (!saved) throw new StoryMaterialConflictError("Another editor saved first. Reopen the content before saving.");
}
export function publicStoryPhoto(row: typeof storyReferencePhotos.$inferSelect): StoryReferencePhoto {
  return { id: row.id, name: row.name, description: row.description, provenance: row.provenance, active: row.active, providerTransmissionAllowed: row.providerTransmissionAllowed };
}
export async function listStoryPhotos(topicId: string, storyId: string) {
  await requireStoryMembership(topicId, storyId);
  return (await db.select().from(storyReferencePhotos).where(and(eq(storyReferencePhotos.topicId, topicId), eq(storyReferencePhotos.storyId, storyId))).orderBy(desc(storyReferencePhotos.createdAt))).map(publicStoryPhoto);
}
export async function findStoryPhoto(topicId: string, storyId: string, id: string) {
  const [row] = await db.select().from(storyReferencePhotos).where(and(eq(storyReferencePhotos.topicId, topicId), eq(storyReferencePhotos.storyId, storyId), eq(storyReferencePhotos.id, id))).limit(1);
  return row;
}
export async function revokeStoryPhoto(topicId: string, storyId: string, id: string) {
  const [row] = await db.update(storyReferencePhotos).set({ active: false, providerTransmissionAllowed: false }).where(and(eq(storyReferencePhotos.topicId, topicId), eq(storyReferencePhotos.storyId, storyId), eq(storyReferencePhotos.id, id))).returning();
  if (!row) throw new StoryMaterialValidationError("Photo not found in this story.");
  return publicStoryPhoto(row);
}
