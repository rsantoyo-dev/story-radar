/**
 * Instagram history read to measure and improve (2026-10-15): a topic's
 * posts with their metric snapshots, read as values at the same ages (24 h,
 * 72 h, 7 d…) so posts of different days compare, and the Draft 2 metadata
 * that made each post (its hook lever, narrative form, structure). Values
 * are observed; a breakdown is a correlation over few posts, never a cause.
 * Everything here is pure: the dashboard computes each view from one payload.
 */
export const INSIGHT_METRICS = ["views", "reach", "total_interactions", "likes", "comments", "saved", "shares", "follows", "profile_visits"] as const;
export type InsightMetricKey = (typeof INSIGHT_METRICS)[number];
/** Rates per account reached: what share of the people who saw a post acted on it. */
export const INSIGHT_RATES = ["engagement_rate", "save_rate", "share_rate"] as const;
export type InsightRateKey = (typeof INSIGHT_RATES)[number];
export type InsightKey = InsightMetricKey | InsightRateKey;

export const INSIGHT_LABEL: Record<InsightKey, string> = {
  views: "Views", reach: "Reach", total_interactions: "Interactions", likes: "Likes", comments: "Comments", saved: "Saves", shares: "Shares",
  follows: "Follows", profile_visits: "Profile visits", engagement_rate: "Engagement rate", save_rate: "Save rate", share_rate: "Share rate",
};
const RATE_PARTS: Record<InsightRateKey, InsightMetricKey> = { engagement_rate: "total_interactions", save_rate: "saved", share_rate: "shares" };
export const isRate = (key: InsightKey): key is InsightRateKey => (INSIGHT_RATES as readonly string[]).includes(key);

/** Where a post is read: its latest reading, or its value at an age in hours (interpolated between snapshots). */
export type InsightAt = "latest" | 24 | 72 | 168;
export const INSIGHT_AT_LABEL: Record<string, string> = { latest: "Latest", 24: "At 24 h", 72: "At 72 h", 168: "At 7 days" };
/** The growth curve's points, in hours since publication. */
export const INSIGHT_CURVE_AGES = [0, 6, 12, 24, 36, 48, 72, 96, 120, 144, 168] as const;

export type InsightValues = Partial<Record<InsightMetricKey, number>>;
export type InsightSnapshot = { ageHours: number; values: InsightValues };
export type InsightDraft2 = { sessionId: string; lever?: string; leverName?: string; narrative?: string; structure?: string; cover?: string };
export type InsightPost = {
  id: string;
  externalId: string;
  permalink: string | null;
  caption: string | null;
  imageUrl: string | null;
  publishedAt: string;
  format: string;
  storyId: string | null;
  storyTitle: string | null;
  /** The last reading Instagram gave. */
  latest: InsightValues;
  /** Readings over the post's life, oldest first. */
  snapshots: InsightSnapshot[];
  draft2?: InsightDraft2;
};
export type InstagramInsights = { account: { igUsername: string | null } | null; posts: InsightPost[]; capturedAt: string };

/** The values of a stored metrics record ({ views: { state: "ok", value } }), the ones Instagram gave. */
export function insightValues(metrics: unknown): InsightValues {
  const values: InsightValues = {};
  if (!metrics || typeof metrics !== "object") return values;
  for (const key of INSIGHT_METRICS) {
    const entry = (metrics as Record<string, unknown>)[key] as { state?: unknown; value?: unknown } | undefined;
    if (entry && entry.state === "ok" && typeof entry.value === "number" && Number.isFinite(entry.value)) values[key] = entry.value;
  }
  return values;
}

/** A count at an age: 0 at publication, then each reading, linear between two; unknown past the last reading. */
function countAt(post: Pick<InsightPost, "snapshots">, key: InsightMetricKey, age: number): number | null {
  const points = [{ ageHours: 0, value: 0 }, ...post.snapshots.flatMap((snapshot) => snapshot.values[key] === undefined ? [] : [{ ageHours: snapshot.ageHours, value: snapshot.values[key]! }])];
  if (points.length < 2) return null;
  const after = points.findIndex((point) => point.ageHours >= age);
  if (after === -1) return null;
  const right = points[after];
  if (right.ageHours === age || after === 0) return right.value;
  const left = points[after - 1];
  return left.value + (right.value - left.value) * ((age - left.ageHours) / (right.ageHours - left.ageHours));
}

/** A post's value of a key where it is read; a rate needs some reach. */
export function insightValue(post: Pick<InsightPost, "latest" | "snapshots">, key: InsightKey, at: InsightAt): number | null {
  const count = (metric: InsightMetricKey) => at === "latest" ? post.latest[metric] ?? post.snapshots.at(-1)?.values[metric] ?? null : countAt(post, metric, at);
  if (!isRate(key)) return count(key);
  const reach = count("reach");
  const part = count(RATE_PARTS[key]);
  return reach && part !== null ? part / reach : null;
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A post's growth curve: its value at each of the curve's ages, unknown past its last reading. */
export const insightCurve = (post: Pick<InsightPost, "latest" | "snapshots">, key: InsightKey): (number | null)[] =>
  INSIGHT_CURVE_AGES.map((age) => age === 0 && !isRate(key) ? 0 : age === 0 ? null : insightValue(post, key, age as InsightAt));

/** The typical post's curve: at each age, the median of the posts read that far. */
export function medianCurve(posts: readonly Pick<InsightPost, "latest" | "snapshots">[], key: InsightKey): (number | null)[] {
  const curves = posts.map((post) => insightCurve(post, key));
  return INSIGHT_CURVE_AGES.map((_, index) => median(curves.flatMap((curve) => curve[index] === null ? [] : [curve[index]!])));
}

/** Posts in time order with their value and the running median of the last few: the trend. */
export function insightTrend(posts: readonly InsightPost[], key: InsightKey, at: InsightAt, window = 5): { post: InsightPost; value: number | null; trend: number | null }[] {
  const ordered = [...posts].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const values = ordered.map((post) => insightValue(post, key, at));
  return ordered.map((post, index) => ({
    post, value: values[index],
    trend: median(values.slice(Math.max(0, index - window + 1), index + 1).flatMap((value) => value === null ? [] : [value])),
  }));
}

export type InsightGroup = { group: string; median: number; n: number; best: number };
/** The median value by a property of the posts (their lever, format, weekday…), highest first; a post without it is left out. */
export function insightBreakdown(posts: readonly InsightPost[], key: InsightKey, at: InsightAt, groupOf: (post: InsightPost) => string | undefined): InsightGroup[] {
  const groups = new Map<string, number[]>();
  for (const post of posts) {
    const group = groupOf(post);
    const value = insightValue(post, key, at);
    if (!group || value === null) continue;
    groups.set(group, [...(groups.get(group) ?? []), value]);
  }
  return [...groups].map(([group, values]) => ({ group, median: median(values)!, n: values.length, best: Math.max(...values) })).sort((a, b) => b.median - a.median || b.n - a.n);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** The day a post went out, in the reader's time zone. */
export const insightWeekday = (post: Pick<InsightPost, "publishedAt">) => WEEKDAYS[new Date(post.publishedAt).getDay()];
/** The part of the day a post went out, in the reader's time zone. */
export function insightDaypart(post: Pick<InsightPost, "publishedAt">): string {
  const hour = new Date(post.publishedAt).getHours();
  if (hour < 6) return "Night (0–6 h)";
  if (hour < 11) return "Morning (6–11 h)";
  if (hour < 15) return "Midday (11–15 h)";
  if (hour < 19) return "Afternoon (15–19 h)";
  return "Evening (19–24 h)";
}

/** How far a value is from the typical post: 1.8 reads "1.8× the median". */
export const timesMedian = (value: number | null, typical: number | null): number | null => value === null || !typical ? null : value / typical;

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** A value as the dashboard shows it: a rate in percent, a count compact (1.2K). */
export function formatInsight(key: InsightKey, value: number | null): string {
  if (value === null) return "—";
  return isRate(key) ? `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%` : compact.format(Math.round(value));
}

/** The posts published within the last `days` (all of them without a period), and the same span before it, for the comparison. */
export function insightPeriods(posts: readonly InsightPost[], days: number | null, now: Date): { current: InsightPost[]; previous: InsightPost[] } {
  if (!days) return { current: [...posts], previous: [] };
  const start = now.getTime() - days * 86_400_000;
  const before = start - days * 86_400_000;
  const time = (post: InsightPost) => new Date(post.publishedAt).getTime();
  return { current: posts.filter((post) => time(post) >= start), previous: posts.filter((post) => time(post) >= before && time(post) < start) };
}
