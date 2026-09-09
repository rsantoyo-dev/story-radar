"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicationCandidate } from "./modules/meta/instagram-publication-candidate";
import type { FrozenPackage } from "./modules/meta/freeze-publication-package.core";
import type {
  PublicationJobView,
  PublicationJobStatus,
} from "./modules/meta/publish-publication-package.core";
import styles from "./creative-draft-workspace.generated.module.css";

const TERMINAL_JOB_STATUS: PublicationJobStatus[] = [
  "published",
  "failed",
  "suspended",
];

const JOB_STATUS_TEXT: Record<PublicationJobStatus, string> = {
  queued: "Queued…",
  preparing: "Re-checking access and approvals…",
  "creating-containers": "Uploading images to Instagram…",
  "containers-ready": "Waiting for Instagram to process the media…",
  publishing: "Publishing…",
  "pending-confirmation":
    "Pending confirmation — verifying with Instagram, not resending.",
  published: "Published",
  failed: "Failed",
  suspended: "Suspended",
};

type Props = { topicId: string; draftId: string; batchId: string; secret: string; disabled?: boolean };

export function InstagramPublicationCandidatePanel({ topicId, draftId, batchId, secret, disabled }: Props) {
  const [result, setResult] = useState<PublicationCandidate>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [packages, setPackages] = useState<FrozenPackage[]>([]);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageError, setPackageError] = useState("");
  const [job, setJob] = useState<PublicationJobView>();
  const [jobPackageId, setJobPackageId] = useState("");
  const [jobError, setJobError] = useState("");
  const request = useRef<AbortController | null>(null);
  const packageUrl = `/api/radar/creative/drafts/${encodeURIComponent(draftId)}/publication-package?topicId=${encodeURIComponent(topicId)}`;
  const jobUrl = `/api/radar/creative/drafts/${encodeURIComponent(draftId)}/publication-job?topicId=${encodeURIComponent(topicId)}`;
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
      const query = new URLSearchParams({ topicId, batchId });
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
        method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ batchId }),
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

  async function publish(packageId: string, retryJobId?: string) {
    setJobError(""); setJobPackageId(packageId);
    try {
      const response = await fetch(jobUrl, {
        method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ packageId, retryJobId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start publishing");
      setJob(body.job);
    } catch (err) {
      setJobError(err instanceof Error ? err.message : "Could not start publishing");
    }
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

  return <section className={styles.publicationCandidate} aria-label="Instagram publication readiness">
    <h4>Instagram publication</h4>
    <p>Validate the saved script and selected images against their approvals, evidence, usage permissions and destination.</p>
    <button type="button" className={styles.secondaryButton} disabled={disabled || busy} onClick={validate}>{busy ? "Validating approved files…" : "Validate publication candidate"}</button>
    {disabled ? <p>Finish editing and save the current version before validating.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {result && !disabled ? <div aria-live="polite">
      <strong>{result.state === "ready" ? "Ready to publish" : result.state === "candidate" ? "Candidate · delivery checks pending" : "Not yet a candidate"}</strong>
      <p>Account: {result.destination.igUsername ? `@${result.destination.igUsername}` : result.destination.igUserId || "Not connected"}</p>
      {result.publishingAccess ? <p>
        Publishing access: <strong>{result.publishingAccess.state}</strong>
        {result.publishingAccess.quota ? ` · ${result.publishingAccess.quota.remaining}/${result.publishingAccess.quota.total} posts left in the current window` : ""}
        <br /><small>{result.publishingAccess.message}</small>
      </p> : null}
      {(() => {
        // Access/destination reasons are already shown in the line above.
        const rest = result.blockers.filter((b) => !/^(publishing-|destination-)/.test(b.code));
        return rest.length ? <ul>{rest.map((blocker, index) => <li key={`${blocker.code}:${blocker.assetId || index}`}>{blocker.message}</li>)}</ul> : null;
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
            {packageBusy ? "Freezing approved files…" : "Freeze publication package"}
          </button>
          {result.state !== "ready" ? <p><small>The approved set is complete, but publishing access is still pending. You can prepare the package now; it cannot be published until access is verified.</small></p> : null}
        </> : null;
      })()}
      <p>This is a point-in-time check. Changes require validation again. Publishing requires an explicit Publish now action. Scheduling is not enabled.</p>
    </div> : null}

    {packageError ? <p role="alert">{packageError}</p> : null}
    {!disabled && packages.length > 0 ? <div className={styles.publicationPackage}>
      <strong>Frozen packages</strong>
      <p>Freezing prepares the exact caption and re-encoded images for delivery to Instagram. It does not publish or schedule.</p>
      {packages.map((pkg) => <article key={pkg.id} className={styles.publicationPackageEntry}>
        <p>
          <strong>{pkg.status === "frozen" ? "Frozen" : pkg.status === "stale" ? "Stale — the approved set changed" : "Consumed"}</strong>
          {" · "}{pkg.mediaType}{" · "}<code>{pkg.packageHash.slice(0, 12)}</code>
          {" · expires "}{new Date(pkg.expiresAt).toLocaleString()}
        </p>
        {pkg.publishingAccessPending ? <p><small>Publishing access was not verified when this was frozen — it will be re-checked before publishing.</small></p> : null}
        <p className={styles.publicationCaption}>{pkg.caption}</p>
        {pkg.hashtags.length ? <p>{pkg.hashtags.join(" ")}</p> : null}
        <ol>{pkg.slides.map((slide) => <li key={slide.unitOrder} className={styles.publicationPackageSlide}>
          Image {slide.unitOrder} · v{slide.assetVersion} · {slide.width}×{slide.height} · {(slide.byteSize / 1024).toFixed(0)} KB · file <code>{slide.sha256.slice(0, 10)}</code>
          {" · "}<a href={slide.deliveryUrl} target="_blank" rel="noreferrer">delivery file</a>
        </li>)}</ol>
        <details><summary>Transforms applied</summary>
          <ul>{pkg.slides.map((slide) => <li key={slide.unitOrder}>Image {slide.unitOrder}: {slide.transform}</li>)}</ul>
        </details>
        <div className={styles.publicationPackageActions}>
          {pkg.status === "frozen" && !pkg.publishingAccessPending ? <button type="button" className={styles.secondaryButton} disabled={jobActive} onClick={() => publish(pkg.id)}>
            {jobActive && jobPackageId === pkg.id ? "Publishing…" : "Publish now"}
          </button> : null}
          {pkg.status === "frozen" && pkg.publishingAccessPending ? <small>Verify publishing access before this can be published.</small> : null}
          {pkg.status !== "consumed" ? <button type="button" className={styles.secondaryButton} disabled={packageBusy || (jobActive && jobPackageId === pkg.id)} onClick={() => discard(pkg.id)}>Discard package</button> : null}
        </div>
      </article>)}
      {jobError ? <p role="alert">{jobError}</p> : null}
      {job ? <div className={styles.publicationJob} aria-live="polite">
        <strong>{job.status === "pending-confirmation" && job.publishedMediaId ? "Instagram confirmed publication — saving its record…" : JOB_STATUS_TEXT[job.status]}</strong>
        {job.status === "pending-confirmation" ? null : job.lastError ? <p><small>{job.lastError}</small></p> : null}
        {job.status === "published" && job.permalink ? <p><a href={job.permalink} target="_blank" rel="noreferrer">View the published post</a></p> : null}
        {job.status === "published" && !job.permalink ? <p><small>Published and recorded. The permalink is not available yet.</small></p> : null}
        {job.canRetry ? <button type="button" className={styles.secondaryButton} disabled={!jobPackageId} onClick={() => publish(jobPackageId, job.id)}>{job.status === "suspended" ? "Revalidate and retry publishing" : "Retry publishing"}</button> : null}
        {job.status === "suspended" && !job.canRetry && job.failureKind !== "uncertain" ? <p><small>Review the recorded reason before creating another publication order.</small></p> : null}
        <p><small>A finished container is not a confirmed publication. A carousel posts as one.</small></p>
      </div> : null}
    </div> : null}
  </section>;
}
