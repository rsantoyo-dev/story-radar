"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./creative-draft-workspace.generated.module.css";

type MetaConnectionState =
  | "disconnected"
  | "connected-without-insights"
  | "operational"
  | "needs-reconnect";

type MediaMetric = {
  value: number | null;
  state: "ok" | "unavailable" | "error";
  period: string | null;
  unit: string | null;
  error?: string;
};

type StoryPost = {
  id: string;
  externalId: string;
  format: "image" | "carousel" | "reel" | "video";
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  accessState: "accessible" | "inaccessible";
  childCount: number;
  metrics: Record<string, MediaMetric> | null;
  metricRatios: {
    savedPerReach?: number;
    sharesPerReach?: number;
    commentsPerReach?: number;
  } | null;
  creativeVersion: {
    draftId: string;
    draftVersion: number | null;
    batchId: string | null;
    status: string;
    label: string;
  } | null;
};

type StoryInstagramResponse = {
  connectionState: MetaConnectionState;
  account: { igUsername: string | null } | null;
  posts: StoryPost[];
};

type PendingItem = {
  externalId: string;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  format: StoryPost["format"];
  accessState: "accessible" | "inaccessible";
  childCount: number;
};

const FORMAT_LABEL: Record<StoryPost["format"], string> = {
  image: "Photo",
  carousel: "Carousel",
  reel: "Reel",
  video: "Video",
};

const METRIC_ROW: { key: string; label: string }[] = [
  { key: "reach", label: "Reach" },
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "saved", label: "Saves" },
  { key: "shares", label: "Shares" },
];

/**
 * IG-06 — the Instagram publications linked to this story, shown inside Creative
 * Studio. Read-only display + a picker to link an imported publication when the
 * story has none yet. Deliberately shows no cross-post reach total.
 */
export function StoryInstagramResults({
  topicId,
  storyId,
  secret,
  disabled,
  onNavigateToDraft,
  onGoToConnectionPanel,
}: {
  topicId: string;
  storyId: string;
  secret: string;
  disabled: boolean;
  onNavigateToDraft: (draftId: string) => void;
  onGoToConnectionPanel: () => void;
}) {
  const [data, setData] = useState<StoryInstagramResponse>();
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>();
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string>();
  const [busyExternalId, setBusyExternalId] = useState<string>();
  const inFlight = useRef<AbortController | null>(null);
  const authenticated = secret.trim().length > 0;

  // No synchronous setState in the effect body — state moves only in the
  // async callbacks (and, for `reloading`, in the `reload` handler).
  useEffect(() => {
    if (!authenticated) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    requestJson<StoryInstagramResponse>(
      storyInstagramUrl(topicId, storyId),
      secret,
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setError(undefined);
        setReloading(false);
        setBroken(new Set());
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(requestError));
          setReloading(false);
        }
      });
    return () => controller.abort();
  }, [authenticated, topicId, storyId, secret, reloadKey]);

  const reload = () => {
    setError(undefined);
    setReloading(true);
    setReloadKey((key) => key + 1);
  };

  const loading = (!data && !error) || reloading;

  const openPicker = () => {
    setPickerOpen(true);
    setPickerError(undefined);
    setPendingLoading(true);
    requestJson<{ items: PendingItem[] }>(pendingMediaUrl(topicId), secret)
      .then((response) => setPending(response.items))
      .catch((requestError) => setPickerError(getErrorMessage(requestError)))
      .finally(() => setPendingLoading(false));
  };

  const linkPending = (externalId: string) => {
    if (busyExternalId) return;
    setBusyExternalId(externalId);
    setPickerError(undefined);
    requestJson<unknown>(mediaLinkUrl(topicId), secret, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId, storyId }),
    })
      .then(() => {
        setPickerOpen(false);
        setPending(undefined);
        setReloadKey((key) => key + 1);
      })
      .catch((requestError) => setPickerError(getErrorMessage(requestError)))
      .finally(() => setBusyExternalId(undefined));
  };

  if (!authenticated) return null;

  const posts = data?.posts ?? [];
  const markBroken = (id: string) =>
    setBroken((prev) => new Set(prev).add(id));

  return (
    <div className={styles.storyInstagramResults}>
      <div className={styles.storyInstagramPostMeta}>
        <strong>Instagram results</strong>
        <span className={styles.brandAssetHint}>
          {loading
            ? "Loading…"
            : `${posts.length} linked publication${posts.length === 1 ? "" : "s"}`}{" "}
          <button
            type="button"
            className={styles.instagramLink}
            disabled={disabled || loading}
            onClick={reload}
          >
            Refresh
          </button>
        </span>
      </div>

      {loading ? (
        <p className={styles.brandAssetHint}>Loading Instagram results…</p>
      ) : error ? (
        <p className={styles.brandAssetHint}>
          {error}{" "}
          <button type="button" className={styles.instagramLink} onClick={reload}>
            Retry
          </button>
        </p>
      ) : posts.length === 0 ? (
        <div className={styles.storyInstagramPicker}>
          {data?.account ? (
            <>
              <p className={styles.brandAssetHint}>
                No Instagram publications are linked to this story yet.
              </p>
              {!pickerOpen ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={disabled}
                  onClick={openPicker}
                >
                  Link a publication
                </button>
              ) : pendingLoading ? (
                <p className={styles.brandAssetHint}>
                  Loading imported publications…
                </p>
              ) : (pending ?? []).length === 0 ? (
                <p className={styles.brandAssetHint}>
                  No unlinked imported publications. Sync from the Instagram
                  panel first.
                </p>
              ) : (
                <>
                  {(pending ?? []).map((item) => (
                    <div
                      key={item.externalId}
                      className={styles.storyInstagramPickerItem}
                    >
                      <Thumb
                        id={item.externalId}
                        url={item.thumbnailUrl}
                        accessState={item.accessState}
                        broken={broken}
                        onBroken={markBroken}
                        alt={item.caption ?? "Instagram publication"}
                      />
                      <span className={styles.instagramCaption}>
                        {item.caption ?? "(no caption)"} ·{" "}
                        {new Date(item.publishedAt).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        className={styles.instagramLink}
                        disabled={Boolean(busyExternalId)}
                        onClick={() => linkPending(item.externalId)}
                      >
                        {busyExternalId === item.externalId
                          ? "Linking…"
                          : "Link"}
                      </button>
                    </div>
                  ))}
                  {pickerError ? (
                    <p className={styles.brandAssetHint}>{pickerError}</p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.instagramLink}
                    onClick={() => setPickerOpen(false)}
                  >
                    Cancel
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <p className={styles.brandAssetHint}>
                Connect an Instagram account for this topic to link its
                publications.
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onGoToConnectionPanel}
              >
                Go to Instagram
              </button>
            </>
          )}
        </div>
      ) : (
        <ul className={styles.storyInstagramList}>
          {posts.map((post) => (
            <li key={post.id} className={styles.storyInstagramPost}>
              <Thumb
                id={post.id}
                url={post.thumbnailUrl}
                accessState={post.accessState}
                broken={broken}
                onBroken={markBroken}
                alt={post.caption ?? "Instagram publication"}
              />
              <div className={styles.storyInstagramPostBody}>
                <div className={styles.storyInstagramPostMeta}>
                  <span className={styles.instagramBadge}>
                    {FORMAT_LABEL[post.format]}
                    {post.format === "carousel" && post.childCount > 0
                      ? ` · ${post.childCount}`
                      : ""}
                  </span>
                  <span className={styles.brandAssetHint}>
                    {new Date(post.publishedAt).toLocaleDateString()}
                  </span>
                </div>

                <PostMetrics post={post} />

                <div className={styles.storyInstagramPostMeta}>
                  {post.creativeVersion ? (
                    <span className={styles.storyInstagramVersionChip}>
                      {post.creativeVersion.label}
                      <button
                        type="button"
                        className={styles.instagramLink}
                        disabled={disabled}
                        onClick={() =>
                          onNavigateToDraft(post.creativeVersion!.draftId)
                        }
                      >
                        View version
                      </button>
                    </span>
                  ) : (
                    <span className={styles.storyInstagramVersionMissing}>
                      Unidentified version
                    </span>
                  )}
                  {post.permalink ? (
                    <a
                      className={styles.instagramLink}
                      href={post.permalink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on Instagram
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({
  id,
  url,
  accessState,
  broken,
  onBroken,
  alt,
}: {
  id: string;
  url: string | null;
  accessState: "accessible" | "inaccessible";
  broken: Set<string>;
  onBroken: (id: string) => void;
  alt: string;
}) {
  if (url && accessState === "accessible" && !broken.has(id)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={styles.instagramThumb}
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => onBroken(id)}
      />
    );
  }
  return (
    <div className={styles.instagramThumbFallback} aria-hidden>
      {accessState === "inaccessible"
        ? "Unavailable on Instagram"
        : "Thumbnail unavailable"}
    </div>
  );
}

function PostMetrics({ post }: { post: StoryPost }) {
  if (!post.metrics) {
    return <p className={styles.brandAssetHint}>No metrics fetched yet</p>;
  }
  const metrics = post.metrics;
  return (
    <>
      <div className={styles.instagramMetricsGrid}>
        {METRIC_ROW.map(({ key, label }) => (
          <div key={key} className={styles.instagramMetricCell}>
            <span className={styles.instagramMetricLabel}>{label}</span>
            <MetricValue metric={metrics[key]} />
          </div>
        ))}
      </div>
      {post.metricRatios ? (
        <p className={styles.instagramMetricRatios}>
          {ratiosLabel(post.metricRatios)}
        </p>
      ) : null}
    </>
  );
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

function ratiosLabel(
  ratios: NonNullable<StoryPost["metricRatios"]>,
): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const parts: string[] = [];
  if (ratios.savedPerReach != null) {
    parts.push(`Saves/reach ${pct(ratios.savedPerReach)}`);
  }
  if (ratios.sharesPerReach != null) {
    parts.push(`Shares/reach ${pct(ratios.sharesPerReach)}`);
  }
  if (ratios.commentsPerReach != null) {
    parts.push(`Comments/reach ${pct(ratios.commentsPerReach)}`);
  }
  return parts.join(" · ");
}

function storyInstagramUrl(topicId: string, storyId: string): string {
  return `/api/radar/stories/${encodeURIComponent(storyId)}/instagram?topicId=${encodeURIComponent(topicId)}`;
}

function pendingMediaUrl(topicId: string): string {
  return `/api/radar/topics/${encodeURIComponent(topicId)}/meta/media?linked=pending&limit=12`;
}

function mediaLinkUrl(topicId: string): string {
  return `/api/radar/topics/${encodeURIComponent(topicId)}/meta/media/link`;
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
