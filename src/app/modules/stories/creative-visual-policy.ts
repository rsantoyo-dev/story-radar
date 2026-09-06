/**
 * Pure helpers for reasoning about a topic's visual fidelity policy version
 * (FEAT-GEO-001 / GEO-01). No "server-only" / DB imports so it is directly
 * unit-testable; the DB-backed invalidation lives in
 * `creative-visual-policy-invalidation.ts`.
 */

/**
 * The `visualPolicyVersion` a brief snapshot was captured under. Snapshots
 * written before GEO-01 have no such field and count as version 1 — the same
 * `coalesce(..., 1)` the SQL filter applies.
 */
export function readSnapshotPolicyVersion(snapshot: unknown): number {
  if (snapshot && typeof snapshot === "object") {
    const value = (snapshot as Record<string, unknown>).visualPolicyVersion;
    if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
      return value;
    }
  }
  return 1;
}

/** True when a brief snapshot predates the current visual policy version. */
export function isVisualPolicySnapshotStale(
  snapshot: unknown,
  currentPolicyVersion: number,
): boolean {
  return readSnapshotPolicyVersion(snapshot) < currentPolicyVersion;
}
