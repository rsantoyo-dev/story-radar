/**
 * Pure parsing + helpers for the per-publication Instagram media insights
 * response (IG-05): `GET /{ig-media-id}/insights?metric=…&metric_type=total_value`.
 * Split out of meta-graph-client.ts (which needs "server-only") so it stays
 * directly unit-testable, the same split as instagram-media-response.ts and
 * instagram-insights-response.ts.
 *
 * A body that is not a `{ data: [...] }` envelope is malformed and throws — a
 * 200 with a broken shape must not be recorded as a successful refresh. Within
 * a well-formed envelope, a requested metric that Instagram simply did not
 * return is reported as `"unavailable"` (the API does not offer it for that
 * resource), which the UI shows differently from a real zero.
 */

import { MetaGraphApiError } from "./meta-token-response";

export const INSTAGRAM_MEDIA_INSIGHT_METRICS = [
  "reach",
  "views",
  "likes",
  "comments",
  "saved",
  "shares",
  "total_interactions",
  "profile_visits",
  "follows",
] as const;
export type InstagramMediaInsightMetric =
  (typeof INSTAGRAM_MEDIA_INSIGHT_METRICS)[number];

/** Notional unit for each metric — Graph's `total_value` responses carry none. */
export const INSTAGRAM_MEDIA_INSIGHT_UNIT: Record<string, "accounts" | "count"> =
  {
    reach: "accounts",
    profile_visits: "accounts",
    follows: "accounts",
  };

export function instagramMediaInsightUnit(metric: string): "accounts" | "count" {
  return INSTAGRAM_MEDIA_INSIGHT_UNIT[metric] ?? "count";
}

export type ParsedInstagramMediaMetric = {
  value: number | null;
  state: "ok" | "unavailable";
  period: string | null;
  unit: "accounts" | "count";
};

/**
 * Reads one media-insights envelope. `requested` is the metric list that was
 * asked for; every one gets an entry — `"ok"` with a numeric value when the
 * API returned it, `"unavailable"` when it did not.
 */
export function parseInstagramMediaInsights(
  payload: unknown,
  requested: readonly string[],
): Record<string, ParsedInstagramMediaMetric> {
  const body = asRecord(payload);
  if (!body || !Array.isArray(body.data)) {
    throw new MetaGraphApiError(
      "Instagram returned 200 but the media insights response was not in the expected shape",
      200,
      payload,
    );
  }

  const returned = new Map<string, ParsedInstagramMediaMetric>();
  for (const entry of body.data) {
    const node = asRecord(entry);
    const name = asNonEmptyString(node?.name);
    if (!node || !name) continue;
    const value = readMetricValue(node);
    if (value === undefined) continue;
    returned.set(name, {
      value,
      state: "ok",
      period: asNonEmptyString(node.period) ?? null,
      unit: instagramMediaInsightUnit(name),
    });
  }

  const out: Record<string, ParsedInstagramMediaMetric> = {};
  for (const metric of requested) {
    out[metric] =
      returned.get(metric) ??
      ({
        value: null,
        state: "unavailable",
        period: null,
        unit: instagramMediaInsightUnit(metric),
      } satisfies ParsedInstagramMediaMetric);
  }
  return out;
}

export type MetricRatios = {
  savedPerReach?: number;
  sharesPerReach?: number;
  commentsPerReach?: number;
};

type RatioMetricInput = { value: number | null; state: string } | undefined;

/**
 * saves/reach, shares/reach and comments/reach — only when `reach` is a real
 * value greater than zero and the numerator is itself a real value. Returns
 * null when reach is unusable or none of the three ratios can be computed.
 */
export function computeMetricRatios(
  metrics: Record<string, RatioMetricInput> | null | undefined,
): MetricRatios | null {
  const reach = metrics?.reach;
  if (!reach || reach.state !== "ok" || !reach.value || reach.value <= 0) {
    return null;
  }
  const ratios: MetricRatios = {};
  const num = (key: string): number | undefined => {
    const metric = metrics?.[key];
    if (!metric || metric.state !== "ok" || typeof metric.value !== "number") {
      return undefined;
    }
    return metric.value / (reach.value as number);
  };
  const saved = num("saved");
  const shares = num("shares");
  const comments = num("comments");
  if (saved !== undefined) ratios.savedPerReach = saved;
  if (shares !== undefined) ratios.sharesPerReach = shares;
  if (comments !== undefined) ratios.commentsPerReach = comments;
  return Object.keys(ratios).length > 0 ? ratios : null;
}

/**
 * When a media-insights request 400s because one metric is not valid for that
 * media type, Graph names the offending metric in the message — but the message
 * usually also enumerates the *allowed* metrics ("must be one of the following
 * values: reach, views, …"). That list is dropped before scanning so an allowed
 * alternative is never mistaken for the offender. Only a name in `candidates`
 * (the set actually requested) is returned; null when nothing is recognizable.
 */
export function unsupportedMetricFromGraphError(
  graphError: unknown,
  candidates: readonly string[] = INSTAGRAM_MEDIA_INSIGHT_METRICS,
): string | null {
  const message = extractMessage(graphError);
  if (!message) return null;
  const head = message
    .toLowerCase()
    .split(
      /one of the following|following (?:values|metrics)|allowed (?:values|metrics)|available metrics/,
    )[0];
  for (const metric of candidates) {
    if (new RegExp(`\\b${metric}\\b`).test(head)) return metric;
  }
  return null;
}

/**
 * The metric value regardless of response shape: `metric_type=total_value`
 * gives `total_value: { value }`; the classic time series gives
 * `values: [{ value, end_time }]` (the latest entry is the current total).
 */
function readMetricValue(node: Record<string, unknown>): number | undefined {
  const total = asRecord(node.total_value);
  if (
    total &&
    typeof total.value === "number" &&
    Number.isFinite(total.value)
  ) {
    return total.value;
  }
  if (Array.isArray(node.values)) {
    for (let i = node.values.length - 1; i >= 0; i -= 1) {
      const entry = asRecord(node.values[i]);
      if (
        entry &&
        typeof entry.value === "number" &&
        Number.isFinite(entry.value)
      ) {
        return entry.value;
      }
    }
  }
  return undefined;
}

function extractMessage(graphError: unknown): string | undefined {
  const record = asRecord(graphError);
  if (!record) return undefined;
  const nested = asRecord(record.error);
  return (
    asNonEmptyString(nested?.message) ??
    asNonEmptyString(record.message) ??
    asNonEmptyString(record.error_message)
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
