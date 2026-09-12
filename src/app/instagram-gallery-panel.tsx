"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./creative-draft-workspace.generated.module.css";

type MetaConnectionState =
  | "disconnected"
  | "connected-without-insights"
  | "operational"
  | "needs-reconnect";

type MediaFormat = "image" | "carousel" | "reel" | "video";

type MediaItem = {
  id: string;
  externalId: string;
  format: MediaFormat;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  accessState: "accessible" | "inaccessible";
  childCount: number;
  linkState: "linked" | "pending";
  linkedStoryId: string | null;
  linkedStoryTitle: string | null;
  linkedDraftId: string | null;
  linkedDraftVersion: number | null;
  linkedBatchId: string | null;
  linkedAt: string | null;
  linkedBy: string | null;
  metrics: Record<string, MediaMetric> | null;
  metricsQueriedAt: string | null;
  metricsApiVersion: string | null;
  metricsError: string | null;
  metricsErroredAt: string | null;
  metricRatios: {
    savedPerReach?: number;
    sharesPerReach?: number;
    commentsPerReach?: number;
  } | null;
};

type MediaMetric = {
  value: number | null;
  state: "ok" | "unavailable" | "error";
  period: string | null;
  unit: string | null;
  error?: string;
};

type MetricsRefreshResult = {
  refreshed: number;
  failed: number;
  error?: string;
  queriedAt: string;
  item?: MediaItem;
};

type ApprovedStoryBrief = {
  id: string;
  title: string;
  publishedAt: string | null;
};

type LinkOptions = {
  stories: ApprovedStoryBrief[];
  suggestion?: { storyId: string; storyTitle: string };
};

type DraftOption = {
  id: string;
  format: string;
  status: string;
  version: number;
};

type BatchOption = {
  id: string;
  draftVersion: number;
  status: string;
  totalAssets: number;
  createdAt: string;
};

type MediaResponse = {
  state: MetaConnectionState;
  account: { igUsername: string | null } | null;
  lastMediaSyncAt: string | null;
  items: MediaItem[];
  nextCursor?: string;
};

type Filters = {
  format: MediaFormat | "";
  linked: "linked" | "pending" | "";
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = { format: "", linked: "", from: "", to: "" };

const FORMAT_LABEL: Record<MediaFormat, string> = {
  image: "Foto",
  carousel: "Carrusel",
  reel: "Reel",
  video: "Vídeo",
};

/**
 * IG-03 — read-only gallery of the topic's imported Instagram publications.
 * Data comes from IG-02's sync; there is no linking or metrics here yet.
 */
export function InstagramGalleryPanel({
  topicId,
  secret,
  disabled,
  refreshToken = 0,
  onLinked,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  /** Bumped by the connection panel after a sync / connect / disconnect. */
  refreshToken?: number;
  onLinked?: () => void;
}) {
  const [data, setData] = useState<MediaResponse>();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());
  // The in-flight request. A filter change / reload aborts it, so a late
  // "Load older" from the previous filter set never appends to the new list.
  const inFlight = useRef<AbortController | null>(null);
  const authenticated = secret.trim().length > 0;

  // Every path that starts a fresh first page: drops the previous list and
  // cursor (so "Load older" can't fire with a stale query's cursor) and marks
  // the reload in progress. These are event-handler calls, never effect-body
  // setState.
  const startReload = (next: Filters) => {
    setFilters(next);
    setItems([]);
    setCursor(undefined);
    setError(undefined);
    setReloading(true);
  };

  const retry = () => {
    setItems([]);
    setCursor(undefined);
    setError(undefined);
    setReloading(true);
    setReloadKey((key) => key + 1);
  };

  // Patch one card in place after a link change (IG-04) — no refetch, so
  // filters, cursor and scroll are untouched. If the card no longer matches an
  // active link filter, drop it from the list.
  const applyLinked = (updated: MediaItem) => {
    setItems((prev) => {
      const next = prev.map((entry) =>
        entry.externalId === updated.externalId ? updated : entry,
      );
      if (filters.linked === "linked" && updated.linkState !== "linked") {
        return next.filter((entry) => entry.externalId !== updated.externalId);
      }
      if (filters.linked === "pending" && updated.linkState !== "pending") {
        return next.filter((entry) => entry.externalId !== updated.externalId);
      }
      return next;
    });
  };

  const mediaUrl = useCallback(
    (next?: string) => {
      const url = new URL(
        `/api/radar/topics/${encodeURIComponent(topicId)}/meta/media`,
        window.location.origin,
      );
      if (filters.format) url.searchParams.set("format", filters.format);
      if (filters.linked) url.searchParams.set("linked", filters.linked);
      if (filters.from) url.searchParams.set("from", filters.from);
      if (filters.to) url.searchParams.set("to", filters.to);
      if (next) url.searchParams.set("cursor", next);
      return url.pathname + url.search;
    },
    [topicId, filters],
  );

  // An external refresh signal from the connection panel (after a sync /
  // disconnect / verify) gets the same protection as a filter change or Retry:
  // drop the list + cursor and block "Load older" before the reload lands.
  // Skips the initial mount (refreshToken starts at 0).
  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    retry();
  }, [refreshToken]);

  // First page: runs on mount, on any filter change, on Retry, and (via the
  // effect above bumping reloadKey) on an external refresh. No synchronous
  // setState in this effect body — state moves only inside the async callbacks.
  useEffect(() => {
    if (!authenticated || !topicId) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    requestJson<MediaResponse>(mediaUrl(), secret, {
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setItems(response.items);
        setCursor(response.nextCursor);
        setError(undefined);
        setReloading(false);
        // A fresh page may carry refreshed (un-expired) thumbnail URLs.
        setBrokenThumbs(new Set());
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(requestError));
          setReloading(false);
        }
      });
    return () => controller.abort();
  }, [authenticated, topicId, mediaUrl, secret, reloadKey]);

  const loadMore = () => {
    // No pagination while the first page is (re)loading — the cursor in state
    // belongs to the query that produced it, and a reload has cleared it.
    if (!cursor || loadingMore || reloading) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoadingMore(true);
    setError(undefined);
    requestJson<MediaResponse>(mediaUrl(cursor), secret, {
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setItems((prev) => [...prev, ...response.items]);
        setCursor(response.nextCursor);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getErrorMessage(requestError));
      })
      // Always clear the flag: an abort by a filter change must not leave the
      // button stuck disabled.
      .finally(() => setLoadingMore(false));
  };

  if (!authenticated) return null;

  const loading = !data && !error;
  const state = data?.state ?? "disconnected";
  // Only branch on connection state once a response actually says so; a failed
  // first load falls through to the error + Retry block below.
  const notConnected =
    data !== undefined && (data.state === "disconnected" || !data.account);
  const needsReconnect = data?.state === "needs-reconnect";

  return (
    <section
      className={styles.instagramGallery}
      aria-labelledby="instagram-gallery-title"
    >
      <header className={styles.instagramGalleryHeader}>
        <div>
          <strong id="instagram-gallery-title">Instagram publications</strong>
          <p className={styles.brandAssetHint}>
            {data?.account?.igUsername ? `@${data.account.igUsername}` : "—"}
            {data?.lastMediaSyncAt
              ? ` · last sync ${new Date(data.lastMediaSyncAt).toLocaleString()}`
              : " · not synced yet"}
          </p>
        </div>
        <span className={`${styles.metaStatusChip} ${toneClass(state)}`}>
          {stateLabel(state)}
        </span>
      </header>

      {loading ? (
        <p className={styles.brandAssetHint}>Loading publications…</p>
      ) : !data ? (
        <p className={styles.brandAssetHint}>
          {error}{" "}
          <button
            type="button"
            className={styles.instagramLink}
            onClick={retry}
          >
            Retry
          </button>
        </p>
      ) : notConnected ? (
        <p className={styles.brandAssetHint}>
          Connect this topic&rsquo;s Instagram account in the panel above, then
          use &ldquo;Sync publications&rdquo;.
        </p>
      ) : needsReconnect ? (
        <p className={styles.brandAssetHint}>
          The Instagram token needs to be reconnected before the gallery can
          load. Reconnect in the panel above.
        </p>
      ) : (
        <>
          <div className={styles.instagramFilters}>
            <label className={styles.field}>
              <span>Format</span>
              <select
                value={filters.format}
                disabled={disabled}
                onChange={(event) =>
                  startReload({
                    ...filters,
                    format: event.target.value as Filters["format"],
                  })
                }
              >
                <option value="">All</option>
                <option value="image">Photo</option>
                <option value="carousel">Carousel</option>
                <option value="reel">Reel</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Link</span>
              <select
                value={filters.linked}
                disabled={disabled}
                onChange={(event) =>
                  startReload({
                    ...filters,
                    linked: event.target.value as Filters["linked"],
                  })
                }
              >
                <option value="">All</option>
                <option value="linked">Linked</option>
                <option value="pending">Pending</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>From</span>
              <input
                type="date"
                value={filters.from}
                disabled={disabled}
                onChange={(event) =>
                  startReload({ ...filters, from: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span>To</span>
              <input
                type="date"
                value={filters.to}
                disabled={disabled}
                onChange={(event) =>
                  startReload({ ...filters, to: event.target.value })
                }
              />
            </label>
            {filters.format || filters.linked || filters.from || filters.to ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={disabled}
                onClick={() => startReload(EMPTY_FILTERS)}
              >
                Clear filters
              </button>
            ) : null}
          </div>

          {error ? (
            <p className={styles.brandAssetHint}>
              {error}{" "}
              <button
                type="button"
                className={styles.instagramLink}
                onClick={retry}
              >
                Retry
              </button>
            </p>
          ) : null}

          {reloading ? (
            <p className={styles.brandAssetHint}>Loading publications…</p>
          ) : items.length === 0 && !error ? (
            <p className={styles.brandAssetHint}>
              No publications match. Sync from the Instagram panel or clear the
              filters.
            </p>
          ) : (
            <ul className={styles.instagramGrid}>
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`${styles.instagramCard} ${
                    item.accessState === "inaccessible"
                      ? styles.instagramCardMuted
                      : ""
                  }`}
                >
                  {item.thumbnailUrl &&
                  !brokenThumbs.has(item.id) &&
                  item.accessState === "accessible" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={styles.instagramThumb}
                      src={item.thumbnailUrl}
                      alt={item.caption ?? "Instagram publication"}
                      loading="lazy"
                      onError={() =>
                        setBrokenThumbs((prev) => new Set(prev).add(item.id))
                      }
                    />
                  ) : (
                    <div className={styles.instagramThumbFallback} aria-hidden>
                      {item.accessState === "inaccessible"
                        ? "Unavailable on Instagram"
                        : "Thumbnail unavailable"}
                    </div>
                  )}
                  <div className={styles.instagramCardBody}>
                    <div className={styles.instagramCardMeta}>
                      <span className={styles.instagramBadge}>
                        {FORMAT_LABEL[item.format]}
                        {item.format === "carousel" && item.childCount > 0
                          ? ` · ${item.childCount}`
                          : ""}
                      </span>
                      <span className={styles.brandAssetHint}>
                        {new Date(item.publishedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {item.caption ? (
                      <p className={styles.instagramCaption}>{item.caption}</p>
                    ) : null}
                    <MediaLinkControl
                      topicId={topicId}
                      secret={secret}
                      disabled={disabled}
                      item={item}
                      onLinked={updated => { applyLinked(updated); onLinked?.(); }}
                    />
                    <MediaMetrics
                      topicId={topicId}
                      secret={secret}
                      disabled={disabled}
                      item={item}
                      onRefreshed={applyLinked}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {cursor && !reloading ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={disabled || loading || loadingMore || reloading}
              onClick={loadMore}
            >
              {loadingMore ? "Loading…" : "Load older"}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

const DRAFT_FORMAT_LABEL: Record<string, string> = {
  meme: "Meme",
  carousel: "Carousel",
  sequence: "Sequence",
};

function draftOptionLabel(draft: DraftOption): string {
  const format = DRAFT_FORMAT_LABEL[draft.format] ?? draft.format;
  const approved = draft.status === "approved" ? " · approved" : "";
  return `${format} · v${draft.version}${approved}`;
}

function batchOptionLabel(batch: BatchOption): string {
  const images =
    batch.totalAssets === 1 ? "1 image" : `${batch.totalAssets} images`;
  return `Batch v${batch.draftVersion} · ${images} · ${batch.status}`;
}

function linkUrl(topicId: string, query: Record<string, string>): string {
  const url = new URL(
    `/api/radar/topics/${encodeURIComponent(topicId)}/meta/media/link`,
    window.location.origin,
  );
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}

function metricsUrl(topicId: string): string {
  return `/api/radar/topics/${encodeURIComponent(topicId)}/meta/media/metrics`;
}

const METRIC_DISPLAY: { key: string; label: string; always: boolean }[] = [
  { key: "reach", label: "Reach", always: true },
  { key: "views", label: "Views", always: true },
  { key: "likes", label: "Likes", always: true },
  { key: "comments", label: "Comments", always: true },
  { key: "saved", label: "Saves", always: true },
  { key: "shares", label: "Shares", always: true },
  { key: "total_interactions", label: "Interactions", always: false },
  { key: "profile_visits", label: "Profile visits", always: false },
  { key: "follows", label: "Follows", always: false },
];

function metricPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function metricRatiosLabel(ratios: NonNullable<MediaItem["metricRatios"]>): string {
  const parts: string[] = [];
  if (ratios.savedPerReach != null) {
    parts.push(`Saves/reach ${metricPercent(ratios.savedPerReach)}`);
  }
  if (ratios.sharesPerReach != null) {
    parts.push(`Shares/reach ${metricPercent(ratios.sharesPerReach)}`);
  }
  if (ratios.commentsPerReach != null) {
    parts.push(`Comments/reach ${metricPercent(ratios.commentsPerReach)}`);
  }
  return parts.join(" · ");
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function MetricValue({ metric }: { metric: MediaMetric | undefined }) {
  if (!metric || metric.state === "unavailable") {
    return (
      <span
        className={styles.instagramMetricUnavailable}
        title="Not available for this publication"
      >
        —
      </span>
    );
  }
  if (metric.state === "error") {
    return (
      <span
        className={styles.instagramMetricError}
        title={metric.error ?? "The last refresh failed"}
      >
        {metric.value != null ? metric.value.toLocaleString() : "n/d"}
      </span>
    );
  }
  return (
    <span className={styles.instagramMetricValue}>
      {(metric.value ?? 0).toLocaleString()}
    </span>
  );
}

/**
 * Per-card metrics block (IG-05). Shows the persisted insights for one
 * publication with a per-metric state (real value incl. 0 / unavailable /
 * error keeping the last good value) and a "Refresh" that re-reads just this
 * one, patched in place. `null` metrics = never fetched (pending).
 */
function MediaMetrics({
  topicId,
  secret,
  disabled,
  item,
  onRefreshed,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  item: MediaItem;
  onRefreshed: (updated: MediaItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const inFlight = useRef<AbortController | null>(null);

  const refresh = () => {
    if (busy) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    setErr(undefined);
    requestJson<MetricsRefreshResult>(metricsUrl(topicId), secret, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId: item.externalId }),
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.error === "needs-reconnect") {
          setErr("Reconnect the account to refresh metrics.");
        } else if (result.error) {
          setErr(result.error);
        } else if (result.item) {
          onRefreshed(result.item);
        } else if (result.failed) {
          setErr("Could not read metrics for this publication.");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setErr(getErrorMessage(error));
      })
      .finally(() => setBusy(false));
  };

  const metrics = item.metrics;

  return (
    <div className={styles.instagramMetrics}>
      {metrics === null ? (
        <p className={styles.instagramMetricsHint}>No metrics fetched yet</p>
      ) : (
        <>
          <div className={styles.instagramMetricsGrid}>
            {METRIC_DISPLAY.filter(
              (entry) =>
                entry.always ||
                (metrics[entry.key] &&
                  metrics[entry.key].state !== "unavailable"),
            ).map((entry) => (
              <div key={entry.key} className={styles.instagramMetricCell}>
                <span className={styles.instagramMetricLabel}>
                  {entry.label}
                </span>
                <MetricValue metric={metrics[entry.key]} />
              </div>
            ))}
          </div>
          {item.metricRatios ? (
            <p className={styles.instagramMetricRatios}>
              {metricRatiosLabel(item.metricRatios)}
            </p>
          ) : null}
        </>
      )}
      <div className={styles.instagramCardMeta}>
        <span
          className={styles.instagramMetricsHint}
          title={item.metricsError ?? undefined}
        >
          {item.metricsQueriedAt
            ? `Updated ${relativeTime(item.metricsQueriedAt)}`
            : "Never refreshed"}
          {item.metricsError ? " · last refresh failed" : ""}
        </span>
        <button
          type="button"
          className={styles.instagramLink}
          disabled={disabled || busy}
          onClick={refresh}
        >
          {busy
            ? "Refreshing…"
            : metrics === null
              ? "Fetch metrics"
              : "Refresh"}
        </button>
      </div>
      {err ? <p className={styles.instagramMetricsHint}>{err}</p> : null}
    </div>
  );
}

/**
 * Per-card link control (IG-04). Collapsed: the link state plus a link/edit
 * button (and Remove when linked). Expanded: an inline form to pick the
 * approved story and, optionally, the draft and image batch that produced the
 * post. All requests reuse the module `requestJson`; state moves only in event
 * handlers and promise callbacks (no effect-body setState).
 */
function MediaLinkControl({
  topicId,
  secret,
  disabled,
  item,
  onLinked,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  item: MediaItem;
  onLinked: (updated: MediaItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [stories, setStories] = useState<ApprovedStoryBrief[]>([]);
  const [suggestion, setSuggestion] = useState<LinkOptions["suggestion"]>();
  const [drafts, setDrafts] = useState<DraftOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [storyId, setStoryId] = useState("");
  const [draftId, setDraftId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  // Guards the chained option fetches (stories → drafts → batches). Any newer
  // story/draft pick aborts the previous chain, so a slow earlier response can
  // never replace the current, valid options.
  const optionsAbort = useRef<AbortController | null>(null);

  const beginOptions = () => {
    optionsAbort.current?.abort();
    const controller = new AbortController();
    optionsAbort.current = controller;
    return controller.signal;
  };

  const loadDrafts = (nextStoryId: string, signal: AbortSignal) => {
    setDrafts([]);
    setBatches([]);
    if (!nextStoryId) return;
    requestJson<{ drafts: DraftOption[] }>(
      linkUrl(topicId, { storyId: nextStoryId }),
      secret,
      { signal },
    )
      .then((response) => {
        if (!signal.aborted) setDrafts(response.drafts);
      })
      .catch(() => {
        if (!signal.aborted) setDrafts([]);
      });
  };

  const loadBatches = (nextDraftId: string, signal: AbortSignal) => {
    setBatches([]);
    if (!nextDraftId) return;
    requestJson<{ batches: BatchOption[] }>(
      linkUrl(topicId, { draftId: nextDraftId }),
      secret,
      { signal },
    )
      .then((response) => {
        if (!signal.aborted) setBatches(response.batches);
      })
      .catch(() => {
        if (!signal.aborted) setBatches([]);
      });
  };

  const openForm = () => {
    setOpen(true);
    setErr(undefined);
    setLoadingOptions(true);
    setStoryId(item.linkedStoryId ?? "");
    setDraftId(item.linkedDraftId ?? "");
    setBatchId(item.linkedBatchId ?? "");
    setBy("");
    const signal = beginOptions();
    requestJson<LinkOptions>(
      linkUrl(topicId, { externalId: item.externalId }),
      secret,
      { signal },
    )
      .then((response) => {
        if (signal.aborted) return;
        setStories(response.stories);
        setSuggestion(response.suggestion);
        const preselect =
          item.linkedStoryId ?? response.suggestion?.storyId ?? "";
        setStoryId(preselect);
        if (preselect) loadDrafts(preselect, signal);
        if (item.linkedDraftId) loadBatches(item.linkedDraftId, signal);
      })
      .catch((error) => {
        if (!signal.aborted) setErr(getErrorMessage(error));
      })
      .finally(() => {
        if (!signal.aborted) setLoadingOptions(false);
      });
  };

  const closeForm = () => {
    optionsAbort.current?.abort();
    setOpen(false);
    setErr(undefined);
  };

  const submit = (nextStoryId: string | null) => {
    setBusy(true);
    setErr(undefined);
    requestJson<MediaItem>(linkUrl(topicId, {}), secret, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        externalId: item.externalId,
        storyId: nextStoryId,
        ...(nextStoryId
          ? { draftId: draftId || null, batchId: batchId || null }
          : {}),
        ...(by.trim() ? { by: by.trim() } : {}),
      }),
    })
      .then((updated) => {
        onLinked(updated);
        optionsAbort.current?.abort();
        setOpen(false);
      })
      .catch((error) => setErr(getErrorMessage(error)))
      .finally(() => setBusy(false));
  };

  const linked = item.linkState === "linked";

  return (
    <>
      <div className={styles.instagramCardMeta}>
        {linked ? (
          <span className={styles.instagramLinkChip}>
            ↪ {item.linkedStoryTitle ?? "Linked story"}
            {item.linkedDraftId
              ? ` · draft${
                  item.linkedDraftVersion ? ` v${item.linkedDraftVersion}` : ""
                }`
              : ""}
            {item.linkedBatchId ? " · with batch" : ""}
          </span>
        ) : (
          <span className={styles.instagramLinkPill}>Pending</span>
        )}
        {item.permalink ? (
          <a
            className={styles.instagramLink}
            href={item.permalink}
            target="_blank"
            rel="noreferrer"
          >
            View on Instagram
          </a>
        ) : null}
      </div>

      {!open ? (
        <div className={styles.instagramCardMeta}>
          <button
            type="button"
            className={styles.instagramLink}
            disabled={disabled}
            onClick={openForm}
          >
            {linked ? "Edit link" : "Link to story"}
          </button>
          {linked ? (
            <button
              type="button"
              className={styles.instagramLink}
              disabled={disabled || busy}
              onClick={() => submit(null)}
            >
              Remove link
            </button>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className={styles.instagramLinkForm}>
          {loadingOptions ? (
            <p className={styles.brandAssetHint}>Loading stories…</p>
          ) : (
            <>
              <label className={styles.field}>
                <span>Approved story</span>
                <select
                  value={storyId}
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStoryId(value);
                    setDraftId("");
                    setBatchId("");
                    loadDrafts(value, beginOptions());
                  }}
                >
                  <option value="">Select…</option>
                  {stories.map((story) => (
                    <option key={story.id} value={story.id}>
                      {story.title}
                    </option>
                  ))}
                </select>
              </label>
              {suggestion && suggestion.storyId === storyId ? (
                <span className={styles.instagramLinkSuggested}>
                  Suggested from the registered URL
                </span>
              ) : null}
              {drafts.length > 0 ? (
                <label className={styles.field}>
                  <span>Draft (optional)</span>
                  <select
                    value={draftId}
                    disabled={busy}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraftId(value);
                      setBatchId("");
                      loadBatches(value, beginOptions());
                    }}
                  >
                    <option value="">No draft</option>
                    {drafts.map((draft) => (
                      <option key={draft.id} value={draft.id}>
                        {draftOptionLabel(draft)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {draftId && batches.length > 0 ? (
                <label className={styles.field}>
                  <span>Image batch (optional)</span>
                  <select
                    value={batchId}
                    disabled={busy}
                    onChange={(event) => setBatchId(event.target.value)}
                  >
                    <option value="">No batch</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batchOptionLabel(batch)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={styles.field}>
                <span>Your name (optional)</span>
                <input
                  type="text"
                  value={by}
                  disabled={busy}
                  maxLength={200}
                  onChange={(event) => setBy(event.target.value)}
                />
              </label>
              <div className={styles.instagramLinkActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy || !storyId}
                  onClick={() => submit(storyId)}
                >
                  {busy ? "Saving…" : "Link"}
                </button>
                <button
                  type="button"
                  className={styles.instagramLink}
                  disabled={busy}
                  onClick={closeForm}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
          {err ? <p className={styles.brandAssetHint}>{err}</p> : null}
        </div>
      ) : null}
    </>
  );
}

function toneClass(state: MetaConnectionState): string {
  switch (state) {
    case "operational":
      return styles.metaStatusConnected;
    case "connected-without-insights":
      return styles.metaStatusWarning;
    case "needs-reconnect":
      return styles.metaStatusError;
    default:
      return "";
  }
}

function stateLabel(state: MetaConnectionState): string {
  switch (state) {
    case "operational":
      return "Connected";
    case "connected-without-insights":
      return "Connected · insights not verified";
    case "needs-reconnect":
      return "Reconnect needed";
    default:
      return "Not connected";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred";
}

async function requestJson<T>(
  input: string,
  secret: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret.trim()}`);
  const response = await fetch(input, { ...init, cache: "no-store", headers });
  const payload = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}
