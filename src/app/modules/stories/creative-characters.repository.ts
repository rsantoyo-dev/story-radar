import "server-only";

import { createHash } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  creativeCharacterReferenceImages,
  creativeCharacters,
  creativeUnitCharacters,
} from "@/db/schema";

import type {
  CreativeCharacter,
  CreativeCharacterReferenceImage,
  CreativeCharacterRosterEntry,
  CreativeCharacterSnapshot,
  EditableCreativeCharacter,
} from "./creative-content.types";

const MAX_CREATIVE_CHARACTERS = 2;
export const MAX_CREATIVE_CHARACTER_REFERENCE_IMAGES = 5;

type StoredReference = typeof creativeCharacterReferenceImages.$inferSelect;

export async function listCreativeCharacters(
  topicId: string,
): Promise<CreativeCharacter[]> {
  const characters = await db
    .select()
    .from(creativeCharacters)
    .where(
      and(
        eq(creativeCharacters.topicId, topicId),
        eq(creativeCharacters.isActive, true),
      ),
    )
    .orderBy(asc(creativeCharacters.slot));

  return mapCharacters(characters);
}

export async function listCreativeCharacterRoster(
  topicId: string,
): Promise<CreativeCharacterRosterEntry[]> {
  const characters = await listCreativeCharacters(topicId);

  return characters
    .filter((character) => character.referenceImages.length > 0)
    .map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      referenceFingerprint: characterReferenceFingerprint(
        character.referenceImages,
      ),
    }));
}

export async function createCreativeCharacter(
  topicId: string,
  input: unknown,
): Promise<CreativeCharacter> {
  const character = parseCreativeCharacterInput(input);
  const existing = await listCreativeCharacters(topicId);
  const slot = availableCharacterSlot(existing);

  if (!slot) {
    throw new CreativeCharacterConflictError(
      `A creative profile can have at most ${MAX_CREATIVE_CHARACTERS} supporting characters.`,
    );
  }

  const now = new Date();
  const [created] = await db
    .insert(creativeCharacters)
    .values({
      topicId,
      slot,
      ...character,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new Error("The supporting character could not be created");
  }

  return mapCharacter(created, []);
}

export async function updateCreativeCharacter(
  topicId: string,
  characterId: string,
  input: unknown,
): Promise<CreativeCharacter> {
  const character = parseCreativeCharacterInput(input);
  const [updated] = await db
    .update(creativeCharacters)
    .set({ ...character, updatedAt: new Date() })
    .where(
      and(
        eq(creativeCharacters.id, characterId),
        eq(creativeCharacters.topicId, topicId),
        eq(creativeCharacters.isActive, true),
      ),
    )
    .returning();

  if (!updated) {
    throw new CreativeCharacterNotFoundError("The supporting character was not found");
  }

  const references = await findReferenceRows([characterId]);
  return mapCharacter(updated, references);
}

/**
 * Archiving frees the visible profile slot but preserves its private references
 * for any draft snapshots that already use this character.
 */
export async function archiveCreativeCharacter(
  topicId: string,
  characterId: string,
): Promise<void> {
  const [archived] = await db
    .update(creativeCharacters)
    .set({ isActive: false, slot: null, updatedAt: new Date() })
    .where(
      and(
        eq(creativeCharacters.id, characterId),
        eq(creativeCharacters.topicId, topicId),
        eq(creativeCharacters.isActive, true),
      ),
    )
    .returning({ id: creativeCharacters.id });

  if (!archived) {
    throw new CreativeCharacterNotFoundError("The supporting character was not found");
  }
}

export async function addCreativeCharacterReference({
  id,
  topicId,
  characterId,
  objectKey,
  contentType,
  fileName,
  fileSize,
}: {
  id?: string;
  topicId: string;
  characterId: string;
  objectKey: string;
  contentType: string;
  fileName: string;
  fileSize: number;
}): Promise<CreativeCharacterReferenceImage> {
  await requireActiveCreativeCharacter(topicId, characterId);
  const references = await findReferenceRows([characterId]);

  if (references.length >= MAX_CREATIVE_CHARACTER_REFERENCE_IMAGES) {
    throw new CreativeCharacterConflictError(
      `A supporting character can have at most ${MAX_CREATIVE_CHARACTER_REFERENCE_IMAGES} reference images.`,
    );
  }

  const [created] = await db
    .insert(creativeCharacterReferenceImages)
    .values({
      ...(id ? { id } : {}),
      characterId,
      objectKey,
      contentType,
      fileName,
      fileSize,
      order: references.length + 1,
    })
    .returning();

  if (!created) {
    throw new Error("The reference image could not be saved");
  }

  return publicReference(created);
}

/**
 * The object stays in R2 because a previous draft snapshot may still need it
 * for an exact image-to-image regeneration.
 */
export async function removeCreativeCharacterReference(
  topicId: string,
  characterId: string,
  referenceId: string,
): Promise<void> {
  await requireActiveCreativeCharacter(topicId, characterId);
  const [removed] = await db
    .delete(creativeCharacterReferenceImages)
    .where(
      and(
        eq(creativeCharacterReferenceImages.id, referenceId),
        eq(creativeCharacterReferenceImages.characterId, characterId),
      ),
    )
    .returning({ id: creativeCharacterReferenceImages.id });

  if (!removed) {
    throw new CreativeCharacterNotFoundError("The reference image was not found");
  }

  await normalizeReferenceOrders(characterId);
}

export async function findCreativeCharacterReference(
  topicId: string,
  characterId: string,
  referenceId: string,
): Promise<StoredReference | undefined> {
  const [reference] = await db
    .select({ reference: creativeCharacterReferenceImages })
    .from(creativeCharacterReferenceImages)
    .innerJoin(
      creativeCharacters,
      eq(creativeCharacterReferenceImages.characterId, creativeCharacters.id),
    )
    .where(
      and(
        eq(creativeCharacterReferenceImages.id, referenceId),
        eq(creativeCharacterReferenceImages.characterId, characterId),
        eq(creativeCharacters.topicId, topicId),
      ),
    )
    .limit(1);

  return reference?.reference;
}

export async function snapshotsForCreativeCharacterIds(
  topicId: string,
  characterIds: string[],
): Promise<Map<string, CreativeCharacterSnapshot>> {
  const uniqueIds = [...new Set(characterIds)];
  if (uniqueIds.length === 0) return new Map();
  if (uniqueIds.length > MAX_CREATIVE_CHARACTERS) {
    throw new CreativeCharacterValidationError(
      `A slide can use at most ${MAX_CREATIVE_CHARACTERS} supporting characters.`,
    );
  }

  const characters = await db
    .select()
    .from(creativeCharacters)
    .where(
      and(
        eq(creativeCharacters.topicId, topicId),
        eq(creativeCharacters.isActive, true),
        inArray(creativeCharacters.id, uniqueIds),
      ),
    );

  if (characters.length !== uniqueIds.length) {
    throw new CreativeCharacterValidationError(
      "Each selected supporting character must belong to this active creative profile.",
    );
  }

  const references = await findReferenceRows(uniqueIds);
  const referencesByCharacter = groupReferences(references);
  const snapshots = new Map<string, CreativeCharacterSnapshot>();

  characters.forEach((character) => {
    const characterReferences = referencesByCharacter.get(character.id) ?? [];
    if (characterReferences.length === 0) {
      throw new CreativeCharacterValidationError(
        `Supporting character ${character.name} needs at least one reference image.`,
      );
    }
    snapshots.set(character.id, {
      id: character.id,
      name: character.name,
      description: character.description,
      referenceImages: characterReferences.map((reference) => ({
        ...publicReference(reference),
        objectKey: reference.objectKey,
      })),
    });
  });

  return snapshots;
}

export async function snapshotsForCreativeUnits(
  unitIds: string[],
): Promise<Map<string, CreativeCharacterSnapshot[]>> {
  if (unitIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(creativeUnitCharacters)
    .where(inArray(creativeUnitCharacters.unitId, unitIds));
  const snapshots = new Map<string, CreativeCharacterSnapshot[]>();

  rows.forEach((row) => {
    const current = snapshots.get(row.unitId) ?? [];
    current.push(row.characterSnapshot as CreativeCharacterSnapshot);
    snapshots.set(row.unitId, current);
  });

  return snapshots;
}

export function parseCreativeCharacterInput(
  value: unknown,
): EditableCreativeCharacter {
  if (!isRecord(value)) {
    throw new CreativeCharacterValidationError("A supporting character object is required");
  }

  return {
    name: requiredText(value.name, "name", 100),
    description: requiredText(value.description, "description", 1_000),
  };
}

function availableCharacterSlot(characters: CreativeCharacter[]): 1 | 2 | undefined {
  const occupied = new Set(characters.map((character) => character.slot));
  return ([1, 2] as const).find((slot) => !occupied.has(slot));
}

async function requireActiveCreativeCharacter(
  topicId: string,
  characterId: string,
): Promise<void> {
  const [character] = await db
    .select({ id: creativeCharacters.id })
    .from(creativeCharacters)
    .where(
      and(
        eq(creativeCharacters.id, characterId),
        eq(creativeCharacters.topicId, topicId),
        eq(creativeCharacters.isActive, true),
      ),
    )
    .limit(1);

  if (!character) {
    throw new CreativeCharacterNotFoundError("The supporting character was not found");
  }
}

async function findReferenceRows(characterIds: string[]): Promise<StoredReference[]> {
  if (characterIds.length === 0) return [];
  return db
    .select()
    .from(creativeCharacterReferenceImages)
    .where(inArray(creativeCharacterReferenceImages.characterId, characterIds))
    .orderBy(
      asc(creativeCharacterReferenceImages.characterId),
      asc(creativeCharacterReferenceImages.order),
    );
}

async function normalizeReferenceOrders(characterId: string): Promise<void> {
  const references = await findReferenceRows([characterId]);
  await Promise.all(
    references.map((reference, index) =>
      db
        .update(creativeCharacterReferenceImages)
        .set({ order: index + 1 })
        .where(eq(creativeCharacterReferenceImages.id, reference.id)),
    ),
  );
}

function mapCharacters(
  characters: (typeof creativeCharacters.$inferSelect)[],
): Promise<CreativeCharacter[]> {
  return findReferenceRows(characters.map((character) => character.id)).then(
    (references) => {
      const referencesByCharacter = groupReferences(references);
      return characters.map((character) =>
        mapCharacter(character, referencesByCharacter.get(character.id) ?? []),
      );
    },
  );
}

function groupReferences(references: StoredReference[]): Map<string, StoredReference[]> {
  const grouped = new Map<string, StoredReference[]>();
  references.forEach((reference) => {
    const current = grouped.get(reference.characterId) ?? [];
    current.push(reference);
    grouped.set(reference.characterId, current);
  });
  return grouped;
}

function mapCharacter(
  character: typeof creativeCharacters.$inferSelect,
  references: StoredReference[],
): CreativeCharacter {
  if (character.slot !== 1 && character.slot !== 2) {
    throw new Error("An active supporting character must have a valid slot");
  }

  return {
    id: character.id,
    slot: character.slot,
    name: character.name,
    description: character.description,
    isActive: character.isActive,
    referenceImages: references.map(publicReference),
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

function publicReference(
  reference: StoredReference,
): CreativeCharacterReferenceImage {
  return {
    id: reference.id,
    fileName: reference.fileName,
    contentType: reference.contentType,
    fileSize: reference.fileSize,
    order: reference.order,
    createdAt: reference.createdAt,
  };
}

/**
 * Character references affect image-to-image output even when the name and
 * description stay the same. Keep an opaque fingerprint in the draft input
 * identity so adding, removing, or reordering a reference offers a fresh
 * draft instead of silently reusing an older one.
 */
function characterReferenceFingerprint(
  references: CreativeCharacterReferenceImage[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        references.map((reference) => ({
          id: reference.id,
          contentType: reference.contentType,
          fileSize: reference.fileSize,
          order: reference.order,
          createdAt: reference.createdAt.toISOString(),
        })),
      ),
    )
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeCharacterValidationError(`${field} is required`);
  }
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

export class CreativeCharacterNotFoundError extends Error {}
export class CreativeCharacterConflictError extends Error {}
export class CreativeCharacterValidationError extends Error {}
