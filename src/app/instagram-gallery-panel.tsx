"use client";

import { useCallback, useEffect, useState } from "react";

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
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
}) {
  const [data, setData] = useState<MediaResponse>();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());
  const authenticated = secret.trim().length > 0;

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

  // First page: runs on mount, on any filter change, and on Retry. No
  // synchronous setState in the effect body — state moves only inside the
  // async callbacks (same shape as MetaConnectionPanel).
  useEffect(() => {
    if (!authenticated || !topicId) return;
    const controller = new AbortController();
    requestJson<MediaResponse>(mediaUrl(), secret, {
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setItems(response.items);
        setCursor(response.nextCursor);
        setError(undefined);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(requestError));
        }
      });
    return () => controller.abort();
  }, [authenticated, topicId, mediaUrl, secret, reloadKey]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(undefined);
    requestJson<MediaResponse>(mediaUrl(cursor), secret)
      .then((response) => {
        setData(response);
        setItems((prev) => [...prev, ...response.items]);
        setCursor(response.nextCursor);
      })
      .catch((requestError) => setError(getErrorMessage(requestError)))
      .finally(() => setLoadingMore(false));
  };

  const loading = authenticated && !data && !error;

  if (!authenticated) return null;

  const state = data?.state ?? "disconnected";
  const notConnected =
    state === "disconnected" || (!data?.account && state !== "operational");
  const needsReconnect = state === "needs-reconnect";

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

      {notConnected ? (
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
                  setFilters((f) => ({
                    ...f,
                    format: event.target.value as Filters["format"],
                  }))
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
                  setFilters((f) => ({
                    ...f,
                    linked: event.target.value as Filters["linked"],
                  }))
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
                  setFilters((f) => ({ ...f, from: event.target.value }))
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
                  setFilters((f) => ({ ...f, to: event.target.value }))
                }
              />
            </label>
            {filters.format || filters.linked || filters.from || filters.to ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={disabled}
                onClick={() => setFilters(EMPTY_FILTERS)}
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
                onClick={() => {
                  setError(undefined);
                  setReloadKey((key) => key + 1);
                }}
              >
                Retry
              </button>
            </p>
          ) : null}

          {loading ? (
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
                    <div className={styles.instagramCardMeta}>
                      <span
                        className={`${styles.instagramLinkPill} ${
                          item.linkState === "linked"
                            ? styles.instagramLinkPillOn
                            : ""
                        }`}
                      >
                        {item.linkState === "linked" ? "Linked" : "Pending"}
                      </span>
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
                  </div>
                </li>
              ))}
            </ul>
          )}

          {cursor ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={disabled || loading || loadingMore}
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
