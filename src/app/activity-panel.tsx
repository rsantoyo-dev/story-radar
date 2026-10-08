"use client";

import { type ReactNode, useEffect, useState } from "react";

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

type Page<T> = { key: string; rows: T[]; actors: Record<string, string>; nextBefore: string | null; canSeeAllWorkspaces: boolean; error?: string };

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
      ? { ...current, rows: [...current.rows, ...(next.rows as T[])], actors: { ...current.actors, ...next.actors }, nextBefore: next.nextBefore, error: next.error }
      : current;
    if (mode === "actions") setActions(merge);
    else setChanges(merge);
    setLoadingMore(false);
  }

  return (
    <section className={`${styles.panel} ${styles.activityPanel}`} aria-labelledby="activity-title">
      <header>
        <span className={styles.eyebrow}>Activity</span>
        <h2 id="activity-title">What happened in this workspace</h2>
        <p>Actions taken by members, scheduled workers and Stripe, and every change to critical records. Both histories are append-only.</p>
      </header>

      <div className={styles.activityModes} role="group" aria-label="History">
        <button type="button" aria-pressed={mode === "actions"} onClick={() => setMode("actions")}>Actions</button>
        <button type="button" aria-pressed={mode === "changes"} onClick={() => setMode("changes")}>Record changes</button>
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
          ? <ActionList events={(page as Page<AuditEventRow>).rows} actors={page.actors} topicName={topicName} />
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

function ActionList({ events, actors, topicName }: { events: AuditEventRow[]; actors: Record<string, string>; topicName: (id: string | null) => string | undefined }) {
  return <DayGroups rows={events} render={(event) => {
    const actor = event.actorType === "user" && event.actorId ? actors[event.actorId] ?? ACTOR_LABELS.user : ACTOR_LABELS[event.actorType];
    const subject = event.action === "api.request" ? event.entityId : event.entityType ? `${event.entityType.replaceAll("_", " ")}${event.entityId ? ` · ${shortId(event.entityId)}` : ""}` : undefined;
    const details = Object.keys(event.details ?? {}).length ? event.details : undefined;
    return (
      <li key={event.id} className={styles.activityItem}>
        <span className={styles.activityDot} data-outcome={event.outcome} aria-hidden="true" />
        <div>
          <p><strong>{ACTION_LABELS[event.action] ?? event.action}</strong>{subject ? <code>{subject}</code> : null}</p>
          <small>{[actor, topicName(event.topicId), time(event.occurredAt), event.outcome === "success" ? undefined : event.outcome].filter(Boolean).join(" · ")}</small>
          {details || event.requestId ? (
            <details>
              <summary>Details</summary>
              <dl>
                <dt>Action</dt><dd><code>{event.action}</code></dd>
                {event.requestId ? <><dt>Request</dt><dd><code>{event.requestId}</code></dd></> : null}
                {details ? Object.entries(details).map(([name, value]) => <FieldRow key={name} name={name} value={value} />) : null}
              </dl>
            </details>
          ) : null}
        </div>
      </li>
    );
  }} />;
}

function ChangeList({ changes, topicName }: { changes: ChangeRow[]; topicName: (id: string | null) => string | undefined }) {
  return <DayGroups rows={changes} render={(change) => {
    const columns = change.operation === "UPDATE"
      ? change.changedColumns ?? Object.keys(change.newValues ?? {})
      : Object.keys((change.operation === "INSERT" ? change.newValues : change.oldValues) ?? {});
    return (
      <li key={change.id} className={styles.activityItem}>
        <span className={styles.activityDot} data-operation={change.operation} aria-hidden="true" />
        <div>
          <p><strong>{OPERATION_LABELS[change.operation]} · {TABLE_LABELS[change.tableName] ?? change.tableName}</strong><code>{shortId(change.rowKey)}</code></p>
          <small>{[change.operation === "UPDATE" ? columns.join(", ") : undefined, topicName(change.topicId), time(change.occurredAt)].filter(Boolean).join(" · ")}</small>
          <details>
            <summary>Values</summary>
            <table className={styles.activityValues}>
              <thead><tr><th scope="col">Field</th>{change.operation !== "INSERT" ? <th scope="col">Before</th> : null}{change.operation !== "DELETE" ? <th scope="col">After</th> : null}</tr></thead>
              <tbody>
                {columns.map((column) => (
                  <tr key={column}>
                    <th scope="row">{column}</th>
                    {change.operation !== "INSERT" ? <td>{display(change.oldValues?.[column])}</td> : null}
                    {change.operation !== "DELETE" ? <td>{display(change.newValues?.[column])}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Row <code>{change.rowKey}</code> · transaction {change.transactionId} · {change.dbUser}</p>
          </details>
        </div>
      </li>
    );
  }} />;
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

async function fetchPage(key: string, secret: string, signal?: AbortSignal): Promise<Page<unknown>> {
  const empty = { key, rows: [], actors: {}, nextBefore: null, canSeeAllWorkspaces: false };
  try {
    const response = await fetch(key, { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store", signal });
    const body = await response.json().catch(() => ({})) as { events?: unknown[]; changes?: unknown[]; actors?: Record<string, string>; nextBefore?: string | null; canSeeAllWorkspaces?: boolean; error?: string };
    if (!response.ok) {
      return { ...empty, error: response.status === 403 ? "Only owners and admins of this workspace can see its activity." : body.error ?? "Activity could not be loaded." };
    }
    return { key, rows: body.events ?? body.changes ?? [], actors: body.actors ?? {}, nextBefore: body.nextBefore ?? null, canSeeAllWorkspaces: body.canSeeAllWorkspaces === true };
  } catch (error) {
    if (signal?.aborted) return empty;
    return { ...empty, error: error instanceof Error ? error.message : "Activity could not be loaded." };
  }
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
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Long ids (UUIDs, hashed workspace ids) shortened for scanning; the full value is in the details. */
function shortId(value: string): string {
  return value.split(":").map((part) => (part.length > 14 ? `${part.slice(0, 8)}…` : part)).join(":");
}

function display(value: unknown): string {
  if (value === undefined || value === null) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}
