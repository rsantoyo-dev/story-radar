import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { creativeBrandReferences } from "@/db/schema";

import type {
  CreativeBrandReference,
  CreativeBrandReferenceKind,
} from "./creative-content.types";

export const MAX_CREATIVE_BRAND_REFERENCES = 60;

export type StoredCreativeBrandReference =
  typeof creativeBrandReferences.$inferSelect;

export type CreateCreativeBrandReferenceInput = {
  id: string;
  topicId: string;
  version: number;
  objectKey: string;
  sha256: string;
  originalContentType: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  name: string;
  kind: CreativeBrandReferenceKind;
  provenance: string | null;
  usageNote: string | null;
  providerTransmissionAllowed: boolean;
};

export type CreativeBrandReferencePatch = Partial<{
  name: string;
  kind: CreativeBrandReferenceKind;
  provenance: string | null;
  usageNote: string | null;
  providerTransmissionAllowed: boolean;
  isActive: boolean;
}>;

/** Every brand reference for a topic, newest first, active ones before archived. */
export async function listCreativeBrandReferences(
  topicId: string,
): Promise<CreativeBrandReference[]> {
  const rows = await db
    .select()
    .from(creativeBrandReferences)
    .where(eq(creativeBrandReferences.topicId, topicId))
    .orderBy(
      desc(creativeBrandReferences.isActive),
      desc(creativeBrandReferences.createdAt),
    );
  return rows.map(publicBrandReference);
}

export async function createCreativeBrandReference(
  input: CreateCreativeBrandReferenceInput,
): Promise<CreativeBrandReference> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creativeBrandReferences)
    .where(eq(creativeBrandReferences.topicId, input.topicId));
  if (count >= MAX_CREATIVE_BRAND_REFERENCES) {
    throw new CreativeBrandReferenceConflictError(
      `The brand reference library is full (${MAX_CREATIVE_BRAND_REFERENCES} maximum)`,
    );
  }

  const [created] = await db
    .insert(creativeBrandReferences)
    .values({
      id: input.id,
      topicId: input.topicId,
      version: input.version,
      objectKey: input.objectKey,
      sha256: input.sha256,
      contentType: "image/webp",
      originalContentType: input.originalContentType,
      fileName: input.fileName,
      fileSize: input.fileSize,
      width: input.width,
      height: input.height,
      name: input.name,
      kind: input.kind,
      provenance: input.provenance,
      usageNote: input.usageNote,
      providerTransmissionAllowed: input.providerTransmissionAllowed,
    })
    .returning();

  if (!created) {
    throw new Error("The brand reference could not be saved");
  }
  return publicBrandReference(created);
}

export async function updateCreativeBrandReference(
  topicId: string,
  referenceId: string,
  patch: CreativeBrandReferencePatch,
): Promise<CreativeBrandReference> {
  const [updated] = await db
    .update(creativeBrandReferences)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(creativeBrandReferences.id, referenceId),
        eq(creativeBrandReferences.topicId, topicId),
      ),
    )
    .returning();

  if (!updated) {
    throw new CreativeBrandReferenceNotFoundError(
      "The brand reference was not found",
    );
  }
  return publicBrandReference(updated);
}

/** Resolves a reference only when it belongs to the selected topic. */
export async function findCreativeBrandReference(
  topicId: string,
  referenceId: string,
): Promise<StoredCreativeBrandReference | undefined> {
  const [row] = await db
    .select()
    .from(creativeBrandReferences)
    .where(
      and(
        eq(creativeBrandReferences.id, referenceId),
        eq(creativeBrandReferences.topicId, topicId),
      ),
    )
    .limit(1);
  return row;
}

/** Browser-safe projection — drops topicId, objectKey and sha256. */
export function publicBrandReference(
  row: StoredCreativeBrandReference,
): CreativeBrandReference {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CreativeBrandReferenceKind,
    provenance: row.provenance,
    usageNote: row.usageNote,
    providerTransmissionAllowed: row.providerTransmissionAllowed,
    originalContentType: row.originalContentType,
    contentType: "image/webp",
    fileName: row.fileName,
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    version: row.version,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CreativeBrandReferenceNotFoundError extends Error {}
export class CreativeBrandReferenceConflictError extends Error {}
