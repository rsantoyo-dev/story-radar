/**
 * Pure helpers for the Topic Overview aggregate (FEAT-OVW-001 / OVW-01).
 *
 * This module has no database or `server-only` import on purpose: the period
 * math, score-freshness rules and source-health bucketing are the parts worth
 * unit-testing in isolation, and the route/repository compose them with real
 * queries.
 */

export const OVERVIEW_PERIODS = [7, 30, 90] as const;

export type OverviewPeriodDays = (typeof OVERVIEW_PERIODS)[number];

/** Feature default: 30 days. */
export const DEFAULT_OVERVIEW_PERIOD: OverviewPeriodDays = 30;

export function isOverviewPeriod(value: unknown): value is OverviewPeriodDays {
  return (
    typeof value === "number" &&
    (OVERVIEW_PERIODS as readonly number[]).includes(value)
  );
}

/**
 * Accepts the `?period=` query value (or a stored preference) and falls back to
 * the feature default rather than throwing — an unknown period is never a
 * request error, just a reset to 30 days.
 */
export function parseOverviewPeriod(
  value: string | number | null | undefined,
): OverviewPeriodDays {
  const parsed = typeof value === "string" ? Number(value) : value;

  return isOverviewPeriod(parsed) ? parsed : DEFAULT_OVERVIEW_PERIOD;
}

export type ResolvedOverviewPeriod = {
  days: OverviewPeriodDays;
  /** Inclusive lower bound. */
  since: Date;
  /** Exclusive upper bound — the query time, not a provider sync time. */
  until: Date;
};

/**
 * A single half-open interval `[since, until)` computed on the server. The
 * caller passes an explicit `now` so this stays deterministic under test.
 */
export function resolveOverviewPeriod(
  days: OverviewPeriodDays,
  now: Date,
): ResolvedOverviewPeriod {
  const until = new Date(now.getTime());
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);

  return { days, since, until };
}

export type OverviewScoreState = "current" | "stale" | "unevaluated";

/**
 * An editorial candidate's score is only "current" while the story has not been
 * re-seen since it was evaluated. A missing evaluation is "unevaluated", never a
 * zero score or an invented priority.
 */
export function resolveScoreState(
  evaluatedAt: Date | null | undefined,
  storyLastSeenAt: Date | null | undefined,
): OverviewScoreState {
  if (!evaluatedAt) {
    return "unevaluated";
  }

  if (storyLastSeenAt && storyLastSeenAt.getTime() > evaluatedAt.getTime()) {
    return "stale";
  }

  return "current";
}

/** Whole hours between two instants, floored, never negative. */
export function ageInHours(from: Date, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - from.getTime()) / (60 * 60 * 1000)),
  );
}

export type SourceHealthCounts = {
  /** Feeds attached to the topic. */
  configured: number;
  /** Feeds the topic currently has enabled. */
  enabled: number;
};

/**
 * Disjoint source-health view: enabled feeds, disabled/unknown feeds, and the
 * failed-source count from the most recent collection run (which may exceed
 * `enabled` if a feed was disabled after failing, so it is reported on its own
 * rather than folded into a bucket).
 */
export function bucketiseSourceHealth(
  counts: SourceHealthCounts,
  lastRunFailedSources: number | null,
): {
  enabled: number;
  disabledOrUnknown: number;
  lastFailedSources: number | null;
} {
  const enabled = Math.max(0, counts.enabled);
  const configured = Math.max(enabled, counts.configured);

  return {
    enabled,
    disabledOrUnknown: configured - enabled,
    lastFailedSources:
      lastRunFailedSources === null
        ? null
        : Math.max(0, lastRunFailedSources),
  };
}

/**
 * The value shown on an `OverviewMetricCard`. `null` renders as "—" (unknown);
 * `0` is only legitimate when the underlying query ran to completion.
 */
export function metricValue(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
