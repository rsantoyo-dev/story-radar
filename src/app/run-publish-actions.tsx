"use client";

import { useEffect, useRef, useState } from "react";

import { PUBLICATION_CHANNEL_LABELS, type PublicationChannel } from "./modules/meta/publication-channel";
import { useConnectedPublicationChannels, type ChannelOption } from "./publication-channels-panel";
import { scheduleInputBounds, scheduleLabel } from "./run-publish-schedule.core";
import { Button } from "./ui/primitives";
import styles from "./radar-dashboard.generated.module.css";

type FrozenPackage = { id: string; caption: string; hashtags: string[]; slides: unknown[]; firstComment?: string };
type CommentView = { status: "pending" | "posting" | "posted" | "failed"; error: string | null; postedAt: string | null };
type JobView = { id: string; status: string; permalink?: string | null; lastError?: string | null; canRetry?: boolean; publishAt?: string | null; comment?: CommentView | null };

/** A published post whose first comment is still being posted: the page keeps following it. */
const commentInFlight = (job: JobView | undefined) => job?.status === "published" && (job.comment?.status === "pending" || job.comment?.status === "posting");

/** The first comment's state under a published post, in a few words. */
function commentLine(comment: CommentView | null | undefined): string {
  if (!comment) return "";
  if (comment.status === "posted") return " · First comment posted";
  if (comment.status === "failed") return ` · First comment not posted: ${comment.error ?? "no reason was recorded."}`;
  return " · Posting the first comment…";
}
type Outcome = { channel: PublicationChannel; job?: JobView; error?: string };

const TERMINAL = new Set(["published", "failed", "suspended"]);
/** How often the page reads a scheduled order again: the server publishes it at its time; this only shows the change. */
const SCHEDULED_REFRESH_MS = 60_000;

/**
 * Publish the approved run from Prepare my day: freeze the exact package for
 * each chosen channel, show it for one explicit confirmation, then publish and
 * follow each order. Same server flow as the draft's Publication tab. The
 * confirmation can schedule the post instead (2026-10-19): the server keeps
 * the order and its worker publishes it at that time, page open or not; a
 * scheduled order can be sent now or cancelled until then. Confirming a post
 * whose earlier order stopped before anything was posted retries that order
 * (2026-10-21: the only retry left once v1's Publication tab was removed).
 */
export function RunPublishActions({ topicId, draftId, batchId, secret, disabled }: {
  topicId: string; draftId: string; batchId: string; secret: string; disabled?: boolean;
}) {
  const { options, error: channelsError } = useConnectedPublicationChannels(topicId, secret);
  const [prepared, setPrepared] = useState<{ option: ChannelOption; pkg: FrozenPackage }[]>();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Which channel is being prepared right now, for a clear "nothing is published yet" status. */
  const [preparing, setPreparing] = useState<{ label: string; index: number; total: number }>();
  const preparation = useRef<AbortController | undefined>(undefined);
  /** "" publishes now; a datetime-local value (the browser's time zone) schedules. */
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  /** Each channel's latest published order for this draft, so the panel says where it already went. */
  const [published, setPublished] = useState<Partial<Record<PublicationChannel, JobView>>>({});
  const channelKey = options?.map((option) => option.channel).join(",") ?? "";
  useEffect(() => {
    if (!channelKey) return;
    let disposed = false;
    void Promise.all(channelKey.split(",").map(async (channel) => {
      try {
        const response = await fetch(`/api/radar/creative/drafts/${encodeURIComponent(draftId)}/publication-job?topicId=${encodeURIComponent(topicId)}&channel=${channel}`, { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store" });
        const body = await response.json() as { jobs?: JobView[] };
        const jobs = response.ok ? body.jobs ?? [] : [];
        return { channel: channel as PublicationChannel, published: jobs.find((job) => job.status === "published"), active: jobs.find((job) => !TERMINAL.has(job.status)) };
      } catch { return { channel: channel as PublicationChannel, published: undefined, active: undefined }; }
    })).then((entries) => {
      if (disposed) return;
      setPublished(Object.fromEntries(entries.filter((entry) => entry.published).map((entry) => [entry.channel, entry.published!])));
      // A reload must never strand an order mid-send: pick up any still in progress and keep driving it.
      const active = entries.filter((entry) => entry.active).map((entry) => ({ channel: entry.channel, job: entry.active }));
      if (active.length) setOutcomes((current) => current.length ? current : active);
    });
    return () => { disposed = true; };
  }, [channelKey, draftId, topicId, secret, outcomes.length]);
  const headers = { Authorization: `Bearer ${secret.trim()}`, "Content-Type": "application/json" };
  const url = (kind: "publication-package" | "publication-job", channel: PublicationChannel, extra = "") =>
    `/api/radar/creative/drafts/${encodeURIComponent(draftId)}/${kind}?topicId=${encodeURIComponent(topicId)}&channel=${channel}${extra}`;

  async function prepare(chosen: ChannelOption[]) {
    const controller = new AbortController();
    preparation.current = controller;
    setBusy(true); setError(""); setOutcomes([]);
    const ready: { option: ChannelOption; pkg: FrozenPackage }[] = [];
    const problems: string[] = [];
    for (const [index, option] of chosen.entries()) {
      if (controller.signal.aborted) break;
      setPreparing({ label: PUBLICATION_CHANNEL_LABELS[option.channel], index: index + 1, total: chosen.length });
      try {
        const response = await fetch(url("publication-package", option.channel), { method: "POST", headers, body: JSON.stringify({ batchId, channel: option.channel }), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error([body.error, ...(Array.isArray(body.blockers) ? body.blockers.map((b: { message: string }) => b.message) : [])].filter(Boolean).join(" · ") || "Not ready to publish");
        ready.push({ option, pkg: body.package });
      } catch (err) {
        if (controller.signal.aborted) break;
        problems.push(`${PUBLICATION_CHANNEL_LABELS[option.channel]}: ${err instanceof Error ? err.message : "not ready to publish"}`);
      }
    }
    setPreparing(undefined);
    setBusy(false);
    if (controller.signal.aborted) return; // Cancelled: nothing was published, and a frozen review is harmless.
    setPrepared(ready.length ? ready : undefined);
    setError(problems.join("\n"));
  }

  function cancelPreparation() {
    preparation.current?.abort();
    setPreparing(undefined);
    setBusy(false);
  }

  async function publish() {
    if (!prepared) return;
    const publishAt = scheduling && scheduleAt ? new Date(scheduleAt).toISOString() : undefined;
    setBusy(true); setError("");
    const started: Outcome[] = [];
    for (const { option, pkg } of prepared) {
      try {
        const send = async (retryJobId?: string): Promise<JobView> => {
          const response = await fetch(url("publication-job", option.channel), { method: "POST", headers, body: JSON.stringify({ packageId: pkg.id, ...(retryJobId ? { retryJobId } : {}), ...(publishAt ? { publishAt } : {}) }) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Could not start publishing");
          return body.job as JobView;
        };
        let job = await send();
        // The same post was ordered before and stopped before anything was posted (a delivery window that
        // closed, a retryable failure): the server answers with that order, and confirming again is the
        // editor's explicit retry of it, now or at the new time. An uncertain outcome is never retried here.
        if ((job.status === "suspended" || job.status === "failed") && job.canRetry) job = await send(job.id);
        started.push({ channel: option.channel, job });
      } catch (err) {
        started.push({ channel: option.channel, error: err instanceof Error ? err.message : "Could not start publishing" });
      }
    }
    setOutcomes(started);
    setPrepared(undefined);
    setScheduling(false); setScheduleAt("");
    setBusy(false);
  }

  /** Sends a scheduled order now, or cancels it (nothing was sent: the post can be published or scheduled again). */
  async function changeSchedule(outcome: Outcome, action: "publish-now" | "cancel-schedule") {
    if (!outcome.job) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url("publication-job", outcome.channel), { method: "PATCH", headers, body: JSON.stringify({ jobId: outcome.job.id, action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The scheduled post could not be changed");
      setOutcomes((current) => action === "cancel-schedule"
        ? current.filter((entry) => entry.channel !== outcome.channel)
        : current.map((entry) => entry.channel === outcome.channel ? { ...entry, job: body.job as JobView } : entry));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The scheduled post could not be changed");
    } finally { setBusy(false); }
  }

  /** Tries a first comment that was not posted again; nothing else about the post changes. */
  async function retryComment(channel: PublicationChannel, job: JobView) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url("publication-job", channel), { method: "PATCH", headers, body: JSON.stringify({ jobId: job.id, action: "retry-comment" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The first comment could not be tried again");
      const next = body.job as JobView;
      setOutcomes((current) => current.some((entry) => entry.channel === channel) ? current.map((entry) => entry.channel === channel ? { ...entry, job: next } : entry) : [...current, { channel, job: next }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The first comment could not be tried again");
    } finally { setBusy(false); }
  }

  // Follow each order until it is published, failed or suspended, and a published post until its first comment is up; the page drives it while open. A scheduled order is read once a minute.
  const pending = outcomes.filter((o) => o.job && ((!TERMINAL.has(o.job.status) && o.job.status !== "scheduled") || commentInFlight(o.job))).map((o) => `${o.channel}:${o.job!.id}`).join(",");
  const waiting = outcomes.filter((o) => o.job?.status === "scheduled").map((o) => `${o.channel}:${o.job!.id}`).join(",");
  useEffect(() => {
    if (!waiting) return;
    let disposed = false;
    const timer = setInterval(async () => {
      const next = await Promise.all(outcomes.map(async (outcome) => {
        if (outcome.job?.status !== "scheduled") return outcome;
        try {
          const response = await fetch(url("publication-job", outcome.channel, `&jobId=${encodeURIComponent(outcome.job.id)}`), { headers, cache: "no-store" });
          const body = await response.json();
          return response.ok && body.job ? { ...outcome, job: body.job as JobView } : outcome;
        } catch { return outcome; }
      }));
      if (!disposed) setOutcomes(next);
    }, SCHEDULED_REFRESH_MS);
    return () => { disposed = true; clearInterval(timer); };
    // `waiting` captures exactly which orders are scheduled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);
  useEffect(() => {
    if (!pending) return;
    let disposed = false;
    const timer = setInterval(async () => {
      const next = await Promise.all(outcomes.map(async (outcome) => {
        if (!outcome.job || (TERMINAL.has(outcome.job.status) && !commentInFlight(outcome.job))) return outcome;
        try {
          const response = await fetch(url("publication-job", outcome.channel, `&jobId=${encodeURIComponent(outcome.job.id)}`), { headers, cache: "no-store" });
          const body = await response.json();
          return response.ok && body.job ? { ...outcome, job: body.job as JobView } : outcome;
        } catch { return outcome; }
      }));
      if (!disposed) setOutcomes(next);
    }, 2500);
    return () => { disposed = true; clearInterval(timer); };
    // `pending` captures exactly which orders still need polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (channelsError) return <p role="alert">{channelsError}</p>;
  if (!options) return <p><small>Checking connected channels…</small></p>;
  if (!options.length) return <p><small>Connect the topic&rsquo;s Facebook Page or Instagram in Channels to publish from here.</small></p>;
  // A first comment still being posted does not hold the buttons: the post itself is up.
  const working = busy || outcomes.some((o) => o.job && !TERMINAL.has(o.job.status) && o.job.status !== "scheduled");
  const label = (option: ChannelOption) => `${PUBLICATION_CHANNEL_LABELS[option.channel]}${option.accountHint ? ` (${option.accountHint})` : ""}`;
  // A channel with a post already scheduled offers no second send: change or cancel the scheduled one.
  const scheduledChannels = new Set(outcomes.filter((o) => o.job?.status === "scheduled").map((o) => o.channel));
  const sendable = options.filter((option) => !scheduledChannels.has(option.channel));
  const bounds = scheduleInputBounds(new Date());

  return <section className={styles.runPublish} aria-label="Publish">
    <h3>Publish</h3>
    {Object.keys(published).length ? <ul className={styles.runPublishResults}>{(Object.entries(published) as [PublicationChannel, JobView][]).map(([channel, job]) => <li key={channel} data-status="published">
      <strong>{PUBLICATION_CHANNEL_LABELS[channel]}</strong> Published{job.permalink ? <> · <a href={job.permalink} target="_blank" rel="noreferrer">View post ↗</a></> : null}{outcomes.some((o) => o.job?.id === job.id) ? null : commentLine(job.comment)}
      {job.comment?.status === "failed" && !outcomes.some((o) => o.job?.id === job.id) ? <>{" "}<Button size="compact" variant="quiet" disabled={disabled || busy} onClick={() => void retryComment(channel, job)}>Try the comment again</Button></> : null}
    </li>)}</ul> : null}
    {preparing ? <div className={styles.runPublishConfirm} role="status" aria-live="polite">
      <strong>Preparing the exact post for {preparing.label}{preparing.total > 1 ? ` (${preparing.index} of ${preparing.total})` : ""}…</strong>
      <p>This takes about 30 seconds per channel. Nothing is published until you confirm on the next screen.</p>
      <div className={styles.dailyPlannerActions}><button type="button" className={styles.secondaryButton} onClick={cancelPreparation}>Cancel</button></div>
    </div> : null}
    {!prepared && !working && sendable.length ? <div className={styles.dailyPlannerActions}>
      {sendable.map((option) => <button key={option.channel} type="button" className={styles.secondaryButton} disabled={disabled || working} onClick={() => void prepare([option])}>
        {published[option.channel] ? "Publish again to" : "Publish to"} {PUBLICATION_CHANNEL_LABELS[option.channel]}
      </button>)}
      {sendable.length > 1 ? <button type="button" className={styles.primaryButton} disabled={disabled || working} onClick={() => void prepare(sendable)}>Publish everywhere</button> : null}
    </div> : prepared ? <div className={styles.runPublishConfirm} role="group" aria-label="Confirm publication">
      <strong>{scheduling ? "Schedule" : "Publish"} this exact post {scheduling ? "" : "now "}to {prepared.map((p) => label(p.option)).join(" and ")}?</strong>
      <p>{prepared[0].pkg.slides.length} {prepared[0].pkg.slides.length === 1 ? "image" : "images"} · {prepared[0].pkg.caption.length > 280 ? `${prepared[0].pkg.caption.slice(0, 280)}…` : prepared[0].pkg.caption}</p>
      {prepared[0].pkg.hashtags.length ? <p><small>{prepared[0].pkg.hashtags.join(" ")}</small></p> : null}
      {prepared[0].pkg.firstComment ? <p><small>First comment, posted once the post is up: {prepared[0].pkg.firstComment}</small></p> : null}
      <div role="radiogroup" aria-label="When to publish" className={styles.dailyPlannerActions}>
        <label><input type="radio" name="publish-when" checked={!scheduling} disabled={busy} onChange={() => setScheduling(false)} /> Publish now</label>
        <label><input type="radio" name="publish-when" checked={scheduling} disabled={busy} onChange={() => { setScheduling(true); setScheduleAt((current) => current || bounds.suggested); }} /> Schedule for later</label>
      </div>
      {scheduling ? <label className={styles.field}><span>Publication time <small>({timeZone})</small></span>
        <input type="datetime-local" value={scheduleAt} min={bounds.min} max={bounds.max} step={300} disabled={busy} onChange={(event) => setScheduleAt(event.currentTarget.value)} />
        <small>The server publishes it at this time, within about 5 to 20 minutes, with this page closed. Up to 6 days ahead; it can be sent now or cancelled until then.</small>
      </label> : null}
      <div className={styles.dailyPlannerActions}>
        <button type="button" className={styles.primaryButton} disabled={busy || (scheduling && !scheduleAt)} onClick={() => void publish()}>{busy ? "Starting…" : scheduling ? `Schedule for ${scheduleAt ? scheduleLabel(new Date(scheduleAt).toISOString()) : "…"}` : "Confirm publish"}</button>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { setPrepared(undefined); setScheduling(false); setScheduleAt(""); }}>Cancel</button>
      </div>
    </div> : null}
    {error ? <p role="alert" className={styles.runPublishError}>{error}</p> : null}
    {outcomes.length ? <ul className={styles.runPublishResults}>{outcomes.map((outcome) => <li key={outcome.channel} data-status={outcome.error ? "failed" : outcome.job?.status}>
      <strong>{PUBLICATION_CHANNEL_LABELS[outcome.channel]}</strong>{" "}
      {outcome.error ? outcome.error
        : outcome.job?.status === "scheduled" ? <>Scheduled for {outcome.job.publishAt ? scheduleLabel(outcome.job.publishAt) : "later"}{" "}
          <Button size="compact" disabled={disabled || busy} onClick={() => void changeSchedule(outcome, "publish-now")}>Publish now</Button>{" "}
          <Button size="compact" variant="quiet" disabled={disabled || busy} onClick={() => void changeSchedule(outcome, "cancel-schedule")}>Cancel the scheduled post</Button></>
        : outcome.job?.status === "published" ? <>Published{outcome.job.permalink ? <> · <a href={outcome.job.permalink} target="_blank" rel="noreferrer">View post ↗</a></> : null}{commentLine(outcome.job.comment)}
          {outcome.job.comment?.status === "failed" ? <>{" "}<Button size="compact" variant="quiet" disabled={disabled || busy} onClick={() => void retryComment(outcome.channel, outcome.job!)}>Try the comment again</Button></> : null}</>
        : TERMINAL.has(outcome.job?.status ?? "") ? `${outcome.job?.status === "suspended" ? "Suspended" : "Failed"}: ${outcome.job?.lastError ?? "no reason was recorded."}${outcome.job?.canRetry ? " Nothing was posted: publish it again to retry it." : ""}`
        : "Publishing… keep this page open."}
    </li>)}</ul> : null}
  </section>;
}
