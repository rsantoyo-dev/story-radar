"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, InlineNotice, LoadingState, StatusBadge } from "./ui/primitives";
import {
  INSIGHT_AT_LABEL, INSIGHT_CURVE_AGES, INSIGHT_LABEL, INSIGHT_METRICS, INSIGHT_RATES,
  formatInsight, insightBreakdown, insightCurve, insightDaypart, insightPeriods, insightTrend, insightValue, insightWeekday, median, medianCurve, timesMedian,
  type InsightAt, type InsightKey, type InsightPost, type InstagramInsights,
} from "./modules/meta/instagram-insights.types";
import styles from "./radar-dashboard.generated.module.css";

/**
 * Instagram performance, to measure and improve: what each post earned, read
 * at the same ages so posts of different days compare; the trend over time;
 * how posts grow against the typical one; what the best ones share (hook
 * lever, format, day, time, narrative form); and every post with its image.
 * Organic readings only: ads come later.
 */
const PERIODS: { days: number | null; label: string }[] = [{ days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }, { days: null, label: "All" }];
const KEYS: InsightKey[] = [...INSIGHT_METRICS, ...INSIGHT_RATES];
const READS: InsightAt[] = ["latest", 24, 72, 168];
const SHOWS = [{ value: 5, label: "Top 5" }, { value: 10, label: "Top 10" }, { value: 20, label: "Top 20" }, { value: 0, label: "All posts" }];
type Breakdown = "lever" | "format" | "weekday" | "daypart" | "narrative";
const BREAKDOWNS: { id: Breakdown; label: string; of: (post: InsightPost) => string | undefined }[] = [
  { id: "lever", label: "Hook lever", of: (post) => post.draft2?.leverName },
  { id: "format", label: "Format", of: (post) => post.format },
  { id: "weekday", label: "Day", of: insightWeekday },
  { id: "daypart", label: "Time of day", of: insightDaypart },
  { id: "narrative", label: "Narrative", of: (post) => post.draft2?.narrative },
];

async function requestInsights(topicId: string, secret: string, days: number | null): Promise<InstagramInsights> {
  const response = await fetch(`/api/radar/topics/${encodeURIComponent(topicId)}/meta/insights${days ? `?days=${days}` : ""}`, { cache: "no-store", headers: { Authorization: `Bearer ${secret.trim()}` } });
  const payload = await response.json().catch(() => undefined) as (InstagramInsights & { error?: string }) | undefined;
  if (!response.ok || !payload) throw new Error(payload?.error ?? `Request failed (${response.status})`);
  return payload;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
/** A round ceiling for an axis: 1, 2 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((step) => step * power).find((step) => step >= value) ?? value;
}
const change = (now: number | null, before: number | null): number | null => now === null || before === null || before === 0 ? null : (now - before) / before;

export function InstagramInsightsPanel({ topicId, secret, refreshToken }: { topicId: string; secret: string; refreshToken?: number }) {
  const [days, setDays] = useState<number | null>(30);
  const [key, setKey] = useState<InsightKey>("views");
  const [at, setAt] = useState<InsightAt>("latest");
  const [breakdown, setBreakdown] = useState<Breakdown>("lever");
  const [order, setOrder] = useState<"top" | "newest">("top");
  const [show, setShow] = useState(10);
  const [format, setFormat] = useState("");
  const [lever, setLever] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InsightPost>();
  const [detail, setDetail] = useState<InsightPost>();
  // What was asked for and what came back: loading while the answer is for another request.
  const request = `${topicId}:${days ?? "all"}:${refreshToken ?? 0}`;
  const [state, setState] = useState<{ request?: string; data?: InstagramInsights; error?: string }>({});
  const loading = state.request !== request;

  useEffect(() => {
    let live = true;
    requestInsights(topicId, secret, days)
      .then((data) => { if (live) setState({ request, data }); })
      .catch((error: unknown) => { if (live) setState((current) => ({ ...current, request, error: error instanceof Error ? error.message : "Unable to read Instagram insights" })); });
    return () => { live = false; };
  }, [topicId, secret, days, request]);

  const view = useMemo(() => {
    const posts = state.data?.posts ?? [];
    const { current, previous } = insightPeriods(posts, days, new Date(state.data?.capturedAt ?? 0));
    const words = search.trim().toLowerCase();
    const keep = (post: InsightPost) => (!format || post.format === format) && (!lever || post.draft2?.leverName === lever)
      && (!words || `${post.caption ?? ""} ${post.draft2?.cover ?? ""} ${post.storyTitle ?? ""}`.toLowerCase().includes(words));
    const chosen = current.filter(keep);
    const before = previous.filter(keep);
    const valueOf = (post: InsightPost) => insightValue(post, key, at);
    const values = chosen.flatMap((post) => { const value = valueOf(post); return value === null ? [] : [value]; });
    const previousValues = before.flatMap((post) => { const value = valueOf(post); return value === null ? [] : [value]; });
    const typical = median(values);
    const ranked = [...chosen].sort((a, b) => (valueOf(b) ?? -1) - (valueOf(a) ?? -1));
    const ordered = order === "top" ? ranked : [...chosen].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return {
      chosen, before, typical, ranked, valueOf,
      shown: show ? ordered.slice(0, show) : ordered,
      total: values.reduce((sum, value) => sum + value, 0),
      previousTotal: previousValues.reduce((sum, value) => sum + value, 0),
      previousTypical: median(previousValues),
      trend: insightTrend(chosen, key, at),
      curve: medianCurve(chosen, key),
      top: ranked.slice(0, 3),
      groups: insightBreakdown(chosen, key, at, BREAKDOWNS.find((entry) => entry.id === breakdown)!.of),
      formats: [...new Set(posts.map((post) => post.format))].sort(),
      levers: [...new Set(posts.flatMap((post) => post.draft2?.leverName ? [post.draft2.leverName] : []))].sort(),
    };
  }, [state.data, days, key, at, breakdown, order, show, format, lever, search]);

  const data = state.data;
  const rate = (INSIGHT_RATES as readonly string[]).includes(key);
  const period = PERIODS.find((entry) => entry.days === days)!.label.toLowerCase();
  const best = view.top[0];
  return <section className={styles.insights} aria-labelledby="instagram-insights-title">
    <header className={styles.insightsHeader}>
      <div>
        <p className={styles.insightsEyebrow}>Instagram{data?.account?.igUsername ? ` · @${data.account.igUsername}` : ""} · organic</p>
        <h2 id="instagram-insights-title" className={styles.insightsTitle}>Performance</h2>
        <p className={styles.insightsLead}>What each post earned, read at the same age so posts of different days compare, and what the best ones share. Ads come later.</p>
      </div>
      <div className={styles.insightsControls}>
        <div className={styles.insightsSegment} role="group" aria-label="Period">
          {PERIODS.map((entry) => <Button key={entry.label} size="compact" variant={entry.days === days ? "primary" : "secondary"} aria-pressed={entry.days === days} onClick={() => setDays(entry.days)}>{entry.label}</Button>)}
        </div>
        <label className={styles.insightsField}>Measure
          <select value={key} onChange={(event) => setKey(event.target.value as InsightKey)}>
            {KEYS.map((entry) => <option key={entry} value={entry}>{INSIGHT_LABEL[entry]}</option>)}
          </select>
        </label>
        <label className={styles.insightsField}>Read
          <select value={String(at)} onChange={(event) => setAt(event.target.value === "latest" ? "latest" : Number(event.target.value) as InsightAt)}>
            {READS.map((entry) => <option key={entry} value={String(entry)}>{INSIGHT_AT_LABEL[entry]}</option>)}
          </select>
        </label>
      </div>
    </header>

    {loading ? <LoadingState>Reading the posts and their metrics…</LoadingState> : null}
    {state.error ? <InlineNotice tone="error" title="The performance view could not load">{state.error}</InlineNotice> : null}
    {data && !data.account ? <InlineNotice tone="info" title="No Instagram account">Connect the Topic’s Instagram account to read its posts.</InlineNotice> : null}
    {data?.account && !view.chosen.length ? <InlineNotice tone="info" title="No posts in this period">Choose a longer period, or clear the filters below.</InlineNotice> : null}

    {data?.account && view.chosen.length ? <>
      <div className={styles.insightsKpis}>
        <Kpi label="Posts" value={String(view.chosen.length)} delta={days ? change(view.chosen.length, view.before.length) : null} note={days ? `vs ${view.before.length} the ${period} before` : "every post read"} />
        <Kpi label={rate ? `Typical ${INSIGHT_LABEL[key].toLowerCase()}` : `Total ${INSIGHT_LABEL[key].toLowerCase()}`} value={rate ? formatInsight(key, view.typical) : formatInsight(key, view.total)} delta={days ? change(rate ? view.typical : view.total, rate ? view.previousTypical : view.previousTotal) : null} note={`${INSIGHT_AT_LABEL[at].toLowerCase()}, ${period}`} />
        <Kpi label="Median per post" value={formatInsight(key, view.typical)} delta={days ? change(view.typical, view.previousTypical) : null} note={days ? `vs ${formatInsight(key, view.previousTypical)} before` : "half the posts do better"} />
        <div className={styles.insightsKpi}>
          <span className={styles.insightsKpiLabel}>Best post</span>
          {best ? <div className={styles.insightsBest}>
            <PostImage post={best} className={styles.insightsBestImage} />
            <div>
              <span className={styles.insightsKpiValue}>{formatInsight(key, view.valueOf(best))}</span>
              <p className={styles.insightsKpiNote}>{timesMedian(view.valueOf(best), view.typical)?.toFixed(1) ?? "—"}× the median · {shortDate(best.publishedAt)}</p>
            </div>
          </div> : <span className={styles.insightsKpiNote}>—</span>}
        </div>
      </div>

      <div className={styles.insightsCharts}>
        <div className={styles.insightsCard}>
          <div>
            <h3 className={styles.insightsCardTitle}>Trend</h3>
            <p className={styles.insightsCardNote}>{INSIGHT_LABEL[key]} of each post, in publication order ({INSIGHT_AT_LABEL[at].toLowerCase()}); the line is the running median of the last five. Click a bar to follow its post on the curves.</p>
          </div>
          <TrendChart points={view.trend} metric={key} selectedId={selected?.id} onSelect={(post) => setSelected(post.id === selected?.id ? undefined : post)} />
          <ul className={styles.insightsLegend}>
            <li><span className={styles.insightsSwatch} data-series="bar" />A post</li>
            <li><span className={styles.insightsSwatch} data-series="trend" />Running median</li>
          </ul>
        </div>
        <div className={styles.insightsCard}>
          <div>
            <h3 className={styles.insightsCardTitle}>How posts grow</h3>
            <p className={styles.insightsCardNote}>{INSIGHT_LABEL[key]} over the first week, the typical post against the three best{selected ? " and the post you picked" : ""}.</p>
          </div>
          <CurveChart metric={key} median={view.curve} series={[...view.top.map((post, index) => ({ post, series: (["a", "b", "c"] as const)[index] })), ...(selected && !view.top.some((post) => post.id === selected.id) ? [{ post: selected, series: "selected" as const }] : [])]} />
          <ul className={styles.insightsLegend}>
            <li><span className={styles.insightsSwatch} data-series="median" />Typical post</li>
            {view.top.map((post, index) => <li key={post.id}><span className={styles.insightsSwatch} data-series={["a", "b", "c"][index]} />#{index + 1} · {shortDate(post.publishedAt)}</li>)}
            {selected && !view.top.some((post) => post.id === selected.id) ? <li><span className={styles.insightsSwatch} data-series="selected" />Picked · {shortDate(selected.publishedAt)}</li> : null}
          </ul>
        </div>
      </div>

      <div className={styles.insightsCard}>
        <div className={styles.insightsPostsHeader}>
          <div>
            <h3 className={styles.insightsCardTitle}>What works</h3>
            <p className={styles.insightsCardNote}>The median {INSIGHT_LABEL[key].toLowerCase()} by what the posts share. Observed over few posts: a lead to test, never a rule.</p>
          </div>
          <div className={styles.insightsSegment} role="group" aria-label="Group by">
            {BREAKDOWNS.map((entry) => <Button key={entry.id} size="compact" variant={entry.id === breakdown ? "primary" : "secondary"} aria-pressed={entry.id === breakdown} onClick={() => setBreakdown(entry.id)}>{entry.label}</Button>)}
          </div>
        </div>
        {view.groups.length ? <ul className={styles.insightsBreakdown}>
          {view.groups.map((group) => <li key={group.group} className={styles.insightsBreakdownRow}>
            <span>{group.group}</span>
            <span className={styles.insightsBreakdownTrack} aria-hidden="true"><span className={styles.insightsBreakdownFill} style={{ width: `${Math.max(3, (group.median / (view.groups[0].median || 1)) * 100)}%` }} /></span>
            <span className={styles.insightsBreakdownValue}>{formatInsight(key, group.median)} · {group.n} post{group.n === 1 ? "" : "s"}{group.n < 3 ? " · too few to tell" : ""}</span>
          </li>)}
        </ul> : <p className={styles.insightsEmpty}>{breakdown === "lever" || breakdown === "narrative" ? "Only posts made in Draft 2 record their lever and narrative form; none in this view yet." : "No readings to group yet."}</p>}
      </div>

      <div className={styles.insightsCard}>
        <div className={styles.insightsPostsHeader}>
          <div>
            <h3 className={styles.insightsCardTitle}>Posts</h3>
            <p className={styles.insightsCardNote}>{view.chosen.length} posts · the median is {formatInsight(key, view.typical)}; green is 1.5× it or more, red 0.6× or less.</p>
          </div>
          <div className={styles.insightsControls}>
            <label className={styles.insightsField}>Order
              <select value={order} onChange={(event) => setOrder(event.target.value as "top" | "newest")}><option value="top">Best first</option><option value="newest">Newest first</option></select>
            </label>
            <label className={styles.insightsField}>Show
              <select value={show} onChange={(event) => setShow(Number(event.target.value))}>{SHOWS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select>
            </label>
            <label className={styles.insightsField}>Format
              <select value={format} onChange={(event) => setFormat(event.target.value)}><option value="">Every format</option>{view.formats.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>
            </label>
            {view.levers.length ? <label className={styles.insightsField}>Hook lever
              <select value={lever} onChange={(event) => setLever(event.target.value)}><option value="">Every lever</option>{view.levers.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>
            </label> : null}
            <label className={styles.insightsField}>Search
              <input type="search" value={search} placeholder="Words in the post" onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>
        </div>
        <div className={styles.insightsGridPosts}>
          {view.shown.map((post) => {
            const value = view.valueOf(post);
            const times = timesMedian(value, view.typical);
            const rank = view.ranked.indexOf(post) + 1;
            return <article key={post.id} className={styles.insightsPost}>
              <a className={styles.insightsPostImage} href={post.permalink ?? undefined} target="_blank" rel="noreferrer" aria-label="Open on Instagram">
                <PostImage post={post} />
                <span className={styles.insightsRank}>#{rank}</span>
              </a>
              <div className={styles.insightsPostBody}>
                <div className={styles.insightsPostValue}><strong>{formatInsight(key, value)}</strong><span>{INSIGHT_LABEL[key].toLowerCase()}</span></div>
                {times !== null ? <StatusBadge tone={times >= 1.5 ? "success" : times <= 0.6 ? "error" : "neutral"}>{times.toFixed(1)}× the median</StatusBadge> : null}
                <Sparkline post={post} metric={key} typical={view.curve} />
                <p className={styles.insightsPostMeta}>{shortDate(post.publishedAt)} · {post.format}{post.draft2?.leverName ? ` · ${post.draft2.leverName}` : ""}</p>
                <p className={styles.insightsPostCaption}>{post.draft2?.cover ?? post.caption ?? post.storyTitle ?? ""}</p>
                <div><Button size="compact" variant="quiet" onClick={() => setDetail(post)}>Details</Button></div>
              </div>
            </article>;
          })}
        </div>
      </div>
    </> : null}

    {detail ? <PostDetail post={detail} metric={key} typical={view.curve} typicalAt={(metric, point) => median(view.chosen.flatMap((post) => { const value = insightValue(post, metric, point); return value === null ? [] : [value]; }))} onClose={() => setDetail(undefined)} /> : null}
  </section>;
}

function Kpi({ label, value, delta, note }: { label: string; value: string; delta: number | null; note: string }) {
  return <div className={styles.insightsKpi}>
    <span className={styles.insightsKpiLabel}>{label}</span>
    <span className={styles.insightsKpiValue}>{value}</span>
    {delta !== null ? <span className={styles.insightsDelta} data-tone={delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat"}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta * 100).toFixed(0)}%</span> : null}
    <span className={styles.insightsKpiNote}>{note}</span>
  </div>;
}

function PostImage({ post, className }: { post: InsightPost; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!post.imageUrl || broken) return <span className={`${styles.insightsPlaceholder} ${className ?? ""}`}>No image</span>;
  // Instagram's own image of the post; the gallery shows it the same way.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={post.imageUrl} alt={post.caption ?? "Instagram post"} loading="lazy" onError={() => setBroken(true)} />;
}

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { left: 48, right: 10, top: 12, bottom: 28 };

function TrendChart({ points, metric, selectedId, onSelect }: { points: { post: InsightPost; value: number | null; trend: number | null }[]; metric: InsightKey; selectedId?: string; onSelect: (post: InsightPost) => void }) {
  const max = niceMax(Math.max(0, ...points.flatMap((point) => [point.value ?? 0, point.trend ?? 0])));
  if (!points.length || !max) return <p className={styles.insightsEmpty}>No readings for these posts yet.</p>;
  const step = (WIDTH - PAD.left - PAD.right) / points.length;
  const bar = Math.max(2, Math.min(28, step * 0.7));
  const x = (index: number) => PAD.left + step * index + step / 2;
  const y = (value: number) => PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - value / max);
  const line = points.flatMap((point, index) => point.trend === null ? [] : [`${x(index)},${y(point.trend)}`]).join(" ");
  const labels = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return <svg className={styles.insightsChart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${INSIGHT_LABEL[metric]} of each post in publication order, with the running median`}>
    {[0, 0.5, 1].map((share) => <g key={share}>
      <line className={share === 0 ? styles.insightsAxis : styles.insightsGrid} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(max * share)} y2={y(max * share)} />
      <text className={styles.insightsAxisLabel} x={PAD.left - 6} y={y(max * share) + 4} textAnchor="end">{formatInsight(metric, max * share)}</text>
    </g>)}
    {points.map((point, index) => point.value === null ? null : <rect key={point.post.id} className={point.post.id === selectedId ? styles.insightsBarActive : styles.insightsBar}
      x={x(index) - bar / 2} y={y(point.value)} width={bar} height={Math.max(1, y(0) - y(point.value))} rx={2} style={{ cursor: "pointer" }} onClick={() => onSelect(point.post)}>
      <title>{`${shortDate(point.post.publishedAt)} · ${formatInsight(metric, point.value)} · ${(point.post.draft2?.cover ?? point.post.caption ?? "").slice(0, 80)}`}</title>
    </rect>)}
    {line ? <polyline className={styles.insightsTrendLine} points={line} /> : null}
    {labels.map((index) => <text key={index} className={styles.insightsAxisLabel} x={x(index)} y={HEIGHT - 8} textAnchor="middle">{shortDate(points[index].post.publishedAt)}</text>)}
  </svg>;
}

const CURVE_CLASS: Record<"a" | "b" | "c" | "selected", string> = { a: styles.insightsCurveA, b: styles.insightsCurveB, c: styles.insightsCurveC, selected: styles.insightsCurveSelected };
const LAST_AGE = INSIGHT_CURVE_AGES[INSIGHT_CURVE_AGES.length - 1];

function curvePath(values: readonly (number | null)[], x: (age: number) => number, y: (value: number) => number): string {
  return INSIGHT_CURVE_AGES.flatMap((age, index) => values[index] === null ? [] : [`${x(age)},${y(values[index]!)}`]).join(" ");
}

function CurveChart({ metric, median: typical, series }: { metric: InsightKey; median: (number | null)[]; series: { post: InsightPost; series: "a" | "b" | "c" | "selected" }[] }) {
  const curves = series.map((entry) => ({ ...entry, values: insightCurve(entry.post, metric) }));
  const max = niceMax(Math.max(0, ...typical.map((value) => value ?? 0), ...curves.flatMap((entry) => entry.values.map((value) => value ?? 0))));
  if (!max) return <p className={styles.insightsEmpty}>No readings over time for these posts yet.</p>;
  const x = (age: number) => PAD.left + (WIDTH - PAD.left - PAD.right) * (age / LAST_AGE);
  const y = (value: number) => PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - value / max);
  return <svg className={styles.insightsChart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${INSIGHT_LABEL[metric]} over the first week: the typical post and the best ones`}>
    {[0, 0.5, 1].map((share) => <g key={share}>
      <line className={share === 0 ? styles.insightsAxis : styles.insightsGrid} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(max * share)} y2={y(max * share)} />
      <text className={styles.insightsAxisLabel} x={PAD.left - 6} y={y(max * share) + 4} textAnchor="end">{formatInsight(metric, max * share)}</text>
    </g>)}
    {[0, 24, 72, 168].map((age) => <text key={age} className={styles.insightsAxisLabel} x={x(age)} y={HEIGHT - 8} textAnchor="middle">{age === 0 ? "0" : age === 168 ? "7 d" : `${age} h`}</text>)}
    {curves.map((entry) => <polyline key={entry.post.id} className={CURVE_CLASS[entry.series]} points={curvePath(entry.values, x, y)}><title>{`${shortDate(entry.post.publishedAt)} · ${(entry.post.draft2?.cover ?? entry.post.caption ?? "").slice(0, 80)}`}</title></polyline>)}
    <polyline className={styles.insightsCurveMedian} points={curvePath(typical, x, y)}><title>The typical post</title></polyline>
  </svg>;
}

function Sparkline({ post, metric, typical }: { post: InsightPost; metric: InsightKey; typical: (number | null)[] }) {
  const values = insightCurve(post, metric);
  const max = Math.max(0, ...values.map((value) => value ?? 0), ...typical.map((value) => value ?? 0));
  if (!max) return null;
  const x = (age: number) => 2 + 96 * (age / LAST_AGE);
  const y = (value: number) => 26 - 24 * (value / max);
  return <svg className={styles.insightsSpark} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
    <polyline className={styles.insightsSparkMedian} points={curvePath(typical, x, y)} />
    <polyline className={styles.insightsSparkLine} points={curvePath(values, x, y)} />
  </svg>;
}

function PostDetail({ post, metric, typical, typicalAt, onClose }: { post: InsightPost; metric: InsightKey; typical: (number | null)[]; typicalAt: (metric: InsightKey, at: InsightAt) => number | null; onClose: () => void }) {
  return <Dialog eyebrow={`${shortDate(post.publishedAt)} · ${post.format}${post.draft2?.leverName ? ` · ${post.draft2.leverName}` : ""}`} title={post.draft2?.cover ?? post.storyTitle ?? "Instagram post"} onClose={onClose}
    footer={post.permalink ? <a href={post.permalink} target="_blank" rel="noreferrer">Open on Instagram ↗</a> : undefined}>
    <div className={styles.insightsDetail}>
      <PostImage post={post} className={styles.insightsDetailImage} />
      <div className={styles.insightsCardGrid}>
        <CurveChart metric={metric} median={typical} series={[{ post, series: "selected" }]} />
        <ul className={styles.insightsLegend}>
          <li><span className={styles.insightsSwatch} data-series="median" />Typical post</li>
          <li><span className={styles.insightsSwatch} data-series="selected" />This post</li>
        </ul>
        <table className={styles.insightsTable}>
          <thead><tr><th scope="col">Measure</th>{READS.map((at) => <th key={at} scope="col">{INSIGHT_AT_LABEL[at]}</th>)}<th scope="col">vs typical</th></tr></thead>
          <tbody>{KEYS.map((key) => {
            const latest = insightValue(post, key, "latest");
            const times = timesMedian(latest, typicalAt(key, "latest"));
            return <tr key={key}>
              <th scope="row">{INSIGHT_LABEL[key]}</th>
              {READS.map((at) => <td key={at}>{formatInsight(key, insightValue(post, key, at))}</td>)}
              <td>{times === null ? "—" : `${times.toFixed(1)}×`}</td>
            </tr>;
          })}</tbody>
        </table>
        {post.caption ? <p className={styles.insightsPostMeta}>{post.caption}</p> : null}
      </div>
    </div>
  </Dialog>;
}
