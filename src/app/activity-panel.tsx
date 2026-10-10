"use client";

import { type ReactNode, useEffect, useState } from "react";

import { describeRoute } from "./modules/observability/request-labels";
import styles from "./radar-dashboard.generated.module.css";

type Outcome = "success" | "failure" | "denied" | "attempted";

type AuditEventRow = {
  id: string;
  occurredAt: string;
  topicId: string | null;
  actorType: "user" | "operator" | "worker" | "stripe" | "system";
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  outcome: Outcome;
  requestId: string | null;
  details: Record<string, unknown>;
};

type ChangeRow = {
  id: string;
  occurredAt: string;
  tableName: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  rowKey: string;
  topicId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedColumns: string[] | null;
  dbUser: string;
  transactionId: number;
};

type Page<T> = { key: string; rows: T[]; actors: Record<string, string>; subjects: Record<string, string>; nextBefore: string | null; canSeeAllWorkspaces: boolean; error?: string };

type Problem = { time?: string; level?: string; module?: string; msg?: string; [field: string]: unknown };

/** The answer of /api/radar/audit/requests/[requestId] (request-trace.ts). */
type RequestTraceData = {
  requestId: string;
  request: { route: string | null; outcome: Outcome; actorType: AuditEventRow["actorType"]; actorName: string | null; topicId: string | null; startedAt: string | null; finishedAt: string; durationMs: number | null };
  window: { from: string; to: string; followUntil: string; approximate: boolean };
  events: AuditEventRow[];
  problems: Problem[];
  changes: ChangeRow[];
  textCalls: { id: string; createdAt: string; finishedAt: string | null; storyId: string; provider: string; model: string; operation: string; status: string; reservedMicros: number; chargedMicros: number | null; usage: unknown }[];
  charges: { id: string; createdAt: string; storyId: string | null; kind: string; provider: string; model: string; operation: string; units: Record<string, unknown>; costMicros: number | null; estimated: boolean }[];
  subjects: Record<string, string>;
  totals: { providerCostMicros: number; chargedTextMicros: number };
};

const AREAS: [string, string][] = [
  ["", "All actions"],
  ["auth.", "Sign-in"],
  ["workspace.", "Workspace and members"],
  ["topic.", "Brands"],
  ["meta.", "Channels"],
  ["publication.", "Publishing"],
  ["billing.", "Billing"],
  ["credits.", "Credits"],
  ["admin.", "Administration"],
  ["api.", "API requests"],
];

const ACTION_LABELS: Record<string, string> = {
  "api.request": "API request",
  "auth.user.created": "Account created",
  "auth.session.created": "Signed in",
  "workspace.created": "Workspace created",
  "workspace.member.added": "Member added",
  "platform.staff.granted": "Platform staff granted",
  "topic.created": "Brand created",
  "topic.updated": "Brand updated",
  "topic.deleted": "Brand deleted",
  "meta.instagram.connected": "Instagram connected",
  "meta.instagram.disconnected": "Instagram disconnected",
  "meta.facebook.connected": "Facebook Page connected",
  "meta.facebook.disconnected": "Facebook Page disconnected",
  "publication.package.frozen": "Publication package frozen",
  "publication.package.discarded": "Publication package discarded",
  "publication.publish.requested": "Publishing requested",
  "publication.job.confirmed_not_published": "Confirmed not published",
  "billing.checkout.started": "Checkout started",
  "billing.purchase.paid": "Credits bought",
  "billing.purchase.refunded": "Purchase refunded",
  "billing.checkout.expired": "Checkout expired",
  "credits.demo.reset": "Demo credits reset",
  "admin.topic_data.cleared": "Brand data cleared",
};

const ACTOR_LABELS: Record<AuditEventRow["actorType"], string> = {
  user: "A member",
  operator: "Operator",
  worker: "Scheduled worker",
  stripe: "Stripe",
  system: "System",
};

/** The tables the change trigger watches (FEAT-OBS-001, layer 3). */
const TABLES: [string, string][] = [
  ["topics", "Brands"],
  ["creative_profiles", "Creative profiles"],
  ["editorial_lines", "Editorial lines"],
  ["topic_editorial_profiles", "Editorial criteria"],
  ["rss_sources", "RSS feeds"],
  ["topic_sources", "Brand feed links"],
  ["topic_auto_collection_settings", "Automatic collection"],
  ["topic_meta_connections", "Instagram connections"],
  ["topic_facebook_connections", "Facebook Page connections"],
  ["creative_drafts", "Drafts"],
  ["creative_assets", "Generated images"],
  ["instagram_publication_packages", "Publication packages"],
  ["instagram_publication_jobs", "Publishing jobs"],
  ["story_social_publications", "Publication marks"],
  ["workspaces", "Workspaces"],
  ["workspace_members", "Workspace members"],
  ["workspace_invitations", "Invitations"],
  ["workspace_credit_entries", "Credit ledger"],
  ["billing_purchases", "Purchases"],
  ["billing_customers", "Billing customers"],
  ["users", "Users"],
  ["platform_staff", "Platform staff"],
];
const TABLE_LABELS = Object.fromEntries(TABLES);
const OPERATION_LABELS: Record<ChangeRow["operation"], string> = { INSERT: "Created", UPDATE: "Updated", DELETE: "Deleted" };

export function ActivityPanel({ secret, topics, active }: { secret: string; topics: { id: string; name: string }[]; active: boolean }) {
  const [mode, setMode] = useState<"actions" | "changes">("actions");
  const [area, setArea] = useState("");
  const [outcome, setOutcome] = useState("");
  const [includeApi, setIncludeApi] = useState(false);
  const [table, setTable] = useState("");
  const [operation, setOperation] = useState("");
  const [allWorkspaces, setAllWorkspaces] = useState(false);
  const [topicId, setTopicId] = useState("");
  const [actions, setActions] = useState<Page<AuditEventRow>>();
  const [changes, setChanges] = useState<Page<ChangeRow>>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [openRequest, setOpenRequest] = useState<string>();

  const query = new URLSearchParams();
  if (topicId) query.set("topicId", topicId);
  if (mode === "actions") {
    if (area) query.set("action", area);
    if (outcome) query.set("outcome", outcome);
    if (!includeApi && area !== "api.") query.set("excludeAction", "api.request");
  } else {
    if (table) query.set("table", table);
    if (operation) query.set("operation", operation);
  }
  if (allWorkspaces) query.set("scope", "all");
  const path = mode === "actions" ? "/api/radar/audit" : "/api/radar/admin/changes";
  const key = `${path}?${query}`;
  const page = mode === "actions" ? actions : changes;
  const loading = active && page?.key !== key;
  const topicName = (id: string | null) => (id ? topics.find((topic) => topic.id === id)?.name ?? "Another brand" : undefined);

  useEffect(() => {
    if (!active || !secret.trim()) return;
    const controller = new AbortController();
    void fetchPage(key, secret, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      if (key.startsWith("/api/radar/audit")) setActions(next as Page<AuditEventRow>);
      else setChanges(next as Page<ChangeRow>);
    });
    return () => controller.abort();
  }, [active, key, secret]);

  async function loadOlder() {
    if (!page?.nextBefore || loadingMore) return;
    setLoadingMore(true);
    const older = new URLSearchParams(query);
    older.set("before", page.nextBefore);
    const next = await fetchPage(`${path}?${older}`, secret);
    const merge = <T,>(current: Page<T> | undefined) => current?.key === key
      ? { ...current, rows: [...current.rows, ...(next.rows as T[])], actors: { ...current.actors, ...next.actors }, subjects: { ...current.subjects, ...next.subjects }, nextBefore: next.nextBefore, error: next.error }
      : current;
    if (mode === "actions") setActions(merge);
    else setChanges(merge);
    setLoadingMore(false);
  }

  if (openRequest) {
    return <RequestView requestId={openRequest} secret={secret} allWorkspaces={allWorkspaces} topicName={topicName} onBack={() => setOpenRequest(undefined)} />;
  }

  return (
    <section className={`${styles.panel} ${styles.activityPanel}`} aria-labelledby="activity-title">
      <header>
        <span className={styles.eyebrow}>Activity</span>
        <h2 id="activity-title">What happened in this workspace</h2>
        <p>Actions taken by members, scheduled workers and Stripe, and every change to critical records. Open a request to see everything it did. Both histories are append-only.</p>
      </header>

      <div className={styles.activityToolbar}>
        <div className={styles.activityModes} role="group" aria-label="History">
          <button type="button" aria-pressed={mode === "actions"} onClick={() => setMode("actions")}>Actions</button>
          <button type="button" aria-pressed={mode === "changes"} onClick={() => setMode("changes")}>Record changes</button>
        </div>
        <button type="button" className={styles.activityDownload} disabled={!page?.rows.length || loading}
          onClick={() => downloadJson(`activity-${mode}-${new Date().toISOString().slice(0, 19).replaceAll(":", "")}.json`, { exportedAt: new Date().toISOString(), filters: Object.fromEntries(query), ...(mode === "actions" ? { actors: page?.actors, subjects: page?.subjects } : {}), rows: page?.rows ?? [] })}>
          Download
        </button>
      </div>

      <div className={styles.activityFilters}>
        {mode === "actions" ? <>
          <label><span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value)}>
              {AREAS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label><span>Outcome</span>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
              <option value="">Any outcome</option>
              <option value="success">Succeeded</option>
              <option value="failure">Failed</option>
              <option value="denied">Denied</option>
              <option value="attempted">Attempted</option>
            </select>
          </label>
        </> : <>
          <label><span>Record</span>
            <select value={table} onChange={(event) => setTable(event.target.value)}>
              <option value="">All records</option>
              {TABLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label><span>Change</span>
            <select value={operation} onChange={(event) => setOperation(event.target.value)}>
              <option value="">Any change</option>
              <option value="INSERT">Created</option>
              <option value="UPDATE">Updated</option>
              <option value="DELETE">Deleted</option>
            </select>
          </label>
        </>}
        <label><span>Brand</span>
          <select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
            <option value="">All brands</option>
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
        </label>
        {mode === "actions" && area !== "api." ? (
          <label className={styles.activityToggle}><input type="checkbox" checked={includeApi} onChange={(event) => setIncludeApi(event.target.checked)} />Include API requests</label>
        ) : null}
        {page?.canSeeAllWorkspaces ? (
          <label className={styles.activityToggle}><input type="checkbox" checked={allWorkspaces} onChange={(event) => setAllWorkspaces(event.target.checked)} />All workspaces</label>
        ) : null}
      </div>

      {page?.key === key && page.error ? <p className={styles.activityEmpty} role="alert">{page.error}</p> : null}
      {loading ? <p className={styles.activityEmpty} role="status">Loading…</p> : page && !page.error && page.rows.length === 0 ? (
        <p className={styles.activityEmpty}>Nothing recorded for these filters yet.{query.has("excludeAction") ? " API requests are hidden; include them to see every change request." : ""}</p>
      ) : null}

      {!loading && page && page.rows.length ? (
        mode === "actions"
          ? <ActionList events={(page as Page<AuditEventRow>).rows} actors={page.actors} subjects={page.subjects} topicName={topicName} onOpenRequest={setOpenRequest} />
          : <ChangeList changes={(page as Page<ChangeRow>).rows} topicName={topicName} />
      ) : null}

      {!loading && page?.nextBefore ? (
        <button type="button" className={styles.activityMore} onClick={() => void loadOlder()} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load older"}
        </button>
      ) : null}
    </section>
  );
}

type TopicName = (id: string | null) => string | undefined;

function ActionList({ events, actors, subjects, topicName, onOpenRequest }: { events: AuditEventRow[]; actors: Record<string, string>; subjects: Record<string, string>; topicName: TopicName; onOpenRequest: (requestId: string) => void }) {
  return <DayGroups rows={events} render={(event) => {
    const actor = event.actorType === "user" && event.actorId ? actors[event.actorId] ?? ACTOR_LABELS.user : ACTOR_LABELS[event.actorType];
    const route = event.action === "api.request" ? event.entityId : null;
    const subject = route ? subjectOf(route, subjects) : undefined;
    const problems = problemsOf(event.details);
    const otherDetails = Object.entries(event.details ?? {}).filter(([name]) => !REQUEST_FIELDS.has(name));
    return (
      <li key={event.id} className={styles.activityItem}>
        <span className={styles.activityDot} data-outcome={problems.errors ? "failure" : event.outcome} aria-hidden="true" />
        <div>
          <p>
            <strong>{route ? describeRoute(route) ?? "API request" : ACTION_LABELS[event.action] ?? event.action}</strong>
            {subject ? <span className={styles.activitySubject}>“{subject}”</span> : null}
            {!route && event.entityType ? <code>{`${event.entityType.replaceAll("_", " ")}${event.entityId ? ` · ${shortId(event.entityId)}` : ""}`}</code> : null}
          </p>
          <small>{[
            actor,
            topicName(event.topicId),
            time(event.occurredAt),
            typeof event.details?.durationMs === "number" ? duration(event.details.durationMs) : undefined,
            problems.errors ? plural(problems.errors, "error") : undefined,
            problems.warnings ? plural(problems.warnings, "warning") : undefined,
            event.outcome === "success" || event.outcome === "attempted" ? undefined : event.outcome,
          ].filter(Boolean).join(" · ")}</small>
          {route ? <code className={styles.activityRoute}>{shortId(route)}</code> : null}
          <div className={styles.activityItemActions}>
            {event.requestId ? <button type="button" onClick={() => onOpenRequest(event.requestId!)}>Open request →</button> : null}
            {otherDetails.length ? (
              <details>
                <summary>Details</summary>
                <dl>
                  <dt>Action</dt><dd><code>{event.action}</code></dd>
                  {otherDetails.map(([name, value]) => <FieldRow key={name} name={name} value={value} />)}
                </dl>
              </details>
            ) : null}
          </div>
        </div>
      </li>
    );
  }} />;
}

function ChangeList({ changes, topicName }: { changes: ChangeRow[]; topicName: TopicName }) {
  return <DayGroups rows={changes} render={(change) => (
    <li key={change.id} className={styles.activityItem}>
      <span className={styles.activityDot} data-operation={change.operation} aria-hidden="true" />
      <ChangeBody change={change} topicName={topicName} />
    </li>
  )} />;
}

function ChangeBody({ change, topicName, offset }: { change: ChangeRow; topicName: TopicName; offset?: string }) {
  const columns = changeColumns(change);
  // A created or deleted row lists only the fields that held something.
  const shown = change.operation === "UPDATE" ? columns : columns.filter((column) => !isEmpty((change.operation === "INSERT" ? change.newValues : change.oldValues)?.[column]));
  return (
    <div>
      <p><strong>{OPERATION_LABELS[change.operation]} · {TABLE_LABELS[change.tableName] ?? change.tableName}</strong><code>{shortId(change.rowKey)}</code></p>
      <small>{[offset, change.operation === "UPDATE" ? columns.join(", ") : undefined, topicName(change.topicId), offset ? undefined : time(change.occurredAt)].filter(Boolean).join(" · ")}</small>
      <details>
        <summary>Values</summary>
        <table className={styles.activityValues}>
          <thead><tr><th scope="col">Field</th>{change.operation !== "INSERT" ? <th scope="col">Before</th> : null}{change.operation !== "DELETE" ? <th scope="col">After</th> : null}</tr></thead>
          <tbody>
            {shown.map((column) => (
              <tr key={column}>
                <th scope="row">{column}</th>
                {change.operation !== "INSERT" ? <td>{display(change.oldValues?.[column])}</td> : null}
                {change.operation !== "DELETE" ? <td>{display(change.newValues?.[column])}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        <p>{shown.length < columns.length ? `${plural(columns.length - shown.length, "empty field")} hidden · ` : ""}Row <code>{change.rowKey}</code> · transaction {change.transactionId} · {change.dbUser}</p>
      </details>
    </div>
  );
}

type TimelineItem = { at: number; key: string; kind: "action" | "ai" | "change"; node: ReactNode; change?: ChangeRow };

/** One request replayed: what it was, what it logged, and what changed and ran while it did. */
function RequestView({ requestId, secret, allWorkspaces, topicName, onBack }: { requestId: string; secret: string; allWorkspaces: boolean; topicName: TopicName; onBack: () => void }) {
  const [result, setResult] = useState<{ requestId: string; trace?: RequestTraceData; error?: string }>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const url = `/api/radar/audit/requests/${encodeURIComponent(requestId)}${allWorkspaces ? "?scope=all" : ""}`;
    fetch(url, { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as RequestTraceData & { error?: string };
        if (!controller.signal.aborted) setResult(response.ok ? { requestId, trace: body } : { requestId, error: body.error ?? "This request could not be loaded." });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ requestId, error: error instanceof Error ? error.message : "This request could not be loaded." });
      });
    return () => controller.abort();
  }, [requestId, secret, allWorkspaces]);

  const trace = result?.requestId === requestId ? result.trace : undefined;
  const error = result?.requestId === requestId ? result.error : undefined;
  const origin = trace ? new Date(trace.request.startedAt ?? trace.window.from).getTime() : 0;
  const offset = (iso: string) => `+${duration(Math.max(0, new Date(iso).getTime() - origin))}`;
  const route = trace?.request.route ?? null;
  const subject = route && trace ? subjectOf(route, trace.subjects) : undefined;
  const actor = trace ? trace.request.actorName ?? ACTOR_LABELS[trace.request.actorType] : undefined;

  const timeline: TimelineItem[] = trace ? [
    ...trace.events.filter((event) => event.action !== "api.request").map((event) => ({
      at: new Date(event.occurredAt).getTime(), key: `event-${event.id}`, kind: "action" as const,
      node: <div><p><strong>{ACTION_LABELS[event.action] ?? event.action}</strong>{event.entityId ? <code>{shortId(event.entityId)}</code> : null}</p><small>{[offset(event.occurredAt), event.outcome].join(" · ")}</small></div>,
    })),
    ...trace.textCalls.map((call) => ({
      at: new Date(call.createdAt).getTime(), key: `text-${call.id}`, kind: "ai" as const,
      node: <div>
        <p><strong>AI text · {call.operation.replaceAll("_", " ")}</strong><code>{call.provider} · {call.model}</code></p>
        <small>{[offset(call.createdAt), call.finishedAt ? `took ${duration(new Date(call.finishedAt).getTime() - new Date(call.createdAt).getTime())}` : "not finished", call.status, call.chargedMicros !== null ? money(call.chargedMicros) : `${money(call.reservedMicros)} reserved`, trace.subjects[call.storyId] ? `“${trace.subjects[call.storyId]}”` : undefined].filter(Boolean).join(" · ")}</small>
        {call.usage ? <details><summary>Usage</summary><pre>{JSON.stringify(call.usage, null, 2)}</pre></details> : null}
      </div>,
    })),
    ...trace.charges.map((charge) => ({
      at: new Date(charge.createdAt).getTime(), key: `charge-${charge.id}`, kind: "ai" as const,
      node: <div>
        <p><strong>AI {charge.kind} · {charge.operation.replaceAll("_", " ")}</strong><code>{charge.provider} · {charge.model}</code></p>
        <small>{[offset(charge.createdAt), charge.costMicros !== null ? `${money(charge.costMicros)}${charge.estimated ? " estimated" : ""}` : "unpriced", charge.storyId && trace.subjects[charge.storyId] ? `“${trace.subjects[charge.storyId]}”` : undefined].filter(Boolean).join(" · ")}</small>
        {Object.keys(charge.units ?? {}).length ? <details><summary>Units</summary><pre>{JSON.stringify(charge.units, null, 2)}</pre></details> : null}
      </div>,
    })),
    ...trace.changes.map((change) => ({
      at: new Date(change.occurredAt).getTime(), key: `change-${change.id}`, kind: "change" as const,
      node: <ChangeBody change={change} topicName={topicName} offset={offset(change.occurredAt)} />, change,
    })),
  ].sort((left, right) => left.at - right.at) : [];
  const steps = trace ? groupRepeatedChanges(timeline, topicName, offset) : [];
  const responseEnd = trace ? new Date(trace.window.to).getTime() : 0;
  const firstLater = steps.findIndex((item) => item.at > responseEnd);

  return (
    <section className={`${styles.panel} ${styles.activityPanel}`} aria-labelledby="request-title">
      <button type="button" className={styles.activityBack} onClick={onBack}>← Back to activity</button>
      {error ? <p className={styles.activityEmpty} role="alert">{error}</p> : !trace ? <p className={styles.activityEmpty} role="status">Loading the request…</p> : <>
        <header className={styles.activityRequestHeader}>
          <div>
            <span className={styles.eyebrow}>Request</span>
            <h2 id="request-title">{route ? describeRoute(route) ?? "API request" : ACTION_LABELS[trace.events[0]?.action ?? ""] ?? "Request"}</h2>
            {subject ? <p>“{subject}”</p> : null}
          </div>
          <button type="button" className={styles.activityDownload} onClick={() => downloadJson(`request-${requestId.replace(/[^A-Za-z0-9_-]+/gu, "_")}.json`, trace)}>Download</button>
        </header>

        <dl className={styles.activityFacts}>
          <div><dt>When</dt><dd>{new Date(trace.request.startedAt ?? trace.request.finishedAt).toLocaleString()}</dd></div>
          <div><dt>Duration</dt><dd>{trace.request.durationMs !== null ? duration(trace.request.durationMs) : "Not recorded"}</dd></div>
          <div><dt>Who</dt><dd>{actor}</dd></div>
          {trace.request.topicId ? <div><dt>Brand</dt><dd>{topicName(trace.request.topicId)}</dd></div> : null}
          <div><dt>AI and provider cost</dt><dd>{money(trace.totals.providerCostMicros + trace.totals.chargedTextMicros)}</dd></div>
          <div><dt>Records changed</dt><dd>{trace.changes.length}</dd></div>
          {route ? <div className={styles.activityFactWide}><dt>Route</dt><dd><code>{route}</code></dd></div> : null}
          <div className={styles.activityFactWide}><dt>Request id</dt><dd><code>{requestId}</code>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(requestId).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy"}</button>
          </dd></div>
        </dl>

        {trace.problems.length ? (
          <section className={styles.activityProblems} aria-label="Warnings and errors">
            <h3>Warnings and errors</h3>
            <ol>
              {trace.problems.map((problem, index) => {
                const fields = Object.entries(problem).filter(([name]) => !["time", "level", "module", "msg"].includes(name));
                return (
                  <li key={index} data-level={problem.level}>
                    <p><strong>{problem.level === "error" ? "Error" : "Warning"}</strong><span>{problem.msg}</span>{problem.module ? <code>{problem.module}</code> : null}</p>
                    {problem.time ? <small>{offset(problem.time)}</small> : null}
                    {fields.length ? <details><summary>Fields</summary><pre>{JSON.stringify(Object.fromEntries(fields), null, 2)}</pre></details> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className={styles.activityTimeline} aria-label="What happened">
          <h3>What happened</h3>
          <p className={styles.activityNote}>
            {trace.window.approximate
              ? "This request was recorded before start times were kept, so changes and AI calls are matched to the minute before it finished."
              : `Changes and AI calls in this workspace between ${time(trace.window.from)} and ${time(trace.window.to)}.`}
            {" "}Each database query runs on its own, so work from another request at the same moment can appear here too.
          </p>
          {steps.length ? (
            <ol>
              {steps.map((item, index) => (
                <li key={item.key} className={styles.activityItem} data-later={index === firstLater ? "first" : undefined}>
                  {index === firstLater ? <span className={styles.activityAfter}>After the response · the same records and story, for 10 minutes</span> : null}
                  <span className={styles.activityDot} data-kind={item.kind} aria-hidden="true" />
                  {item.node}
                </li>
              ))}
            </ol>
          ) : <p className={styles.activityEmpty}>No record changes or AI calls were found in this window.</p>}
        </section>
      </>}
    </section>
  );
}

/** Consecutive changes of the same kind to the same table and fields read as one step. */
function groupRepeatedChanges(items: TimelineItem[], topicName: TopicName, offset: (iso: string) => string): TimelineItem[] {
  const groupKey = (item: TimelineItem) => item.change ? `${item.change.operation}|${item.change.tableName}|${changeColumns(item.change).join(",")}` : undefined;
  const steps: TimelineItem[][] = [];
  for (const item of items) {
    const last = steps.at(-1);
    const key = groupKey(item);
    if (key && last && groupKey(last[0]!) === key) last.push(item);
    else steps.push([item]);
  }
  return steps.map((group) => {
    const first = group[0]!;
    if (group.length === 1 || !first.change) return first;
    const change = first.change;
    const last = group.at(-1)!.change!;
    return {
      ...first,
      key: `${first.key}-group`,
      node: <div>
        <p><strong>{group.length} × {OPERATION_LABELS[change.operation]} · {TABLE_LABELS[change.tableName] ?? change.tableName}</strong></p>
        <small>{[`${offset(change.occurredAt)} to ${offset(last.occurredAt)}`, change.operation === "UPDATE" ? changeColumns(change).join(", ") : undefined, topicName(change.topicId)].filter(Boolean).join(" · ")}</small>
        <details>
          <summary>Show each</summary>
          <ol className={styles.activityGroup}>
            {group.map((item) => <li key={item.key}><ChangeBody change={item.change!} topicName={topicName} offset={offset(item.change!.occurredAt)} /></li>)}
          </ol>
        </details>
      </div>,
    };
  });
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
    || (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);
}

/** Rows under a heading per day, newest first, as the API returns them. */
function DayGroups<T extends { id: string; occurredAt: string }>({ rows, render }: { rows: T[]; render: (row: T) => ReactNode }) {
  const days: { label: string; rows: T[] }[] = [];
  for (const row of rows) {
    const label = dayLabel(row.occurredAt);
    const last = days.at(-1);
    if (last?.label === label) last.rows.push(row);
    else days.push({ label, rows: [row] });
  }
  return <div className={styles.activityDays}>
    {days.map((day) => (
      <section key={day.label} aria-label={day.label}>
        <h3>{day.label}</h3>
        <ol>{day.rows.map(render)}</ol>
      </section>
    ))}
  </div>;
}

function FieldRow({ name, value }: { name: string; value: unknown }) {
  return <><dt>{name}</dt><dd>{display(value)}</dd></>;
}

/** Fields of an `api.request` event that Activity shows in its own places. */
const REQUEST_FIELDS = new Set(["startedAt", "durationMs", "problems"]);

function problemsOf(details: Record<string, unknown> | undefined): { errors: number; warnings: number } {
  const problems = Array.isArray(details?.problems) ? details.problems as Problem[] : [];
  return { errors: problems.filter((problem) => problem.level === "error").length, warnings: problems.filter((problem) => problem.level === "warn").length };
}

function subjectOf(route: string, subjects: Record<string, string>): string | undefined {
  const ids = route.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu) ?? [];
  return ids.map((id) => subjects[id]).find(Boolean);
}

function changeColumns(change: ChangeRow): string[] {
  return change.operation === "UPDATE"
    ? change.changedColumns ?? Object.keys(change.newValues ?? {})
    : Object.keys((change.operation === "INSERT" ? change.newValues : change.oldValues) ?? {});
}

async function fetchPage(key: string, secret: string, signal?: AbortSignal): Promise<Page<unknown>> {
  const empty = { key, rows: [], actors: {}, subjects: {}, nextBefore: null, canSeeAllWorkspaces: false };
  try {
    const response = await fetch(key, { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store", signal });
    const body = await response.json().catch(() => ({})) as { events?: unknown[]; changes?: unknown[]; actors?: Record<string, string>; subjects?: Record<string, string>; nextBefore?: string | null; canSeeAllWorkspaces?: boolean; error?: string };
    if (!response.ok) {
      return { ...empty, error: response.status === 403 ? "Only owners and admins of this workspace can see its activity." : body.error ?? "Activity could not be loaded." };
    }
    return { key, rows: body.events ?? body.changes ?? [], actors: body.actors ?? {}, subjects: body.subjects ?? {}, nextBefore: body.nextBefore ?? null, canSeeAllWorkspaces: body.canSeeAllWorkspaces === true };
  } catch (error) {
    if (signal?.aborted) return empty;
    return { ...empty, error: error instanceof Error ? error.message : "Activity could not be loaded." };
  }
}

function downloadJson(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/** Provider micros (1,000,000 = US$1) in dollars, with more digits for small amounts. */
function money(micros: number): string {
  return `US$${(micros / 1_000_000).toFixed(micros > 0 && micros < 10_000 ? 4 : 2)}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Long ids (UUIDs, hashed workspace ids) shortened for scanning; the full value is in the details. */
function shortId(value: string): string {
  return value.split(/([:/ ])/u).map((part) => (part.length > 14 ? `${part.slice(0, 8)}…` : part)).join("");
}

function display(value: unknown): string {
  if (value === undefined || value === null) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}
