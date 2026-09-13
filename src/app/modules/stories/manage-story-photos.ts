import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/db/client";
import { storyReferencePhotos } from "@/db/schema";
import { buildStoryReferenceObjectKey, deletePrivateR2Object, putPrivateR2Object, readPrivateR2ImageFile } from "./r2-storage";
import { findStoryPhoto, publicStoryPhoto, requireStoryMembership } from "./story-materials.repository";
import { materialText, parseStoryReferences, StoryMaterialValidationError } from "./story-materials.types";
import type { StoryGenerationReference } from "./story-reference-generation";

export async function uploadStoryPhoto(topicId: string, storyId: string, form: FormData) {
  await requireStoryMembership(topicId, storyId);
  const image = form.get("image");
  if (!(image instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size === 0 || image.size > 15 * 1024 * 1024) throw new StoryMaterialValidationError("Upload a JPG, PNG or WebP photo up to 15 MB.");
  const name = materialText(form.get("name"), "Photo name", 150);
  const description = materialText(form.get("description"), "Description", 1000);
  const provenance = materialText(form.get("provenance"), "Source / permission", 1000);
  if (form.get("providerTransmissionAllowed") !== "true") throw new StoryMaterialValidationError("Confirm permission to use and send this photo to the image provider.");
  const bytes = Buffer.from(await image.arrayBuffer());
  let normalized: Buffer;
  try {
    const pipeline = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 64 || metadata.height < 64 || !["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Invalid image");
    normalized = await pipeline.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  } catch { throw new StoryMaterialValidationError("This image cannot be decoded. Use a still JPG, PNG or WebP of at least 64 × 64."); }
  const id = randomUUID();
  const objectKey = buildStoryReferenceObjectKey(topicId, storyId, id);
  await putPrivateR2Object({ objectKey, body: normalized, contentType: "image/webp" });
  try {
    const [row] = await db.insert(storyReferencePhotos).values({ id, topicId, storyId, name, description, provenance, providerTransmissionAllowed: true, objectKey, sha256: createHash("sha256").update(normalized).digest("hex"), fileName: `${id}.webp`, fileSize: normalized.length }).returning();
    return publicStoryPhoto(row);
  } catch (error) { await deletePrivateR2Object(objectKey).catch(() => undefined); throw error; }
}
export async function resolveStoryReferences(topicId: string, storyId: string, input: unknown): Promise<StoryGenerationReference[]> {
  return Promise.all(parseStoryReferences(input).map(async selection => {
    const row = await findStoryPhoto(topicId, storyId, selection.id);
    if (!row || !row.active || !row.providerTransmissionAllowed) throw new StoryMaterialValidationError("A selected story photo is unavailable or its permission was revoked. Update the slide references.");
    return { ...publicStoryPhoto(row), topicId, storyId, purpose: selection.purpose, objectKey: row.objectKey, sha256: row.sha256, contentType: row.contentType, fileName: row.fileName };
  }));
}
export async function loadStoryReferenceImages(references: StoryGenerationReference[]) {
  return Promise.all(references.map(async reference => {
    const row = await findStoryPhoto(reference.topicId, reference.storyId, reference.id);
    if (!row?.active || !row.providerTransmissionAllowed || row.sha256 !== reference.sha256 || row.objectKey !== reference.objectKey) throw new StoryMaterialValidationError("A story photo's permission or identity changed. Update the slide references.");
    const image = await readPrivateR2ImageFile(reference);
    if (createHash("sha256").update(Buffer.from(await image.arrayBuffer())).digest("hex") !== reference.sha256) throw new StoryMaterialValidationError("The story photo does not match its saved snapshot.");
    return image;
  }));
}
