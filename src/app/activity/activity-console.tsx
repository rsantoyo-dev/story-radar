"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import styles from "@/app/radar-dashboard.generated.module.css";

type Tab = "requests" | "events" | "changes";
type Person = { id: string; name: string; email: string; role: string | null };
type Brand = { id: string; name: string };
type Summary = {
  hours: number; requests: number; serverErrors: number; clientErrors: number; denied: number; p95Ms: number;
  events: number; failedEvents: number; changes: number;
};
type SummaryResponse = { summary: Summary; people: Person[]; brands: Brand[]; scope: "workspace" | "all"; canPurge: boolean; canSeeAllWorkspaces: boolean };

type RequestRow = {
  id: string; occurredAt: string; requestId: string | null; workspaceId: string | null; topicId: string | null;
  actorType: string | null; actorId: string | null; method: string; path: string; query: string | null; status: number;
  durationMs: number; requestBody: string | null; responseBody: string | null; responseBytes: number | null; error: string | null;
  ip: string | null; userAgent: string | null;
};
type EventRow = {
  id: string; occurredAt: string; workspaceId: string | null; topicId: string | null; actorType: string; actorId: string | null;
  action: string; entityType: string | null; entityId: string | null; outcome: string; requestId: string | null; details: Record<string, unknown>;
};
type ChangeRow = {
  id: string; occurredAt: string; tableName: string; operation: string; rowKey: string; workspaceId: string | null; topicId: string | null;
  oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null; changedColumns: string[] | null; dbUser: string; transactionId: number;
};
type Page<T> = { rows: T[]; nextBefore: string | null };
type Trail = { requests: RequestRow[]; events: EventRow[]; changes: ChangeRow[] };

const RANGES = [
  { value: "1h", label: "Last hour", hours: 1 },
  { value: "24h", label: "24 hours", hours: 24 },
  { value: "7d", label: "7 days", hours: 24 * 7 },
  { value: "30d", label: "30 days", hours: 24 * 30 },
  { value: "all", label: "All", hours: 0 },
] as const;
type Range = (typeof RANGES)[number]["value"];

const ACTION_AREAS = ["auth.", "workspace.", "topic.", "meta.", "publication.", "billing.", "credits.", "admin.", "activity.", "platform."];
const TABLES = [
  "billing_purchases", "billing_customers", "creative_assets", "creative_drafts", "creative_profiles", "editorial_lines",
  "instagram_publication_jobs", "instagram_publication_packages", "platform_staff", "rss_sources", "story_social_publications",
  "topic_auto_collection_settings", "topic_editorial_profiles", "topic_facebook_connections", "topic_meta_connections", "topic_sources",
  "topics", "users", "workspace_credit_entries", "workspace_invitations", "workspace_members", "workspaces",
];

function readSecret(): string {
  if (typeof window === "undefined") return "";
  try { return window.sessionStorage.getItem("story-radar:collector-secret") ?? ""; } catch { return ""; }
}

function when(value: string): string {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** A stored body as readable text: pretty JSON when it is JSON. */
function pretty(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  return JSON.stringify(value, null, 2);
}

function statusTone(status: number): string {
  if (status >= 500) return styles.activityBadgeError;
  if (status >= 400) return styles.activityBadgeWarning;
  return styles.activityBadgeOk;
}

function outcomeTone(outcome: string): string {
  if (outcome === "failure") return styles.activityBadgeError;
  if (outcome === "denied") return styles.activityBadgeWarning;
  return styles.activityBadgeOk;
}

function download(name: string, rows: unknown[]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function ActivityConsole({ signedIn = false }: { signedIn?: boolean }) {
  const [secret] = useState(() => (signedIn ? "" : readSecret()));
  const headers = useMemo((): Record<string, string> => {
    const value: Record<string, string> = {};
    if (secret) value.Authorization = `Bearer ${secret}`;
    return value;
  }, [secret]);

  const [tab, setTab] = useState<Tab>("requests");
  const [range, setRange] = useState<Range>("24h");
  const [allWorkspaces, setAllWorkspaces] = useState(false);
  const [actorId, setActorId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [table, setTable] = useState("");

  const [meta, setMeta] = useState<SummaryResponse>();
  const [requests, setRequests] = useState<Page<RequestRow>>();
  const [events, setEvents] = useState<Page<EventRow>>();
  const [changes, setChanges] = useState<Page<ChangeRow>>();
  const [open, setOpen] = useState<string>();
  const [trail, setTrail] = useState<{ requestId: string; data?: Trail; error?: string }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [loading, setLoading] = useState(false);

  const people = useMemo(() => new Map((meta?.people ?? []).map((person) => [person.id, person])), [meta]);
  const brands = useMemo(() => new Map((meta?.brands ?? []).map((brand) => [brand.id, brand.name])), [meta]);
  const who = (type: string | null, id: string | null) => {
    if (id && people.has(id)) return people.get(id)!.name || people.get(id)!.email;
    if (id) return `${type ?? "user"} ${id.slice(0, 8)}`;
    return type ?? "anonymous";
  };

  const params = useCallback((extra: Record<string, string> = {}) => {
    const value = new URLSearchParams();
    const hours = RANGES.find((option) => option.value === range)?.hours ?? 0;
    if (hours) value.set("from", new Date(Date.now() - hours * 3_600_000).toISOString());
    if (allWorkspaces) value.set("scope", "all");
    if (actorId) value.set("actorId", actorId);
    if (topicId) value.set("topicId", topicId);
    if (query) value.set("q", query);
    if (tab === "requests") {
      if (method) value.set("method", method);
      if (status) value.set("status", status);
    } else if (tab === "events") {
      if (action) value.set("action", action);
      if (outcome) value.set("outcome", outcome);
    } else if (table) {
      value.set("table", table);
    }
    for (const [key, item] of Object.entries(extra)) value.set(key, item);
    return value;
  }, [range, allWorkspaces, actorId, topicId, query, tab, method, status, action, outcome, table]);

  const fetchJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, { cache: "no-store", ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
    return body;
  }, [headers]);

  const loadSummary = useCallback(async () => {
    setMeta(await fetchJson<SummaryResponse>(`/api/radar/activity/summary${allWorkspaces ? "?scope=all" : ""}`));
  }, [fetchJson, allWorkspaces]);

  const load = useCallback(async (more = false) => {
    setLoading(true);
    try {
      if (tab === "requests") {
        const page = await fetchJson<Page<RequestRow>>(`/api/radar/activity/requests?${params(more && requests?.nextBefore ? { before: requests.nextBefore } : {})}`);
        setRequests((current) => (more && current ? { rows: [...current.rows, ...page.rows], nextBefore: page.nextBefore } : page));
      } else if (tab === "events") {
        const page = await fetchJson<Page<EventRow>>(`/api/radar/activity/events?${params(more && events?.nextBefore ? { before: events.nextBefore } : {})}`);
        setEvents((current) => (more && current ? { rows: [...current.rows, ...page.rows], nextBefore: page.nextBefore } : page));
      } else {
        const page = await fetchJson<Page<ChangeRow>>(`/api/radar/activity/changes?${params(more && changes?.nextBefore ? { before: changes.nextBefore } : {})}`);
        setChanges((current) => (more && current ? { rows: [...current.rows, ...page.rows], nextBefore: page.nextBefore } : page));
      }
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Activity is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, [tab, params, fetchJson, requests?.nextBefore, events?.nextBefore, changes?.nextBefore]);

  useEffect(() => {
    if (!signedIn && !secret) {
      Promise.resolve().then(() => setError("Connect with the collector secret on the dashboard to see activity."));
      return;
    }
    let active = true;
    loadSummary().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Activity is unavailable right now."); });
    return () => { active = false; };
  }, [loadSummary, signedIn, secret]);

  // Reload the visible list when its filters change (not when paging state changes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (signedIn || secret) void Promise.resolve().then(() => load(false)); }, [tab, range, allWorkspaces, actorId, topicId, query, method, status, action, outcome, table]);

  const openTrail = (requestId: string) => {
    setTrail({ requestId });
    fetchJson<Trail>(`/api/radar/activity/trail/${encodeURIComponent(requestId)}${allWorkspaces ? "?scope=all" : ""}`)
      .then((data) => setTrail({ requestId, data }))
      .catch((cause: unknown) => setTrail({ requestId, error: cause instanceof Error ? cause.message : "Could not load this request." }));
  };

  const purge = () => {
    if (!window.confirm("Delete every API request log that matches the current filters? Actions and data changes are kept. This cannot be undone.")) return;
    fetchJson<{ deleted: number }>(`/api/radar/activity/requests?${params()}`, { method: "DELETE", headers: { "X-Confirm": "DELETE" } })
      .then((result) => { setNotice(`${result.deleted.toLocaleString("en-US")} request logs deleted. The deletion itself is recorded in Actions.`); return Promise.all([load(false), loadSummary()]); })
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : "The request logs could not be deleted."));
  };

  const showRequests = (statusFilter: string) => { setTab("requests"); setStatus(statusFilter); };
  const showEvents = (outcomeFilter: string) => { setTab("events"); setOutcome(outcomeFilter); };
  const summary = meta?.summary;
  const rows = tab === "requests" ? requests?.rows : tab === "events" ? events?.rows : changes?.rows;
  const nextBefore = tab === "requests" ? requests?.nextBefore : tab === "events" ? events?.nextBefore : changes?.nextBefore;

  return <main className={styles.spendingPage}>
    <header className={styles.spendingHeader}>
      <Link href="/" className={styles.spendingBack}>← Press Craftor</Link>
      <div>
        <h1>Activity</h1>
        <p>Every API request with its response, every action and every change to important data in this workspace. Use it to answer &ldquo;what happened?&rdquo; when something goes wrong. Secrets and personal details are hidden; request logs are kept 30 days, actions and data changes are kept for good.</p>
      </div>
    </header>

    {error ? <div className={styles.spendingError} role="alert"><strong>Activity is unavailable</strong><p>{error}</p></div> : null}

    {summary ? <dl className={styles.spendingSummary}>
      <div><dt>Requests · 24 h</dt><dd><button type="button" className={styles.activityStat} onClick={() => showRequests("")}>{summary.requests.toLocaleString("en-US")}</button> <small>p95 {summary.p95Ms.toLocaleString("en-US")} ms</small></dd></div>
      <div><dt>Server errors</dt><dd><button type="button" className={styles.activityStat} data-alert={summary.serverErrors > 0} onClick={() => showRequests("5xx")}>{summary.serverErrors.toLocaleString("en-US")}</button> <small>status 500+</small></dd></div>
      <div><dt>Refused</dt><dd><button type="button" className={styles.activityStat} onClick={() => showRequests("denied")}>{summary.denied.toLocaleString("en-US")}</button> <small>401 / 403</small></dd></div>
      <div><dt>Actions</dt><dd><button type="button" className={styles.activityStat} onClick={() => showEvents("")}>{summary.events.toLocaleString("en-US")}</button> <small>{summary.failedEvents ? `${summary.failedEvents} failed or denied` : "none failed"}</small></dd></div>
      <div><dt>Data changes</dt><dd><button type="button" className={styles.activityStat} onClick={() => setTab("changes")}>{summary.changes.toLocaleString("en-US")}</button> <small>rows written</small></dd></div>
    </dl> : null}

    <div role="tablist" aria-label="Activity" className={styles.spendingPeriods}>
      {([["requests", "API requests"], ["events", "Actions"], ["changes", "Data changes"]] as const).map(([value, label]) =>
        <button key={value} type="button" role="tab" aria-selected={tab === value} aria-pressed={tab === value} onClick={() => { setTab(value); setOpen(undefined); }}>{label}</button>)}
    </div>

    <section className={styles.spendingControls} aria-label="Filters">
      <label className={styles.spendingTopic}><span>Period</span>
        <select value={range} onChange={(event) => setRange(event.target.value as Range)}>
          {RANGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {tab !== "changes" ? <label className={styles.spendingTopic}><span>Person</span>
        <select value={actorId} onChange={(event) => setActorId(event.target.value)}>
          <option value="">Everyone</option>
          {meta?.people.map((person) => <option key={person.id} value={person.id}>{person.name || person.email}{person.role ? ` · ${person.role}` : ""}</option>)}
        </select>
      </label> : null}
      <label className={styles.spendingTopic}><span>Brand</span>
        <select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
          <option value="">All brands</option>
          {meta?.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </label>
      {tab === "requests" ? <>
        <label className={styles.spendingTopic}><span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Any</option><option value="2xx">Success (2xx)</option><option value="errors">Errors (4xx–5xx)</option>
            <option value="4xx">Client errors (4xx)</option><option value="denied">Refused (401/403)</option><option value="5xx">Server errors (5xx)</option>
          </select>
        </label>
        <label className={styles.spendingTopic}><span>Method</span>
          <select value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="">Any</option>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
      </> : null}
      {tab === "events" ? <>
        <label className={styles.spendingTopic}><span>Area</span>
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">All actions</option>{ACTION_AREAS.map((value) => <option key={value} value={value}>{value.replace(".", "")}</option>)}
          </select>
        </label>
        <label className={styles.spendingTopic}><span>Outcome</span>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            <option value="">Any</option><option value="success">Success</option><option value="failure">Failure</option><option value="denied">Denied</option>
          </select>
        </label>
      </> : null}
      {tab === "changes" ? <label className={styles.spendingTopic}><span>Table</span>
        <select value={table} onChange={(event) => setTable(event.target.value)}>
          <option value="">All tables</option>{TABLES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label> : null}
      <form className={styles.activitySearch} onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
        <label className={styles.spendingTopic}><span>Search</span>
          <input type="search" value={search} placeholder="Request id, path, id, text…" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button type="submit" className={styles.spendingMore}>Search</button>
      </form>
      {meta?.canSeeAllWorkspaces ? <label className={styles.activityToggle}>
        <input type="checkbox" checked={allWorkspaces} onChange={(event) => setAllWorkspaces(event.target.checked)} /> All workspaces
      </label> : null}
    </section>

    <div className={styles.activityActions}>
      <button type="button" className={styles.spendingMore} disabled={loading} onClick={() => { void load(false); void loadSummary(); }}>{loading ? "Loading…" : "Refresh"}</button>
      <button type="button" className={styles.spendingMore} disabled={!rows?.length} onClick={() => download(`activity-${tab}-${new Date().toISOString().slice(0, 19)}.json`, rows ?? [])}>Download JSON</button>
      {tab === "requests" && meta?.canPurge ? <button type="button" className={styles.spendingReset} onClick={purge}>Delete matching requests…</button> : null}
    </div>
    {notice ? <p className={styles.spendingNotice} role="status">{notice}</p> : null}

    {trail ? <section className={styles.activityTrail} aria-labelledby="activity-trail">
      <div className={styles.activityTrailHead}>
        <h2 id="activity-trail">Request <code>{trail.requestId}</code></h2>
        <button type="button" className={styles.spendingMore} onClick={() => setTrail(undefined)}>Close</button>
      </div>
      {trail.error ? <p className={styles.spendingNotice}>{trail.error}</p> : !trail.data ? <p className={styles.spendingLoading}>Loading…</p> : <>
        <h3>Calls</h3>
        <ul className={styles.spendingHistory}>{trail.data.requests.map((row) => <li key={row.id}><span><strong>{row.method} {row.path}</strong><small>{when(row.occurredAt)} · {who(row.actorType, row.actorId)} · {row.durationMs} ms</small></span><b className={statusTone(row.status)}>{row.status}</b></li>)}
          {!trail.data.requests.length ? <li><span>No call recorded with this id (it may have been deleted).</span></li> : null}</ul>
        <h3>Actions</h3>
        <ul className={styles.spendingHistory}>{trail.data.events.map((row) => <li key={row.id}><span><strong>{row.action}</strong><small>{when(row.occurredAt)} · {row.entityType} {row.entityId}</small></span><b className={outcomeTone(row.outcome)}>{row.outcome}</b></li>)}
          {!trail.data.events.length ? <li><span>No actions recorded.</span></li> : null}</ul>
        <h3>Data changed while it ran</h3>
        <ul className={styles.spendingHistory}>{trail.data.changes.map((row) => <li key={row.id}><span><strong>{row.operation} {row.tableName}</strong><small>{when(row.occurredAt)} · {row.rowKey}{row.changedColumns ? ` · ${row.changedColumns.join(", ")}` : ""}</small></span></li>)}
          {!trail.data.changes.length ? <li><span>No data changes in that window.</span></li> : null}</ul>
      </>}
    </section> : null}

    <section className={styles.spendingSection} aria-label="Results">
      {!rows && !error ? <p className={styles.spendingLoading} role="status">Loading activity…</p> : null}
      {rows && !rows.length ? <p className={styles.spendingNote}>Nothing matches these filters.</p> : null}

      {tab === "requests" && requests?.rows.length ? <ul className={styles.activityList}>{requests.rows.map((row) => <li key={row.id}>
        <button type="button" className={styles.activityRow} aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? undefined : row.id)}>
          <time>{when(row.occurredAt)}</time>
          <span className={styles.activityMethod}>{row.method}</span>
          <span className={styles.activityPath}>{row.path}{row.query ?? ""}</span>
          <span className={statusTone(row.status)}>{row.status}</span>
          <span className={styles.activityMuted}>{row.durationMs} ms</span>
          <span className={styles.activityMuted}>{who(row.actorType, row.actorId)}</span>
        </button>
        {open === row.id ? <div className={styles.activityDetail}>
          <dl>
            <div><dt>Request id</dt><dd>{row.requestId ? <button type="button" className={styles.activityLink} onClick={() => openTrail(row.requestId!)}>{row.requestId} · show everything it did</button> : "—"}</dd></div>
            <div><dt>Brand</dt><dd>{row.topicId ? brands.get(row.topicId) ?? row.topicId : "—"}</dd></div>
            <div><dt>Client</dt><dd>{row.ip ?? "—"} · {row.userAgent ?? "—"}</dd></div>
            <div><dt>Response size</dt><dd>{row.responseBytes !== null ? `${row.responseBytes.toLocaleString("en-US")} bytes` : "—"}</dd></div>
          </dl>
          <h4>Request body</h4><pre>{pretty(row.requestBody)}</pre>
          <h4>Response</h4><pre>{row.responseBody ? pretty(row.responseBody) : row.method === "GET" && row.status < 400 ? "Successful reads keep only their size." : "—"}</pre>
          {row.error ? <><h4>Error</h4><pre>{pretty(row.error)}</pre></> : null}
        </div> : null}
      </li>)}</ul> : null}

      {tab === "events" && events?.rows.length ? <ul className={styles.activityList}>{events.rows.map((row) => <li key={row.id}>
        <button type="button" className={styles.activityRow} aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? undefined : row.id)}>
          <time>{when(row.occurredAt)}</time>
          <span className={styles.activityPath}>{row.action}</span>
          <span className={outcomeTone(row.outcome)}>{row.outcome}</span>
          <span className={styles.activityMuted}>{who(row.actorType, row.actorId)}</span>
          <span className={styles.activityMuted}>{row.entityType ? `${row.entityType} ${row.entityId ?? ""}` : ""}</span>
        </button>
        {open === row.id ? <div className={styles.activityDetail}>
          <dl>
            <div><dt>Request id</dt><dd>{row.requestId ? <button type="button" className={styles.activityLink} onClick={() => openTrail(row.requestId!)}>{row.requestId} · show the request</button> : "—"}</dd></div>
            <div><dt>Brand</dt><dd>{row.topicId ? brands.get(row.topicId) ?? row.topicId : "—"}</dd></div>
            <div><dt>Actor</dt><dd>{row.actorType}{row.actorId ? ` · ${row.actorId}` : ""}</dd></div>
          </dl>
          <h4>Details</h4><pre>{pretty(row.details)}</pre>
        </div> : null}
      </li>)}</ul> : null}

      {tab === "changes" && changes?.rows.length ? <ul className={styles.activityList}>{changes.rows.map((row) => <li key={row.id}>
        <button type="button" className={styles.activityRow} aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? undefined : row.id)}>
          <time>{when(row.occurredAt)}</time>
          <span className={styles.activityMethod}>{row.operation}</span>
          <span className={styles.activityPath}>{row.tableName}</span>
          <span className={styles.activityMuted}>{row.rowKey}</span>
          <span className={styles.activityMuted}>{row.changedColumns?.join(", ") ?? ""}</span>
        </button>
        {open === row.id ? <div className={styles.activityDetail}>
          <dl>
            <div><dt>Brand</dt><dd>{row.topicId ? brands.get(row.topicId) ?? row.topicId : "—"}</dd></div>
            <div><dt>Transaction</dt><dd>{row.transactionId} · by {row.dbUser}</dd></div>
          </dl>
          <table className={styles.activityDiff}>
            <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
            <tbody>{Object.keys({ ...(row.oldValues ?? {}), ...(row.newValues ?? {}) }).sort().map((field) => <tr key={field}>
              <th scope="row">{field}</th>
              <td><pre>{row.oldValues && field in row.oldValues ? pretty(row.oldValues[field]) : "—"}</pre></td>
              <td><pre>{row.newValues && field in row.newValues ? pretty(row.newValues[field]) : "—"}</pre></td>
            </tr>)}</tbody>
          </table>
        </div> : null}
      </li>)}</ul> : null}

      {nextBefore ? <button type="button" className={styles.spendingMore} disabled={loading} onClick={() => void load(true)}>Load older</button> : null}
    </section>
  </main>;
}
