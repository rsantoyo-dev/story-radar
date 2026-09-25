"use client";

import { useEffect, useId, useRef, useState } from "react";

import styles from "./radar-dashboard.generated.module.css";

type TopicOption = { id: string; name: string; isActive?: boolean };
type Preview = {
  sourceType: "rss" | "article" | "document";
  sourceUrl: string;
  title?: string;
  preview: string;
  fingerprint: string;
};

export type AddedSource = {
  sourceType: Preview["sourceType"];
  topicIds: string[];
  storyId?: string;
};

export function AddSourceDialog({ topics, initialTopicId, secret, onClose, onCreated }: {
  topics: TopicOption[];
  initialTopicId: string;
  secret: string;
  onClose: () => void;
  onCreated: (source: AddedSource) => void;
}) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File>();
  const [topicIds, setTopicIds] = useState<string[]>([initialTopicId]);
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const urlInput = useRef<HTMLInputElement>(null);
  const headingId = useId();

  useEffect(() => {
    urlInput.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function submit(confirm: boolean) {
    if (!confirm && !url.trim() && !file) {
      setError("Paste a URL or choose a PDF file.");
      return;
    }
    if (confirm && (!preview || topicIds.length === 0)) {
      setError("Select at least one topic and detect the source first.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const body = file ? new FormData() : undefined;
      if (file && body) {
        body.append("file", file);
        if (confirm && preview) {
          body.append("sourceType", preview.sourceType);
          body.append("fingerprint", preview.fingerprint);
          body.append("topicIds", JSON.stringify(topicIds));
        }
      }
      const response = await fetch(`/api/radar/sources/${confirm ? "confirm" : "detect"}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${secret.trim()}`,
          ...(!file ? { "Content-Type": "application/json" } : {}),
        },
        body: body ?? JSON.stringify(confirm && preview
          ? { url: url.trim(), sourceType: preview.sourceType, fingerprint: preview.fingerprint, topicIds }
          : { url: url.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
      if (confirm) onCreated(result as AddedSource);
      else setPreview(result as Preview);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The source could not be processed");
    } finally {
      setBusy(false);
    }
  }

  function chooseFile(next?: File) {
    setFile(next);
    if (next) setUrl("");
    setPreview(undefined);
    setError(undefined);
  }

  return (
    <div className={styles.contentViewerBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className={styles.contentViewer} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className={styles.contentViewerHeader}>
          <div><p>Sources</p><h2 id={headingId}>Add source</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close add source">×</button>
        </header>
        <div className={styles.newStoryForm}>
          <p className={styles.newStoryHint}>Paste a public feed, article or PDF URL, or choose a PDF file. Review the detected type before anything is added.</p>
          <label className={styles.field}>
            <span>Source URL</span>
            <input ref={urlInput} type="url" value={url} onChange={(event) => { setUrl(event.target.value); setFile(undefined); setPreview(undefined); }} placeholder="https://example.org/source" disabled={busy} />
          </label>
          <label className={styles.sourceDropZone} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
            event.preventDefault();
            chooseFile(event.dataTransfer.files[0]);
          }}>
            <span>{file ? file.name : "Drop a PDF here or choose a file"}</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => chooseFile(event.target.files?.[0])} disabled={busy} />
          </label>
          <fieldset className={styles.sourceTopicChoices}>
            <legend>Topics to link</legend>
            {topics.filter((topic) => topic.isActive !== false).map((topic) => (
              <label key={topic.id}>
                <input type="checkbox" checked={topicIds.includes(topic.id)} onChange={(event) => setTopicIds((current) => event.target.checked ? [...current, topic.id] : current.filter((id) => id !== topic.id))} disabled={busy} />
                {topic.name}
              </label>
            ))}
          </fieldset>
          {preview ? (
            <div className={styles.sourcePreview} role="status">
              <strong>Detected: {preview.sourceType === "rss" ? "RSS / Atom feed" : preview.sourceType === "article" ? "Article page" : "PDF document"}</strong>
              <span>{preview.title ?? (file?.name || preview.sourceUrl)}</span>
              <p>{preview.preview}</p>
              <small>Confirming checks the source again before it is saved.</small>
            </div>
          ) : null}
          {error ? <p className={styles.newStoryError} role="alert">{error}</p> : null}
          <div className={styles.newStoryFooter}>
            <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
            {!preview ? (
              <button type="button" className={styles.primaryButton} onClick={() => void submit(false)} disabled={busy || (!file && !url.trim())}>{busy ? "Detecting…" : "Detect source"}</button>
            ) : (
              <button type="button" className={styles.primaryButton} onClick={() => void submit(true)} disabled={busy || topicIds.length === 0}>{busy ? "Adding…" : "Confirm and add"}</button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
