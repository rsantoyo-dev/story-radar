import type {
  CreativeCharacterReferenceImage,
  CreativeCharacterSnapshot,
} from "./creative-content.types";

/**
 * Multiple edit inputs of the same identity are often interpreted as separate
 * subjects to preserve. Keep the complete immutable snapshot in storage, but
 * submit one primary identity reference per selected character.
 */
export function charactersForImageGeneration(
  characters: readonly CreativeCharacterSnapshot[],
): CreativeCharacterSnapshot[] {
  return characters.map((character) => ({
    ...character,
    referenceImages: primaryReferenceImages(character.referenceImages),
  }));
}

export function primaryReferenceImages(
  references: readonly (CreativeCharacterReferenceImage & { objectKey: string })[],
): Array<CreativeCharacterReferenceImage & { objectKey: string }> {
  return [...references].sort((first, second) => first.order - second.order).slice(0, 1);
}
