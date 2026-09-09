"use client";

import Image from "next/image";
import { InstagramPublicationCandidatePanel } from "./instagram-publication-candidate-panel";
import { useEffect, useState } from "react";
import type { DocumentaryResult } from "./modules/stories/manage-creative-documentary";
import { documentarySnapshot } from "./modules/stories/creative-documentary";
import type { CreativeFormat } from "./modules/stories/creative-content.types";
import styles from "./creative-draft-workspace.generated.module.css";

type Props = { topicId: string; storyId: string; secret: string; format: CreativeFormat; disabled?: boolean; onLoaded?: (value: { topicId: string; storyId: string; assetCount: number }) => void };
export function CreativeDocumentaryPanel({ topicId, storyId, secret, format, disabled, onLoaded }: Props) {
  const [result, setResult] = useState<DocumentaryResult>();
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [correction, setCorrection] = useState("");
  const [actor, setActor] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const endpoint = `/api/radar/creative/documentary/${encodeURIComponent(storyId)}?topicId=${encodeURIComponent(topicId)}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", headers: { Authorization: `Bearer ${secret.trim()}` }, signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load documentary preparation");
      if (controller.signal.aborted) return;
      setResult(data);
      onLoaded?.({ topicId, storyId, assetCount: data.batch?.assets?.length ?? 0 });
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load preparation"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, secret, reload, onLoaded, topicId, storyId]);
  async function act(method: "POST" | "PATCH", body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Documentary request failed");
      setResult(data); setReviewed(false);
      onLoaded?.({ topicId, storyId, assetCount: data.batch?.assets?.length ?? 0 });
    } catch (err) { setError(err instanceof Error ? err.message : "Documentary request failed"); }
    finally { setBusy(false); }
  }
  const snapshot = result?.snapshot;
  const batch = result?.batch;
  const blocked = snapshot?.representation === "blocked" || batch?.status !== "completed";
  const approved = batch?.allApproved && !result?.stale;
  return <section id={`documentary-review-${storyId}`} tabIndex={-1} className={styles.documentaryPanel} aria-label="Automatic documentary publication">
    <div className={styles.sectionHeading}><h3>Real places · automatic preparation</h3></div>
    <p>Prepare a 1080×1350 publication from the article. Original photo, verified map or source text. Review the complete publication once, at the end.</p>
    {loading ? <p role="status">Loading your saved publication…</p> : null}
    {!loading && batch ? <p role="status"><strong>Saved publication · {batch.assets.length} images</strong> — review it below. You do not need to generate another draft.</p> : null}
    {!batch ? <button type="button" className={styles.approveButton} disabled={loading || Boolean(error) || busy || disabled} onClick={() => act("POST", { format, retry: Boolean(batch), ...(correction.trim() ? { correction: correction.trim() } : {}) })}>
      {busy ? "Preparing…" : batch ? "Prepare a new version" : "Prepare documentary publication"}
    </button> : null}
    {busy ? <p role="status">Checking the article, place and available material. Preparation continues without further input.</p> : null}
    {error ? <div role="alert"><p>{error}</p><button type="button" className={styles.secondaryButton} disabled={loading || busy} onClick={() => { setLoading(true); setError(""); setReload(value => value + 1); }}>Reload saved publication</button></div> : null}
    {snapshot && batch ? <>
      <h4>{approved ? "Final review approved" : result?.stale ? "Source or policy changed — prepare a new version" : blocked ? "Preparation blocked" : "Final review"}</h4>
      <p><a href={snapshot.story.url} target="_blank" rel="noreferrer">{snapshot.story.title || "Source article"}</a></p>
      <p>Visual policy: {snapshot.policy?.mode || "documentary"}</p>
      <p>{snapshot.scope.municipality} · {snapshot.scope.region} · {snapshot.scope.country}</p>
      <details open>
        <summary>Place research and map links</summary>
        <p>Search results are candidates. Finding a photograph does not confirm its identity or permission to publish it.</p>
        {snapshot.discovery ? <p>{snapshot.discovery.calls} web search calls · {snapshot.discovery.sources.length} sources</p> : <p>No web search results available for this version. Prepare again to search.</p>}
        {snapshot.discovery?.sources.map((source, i) => <p key={i}>
          <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
          {source.imageUrl ? <> · <a href={source.imageUrl} target="_blank" rel="noreferrer">Candidate photograph</a></> : null}
        </p>)}
        {snapshot.mentions.map((mention, i) => <p key={i}><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([mention.name, snapshot.scope.municipality, snapshot.scope.region, snapshot.scope.country].filter(Boolean).join(", "))}`}>Search Google Maps: {mention.name}</a> · Search link; location not verified.</p>)}
      </details>
      {batch.assets.map(asset => {
        const evidence = documentarySnapshot(asset.unitSnapshot);
        return <article key={asset.id} className={styles.generateDraftCard}>
          <h4>Image {asset.unitOrder} · {evidence?.representation}</h4>
          {asset.imageUrl ? <PrivateDocumentaryImage url={asset.imageUrl} secret={secret} alt={asset.expectedText} ready={Boolean(approved)} /> : <p role="status">{asset.error || "Image unavailable"}</p>}
          <p>{evidence?.story.excerpt}</p>
          {evidence?.places.map(place => <p key={place.id}><a href={place.sourceUrl} target="_blank" rel="noreferrer">{place.name}</a> · {place.id} · revision {place.revision}<br />{place.hierarchy.map(parent => parent.name).join(" → ")}</p>)}
          {evidence?.photo ? <>
            <p><a href={evidence.photo.sourceUrl} target="_blank" rel="noreferrer">Original source</a> · {evidence.photo.author} · <a href={evidence.photo.licenseUrl} target="_blank" rel="noreferrer">{evidence.photo.license}</a></p>
            <p>Archive context · capture date: {evidence.photo.captureDate || "unknown"}. This photo does not establish the current state or document the event.</p>
          </> : null}
          {evidence?.map ? <p>{evidence.map.attribution} · <a href={evidence.map.termsUrl} target="_blank" rel="noreferrer">Map terms</a> · location only</p> : null}
          {asset.imageUrl && (evidence?.photo || evidence?.map) ? <details><summary>Compare original</summary><PrivateDocumentaryImage url={`${asset.imageUrl}&original=true`} secret={secret} alt="Original used for this composition" /></details> : null}
          <ul>{evidence?.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
        </article>;
      })}
      <details><summary>Complete caption and preparation evidence</summary>
        <p>{snapshot.story.title}</p>
        {batch.assets.map(asset => <p key={asset.id}>{asset.unitSnapshot.body}</p>)}
        <p>{snapshot.story.url}</p>
        <p>Place extraction: {snapshot.extraction.status} · {snapshot.extraction.model} · {snapshot.extraction.attempts} attempts · {snapshot.extraction.usage.totalTokens} tokens.</p>
        {snapshot.mentions.map((mention, i) => <p key={i}>{mention.name} ({mention.kind}, {mention.role}): “{mention.excerpt}”</p>)}
      </details>
      <InstagramPublicationCandidatePanel key={JSON.stringify([topicId, batch, busy, disabled])} topicId={topicId} draftId={batch.draftId} batchId={batch.id} secret={secret} disabled={busy || disabled || result?.stale} />
      {snapshot.review ? <p>Last decision: {snapshot.review.decision} · {snapshot.review.actor} · {snapshot.review.at}</p> : null}
      {approved ? <p role="status">Publication approved. You can download each image using “Download approved image”. This approval does not publish automatically.</p> : null}
      {!result?.stale ? <>
        <label className={styles.field}>Reviewer name<input value={actor} maxLength={120} disabled={busy} onChange={e => setActor(e.target.value)} /></label>
        <label className={styles.documentaryCheck}><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} /> I reviewed the complete copy, images, identity, source, usage terms and archive context.</label>
        {!approved ? <p role="status">{blocked ? "Approval unavailable: preparation is blocked or images are incomplete. Review the reasons above and prepare a new version." : !actor.trim() ? "Enter your reviewer name to enable final approval." : !reviewed ? "Confirm that you reviewed the complete publication to enable approval." : "Ready for your final decision."}</p> : null}
        <div className={styles.documentaryActions}>
          <button type="button" className={styles.approveButton} disabled={busy || !reviewed || !actor.trim() || (Boolean(approved) || blocked)} onClick={() => act("PATCH", { batchId: batch.id, inputHash: snapshot.inputHash, actor, humanReviewed: true, decision: "approved" })}>{approved ? "Publication approved" : "Approve complete publication"}</button>
          <button type="button" className={styles.unapproveButton} disabled={busy || !reviewed || !actor.trim()} onClick={() => act("PATCH", { batchId: batch.id, inputHash: snapshot.inputHash, actor, humanReviewed: true, decision: "rejected" })}>Reject publication</button>
        </div>
      </> : null}
      <label className={styles.field}><span>Replace the opening excerpt (optional, copied exactly from the article)</span><textarea value={correction} onChange={e => setCorrection(e.target.value)} maxLength={450} disabled={busy} /></label>
      <button type="button" className={styles.secondaryButton} disabled={busy || disabled} onClick={() => act("POST", { format, retry: true, ...(correction.trim() ? { correction: correction.trim() } : {}) })}>Prepare a new version</button>
      <p>To correct the source or geographic scope, update it and prepare a new version. Previous versions remain recorded. Approval never publishes automatically.</p>
    </> : null}
  </section>;
}
function PrivateDocumentaryImage({ url, secret, alt, ready = false }: { url: string; secret: string; alt: string; ready?: boolean }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = "";
    fetch(url, { headers: { Authorization: `Bearer ${secret}` }, signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load the private image");
      const blob = await response.blob();
      if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); }
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load image"); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, secret]);
  async function download() {
    try {
      const response = await fetch(`${url}&download=true`, { headers: { Authorization: `Bearer ${secret}` } });
      if (!response.ok) throw new Error("The final approval is no longer current");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = objectUrl; link.download = "documentary-publication.png"; link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : "Export failed"); }
  }
  return <>{src ? <Image className={styles.documentaryPreview} src={src} alt={alt} width={432} height={540} unoptimized /> : <p>{error || "Loading preview…"}</p>}{ready ? <button type="button" onClick={download}>Download approved image</button> : null}{error && src ? <p role="alert">{error}</p> : null}</>;
}
