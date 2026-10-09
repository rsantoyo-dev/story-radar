import type { AutoCollectionForm, UrgentStory } from "./auto-collection-view";

/**
 * Browser calls to the Topic's automatic-reader route. Settings and urgent
 * stories are read and changed there; the scheduled worker does the rest.
 */

/** Dispatched with the Topic id whenever urgent stories change, so the banner and the panel agree. */
export const URGENT_STORIES_CHANGED = "urgent-stories-changed";

export type SavedAutoCollection = AutoCollectionForm & { lastRunAt?: string; nextRunAt?: string };
export type UrgentPreview = { storyId: string; title: string | null; alreadyFlagged: boolean; qualifies: boolean; reasons: string[] };

async function request<T>(topicId: string, secret: string, init: RequestInit = {}, query = ""): Promise<T> {
  const response = await fetch(`/api/radar/topics/${encodeURIComponent(topicId)}/auto-collection${query}`, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, Authorization: `Bearer ${secret.trim()}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const value = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(value.error ?? `The automatic reader request failed (${response.status}).`);
  return value as T;
}

export function loadAutoCollection(topicId: string, secret: string, signal?: AbortSignal) {
  return request<{ settings: SavedAutoCollection | null; scoops: UrgentStory[] }>(topicId, secret, { signal });
}

export function saveAutoCollection(topicId: string, secret: string, form: AutoCollectionForm) {
  return request<{ settings: SavedAutoCollection }>(topicId, secret, { method: "PUT", body: JSON.stringify(form) });
}

/** Which recent stories these thresholds would flag. Read-only: spends no AI. */
export function previewUrgent(topicId: string, secret: string, thresholds: Pick<AutoCollectionForm, "scoopMinGrowth" | "scoopMinEditorial" | "scoopMaxAgeHours">) {
  const query = new URLSearchParams({
    preview: "1",
    minGrowth: String(thresholds.scoopMinGrowth),
    minEditorial: String(thresholds.scoopMinEditorial),
    maxAgeHours: String(thresholds.scoopMaxAgeHours),
  });
  return request<{ candidates: UrgentPreview[] }>(topicId, secret, {}, `?${query}`);
}

/** "seen" hides it from the banner; "dismiss" also stops a preparation that has not started. */
export async function markUrgent(topicId: string, secret: string, scoopId: string, action: "seen" | "dismiss") {
  const result = await request<{ scoops: UrgentStory[] }>(topicId, secret, { method: "PATCH", body: JSON.stringify({ scoopId, action }) });
  window.dispatchEvent(new CustomEvent(URGENT_STORIES_CHANGED, { detail: topicId }));
  return result.scoops;
}
