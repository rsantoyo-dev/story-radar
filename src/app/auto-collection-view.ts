/**
 * Pure rules behind the automatic reader's panel and the urgent-stories
 * banner: how many passes a schedule makes, how an urgent story's state reads
 * and which ones still need the editor. No I/O, so they are unit-tested.
 */

/** The reader's settings as the editor edits them (see auto-collection.repository). */
export type AutoCollectionForm = {
  enabled: boolean;
  lineId: string;
  intervalHours: number;
  timezone: string;
  activeFromHour: number;
  activeToHour: number;
  scoopEnabled: boolean;
  scoopMinGrowth: number;
  scoopMinEditorial: number;
  scoopMaxAgeHours: number;
  autoPrepareScoops: boolean;
};

/** An urgent story ("scoop") as the auto-collection route lists it. */
export type UrgentStory = {
  id: string;
  storyId: string;
  storyTitle?: string;
  growthScore: number;
  editorialScore: number;
  reasons: string[];
  status: string;
  blockedStep?: string;
  message?: string;
  preparationRunId?: string;
  detectedAt: string;
  seen: boolean;
};

/** The server's defaults, so a Topic without saved settings starts from them. */
export const DEFAULT_AUTO_COLLECTION = {
  enabled: false,
  intervalHours: 4,
  activeFromHour: 6,
  activeToHour: 22,
  scoopEnabled: true,
  scoopMinGrowth: 85,
  scoopMinEditorial: 80,
  scoopMaxAgeHours: 6,
  autoPrepareScoops: true,
} as const satisfies Omit<AutoCollectionForm, "lineId" | "timezone">;

/** At most this many urgent stories are prepared ahead per Topic and day (MAX_SCOOP_PREPARATIONS_PER_DAY). */
export const URGENT_PREPARATIONS_PER_DAY = 3;

export const INTERVAL_HOURS = [1, 2, 3, 4, 6, 8, 12, 24] as const;

/** Hours a day a pass may start: [from, to) on the Topic's clock; equal ends mean all day. */
export function activeWindowHours(from: number, to: number): number {
  if (from === to % 24) return 24;
  return from < to ? to - from : 24 - from + to;
}

/**
 * Passes a day: one per interval inside the active window, as the scheduler
 * spaces them (6–22 every 4 h starts at 6, 10, 14 and 18).
 */
export function passesPerDay(form: Pick<AutoCollectionForm, "intervalHours" | "activeFromHour" | "activeToHour">): number {
  return Math.ceil(activeWindowHours(form.activeFromHour, form.activeToHour) / Math.max(1, form.intervalHours));
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Shown, not hidden: an urgent story the editor has neither seen nor dismissed. */
export function needsAttention(story: UrgentStory): boolean {
  return !story.seen && story.status !== "dismissed";
}

export type UrgentStatus = { label: string; tone: "info" | "success" | "warning" | "neutral" };

/** Where an urgent story's preparation stands, in the editor's words. */
export function urgentStatus(story: UrgentStory, autoPrepare = true): UrgentStatus {
  switch (story.status) {
    case "ready":
      return { label: "Draft ready to review", tone: "success" };
    case "preparing":
      return { label: "Preparing its brief and draft…", tone: "info" };
    case "blocked":
      return { label: story.blockedStep ? `Needs you at the ${story.blockedStep} step` : "Needs you", tone: "warning" };
    case "dismissed":
      return { label: "Dismissed", tone: "neutral" };
    default:
      return { label: autoPrepare ? "Waiting for its brief and draft" : "Flagged", tone: "info" };
  }
}

export function ageLabel(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}
