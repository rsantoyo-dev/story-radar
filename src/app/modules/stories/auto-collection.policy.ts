/**
 * Pure scheduling and scoop rules for the per-Topic automatic reader. No I/O,
 * so the worker's decisions are unit-testable and explainable.
 */

export type AutoCollectionSchedule = {
  enabled: boolean;
  intervalHours: number;
  timezone: string;
  activeFromHour: number;
  activeToHour: number;
  nextRunAt: Date | null;
};

export type ScoopThresholds = {
  scoopMinGrowth: number;
  scoopMinEditorial: number;
  scoopMaxAgeHours: number;
};

export type ScoopCandidate = {
  growthScore: number | null;
  editorialScore: number;
  /** When the source published it; falls back to when the Topic first saw it. */
  publishedAt: Date | null;
  firstSeenAt: Date | null;
};

/** The hour (0–23) on the Topic's wall clock. An invalid zone falls back to UTC. */
export function localHour(now: Date, timezone: string): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(now);
    return Number(hour) % 24;
  } catch {
    return now.getUTCHours();
  }
}

/** [from, to) in local hours; a window like 22 → 6 crosses midnight. */
export function isWithinActiveWindow(now: Date, timezone: string, fromHour: number, toHour: number): boolean {
  const hour = localHour(now, timezone);
  if (fromHour === toHour % 24) return true;
  return fromHour < toHour ? hour >= fromHour && hour < toHour : hour >= fromHour || hour < toHour;
}

export function isAutoCollectionDue(schedule: AutoCollectionSchedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (schedule.nextRunAt && schedule.nextRunAt.getTime() > now.getTime()) return false;
  return isWithinActiveWindow(now, schedule.timezone, schedule.activeFromHour, schedule.activeToHour);
}

export function nextAutoCollectionRun(now: Date, intervalHours: number): Date {
  const hours = Math.min(24, Math.max(1, Math.round(intervalHours)));
  return new Date(now.getTime() + hours * 3_600_000);
}

/**
 * A scoop needs every signal at once — strong growth, real editorial value
 * and freshness — and records each one as a reason. An unscored growth
 * signal never qualifies (0/null means "not computed", not "weak").
 */
export function scoopDecision(candidate: ScoopCandidate, thresholds: ScoopThresholds, now: Date): { qualifies: boolean; reasons: string[] } {
  const growth = candidate.growthScore;
  if (growth === null || growth < 1) return { qualifies: false, reasons: [] };
  const seenAt = candidate.publishedAt ?? candidate.firstSeenAt;
  if (!seenAt) return { qualifies: false, reasons: [] };
  const ageHours = (now.getTime() - seenAt.getTime()) / 3_600_000;
  const checks = [
    { ok: growth >= thresholds.scoopMinGrowth, reason: `Growth ${growth} ≥ ${thresholds.scoopMinGrowth}` },
    { ok: candidate.editorialScore >= thresholds.scoopMinEditorial, reason: `Editorial ${candidate.editorialScore} ≥ ${thresholds.scoopMinEditorial}` },
    {
      ok: ageHours >= -1 && ageHours <= thresholds.scoopMaxAgeHours,
      reason: `${candidate.publishedAt ? "Published" : "First seen"} ${Math.max(0, Math.round(ageHours * 10) / 10)} h ago (≤ ${thresholds.scoopMaxAgeHours} h)`,
    },
  ];
  return { qualifies: checks.every((check) => check.ok), reasons: checks.map((check) => check.reason) };
}
