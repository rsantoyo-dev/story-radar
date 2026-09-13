export const STORY_REFERENCE_PURPOSES = ["subject", "result", "step", "place", "style"] as const;
export type StoryReferencePurpose = typeof STORY_REFERENCE_PURPOSES[number];
export type StoryReferenceSelection = { id: string; purpose: StoryReferencePurpose };
export type StoryReferencePhoto = {
  id: string; name: string; description: string; provenance: string;
  providerTransmissionAllowed: boolean; active: boolean;
};
export type StoryContentEdition = {
  revision: number;
  original: { title: string; text: string };
};
export class StoryMaterialValidationError extends Error {}
export class StoryMaterialConflictError extends Error {}
export const STORY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function materialText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new StoryMaterialValidationError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export function parseContentEdit(value: unknown) {
  const input = value as Record<string, unknown> | null;
  if (!input || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) throw new StoryMaterialValidationError("The current content revision is required.");
  return { expectedRevision: Number(input.expectedRevision), title: materialText(input.title, "Title", 500), text: materialText(input.text, "Content", 100_000) };
}
export function parseStoryReferences(value: unknown): StoryReferenceSelection[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) throw new StoryMaterialValidationError("Select at most three story photos per slide.");
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item.id !== "string" || !STORY_UUID.test(item.id) || seen.has(item.id) || !STORY_REFERENCE_PURPOSES.includes(item.purpose)) throw new StoryMaterialValidationError("Invalid or duplicate story photo selection.");
    seen.add(item.id);
    return { id: item.id, purpose: item.purpose };
  });
}
