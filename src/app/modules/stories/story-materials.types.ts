export const STORY_REFERENCE_PURPOSES = ["subject", "result", "step", "place", "style", "documentary-portrait"] as const;
export type StoryReferencePurpose = typeof STORY_REFERENCE_PURPOSES[number];
export type StoryReferenceSelection = { id: string; purpose: StoryReferencePurpose };
/** A point in a photo as fractions of its width and height, from the top left. */
export type PhotoFocus = { x: number; y: number };
export type StoryReferencePhoto = {
  id: string; name: string; description: string; provenance: string;
  providerTransmissionAllowed: boolean; active: boolean;
  /** Where the subject is; crops keep this point. Absent: automatic framing. */
  focus?: PhotoFocus;
};
/** A focal point from untrusted input, rounded; null clears it. */
export function parsePhotoFocus(value: unknown): PhotoFocus | null {
  if (value === null) return null;
  const point = value as { x?: unknown; y?: unknown } | undefined;
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  if (!point || typeof point !== "object" || !valid(point.x) || !valid(point.y)) throw new StoryMaterialValidationError("The focal point must be two numbers between 0 and 1.");
  return { x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 };
}
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
  const selected = value.map(item => {
    if (!item || typeof item.id !== "string" || !STORY_UUID.test(item.id) || seen.has(item.id) || !STORY_REFERENCE_PURPOSES.includes(item.purpose)) throw new StoryMaterialValidationError("Invalid or duplicate story photo selection.");
    seen.add(item.id);
    return { id: item.id, purpose: item.purpose };
  });
  if (selected.some(item => item.purpose === "documentary-portrait") && selected.length !== 1) {
    throw new StoryMaterialValidationError("An exact documentary portrait must be the only story photo selected for its slide.");
  }
  return selected;
}
