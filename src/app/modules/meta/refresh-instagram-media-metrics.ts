import "server-only";

import {
  fetchInstagramMediaInsights,
  GRAPH_API_VERSION,
  MetaGraphApiError,
} from "./meta-graph-client";
import {
  INSTAGRAM_MEDIA_INSIGHT_METRICS,
  parseInstagramMediaInsights,
  unsupportedMetricFromGraphError,
} from "./instagram-media-insights-response";
import {
  classifyMetaGraphError,
  describeMetaVerificationError,
} from "./meta-verification";
import {
  getInstagramHistoryCredentials,
  getInstagramHistoryStatus,
  recordInstagramHistoryAuthFailure,
  type InstagramHistoryCredentials,
} from "./instagram-history-account";
import {
  listInstagramMediaForMetricsRefresh,
  saveInstagramMediaMetrics,
  type InstagramMediaListItem,
} from "./topic-instagram-media.repository";

export class InstagramMediaMetricsError extends Error {}

export type InstagramMediaMetricsRefreshResult = {
  /** Publications whose metrics were (at least partially) refreshed. */
  refreshed: number;
  /** Publications whose refresh failed; their previous values are kept. */
  failed: number;
  /** Set when the whole run stopped early: `"needs-reconnect"`, or a missing insights permission. */
  error?: string;
  queriedAt: string;
  /** The fresh item — only for the single-publication form. */
  item?: InstagramMediaListItem;
};

type Account = InstagramHistoryCredentials;

/** Shown to the editor when Meta refuses insights for the whole account. */
export const INSIGHTS_PERMISSION_MESSAGE =
  "Meta did not grant permission to read Instagram insights. For a Facebook Page connection, add instagram_manage_insights to the app's Facebook Login configuration and reconnect the Page; for a direct Instagram connection, reconnect and allow insights.";

/**
 * Reads current Instagram insights for a topic's publications (IG-05) and
 * stores them. With `externalId`, refreshes that one and returns the fresh
 * item; otherwise refreshes the most-recent accessible publications (capped).
 *
 * Like `syncInstagramMediaPage`, a Graph failure is a result, not a thrown
 * route error: a per-publication failure increments `failed` and keeps that
 * publication's last good values; an auth failure marks the connection
 * needs-reconnect and stops the run with `error: "needs-reconnect"`.
 */
export async function refreshInstagramMediaMetrics(
  topicId: string,
  options: { externalId?: string; externalIds?: readonly string[]; limit?: number } = {},
): Promise<InstagramMediaMetricsRefreshResult> {
  const account = await getInstagramHistoryCredentials(topicId);
  if (!account) {
    throw new InstagramMediaMetricsError(
      "This topic has no connected Instagram account",
    );
  }

  const queriedAt = new Date();
  const at = queriedAt.toISOString();

  const status = await getInstagramHistoryStatus(topicId);
  if (status.state === "needs-reconnect") {
    return { refreshed: 0, failed: 0, error: "needs-reconnect", queriedAt: at };
  }

  const externalIds = options.externalId
    ? [options.externalId]
    : options.externalIds
    ? [...options.externalIds]
    : (
        await listInstagramMediaForMetricsRefresh(
          topicId,
          account.igUserId,
          Math.min(options.limit ?? 25, 50),
        )
      ).map((target) => target.externalId);

  let refreshed = 0;
  let failed = 0;
  let lastItem: InstagramMediaListItem | undefined;

  for (const externalId of externalIds) {
    const outcome = await refreshOne(topicId, account, externalId, queriedAt);
    if (outcome === "auth") {
      return { refreshed, failed, error: "needs-reconnect", queriedAt: at };
    }
    // Refused before anything succeeded: the account lacks the grant. After a
    // success it is one publication Meta will not report on; keep going.
    if (outcome === "permission" && refreshed === 0) {
      return { refreshed, failed, error: INSIGHTS_PERMISSION_MESSAGE, queriedAt: at };
    }
    if (outcome === "permission") {
      failed += 1;
      continue;
    }
    if (outcome.ok) {
      refreshed += 1;
      if (outcome.item) lastItem = outcome.item;
    } else {
      failed += 1;
    }
  }

  return {
    refreshed,
    failed,
    queriedAt: at,
    ...(options.externalId && lastItem ? { item: lastItem } : {}),
  };
}

async function refreshOne(
  topicId: string,
  account: Account,
  externalId: string,
  queriedAt: Date,
): Promise<"auth" | "permission" | { ok: boolean; item?: InstagramMediaListItem }> {
  let candidates: string[] = [...INSTAGRAM_MEDIA_INSIGHT_METRICS];

  // Each iteration returns, or drops exactly one unsupported metric and retries.
  for (let i = 0; i <= INSTAGRAM_MEDIA_INSIGHT_METRICS.length; i += 1) {
    if (candidates.length === 0) break;
    try {
      const payload = await fetchInstagramMediaInsights(
        externalId,
        account.accessToken,
        candidates,
        account.host,
      );
      const ok = parseInstagramMediaInsights(payload, candidates);
      const item = await saveInstagramMediaMetrics({
        topicId,
        igUserId: account.igUserId,
        externalId,
        result: { ok, apiVersion: GRAPH_API_VERSION },
        queriedAt,
      });
      return item ? { ok: true, item } : { ok: false };
    } catch (error) {
      const graphError =
        error instanceof MetaGraphApiError ? error.graphError : undefined;

      const kind = classifyMetaGraphError(graphError);
      if (kind === "auth") {
        await recordInstagramHistoryAuthFailure(topicId, account, describeMetaVerificationError(
          graphError,
          "The Instagram token was rejected while reading metrics",
        ));
        return "auth";
      }
      // A missing insights grant covers every publication: stop the run and
      // keep each publication's last good values instead of marking them failed.
      if (kind === "permission") return "permission";

      const status =
        error instanceof MetaGraphApiError ? error.status : undefined;
      const unsupported =
        status === 400
          ? unsupportedMetricFromGraphError(graphError, candidates)
          : null;
      // Never drop `reach` (valid for every media type, and the ratio
      // denominator) nor the last remaining candidate — fall through to the
      // per-publication error instead of blinding ourselves.
      if (
        unsupported &&
        unsupported !== "reach" &&
        candidates.length > 1 &&
        candidates.includes(unsupported)
      ) {
        candidates = candidates.filter((metric) => metric !== unsupported);
        continue;
      }

      console.error(
        `Instagram media metrics refresh failed for ${externalId}`,
        error,
      );
      await saveInstagramMediaMetrics({
        topicId,
        igUserId: account.igUserId,
        externalId,
        result: {
          error: describeMetaVerificationError(
            graphError,
            error instanceof Error ? error.message : "Could not read metrics",
          ),
        },
        queriedAt,
      });
      return { ok: false };
    }
  }

  await saveInstagramMediaMetrics({
    topicId,
    igUserId: account.igUserId,
    externalId,
    result: { error: "No supported metric could be read for this publication" },
    queriedAt,
  });
  return { ok: false };
}
