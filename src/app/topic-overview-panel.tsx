"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import styles from "./radar-dashboard.generated.module.css";
import {
  OVERVIEW_PERIODS,
  parseOverviewPeriod,
  type OverviewPeriodDays,
} from "./modules/topics/topic-overview.logic";
import type {
  OverviewSection,
  TopicOverviewDto,
} from "./modules/topics/topic-overview.types";

const NUMBER_FORMAT = new Intl.NumberFormat("en-CA");

type Phase = "idle" | "loading" | "ready" | "error";

type TopicOverviewPanelProps = {
  secret: string;
  topicId: string;
  topicName: string;
  topicDescription?: string;
  /** A global operation is running; pause the panel's own controls. */
  disabled?: boolean;
  /**
   * Opens the creative workspace for a story (the exact-review contract).
   * `draftId`, when known, opens that specific revision instead of whichever
   * one the workspace would default to.
   */
  onOpenStory?: (storyId: string, title: string, draftId?: string) => void;
};

function periodStorageKey(topicId: string): string {
  return `pc:overview-period:${topicId}`;
}

function readStoredPeriod(topicId: string): OverviewPeriodDays {
  if (typeof window === "undefined") return parseOverviewPeriod(undefined);
  try {
    return parseOverviewPeriod(
      window.sessionStorage.getItem(periodStorageKey(topicId)),
    );
  } catch {
    return parseOverviewPeriod(undefined);
  }
}

function writeStoredPeriod(topicId: string, period: OverviewPeriodDays): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(periodStorageKey(topicId), String(period));
  } catch {
    // Ignore storage failures (private browsing, quota, disabled storage).
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatMetric(value: number | null): string {
  return value === null ? "—" : NUMBER_FORMAT.format(value);
}

function scopeLabel(scope: "period" | "now"): string {
  return scope === "now" ? "Now" : "In the selected period";
}

const SEVERITY_LABEL: Record<string, string> = {
  "uncertain-delivery": "Uncertain delivery",
  "delivery-failure": "Delivery failure",
  "draft-blocker": "Blocked",
  "pending-approval": "Needs approval",
};

const DELIVERY_STATE_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  "record-pending": "Remote OK · recording",
  uncertain: "Uncertain",
  "container-ready": "Container ready",
  "in-progress": "Sending",
  failed: "Failed",
  logged: "Logged manually",
};

function deliveryBadgeClass(state: string, styleMap: typeof styles): string {
  if (state === "confirmed") return styleMap.ovwBadge;
  if (state === "failed" || state === "uncertain") return styleMap.ovwBadgeError;
  if (state === "logged") return styleMap.ovwBadgeMuted;
  return styleMap.ovwBadgeWarn;
}

/** Mirrors deliveryBadgeClass's tiers so the two severity scales in this
 * panel read consistently: a send problem is the same color whether it
 * shows up in "Needs your attention" or in "Recent publications". */
function attentionBadgeClass(severity: string, styleMap: typeof styles): string {
  if (severity === "uncertain-delivery" || severity === "delivery-failure") {
    return styleMap.ovwBadgeError;
  }
  if (severity === "pending-approval") return styleMap.ovwBadgeMuted;
  return styleMap.ovwBadgeWarn; // draft-blocker
}

/**
 * Phase-1 stand-in for the editorial report (OVW-08): a deterministic sentence
 * built only from counters already in the DTO. Never a model call, and never
 * labeled as analysis — each section stays "—" rather than a guess when its
 * own read failed.
 */
function buildOperationalSummary(dto: TopicOverviewDto): string {
  const parts: string[] = [];
  const { newStories, inProduction, published } = dto.metrics;

  if (newStories.value !== null) {
    parts.push(`${newStories.value} new ${newStories.value === 1 ? "story" : "stories"}`);
  }
  if (dto.attention.status !== "error") {
    parts.push(
      `${dto.attention.data.total} needing attention`,
    );
  }
  if (inProduction.value !== null) {
    parts.push(`${inProduction.value} in production`);
  }
  if (published.value !== null) {
    parts.push(`${published.value} published`);
  }

  return parts.length > 0
    ? `Last ${dto.context.period.days} days: ${parts.join(", ")}.`
    : "No data available for this period yet.";
}

type QuickAction = {
  key: string;
  label: string;
  description: string;
  href: string;
  onClick?: () => void;
};

/**
 * Up to four contextual shortcuts, computed client-side from data already on
 * screen — no extra fetch. Each declares its real effect; none of them starts
 * a collection run, generates images, or sends a publication.
 */
function buildQuickActions(
  dto: TopicOverviewDto,
  onOpenStory:
    | ((storyId: string, title: string, draftId?: string) => void)
    | undefined,
): QuickAction[] {
  const actions: QuickAction[] = [];

  if (dto.attention.status !== "error" && dto.attention.data.total > 0) {
    const top = dto.attention.data.items[0];
    // The top item's own action already knows its real destination (Story
    // review for a draft, the Instagram section for a publication-job
    // incident) — reuse it instead of hard-coding one destination for both.
    actions.push({
      key: "attention",
      label: `Review ${dto.attention.data.total} pending ${
        dto.attention.data.total === 1 ? "item" : "items"
      }`,
      description:
        top?.entity === "publication-job"
          ? "Opens the Instagram section; nothing is resolved automatically."
          : "Opens Story review; nothing is resolved automatically.",
      href: top?.action.href ?? "#stories",
      ...(top && top.entity === "draft" && onOpenStory
        ? { onClick: () => onOpenStory(top.storyId, top.title, top.entityId) }
        : {}),
    });
  }

  if (
    dto.production.status !== "error" &&
    dto.production.data.draftsInReview > 0
  ) {
    actions.push({
      key: "drafts",
      label: `Continue ${dto.production.data.draftsInReview} draft${
        dto.production.data.draftsInReview === 1 ? "" : "s"
      }`,
      description: "Opens the creative workspace; it does not generate images.",
      href: "#stories",
    });
  }

  actions.push({
    key: "collection",
    label: "Open collection",
    description: "Opens Topics & sources; it does not start a collection run.",
    href: "#configuration",
  });
  actions.push({
    key: "source",
    label: "Add a source",
    description: "Opens Topics & sources to add a feed.",
    href: "#configuration",
  });
  actions.push({
    key: "studio",
    label: "Open studio",
    description: "Opens the creative workspace; it does not generate images.",
    href: "#stories",
  });

  return actions.slice(0, 4);
}

export function TopicOverviewPanel({
  secret,
  topicId,
  topicName,
  topicDescription,
  disabled = false,
  onOpenStory,
}: TopicOverviewPanelProps) {
  const [period, setPeriod] = useState<OverviewPeriodDays>(() =>
    readStoredPeriod(topicId),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [data, setData] = useState<TopicOverviewDto>();
  const [errorMessage, setErrorMessage] = useState<string>();

  // Ignore a response whose topic/period no longer matches what is selected.
  const requestRef = useRef(0);
  const trimmedSecret = secret.trim();

  // `period` is seeded per-topic by the useState initializer; the panel is
  // mounted with a topic-scoped `key`, so a topic switch remounts and re-reads
  // the stored value rather than needing a syncing effect.

  const load = useCallback(() => {
    if (!trimmedSecret) {
      setPhase("idle");
      setData(undefined);
      return () => undefined;
    }

    const token = ++requestRef.current;
    const controller = new AbortController();
    setPhase("loading");
    setErrorMessage(undefined);

    void (async () => {
      try {
        const response = await fetch(
          `/api/radar/overview?topicId=${encodeURIComponent(
            topicId,
          )}&period=${period}`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Authorization: `Bearer ${trimmedSecret}` },
          },
        );
        const payload = (await response
          .json()
          .catch(() => undefined)) as
          | (TopicOverviewDto & { error?: string })
          | undefined;

        if (token !== requestRef.current) return;

        if (!response.ok) {
          // Drop any prior payload: it belongs to the previous topic/period
          // and there is no per-period staleness label in this view, so
          // showing it under the new selection would be misleading.
          setData(undefined);
          setPhase("error");
          setErrorMessage(
            payload?.error ?? `Request failed with ${response.status}`,
          );
          return;
        }

        setData(payload as TopicOverviewDto);
        setPhase("ready");
      } catch (error) {
        if (controller.signal.aborted || token !== requestRef.current) return;
        setData(undefined);
        setPhase("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    })();

    return () => controller.abort();
  }, [period, topicId, trimmedSecret]);

  // A data-fetch effect: it drives the panel's own loading/error state from an
  // external system (the overview API), which is exactly what effects are for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => load(), [load]);

  function changePeriod(next: OverviewPeriodDays) {
    if (next === period) return;
    writeStoredPeriod(topicId, next);
    setPeriod(next);
  }

  const isLoading = phase === "loading";
  const metrics = data?.metrics;

  const summaryText = useMemo(
    () => (data ? buildOperationalSummary(data) : null),
    [data],
  );
  const quickActions = useMemo(
    () => (data ? buildQuickActions(data, onOpenStory) : []),
    [data, onOpenStory],
  );

  // Each card links to the real section where that list is worked, not a
  // fabricated filtered view. OVW-03/04 replace these with deep links that
  // carry the exact filter.
  const metricCards = useMemo(
    () =>
      [
        {
          key: "newStories",
          label: "New stories",
          icon: "✦",
          href: "#stories",
          linkLabel: "Open story review",
        },
        {
          key: "needsAttention",
          label: "Needs attention",
          icon: "!",
          href: "#stories",
          linkLabel: "Review in stories",
        },
        {
          key: "inProduction",
          label: "In production",
          icon: "▤",
          href: "#stories",
          linkLabel: "Open story review",
        },
        {
          key: "published",
          label: "Published",
          icon: "➤",
          href: "#editorial-instagram",
          linkLabel: "Open Instagram",
        },
      ] as const,
    [],
  );

  return (
    <div className={styles.ovwRoot}>
      <div className={styles.ovwHeader}>
        <div className={styles.ovwHeaderMain}>
          <h2 className={styles.ovwTitle}>{topicName}</h2>
          {topicDescription ? (
            <p className={styles.ovwDescription}>{topicDescription}</p>
          ) : null}
          <p className={styles.ovwFreshness} aria-live="polite">
            {phase === "ready" && data
              ? `Last updated ${formatDateTime(
                  data.context.generatedAt,
                )} · ${data.context.timezone} · last ${
                  data.context.period.days
                } days`
              : phase === "idle"
                ? "Connect with the collector secret to load this topic."
                : isLoading
                  ? "Loading topic data…"
                  : `Topic data could not be loaded${
                      errorMessage ? `: ${errorMessage}` : "."
                    }`}
          </p>
        </div>

        <div className={styles.ovwHeaderMeta}>
          <div
            className={styles.ovwPeriod}
            role="group"
            aria-label="Overview period"
          >
            {OVERVIEW_PERIODS.map((option) => {
              const active = option === period;
              return (
                <button
                  key={option}
                  type="button"
                  className={`${styles.ovwPeriodButton} ${
                    active ? styles.ovwPeriodButtonActive : ""
                  }`}
                  aria-pressed={active}
                  disabled={disabled || isLoading}
                  onClick={() => changePeriod(option)}
                >
                  {option}d
                </button>
              );
            })}
          </div>
          <div className={styles.ovwHeaderActions}>
            <button
              type="button"
              className={styles.ovwRefreshButton}
              onClick={() => load()}
              disabled={disabled || isLoading || !trimmedSecret}
            >
              {isLoading ? "Refreshing…" : "Refresh data"}
            </button>
            <a className={styles.ovwConfigLink} href="#configuration">
              Configure topic
            </a>
          </div>
        </div>
      </div>

      <div className={styles.ovwMetrics}>
        {metricCards.map(({ key, label, icon, href, linkLabel }) => {
          const metric = metrics?.[key];
          return (
            <div key={key} className={styles.ovwMetricCard}>
              <div className={styles.ovwMetricHeader}>
                <span className={styles.ovwMetricIcon} aria-hidden="true">
                  {icon}
                </span>
                <span className={styles.ovwMetricLabel}>{label}</span>
              </div>
              <span className={styles.ovwMetricValue}>
                {isLoading || !metric ? "—" : formatMetric(metric.value)}
              </span>
              <span className={styles.ovwMetricScope}>
                {metric ? scopeLabel(metric.scope) : "—"}
              </span>
              {metric?.breakdown && metric.breakdown.length > 0 ? (
                <p className={styles.ovwMetricBreakdown}>
                  {metric.breakdown
                    .map((entry) => `${entry.label}: ${entry.value}`)
                    .join(" · ")}
                </p>
              ) : null}
              <a className={styles.ovwMetricLink} href={href}>
                {linkLabel} →
              </a>
            </div>
          );
        })}
      </div>

      {summaryText ? (
        <div className={styles.ovwSummary}>
          <p className={styles.ovwSummaryLabel}>
            Status · calculated from current data, not an AI report
          </p>
          <p className={styles.ovwSummaryText}>{summaryText}</p>
        </div>
      ) : null}

      <div className={styles.ovwMainRow}>
        <SectionCard
          title="Editorial candidates"
          section={data?.candidates}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="No eligible candidates for this topic yet."
        >
          {(candidates) => (
            <ul className={styles.ovwList}>
              {candidates.map((candidate) => (
                <li key={candidate.storyId} className={styles.ovwPieceItem}>
                  <span
                    className={styles.ovwPieceThumbEmpty}
                    aria-hidden="true"
                  />
                  <span className={styles.ovwPieceBody}>
                    <span className={styles.ovwRowHead}>
                      <span className={styles.ovwListPrimary}>
                        {candidate.title}
                      </span>
                      {candidate.scoreState !== "unevaluated" &&
                      candidate.score !== null ? (
                        <span
                          className={
                            candidate.scoreState === "stale"
                              ? styles.ovwBadgeMuted
                              : styles.ovwBadge
                          }
                        >
                          {candidate.scoreState === "stale"
                            ? `score ${candidate.score} · outdated`
                            : `score ${candidate.score}`}
                        </span>
                      ) : (
                        <span className={styles.ovwBadgeMuted}>
                          Not evaluated
                        </span>
                      )}
                    </span>
                    <span className={styles.ovwListMeta}>
                      {`${candidate.source ?? "Unknown source"} · ${
                        candidate.ageHours
                      }h old`}
                    </span>
                    {onOpenStory ? (
                      <button
                        type="button"
                        className={styles.ovwListLinkButton}
                        onClick={() =>
                          onOpenStory(candidate.storyId, candidate.title)
                        }
                      >
                        Review →
                      </button>
                    ) : (
                      <a className={styles.ovwListLink} href="#stories">
                        Review →
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className={styles.ovwSideColumn}>
          <SectionCard
            title="Needs your attention"
            section={data?.attention}
            loading={isLoading}
            phase={phase}
            onRetry={load}
            emptyLabel="Nothing needs attention right now."
          >
            {(attention) => (
              <>
                <ul className={styles.ovwList}>
                  {attention.items.map((item) => (
                    <li key={item.id} className={styles.ovwListItem}>
                      <span className={styles.ovwRowHead}>
                        <span
                          className={attentionBadgeClass(item.severity, styles)}
                        >
                          {SEVERITY_LABEL[item.severity] ?? item.severity}
                        </span>
                        <span className={styles.ovwListPrimary}>
                          {item.title}
                        </span>
                      </span>
                      <span className={styles.ovwListMeta}>
                        {[
                          item.pieceType,
                          item.reason,
                          item.extraReasons > 0
                            ? `+${item.extraReasons} more`
                            : null,
                          `${item.ageHours}h old`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {item.entity === "draft" && onOpenStory ? (
                        <button
                          type="button"
                          className={styles.ovwListLinkButton}
                          onClick={() =>
                            onOpenStory(item.storyId, item.title, item.entityId)
                          }
                        >
                          {item.action.label} →
                        </button>
                      ) : (
                        <a
                          className={styles.ovwListLink}
                          href={item.action.href}
                        >
                          {item.action.label} →
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
                {attention.total > attention.items.length ? (
                  <a className={styles.ovwListLink} href="#stories">
                    View all {attention.total} →
                  </a>
                ) : null}
              </>
            )}
          </SectionCard>

          <section className={styles.ovwSection}>
            <h3 className={styles.ovwSectionTitle}>Publishing</h3>
            <div className={styles.ovwSectionBody}>
              {isLoading || !data ? (
                <div className={styles.ovwSkeleton} aria-hidden="true">
                  <span className={styles.ovwSkeletonLine} />
                  <span className={styles.ovwSkeletonLine} />
                </div>
              ) : (
                <ul className={styles.ovwList}>
                  <li className={styles.ovwListItem}>
                    <span className={styles.ovwListPrimary}>
                      {data.capabilities.instagram.connected
                        ? `Instagram${
                            data.capabilities.instagram.username
                              ? ` · @${data.capabilities.instagram.username}`
                              : ""
                          }`
                        : "Instagram not connected"}
                    </span>
                    <span className={styles.ovwListMeta}>
                      {[
                        `publish: ${
                          data.capabilities.instagram.canPublish ? "yes" : "no"
                        }`,
                        `insights: ${
                          data.capabilities.instagram.canReadInsights
                            ? "yes"
                            : "no"
                        }`,
                      ].join(" · ")}
                    </span>
                    <a className={styles.ovwListLink} href="#editorial-meta">
                      Manage →
                    </a>
                  </li>
                  <li className={styles.ovwListItem}>
                    <span className={styles.ovwListMeta}>
                      {data.capabilities.facebook.reason}
                    </span>
                  </li>
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <SectionCard
        title="Production"
        section={data?.production}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="Nothing in production yet."
        >
          {(production) => (
            <>
              <div className={styles.ovwStages}>
                {(
                  [
                    ["Selected", production.selectedStories, "stories"],
                    ["Briefs", production.briefs, "stories"],
                    ["Drafts in review", production.draftsInReview, "drafts"],
                    ["Images to review", production.imagesToReview, "images"],
                    ["Ready / published", production.readyOrPublished, "stories"],
                  ] as const
                ).map(([label, value, unit]) => (
                  <div key={label} className={styles.ovwStage}>
                    <span className={styles.ovwStageValue}>
                      {NUMBER_FORMAT.format(value)}
                    </span>
                    <span className={styles.ovwStageLabel}>{label}</span>
                    <span className={styles.ovwStageUnit}>{unit}</span>
                  </div>
                ))}
              </div>
              {production.continuable.length > 0 ? (
                <ul className={styles.ovwList}>
                  {production.continuable.map((piece) => (
                    <li key={piece.draftId} className={styles.ovwPieceItem}>
                      {piece.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className={styles.ovwPieceThumb}
                          src={piece.thumbnailUrl}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className={styles.ovwPieceThumbEmpty}
                          aria-hidden="true"
                        />
                      )}
                      <span className={styles.ovwPieceBody}>
                        <span className={styles.ovwListPrimary}>
                          {piece.title}
                        </span>
                        <span className={styles.ovwListMeta}>
                          {`${piece.format} · v${piece.version} · updated ${formatRelative(
                            piece.updatedAt,
                          )} · ${piece.nextStep}`}
                        </span>
                        {onOpenStory ? (
                          <button
                            type="button"
                            className={styles.ovwListLinkButton}
                            onClick={() =>
                              onOpenStory(piece.storyId, piece.title, piece.draftId)
                            }
                          >
                            Continue →
                          </button>
                        ) : (
                          <a className={styles.ovwListLink} href="#stories">
                            Continue →
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
      </SectionCard>

      <div className={styles.ovwSections}>
        <SectionCard
          title="Recent publications"
          section={data?.publications}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="No publications recorded for this topic."
        >
          {(publications) => (
            <>
              <ul className={styles.ovwList}>
                {publications.recent.map((delivery) => (
                  <li key={delivery.id} className={styles.ovwListItem}>
                    <span className={styles.ovwRowHead}>
                      <span
                        className={deliveryBadgeClass(delivery.state, styles)}
                      >
                        {DELIVERY_STATE_LABEL[delivery.state] ?? delivery.state}
                      </span>
                      <span className={styles.ovwListPrimary}>
                        {delivery.storyTitle}
                      </span>
                    </span>
                    <span className={styles.ovwListMeta}>
                      {[
                        delivery.platform,
                        delivery.account,
                        delivery.at ? formatDateTime(delivery.at) : "no date",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {delivery.permalink ? (
                        <>
                          {" · "}
                          <a
                            className={styles.ovwListLink}
                            href={delivery.permalink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            view post
                          </a>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {publications.total > publications.recent.length ? (
                <a className={styles.ovwListLink} href="#editorial-instagram">
                  View all {publications.total} →
                </a>
              ) : null}
            </>
          )}
        </SectionCard>

        {/*
          Titled "Recent updates", not "Activity log": these are entity
          timestamps (when a story was linked, a draft last changed, a post
          went out), not a persisted audit trail — no author or history is
          implied.
        */}
        <SectionCard
          title="Recent updates"
          section={data?.activity}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="No recent updates for this topic."
        >
          {(activity) => (
            <ul className={styles.ovwList}>
              {activity.map((event) => (
                <li key={event.id} className={styles.ovwListItem}>
                  <span className={styles.ovwListPrimary}>{event.label}</span>
                  <span className={styles.ovwListMeta}>
                    {formatRelative(event.at)}
                    {event.kind !== "publication" && onOpenStory ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className={styles.ovwListLinkButton}
                          onClick={() =>
                            onOpenStory(
                              event.storyId,
                              event.title,
                              event.kind === "draft-updated"
                                ? event.entityId
                                : undefined,
                            )
                          }
                        >
                          Open →
                        </button>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className={styles.ovwSections}>
        <SectionCard
          title="Topic health"
          section={data?.health}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="No sources configured for this topic."
        >
          {(health) => (
            <ul className={styles.ovwList}>
              <li className={styles.ovwListItem}>
                <span className={styles.ovwListPrimary}>
                  {`${health.enabled} of ${health.configured} feeds enabled`}
                </span>
                <span className={styles.ovwListMeta}>
                  {[
                    health.disabledOrUnknown > 0
                      ? `${health.disabledOrUnknown} disabled/unknown`
                      : null,
                    health.lastSuccessfulSources !== null
                      ? `last run: ${health.lastSuccessfulSources} ok / ${
                          health.lastFailedSources ?? 0
                        } failed`
                      : "no collection run yet",
                    health.aiResearchEnabled
                      ? "AI research on"
                      : "AI research off",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
              <li className={styles.ovwListItem}>
                <span className={styles.ovwListPrimary}>
                  {health.lastCollectionAt
                    ? `Last collection ${formatRelative(
                        health.lastCollectionAt,
                      )} · ${health.lastCollectionStatus}`
                    : "No collection run yet"}
                </span>
                <span className={styles.ovwListMeta}>
                  <a className={styles.ovwListLink} href="#configuration">
                    Open Topics &amp; sources →
                  </a>
                </span>
              </li>
            </ul>
          )}
        </SectionCard>

        <section className={styles.ovwSection}>
          <h3 className={styles.ovwSectionTitle}>Quick actions</h3>
          <div className={styles.ovwSectionBody}>
            {isLoading || !data ? (
              <div className={styles.ovwSkeleton} aria-hidden="true">
                <span className={styles.ovwSkeletonLine} />
                <span className={styles.ovwSkeletonLine} />
                <span className={styles.ovwSkeletonLine} />
              </div>
            ) : (
              <ul className={styles.ovwQuickActions}>
                {quickActions.map((action) => (
                  <li key={action.key} className={styles.ovwQuickAction}>
                    <span className={styles.ovwQuickActionTitle}>
                      {action.label}
                    </span>
                    <span className={styles.ovwQuickActionDesc}>
                      {action.description}
                    </span>
                    {action.onClick ? (
                      <button
                        type="button"
                        className={styles.ovwListLinkButton}
                        onClick={action.onClick}
                      >
                        Open →
                      </button>
                    ) : (
                      <a className={styles.ovwListLink} href={action.href}>
                        Open →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

type SectionCardProps<TData> = {
  title: string;
  section: OverviewSection<TData> | undefined;
  loading: boolean;
  phase: Phase;
  emptyLabel: string;
  onRetry: () => void;
  children: (data: TData) => ReactNode;
};

function SectionCard<TData>({
  title,
  section,
  loading,
  phase,
  emptyLabel,
  onRetry,
  children,
}: SectionCardProps<TData>) {
  return (
    <section className={styles.ovwSection}>
      <h3 className={styles.ovwSectionTitle}>{title}</h3>
      <div className={styles.ovwSectionBody}>
        {loading || (phase !== "ready" && !section) ? (
          phase === "idle" ? (
            <p className={styles.ovwEmpty}>Waiting for connection.</p>
          ) : phase === "error" ? (
            <div className={styles.ovwError} role="status">
              <span>This section could not be loaded.</span>
              <button
                type="button"
                className={styles.ovwRetryButton}
                onClick={onRetry}
              >
                Retry
              </button>
            </div>
          ) : (
            <div className={styles.ovwSkeleton} aria-hidden="true">
              <span className={styles.ovwSkeletonLine} />
              <span className={styles.ovwSkeletonLine} />
              <span className={styles.ovwSkeletonLine} />
            </div>
          )
        ) : !section ? (
          <p className={styles.ovwEmpty}>{emptyLabel}</p>
        ) : section.status === "error" || section.status === "unavailable" ? (
          <div className={styles.ovwError} role="status">
            <span>{section.reason ?? "This section is unavailable."}</span>
            <button
              type="button"
              className={styles.ovwRetryButton}
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        ) : section.status === "empty" ? (
          <p className={styles.ovwEmpty}>{emptyLabel}</p>
        ) : (
          children(section.data)
        )}
      </div>
    </section>
  );
}
