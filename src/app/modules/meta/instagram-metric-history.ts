/**
 * IG-07 rules for the metrics history, kept pure so they can be tested and
 * reused by reports. Young publications change fastest, so they are measured
 * more often; past 30 days a publication is no longer captured.
 */

const HOUR_MS = 3_600_000;
/** Absorbs scheduler jitter so an hourly pass does not skip a capture by minutes. */
const SLACK_HOURS = 0.5;
export const METRIC_HISTORY_MAX_AGE_HOURS = 30 * 24;

/** The comparison points of IG-07, with the tolerance each one accepts. */
export const METRIC_HISTORY_CHECKPOINTS = [
  { label: "24h", ageHours: 24, toleranceHours: 6 },
  { label: "72h", ageHours: 72, toleranceHours: 12 },
  { label: "7d", ageHours: 168, toleranceHours: 24 },
] as const;

export function publicationAgeHours(publishedAt: Date, at: Date): number {
  return Math.max(0, Math.floor((at.getTime() - publishedAt.getTime()) / HOUR_MS));
}

/** Hours between captures at this age; null once the publication is no longer followed. */
export function snapshotIntervalHours(ageHours: number): number | null {
  if (ageHours < 72) return 6;
  if (ageHours < 168) return 24;
  if (ageHours < METRIC_HISTORY_MAX_AGE_HOURS) return 72;
  return null;
}

export function snapshotDue(publishedAt: Date, lastCapturedAt: Date | null, now: Date): boolean {
  const interval = snapshotIntervalHours(publicationAgeHours(publishedAt, now));
  if (interval === null) return false;
  if (!lastCapturedAt) return true;
  return (now.getTime() - lastCapturedAt.getTime()) / HOUR_MS >= interval - SLACK_HOURS;
}

/** The snapshot closest to a target age, if one falls within its tolerance. */
export function snapshotNearestAge<T extends { ageHours: number }>(
  snapshots: readonly T[],
  checkpoint: { ageHours: number; toleranceHours: number },
): T | undefined {
  let best: T | undefined;
  for (const snapshot of snapshots) {
    const distance = Math.abs(snapshot.ageHours - checkpoint.ageHours);
    if (distance > checkpoint.toleranceHours) continue;
    if (!best || distance < Math.abs(best.ageHours - checkpoint.ageHours)) best = snapshot;
  }
  return best;
}
