"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CandidateDestinationSummary, PublicationCandidate } from "./modules/meta/instagram-publication-candidate";
import {
  DEFAULT_PUBLICATION_CHANNEL,
  PUBLICATION_CHANNEL_LABELS,
  publicationPlatformLabel,
  type PublicationChannel,
} from "./modules/meta/publication-channel";
import type { FrozenPackage } from "./modules/meta/freeze-publication-package.core";
import type {
  PublicationJobView,
  PublicationJobStatus,
} from "./modules/meta/publish-publication-package.core";
import styles from "./creative-draft-workspace.generated.module.css";
import { publicationBlockerTarget, type BlockerTarget } from "./publication-blocker-target";

export type { BlockerTarget };

const TERMINAL_JOB_STATUS: PublicationJobStatus[] = [
  "published",
  "failed",
  "suspended",
];

function jobStatusText(status: PublicationJobStatus, platform: string): string {
  switch (status) {
    case "queued": return "Queued…";
    case "preparing": return "Re-checking access and approvals…";
    case "creating-containers": return `Uploading images to ${platform}…`;
    case "containers-ready": return `Waiting for ${platform} to process the media…`;
    case "publishing": return "Publishing…";
    case "pending-confirmation": return `Pending confirmation — verifying with ${platform}, not resending.`;
    case "published": return "Published";
    case "failed": return "Failed";
    case "suspended": return "Suspended";
  }
}

/** The account a channel publishes as, for display. Never a token or internal id when a name exists. */
function destinationLabel(destination: CandidateDestinationSummary, channel: PublicationChannel, fallback?: string): string {
  if (channel === "facebook-page") return destination.pageName ?? fallback ?? (destination.pageId ? `Page ${destination.pageId}` : "Not connected");
  const account = destination.igUsername ? `@${destination.igUsername}` : destination.igUserId ?? fallback ?? "Not connected";
  return channel === "instagram-page" ? `${account} (through the Facebook Page)` : account;
}

type Props = {
  topicId: string;
  draftId: string;
  batchId: string;
  secret: string;
  disabled?: boolean;
  /** PUB-10 delivery channel. Defaults to the direct Instagram connection. */
  channel?: PublicationChannel;
  /** Display name of the connected account/Page when a package does not carry one. */
  accountHint?: string;
  /** Takes the editor to where a blocker is resolved (script tab or one image). */
  onGoToBlocker?: (target: BlockerTarget) => void;
};

export function InstagramPublicationCandidatePanel({ topicId, draftId, batchId, secret, disabled, channel = DEFAULT_PUBLICATION_CHANNEL, accountHint, onGoToBlocker }: Props) {
  const platform = publicationPlatformLabel(channel);
  const [result, setResult] = useState<PublicationCandidate>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [packages, setPackages] = useState<FrozenPackage[]>([]);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageError, setPackageError] = useState("");
  const [job, setJob] = useState<PublicationJobView>();
  const [jobBusy, setJobBusy] = useState(false);
  const [confirmPackageId, setConfirmPackageId] = useState("");
  const publishing = useRef(false);
  const [jobPackageId, setJobPackageId] = useState("");
  const [jobError, setJobError] = useState("");
  const request = useRef<AbortController | null>(null);
  const packageUrl = `/api/radar/creative/drafts/${encodeURIComponent(draftId)}/publication-package?topicId=${encodeURIComponent(topicId)}&channel=${channel}`;
  const jobUrl = `/api/radar/creative/drafts/${encodeURIComponent(draftId)}/publication-job?topicId=${encodeURIComponent(topicId)}&channel=${channel}`;
  const authHeader = () => ({ Authorization: `Bearer ${secret.trim()}` });
  const jobActive = Boolean(job && !TERMINAL_JOB_STATUS.includes(job.status));

  useEffect(() => {
    const controller = new AbortController();
    async function restore() {
      try {
        const headers = { Authorization: `Bearer ${secret.trim()}` };
        const [packageResponse, jobResponse] = await Promise.all([
          fetch(packageUrl, { cache: "no-store", headers, signal: controller.signal }),
          fetch(jobUrl, { cache: "no-store", headers, signal: controller.signal }),
        ]);
        if (!packageResponse.ok || !jobResponse.ok) return;
        const packageBody = await packageResponse.json();
        const jobBody = await jobResponse.json();
        if (controller.signal.aborted) return;
        const savedPackages: FrozenPackage[] = packageBody.packages ?? [];
        const savedJobs: PublicationJobView[] = jobBody.jobs ?? [];
        setPackages(savedPackages);
        const latest = savedJobs.at(-1);
        setJob(latest);
        setJobPackageId(latest?.packageId ?? "");
      } catch { /* A later validation can reload the state. */ }
    }
    void restore();
    return () => controller.abort();
  }, [packageUrl, jobUrl, secret]);

  async function loadPackages() {
    try {
      const response = await fetch(packageUrl, { cache: "no-store", headers: authHeader() });
      const body = await response.json();
      if (response.ok) setPackages(body.packages ?? []);
      const jobResponse = await fetch(jobUrl, { cache: "no-store", headers: authHeader() });
      if (jobResponse.ok) {
        const latest = ((await jobResponse.json()).jobs as PublicationJobView[] | undefined)?.at(-1);
        setJob(latest); setJobPackageId(latest?.packageId ?? "");
      }
    } catch {
      /* the panel still works without the list */
    }
  }

  useEffect(() => {
    function invalidate() { request.current?.abort(); setBusy(false); setResult(undefined); }
    window.addEventListener("focus", invalidate);
    return () => { request.current?.abort(); window.removeEventListener("focus", invalidate); };
  }, []);

  useEffect(() => {
    if (!result?.publishingAccess) return;
    const timer = window.setTimeout(() => setResult(undefined), Math.max(0, Date.parse(result.publishingAccess.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [result]);
  async function validate() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setResult(undefined); setError("");
    try {
      const query = new URLSearchParams({ topicId, batchId, channel });
      const response = await fetch(`/api/radar/creative/drafts/${encodeURIComponent(draftId)}/publication-candidate?${query}`, {
        cache: "no-store", headers: authHeader(), signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publication validation failed");
      if (!controller.signal.aborted) { setResult(body); void loadPackages(); }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Publication validation failed");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  async function freeze() {
    setPackageBusy(true); setPackageError("");
    try {
      const response = await fetch(packageUrl, {
        method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ batchId, channel }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          [body.error, ...(Array.isArray(body.blockers) ? body.blockers.map((b: { message: string }) => b.message) : [])]
            .filter(Boolean).join(" · ") || "Freezing failed",
        );
      }
      setPackages((current) => [body.package, ...current.filter((p) => p.id !== body.package.id)]);
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : "Freezing failed");
    } finally { setPackageBusy(false); }
  }

  async function discard(id: string) {
    setPackageBusy(true); setPackageError("");
    try {
      const response = await fetch(packageUrl, {
        method: "DELETE", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ packageId: id }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Could not discard the package");
      setPackages((current) => current.filter((p) => p.id !== id));
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : "Could not discard the package");
    } finally { setPackageBusy(false); }
  }

  /** The newest unexpired review of the order's exact content; re-freezing makes a stale package current. */
  function retryPackageId(orderPackageId: string): string {
    const order = packages.find((item) => item.id === orderPackageId);
    if (!order) return orderPackageId;
    const newest = packages
      .filter((item) => item.status === "frozen" && item.packageHash === order.packageHash && Date.parse(item.expiresAt) > Date.now())
      .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0];
    return newest?.id ?? orderPackageId;
  }

  async function publish(packageId: string, retryJobId?: string) {
    if (publishing.current || jobActive || packageBusy) return;
    if (!retryJobId) {
      const selectedPackage = packages.find((item) => item.id === packageId);
      if (!selectedPackage || selectedPackage.status !== "frozen" || selectedPackage.publishingAccessPending || Date.parse(selectedPackage.expiresAt) <= Date.now()) {
        setConfirmPackageId("");
        setJobError("This publication review is no longer ready. Check readiness and prepare a new review.");
        return;
      }
    }
    publishing.current = true;
    setJobBusy(true);
    setJobError(""); setJobPackageId(packageId);
    try {
      const response = await fetch(jobUrl, {
        method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ packageId, retryJobId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start publishing");
      setJob(body.job);
      setConfirmPackageId("");
    } catch (err) {
      setJobError(err instanceof Error ? err.message : "Could not start publishing");
    } finally { publishing.current = false; setJobBusy(false); }
  }

  // Poll the job while it is running; the effect only mounts a timer while a
  // non-terminal job is set, and clears it when the job finishes or unmounts.
  const jobId = job?.id;
  const jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || !jobStatus || TERMINAL_JOB_STATUS.includes(jobStatus)) return;
    let cancelled = false;
    const url = `/api/radar/creative/drafts/${encodeURIComponent(draftId)}/publication-job?topicId=${encodeURIComponent(topicId)}&jobId=${encodeURIComponent(jobId)}`;
    const poll = async () => {
      try {
        const response = await fetch(url, {
          cache: "no-store", headers: { Authorization: `Bearer ${secret.trim()}` },
        });
        const body = await response.json();
        if (!cancelled && response.ok && body.job) setJob(body.job);
      } catch {
        /* keep polling; a transient error is not a job failure */
      }
    };
    const timer = window.setInterval(poll, 2_500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [jobId, jobStatus, draftId, topicId, secret]);

  return <section className={styles.publicationCandidate} aria-label={`${PUBLICATION_CHANNEL_LABELS[channel]} publication readiness`}>
    <h4>Review {PUBLICATION_CHANNEL_LABELS[channel]} publication</h4>
    <p>Check the saved script, selected visuals, permissions, and destination. Preparing the review does not publish.</p>
    <button type="button" className={styles.secondaryButton} disabled={disabled || busy} onClick={validate}>{busy ? "Checking publication readiness…" : "Check publication readiness"}</button>
    {disabled ? <p>Finish editing and save the current version before validating.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {result && !disabled ? <div aria-live="polite">
      <strong>{result.state === "ready" ? "Ready to publish" : result.state === "candidate" ? "Candidate · delivery checks pending" : "Not yet a candidate"}</strong>
      <p>{channel === "facebook-page" ? "Page" : "Account"}: {destinationLabel(result.destination, channel, accountHint)}</p>
      {result.publishingAccess ? <p>
        Publishing access: <strong>{result.publishingAccess.state}</strong>
        {result.publishingAccess.quota && channel !== "facebook-page" ? ` · ${result.publishingAccess.quota.remaining}/${result.publishingAccess.quota.total} posts left in the current window` : ""}
        <br /><small>{result.publishingAccess.message}</small>
      </p> : null}
      {(() => {
        // Access/destination reasons are already shown in the line above.
        const rest = result.blockers.filter((b) => !/^(publishing-|destination-)/.test(b.code));
        return rest.length ? <ul>{rest.map((blocker, index) => {
          const target = onGoToBlocker ? publicationBlockerTarget(blocker) : undefined;
          return <li key={`${blocker.code}:${blocker.assetId || index}`}>
            {blocker.message}
            {target ? <>{" "}<button type="button" className={styles.blockerAction} onClick={() => onGoToBlocker?.(target)}>{target.label}</button></> : null}
          </li>;
        })}</ul> : null;
      })()}
      <details><summary>Validated copy and image selection</summary>
        <p className={styles.publicationCaption}>{result.caption}</p>
        <p>{result.hashtags.join(" ")}</p>
        <ol>{result.assets.map(asset => <li key={asset.id}>Image {asset.order} · version {asset.version} · {asset.sha256 ? "File verified" : "File not verified"}</li>)}</ol>
        <p>Draft revision {result.draftVersion} · checked {new Date(result.checkedAt).toLocaleString()}</p>
      </details>
      {(() => {
        const onlyAccessBlockers = result.blockers.length > 0 && result.blockers.every((b) => /^(publishing-|destination-)/.test(b.code));
        const canFreeze = result.state === "ready" || (result.state === "candidate" && onlyAccessBlockers);
        return canFreeze ? <>
          <button type="button" className={styles.secondaryButton} disabled={packageBusy} onClick={freeze}>
            {packageBusy ? "Preparing exact review…" : "Prepare exact publication review"}
          </button>
          {result.state !== "ready" ? <p><small>The approved set is complete, but publishing access is still pending. You can prepare the package now; it cannot be published until access is verified.</small></p> : null}
        </> : null;
      })()}
      <p>This is a point-in-time check. Changes require validation again. Publishing requires an explicit Publish now action. Scheduling is not enabled.</p>
    </div> : null}

    {packageError ? <p role="alert">{packageError}</p> : null}
    {!disabled && packages.length > 0 ? <div className={styles.publicationPackage}>
      <strong>Prepared publication reviews</strong>
      <p>Review the exact account, caption, and ordered media. Preparation does not publish or schedule.</p>
      {packages.map((pkg) => <article key={pkg.id} className={styles.publicationPackageEntry}>
        <p>
          <strong>{pkg.status === "frozen" ? "Ready for final review" : pkg.status === "stale" ? "Stale — the approved set changed" : job?.packageId === pkg.id && job.status === "published" ? "Published" : "Publication attempt recorded"}</strong>
          {" · "}{pkg.mediaType === "carousel" ? "Carousel" : "Single image"}
          {pkg.draftVersion ? ` · Script v${pkg.draftVersion}` : ""}
        </p>
        <p>{channel === "facebook-page" ? "Page" : "Account"}: <strong>{destinationLabel(pkg.destination, channel, accountHint)}</strong> · Review expires {new Date(pkg.expiresAt).toLocaleString()} (local time)</p>
        {pkg.publishingAccessPending ? <p><small>Publishing access was not verified when this review was prepared. Verify access in Channels before publishing.</small></p> : null}
        <p className={styles.publicationCaption}>{pkg.caption}</p>
        {pkg.hashtags.length ? <p>{pkg.hashtags.join(" ")}</p> : null}
        <ol className={styles.publicationPreviewList}>{pkg.slides.map((slide) => <li key={slide.unitOrder} className={styles.publicationPackageSlide}>
          <Image unoptimized src={slide.deliveryUrl} width={108} height={135} alt={`Publication image ${slide.unitOrder} of ${pkg.slides.length}`} />
          <span>Image {slide.unitOrder} · version {slide.assetVersion}</span>
        </li>)}</ol>
        <details><summary>Technical delivery details</summary>
          <p>Package hash: <code>{pkg.packageHash}</code></p>
          <ul>{pkg.slides.map((slide) => <li key={slide.unitOrder}>Image {slide.unitOrder}: {slide.width}×{slide.height} · {(slide.byteSize / 1024).toFixed(0)} KB · SHA-256 <code>{slide.sha256}</code> · {slide.transform} · <a href={slide.deliveryUrl} target="_blank" rel="noreferrer">delivery file</a></li>)}</ul>
        </details>
        <div className={styles.publicationPackageActions}>
          {pkg.status === "frozen" && !pkg.publishingAccessPending ? <button type="button" className={styles.secondaryButton} disabled={jobActive || jobBusy || Date.parse(pkg.expiresAt) <= Date.now()} onClick={() => setConfirmPackageId(pkg.id)}>
            {jobActive && jobPackageId === pkg.id ? "Publishing…" : "Review and publish"}
          </button> : null}
          {pkg.status === "frozen" && Date.parse(pkg.expiresAt) <= Date.now() ? <small>This review expired. Check readiness and prepare a new review.</small> : null}
          {pkg.status === "frozen" && pkg.publishingAccessPending ? <small>Verify publishing access before this can be published.</small> : null}
          {pkg.status !== "consumed" && job?.packageId !== pkg.id ? <button type="button" className={styles.secondaryButton} disabled={packageBusy || jobBusy || (jobActive && jobPackageId === pkg.id)} onClick={() => discard(pkg.id)}>Discard package</button> : null}
        </div>
        {confirmPackageId === pkg.id && pkg.status === "frozen" && !pkg.publishingAccessPending && Date.parse(pkg.expiresAt) > Date.now() ? <div className={styles.publicationConfirm} role="group" aria-label={`Confirm ${platform} publication`}>
          <strong>Publish this exact review to {destinationLabel(pkg.destination, channel, accountHint)} on {platform} now?</strong>
          <p>This sends {pkg.slides.length} {pkg.slides.length === 1 ? "image" : "images"} and the caption above{channel === "facebook-page" ? " as one Page post" : ""}. Scheduling is not enabled.</p>
          <div className={styles.publicationPackageActions}>
            <button type="button" className={styles.primaryButton} disabled={jobBusy || jobActive || packageBusy} onClick={() => void publish(pkg.id)}>{jobBusy ? "Starting publication…" : "Confirm publish now"}</button>
            <button type="button" className={styles.secondaryButton} disabled={jobBusy} onClick={() => setConfirmPackageId("")}>Keep reviewing</button>
          </div>
        </div> : null}
      </article>)}
      {jobError ? <p role="alert">{jobError}</p> : null}
      {job ? <div className={styles.publicationJob} aria-live="polite">
        <strong>{job.status === "pending-confirmation" && job.publishedMediaId ? `${platform} confirmed publication — saving its record…` : jobStatusText(job.status, platform)}</strong>
        {job.status === "pending-confirmation" ? null : job.lastError ? <p><small>{job.lastError}</small></p> : null}
        {job.status === "published" && job.permalink ? <p><a href={job.permalink} target="_blank" rel="noreferrer">View the published post</a></p> : null}
        {job.status === "published" && !job.permalink ? <p><small>Published and recorded. The permalink is not available yet.</small></p> : null}
        {job.canRetry ? <button type="button" className={styles.secondaryButton} disabled={!jobPackageId || jobBusy || packageBusy} onClick={() => void publish(retryPackageId(jobPackageId), job.id)}>{jobBusy ? "Starting retry…" : job.status === "suspended" ? "Revalidate and retry publishing" : "Retry publishing"}</button> : null}
        {job.status === "suspended" && !job.canRetry && job.failureKind !== "uncertain" ? <p><small>Review the recorded reason before creating another publication order.</small></p> : null}
        <p><small>{channel === "facebook-page" ? "Images are uploaded unpublished and appear only as one post." : "A finished container is not a confirmed publication. A carousel posts as one."}</small></p>
      </div> : null}
    </div> : null}
  </section>;
}
