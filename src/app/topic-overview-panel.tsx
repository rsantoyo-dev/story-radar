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

export function TopicOverviewPanel({
  secret,
  topicId,
  topicName,
  topicDescription,
  disabled = false,
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
          <p className={styles.ovwFreshness}>
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

      <div className={styles.ovwSections}>
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
                <li key={candidate.storyId} className={styles.ovwListItem}>
                  <span className={styles.ovwListPrimary}>
                    {candidate.title}
                  </span>
                  <span className={styles.ovwListMeta}>
                    {(candidate.source ?? "Unknown source") +
                      ` · ${candidate.ageHours}h old · ` +
                      (candidate.scoreState === "current" &&
                      candidate.score !== null
                        ? `score ${candidate.score}`
                        : candidate.scoreState === "stale"
                          ? "score outdated"
                          : "not evaluated")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Needs your attention"
          section={data?.attention}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="Nothing needs attention right now."
        >
          {(attention) => (
            <p className={styles.ovwListPrimary}>
              {attention.total === 1
                ? "1 item needs attention"
                : `${attention.total} items need attention`}
              <span className={styles.ovwListMeta}>
                {" "}
                · open Story review to resolve
              </span>
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Production"
          section={data?.production}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="Nothing in production yet."
        >
          {(production) => (
            <div className={styles.ovwStages}>
              {(
                [
                  ["Selected", production.selectedStories],
                  ["Briefs", production.briefs],
                  ["Drafts in review", production.draftsInReview],
                  ["Images to review", production.imagesToReview],
                  ["Ready / published", production.readyOrPublished],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className={styles.ovwStage}>
                  <span className={styles.ovwStageValue}>
                    {NUMBER_FORMAT.format(value)}
                  </span>
                  <span className={styles.ovwStageLabel}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent publications"
          section={data?.publications}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="No publications recorded for this topic."
        >
          {(publications) => (
            <ul className={styles.ovwList}>
              {publications.recent.map((publication, index) => (
                <li
                  key={`${publication.storyId}:${publication.platform}:${index}`}
                  className={styles.ovwListItem}
                >
                  <span className={styles.ovwListPrimary}>
                    {publication.storyTitle}
                  </span>
                  <span className={styles.ovwListMeta}>
                    {`${publication.platform} · ${publication.status} · ${
                      publication.at ? formatDateTime(publication.at) : "no date"
                    }`}
                    {publication.permalink ? (
                      <>
                        {" · "}
                        <a
                          className={styles.ovwListLink}
                          href={publication.permalink}
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
          )}
        </SectionCard>

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
                  {health.aiResearchEnabled
                    ? "AI research collector enabled"
                    : "AI research collector off"}
                </span>
              </li>
              <li className={styles.ovwListItem}>
                <span className={styles.ovwListPrimary}>
                  {health.lastCollectionAt
                    ? `Last collection ${formatRelative(
                        health.lastCollectionAt,
                      )}`
                    : "No collection run yet"}
                </span>
                <span className={styles.ovwListMeta}>
                  {health.lastCollectionStatus
                    ? `status: ${health.lastCollectionStatus}` +
                      (health.lastFailedSources !== null
                        ? ` · ${health.lastFailedSources} failed sources`
                        : "")
                    : "run a collection from Topics & sources"}
                </span>
              </li>
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent activity"
          section={data?.activity}
          loading={isLoading}
          phase={phase}
          onRetry={load}
          emptyLabel="No recent activity for this topic."
        >
          {(activity) => (
            <ul className={styles.ovwList}>
              {activity.map((event) => (
                <li key={event.id} className={styles.ovwListItem}>
                  <span className={styles.ovwListPrimary}>{event.label}</span>
                  <span className={styles.ovwListMeta}>
                    {formatRelative(event.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
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
