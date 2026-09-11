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

/** A piece the editor can move forward now (OVW-04). Blocked pieces are left
 * to the attention queue, not listed here; a piece whose delivery is already
 * confirmed is dropped entirely. */
export type OverviewProductionPiece = {
  draftId: string;
  storyId: string;
  title: string;
  format: string;
  /** Latest revision number of this draft. */
  version: number;
  status: string;
  /** When this revision last changed. */
  updatedAt: string;
  /** Provider image URL for the cover slide, or null when none exists yet. */
  thumbnailUrl: string | null;
  /**
   * The concrete next step, derived from stored state only (no provider call):
   * generate images → review/approve → freeze package → publish package.
   */
  nextStep: string;
};

export type OverviewProduction = OverviewProductionStages & {
  continuable: OverviewProductionPiece[];
};

/**
 * Priority tiers for the attention queue (OVW-03), highest first:
 * an uncertain / unrecorded delivery, then a safe delivery failure or a
 * blocked authorization, then an editorial blocker on a draft, then a
 * revision waiting for approval.
 */
export type OverviewAttentionSeverity =
  | "uncertain-delivery"
  | "delivery-failure"
  | "draft-blocker"
  | "pending-approval";

export type OverviewAttentionItem = {
  /** Stable dedup/identity key, e.g. `job:<uuid>` or `draft-blocker:<uuid>`. */
  id: string;
  entity: "publication-job" | "draft";
  entityId: string;
  storyId: string;
  /** Piece or story title in plain text. */
  title: string;
  /** e.g. "Instagram job" or "Draft v3". */
  pieceType: string | null;
  severity: OverviewAttentionSeverity;
  /** Primary reason, in editor language — never a raw field name. */
  reason: string;
  /** How many further reasons the same piece has beyond `reason`. */
  extraReasons: number;
  ageHours: number;
  action: { label: string; href: string };
};

export type OverviewAttention = {
  /** Real count of distinct actionable entities, not just what is shown. */
  total: number;
  /** At most five, ranked by severity then age. */
  items: OverviewAttentionItem[];
};

/**
 * How far a delivery actually got. A confirmed delivery with no permalink is
 * NOT a failure; a manually logged entry is NOT a provider-confirmed send.
 */
export type OverviewDeliveryState =
  | "confirmed"
  | "record-pending"
  | "uncertain"
  | "container-ready"
  | "in-progress"
  | "failed"
  | "logged";

export type OverviewDelivery = {
  id: string;
  storyId: string;
  storyTitle: string;
  platform: string;
  /** Destination account (Instagram username or id), when known. */
  account: string | null;
  state: OverviewDeliveryState;
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
  lastSuccessfulSources: number | null;
  lastFailedSources: number | null;
};

export type OverviewInstagramCapability = {
  connected: boolean;
  canPublish: boolean;
  canReadInsights: boolean;
  username: string | null;
  lastActivityAt: string | null;
};

export type OverviewPlannedCapability = {
  available: false;
  /** Why it is unavailable, shown instead of an invented figure. */
  reason: string;
};

export type OverviewCapabilities = {
  instagram: OverviewInstagramCapability;
  /** Planned connector — never shown as functional. */
  facebook: OverviewPlannedCapability;
  /** Depends on durable scheduling (PUB-05). */
  scheduling: OverviewPlannedCapability;
};

/**
 * Derived from entity timestamps, not a persisted audit log — there is no
 * author or change history behind these, only "this changed at this time".
 * The panel labels the section "Recent updates" accordingly.
 */
export type OverviewActivityEvent = {
  id: string;
  kind: "story-linked" | "draft-updated" | "publication";
  entityId: string;
  storyId: string;
  /** The story's real title — use this to open it, never parsed out of `label`. */
  title: string;
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
  attention: OverviewSection<OverviewAttention>;
  production: OverviewSection<OverviewProduction>;
  publications: OverviewSection<{ total: number; recent: OverviewDelivery[] }>;
  health: OverviewSection<OverviewSourceHealth>;
  activity: OverviewSection<OverviewActivityEvent[]>;
  capabilities: OverviewCapabilities;
};
