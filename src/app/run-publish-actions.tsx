"use client";

import { useEffect, useRef, useState } from "react";

import { PUBLICATION_CHANNEL_LABELS, type PublicationChannel } from "./modules/meta/publication-channel";
import { useConnectedPublicationChannels, type ChannelOption } from "./publication-channels-panel";
import styles from "./radar-dashboard.generated.module.css";

type FrozenPackage = { id: string; caption: string; hashtags: string[]; slides: unknown[] };
type JobView = { id: string; status: string; permalink?: string | null; lastError?: string | null; canRetry?: boolean };
type Outcome = { channel: PublicationChannel; job?: JobView; error?: string };

const TERMINAL = new Set(["published", "failed", "suspended"]);

/**
 * Publish the approved run from Prepare my day: freeze the exact package for
 * each chosen channel, show it for one explicit confirmation, then publish and
 * follow each order. Same server flow as the draft's Publication tab.
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
    setBusy(true); setError("");
    const started: Outcome[] = [];
    for (const { option, pkg } of prepared) {
      try {
        const response = await fetch(url("publication-job", option.channel), { method: "POST", headers, body: JSON.stringify({ packageId: pkg.id }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not start publishing");
        started.push({ channel: option.channel, job: body.job });
      } catch (err) {
        started.push({ channel: option.channel, error: err instanceof Error ? err.message : "Could not start publishing" });
      }
    }
    setOutcomes(started);
    setPrepared(undefined);
    setBusy(false);
  }

  // Follow each order until it is published, failed or suspended; the page drives it while open.
  const pending = outcomes.filter((o) => o.job && !TERMINAL.has(o.job.status)).map((o) => `${o.channel}:${o.job!.id}`).join(",");
  useEffect(() => {
    if (!pending) return;
    let disposed = false;
    const timer = setInterval(async () => {
      const next = await Promise.all(outcomes.map(async (outcome) => {
        if (!outcome.job || TERMINAL.has(outcome.job.status)) return outcome;
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
  const working = busy || Boolean(pending);
  const label = (option: ChannelOption) => `${PUBLICATION_CHANNEL_LABELS[option.channel]}${option.accountHint ? ` (${option.accountHint})` : ""}`;

  return <section className={styles.runPublish} aria-label="Publish">
    <h3>Publish</h3>
    {Object.keys(published).length ? <ul className={styles.runPublishResults}>{(Object.entries(published) as [PublicationChannel, JobView][]).map(([channel, job]) => <li key={channel} data-status="published">
      <strong>{PUBLICATION_CHANNEL_LABELS[channel]}</strong> Published{job.permalink ? <> · <a href={job.permalink} target="_blank" rel="noreferrer">View post ↗</a></> : null}
    </li>)}</ul> : null}
    {preparing ? <div className={styles.runPublishConfirm} role="status" aria-live="polite">
      <strong>Preparing the exact post for {preparing.label}{preparing.total > 1 ? ` (${preparing.index} of ${preparing.total})` : ""}…</strong>
      <p>This takes about 30 seconds per channel. Nothing is published until you confirm on the next screen.</p>
      <div className={styles.dailyPlannerActions}><button type="button" className={styles.secondaryButton} onClick={cancelPreparation}>Cancel</button></div>
    </div> : null}
    {!prepared && !working ? <div className={styles.dailyPlannerActions}>
      {options.map((option) => <button key={option.channel} type="button" className={styles.secondaryButton} disabled={disabled || working} onClick={() => void prepare([option])}>
        {published[option.channel] ? "Publish again to" : "Publish to"} {PUBLICATION_CHANNEL_LABELS[option.channel]}
      </button>)}
      {options.length > 1 ? <button type="button" className={styles.primaryButton} disabled={disabled || working} onClick={() => void prepare(options)}>Publish everywhere</button> : null}
    </div> : prepared ? <div className={styles.runPublishConfirm} role="group" aria-label="Confirm publication">
      <strong>Publish this exact post now to {prepared.map((p) => label(p.option)).join(" and ")}?</strong>
      <p>{prepared[0].pkg.slides.length} {prepared[0].pkg.slides.length === 1 ? "image" : "images"} · {prepared[0].pkg.caption.length > 280 ? `${prepared[0].pkg.caption.slice(0, 280)}…` : prepared[0].pkg.caption}</p>
      {prepared[0].pkg.hashtags.length ? <p><small>{prepared[0].pkg.hashtags.join(" ")}</small></p> : null}
      <div className={styles.dailyPlannerActions}>
        <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void publish()}>{busy ? "Starting…" : "Confirm publish"}</button>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setPrepared(undefined)}>Cancel</button>
      </div>
    </div> : null}
    {error ? <p role="alert" className={styles.runPublishError}>{error}</p> : null}
    {outcomes.length ? <ul className={styles.runPublishResults}>{outcomes.map((outcome) => <li key={outcome.channel} data-status={outcome.error ? "failed" : outcome.job?.status}>
      <strong>{PUBLICATION_CHANNEL_LABELS[outcome.channel]}</strong>{" "}
      {outcome.error ? outcome.error
        : outcome.job?.status === "published" ? <>Published{outcome.job.permalink ? <> · <a href={outcome.job.permalink} target="_blank" rel="noreferrer">View post ↗</a></> : null}</>
        : TERMINAL.has(outcome.job?.status ?? "") ? `${outcome.job?.status === "suspended" ? "Suspended" : "Failed"}: ${outcome.job?.lastError ?? "see the draft's Publication tab"}${outcome.job?.canRetry ? " Retry it from the draft's Publication tab." : ""}`
        : "Publishing… keep this page open."}
    </li>)}</ul> : null}
  </section>;
}
