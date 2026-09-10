/**
 * Wire contract for the Topic Overview aggregate (FEAT-OVW-001 / OVW-01).
 *
 * Shared by the authenticated route and the client panel. Kept free of
 * database / `server-only` imports so the browser bundle can import the types.
 * Every section carries its own status and freshness; a failure in one section
 * never blanks the others, and a missing datum is never reported as zero.
 */

import type { OverviewPeriodDays, OverviewScoreState } from "./topic-overview.logic";

export type { OverviewPeriodDays, OverviewScoreState };

export type OverviewSectionStatus = "ok" | "empty" | "unavailable" | "error";

export type OverviewSection<TData> = {
  status: OverviewSectionStatus;
  /** ISO timestamp of the newest underlying datum, or null when not dated. */
  asOf: string | null;
  /** Human-readable cause when status is "unavailable" or "error". */
  reason?: string;
  data: TData;
};

/** Counters represent either the selected period or the current moment. */
export type OverviewMetricScope = "period" | "now";

export type OverviewMetric = {
  /** null → "—" (unknown). 0 only when the query was complete. */
  value: number | null;
  scope: OverviewMetricScope;
  /** Optional per-destination or per-status split. */
  breakdown?: { label: string; value: number }[];
};

export type OverviewMetrics = {
  /** Distinct stories linked to the topic within the period. */
  newStories: OverviewMetric;
  /** Distinct actionable entities with an open incident (current). */
  needsAttention: OverviewMetric;
  /** Distinct stories with an active creative revision and no final delivery. */
  inProduction: OverviewMetric;
  /** Confirmed remote deliveries within the period, split by platform. */
  published: OverviewMetric;
};

export type OverviewCandidate = {
  storyId: string;
  title: string;
  source: string | null;
  linkedAt: string;
  ageHours: number;
  score: number | null;
  scoreState: OverviewScoreState;
};

export type OverviewProductionStages = {
  selectedStories: number;
  briefs: number;
  draftsInReview: number;
  imagesToReview: number;
  readyOrPublished: number;
};

export type OverviewPublication = {
  storyId: string;
  storyTitle: string;
  platform: string;
  status: string;
  /** Real or scheduled time; null when neither is recorded. */
  at: string | null;
  permalink: string | null;
};

export type OverviewSourceHealth = {
  configured: number;
  enabled: number;
  disabledOrUnknown: number;
  aiResearchEnabled: boolean;
  lastCollectionAt: string | null;
  lastCollectionStatus: "completed" | "partial" | "failed" | null;
  lastFailedSources: number | null;
};

export type OverviewInstagramCapability = {
  connected: boolean;
  canPublish: boolean;
  canReadInsights: boolean;
  username: string | null;
  lastActivityAt: string | null;
};

export type OverviewCapabilities = {
  instagram: OverviewInstagramCapability;
  /** Planned connector — never shown as functional. */
  facebook: { available: false };
  /** Depends on durable scheduling (PUB-05). */
  scheduling: { available: false };
};

export type OverviewActivityEvent = {
  id: string;
  kind: "story-linked" | "draft-updated" | "publication";
  entityId: string;
  label: string;
  at: string;
};

export type OverviewContext = {
  topicId: string;
  name: string;
  description: string | null;
  themeKey: string;
  /** Effective timezone the interval is expressed in (currently always UTC). */
  timezone: string;
  generatedAt: string;
  period: {
    days: OverviewPeriodDays;
    since: string;
    until: string;
  };
};

export type TopicOverviewDto = {
  context: OverviewContext;
  metrics: OverviewMetrics;
  candidates: OverviewSection<OverviewCandidate[]>;
  attention: OverviewSection<{ total: number }>;
  production: OverviewSection<OverviewProductionStages>;
  publications: OverviewSection<{ total: number; recent: OverviewPublication[] }>;
  health: OverviewSection<OverviewSourceHealth>;
  activity: OverviewSection<OverviewActivityEvent[]>;
  capabilities: OverviewCapabilities;
};
