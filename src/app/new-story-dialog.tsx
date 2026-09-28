"use client";

import { useId, useState } from "react";

import styles from "./radar-dashboard.generated.module.css";
import { ModalLayer } from "./ui/modal-layer";

/**
 * Global "New story" entry point (FEAT-SRC-001, SRC-01).
 *
 * Creates a manual story through the existing owned-content route, so the
 * result is a normal Story: it lands in the topic's inbox ready for editorial
 * and AI evaluation and is never published by itself. The dialog is reachable
 * from the top bar regardless of the section the editor is in; the topic
 * defaults to the current one and can be changed here.
 */

const CONTENT_TYPES = [
  ["campaign", "Campaign"],
  ["launch", "Launch"],
  ["promotion", "Promotion"],
  ["product", "Product"],
  ["announcement", "Announcement"],
  ["educational", "Educational"],
] as const;

type ContentType = (typeof CONTENT_TYPES)[number][0];

type Draft = {
  topicId: string;
  title: string;
  content: string;
  contentType: ContentType;
  language: string;
  region: string;
  sourceUrl: string;
  publishedAt: string;
};

export type CreatedStory = {
  topicId: string;
  storyId: string;
  title: string;
};

type TopicOption = { id: string; name: string; isActive?: boolean };

function emptyDraft(topicId: string, language = "en", region = "global"): Draft {
  return {
    topicId,
    title: "",
    content: "",
    contentType: "campaign",
    language,
    region,
    sourceUrl: "",
    publishedAt: new Date().toISOString().slice(0, 10),
  };
}

export function NewStoryDialog({
  topics,
  initialTopicId,
  defaultLanguage = "en",
  defaultRegion = "global",
  secret,
  onClose,
  onCreated,
}: {
  topics: TopicOption[];
  initialTopicId: string;
  defaultLanguage?: string;
  defaultRegion?: string;
  secret: string;
  onClose: () => void;
  onCreated: (story: CreatedStory) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialTopicId, defaultLanguage, defaultRegion));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const headingId = useId();
  const activeTopics = topics.filter((topic) => topic.isActive !== false);

  function close() {
    if (busy) return;
    const changed = draft.title.trim() || draft.content.trim() || draft.sourceUrl.trim();
    if (changed && !window.confirm("Discard this new story draft?")) return;
    onClose();
  }

  const canSubmit =
    !busy &&
    draft.topicId.length > 0 &&
    draft.title.trim().length > 0 &&
    draft.content.trim().length > 0;

  async function submit() {
    if (!canSubmit) {
      setError("A topic, a title and the story content are required.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/radar/topics/${encodeURIComponent(draft.topicId)}/owned-content`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret.trim()}`,
          },
          body: JSON.stringify({
            title: draft.title.trim(),
            content: draft.content.trim(),
            contentType: draft.contentType,
            language: draft.language.trim() || "en",
            region: draft.region.trim() || "global",
            publishedAt: draft.publishedAt,
            ...(draft.sourceUrl.trim() ? { sourceUrl: draft.sourceUrl.trim() } : {}),
          }),
        },
      );
      const payload = (await response.json().catch(() => undefined)) as
        | { entry?: { storyId: string; title: string }; error?: string }
        | undefined;
      if (!response.ok || !payload?.entry) {
        throw new Error(payload?.error ?? `Request failed (${response.status})`);
      }
      onCreated({
        topicId: draft.topicId,
        storyId: payload.entry.storyId,
        title: payload.entry.title,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The story could not be created",
      );
      setBusy(false);
    }
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <ModalLayer onClose={close} canClose={!busy}>
    <div
      className={styles.contentViewerBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className={styles.contentViewer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className={styles.contentViewerHeader}>
          <div>
            <p>Manual story</p>
            <h2 id={headingId}>New story</h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close new story"
          >
            ×
          </button>
        </header>

        <form
          className={styles.newStoryForm}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className={styles.newStoryHint}>
            Write the approved facts, dates, conditions and claims. The story
            joins the topic&rsquo;s inbox ready for editorial and AI evaluation;
            nothing is published automatically.
          </p>

          <div className={styles.newStoryGrid}>
            <label className={styles.field}>
              <span>Topic</span>
              <select
                value={draft.topicId}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  topicId: event.target.value,
                  language: event.target.value === initialTopicId ? defaultLanguage : "en",
                  region: event.target.value === initialTopicId ? defaultRegion : "global",
                }))}
                disabled={busy}
                required
              >
                {activeTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${styles.field} ${styles.newStoryWide}`}>
              <span>Title</span>
              <input
                data-initial-focus
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
                maxLength={240}
                placeholder="What is this story about?"
                disabled={busy}
                required
              />
            </label>
            <label className={`${styles.field} ${styles.newStoryWide}`}>
              <span>Story content</span>
              <textarea
                value={draft.content}
                onChange={(event) => update("content", event.target.value)}
                maxLength={12_000}
                rows={9}
                placeholder="Approved context, product details, conditions, dates and claims the editorial workflow can rely on."
                disabled={busy}
                required
              />
            </label>
            <details className={`${styles.newStoryWide} ${styles.newStoryOptional}`}>
              <summary>Content type, language, and source details</summary>
              <div className={styles.newStoryGrid}>
                <label className={styles.field}>
                  <span>Content type</span>
                  <select value={draft.contentType} onChange={(event) => update("contentType", event.target.value as ContentType)} disabled={busy}>
                    {CONTENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Content language</span>
                  <input value={draft.language} onChange={(event) => update("language", event.target.value)} maxLength={32} disabled={busy} />
                </label>
                <label className={styles.field}>
                  <span>Region</span>
                  <input value={draft.region} onChange={(event) => update("region", event.target.value)} maxLength={80} disabled={busy} />
                </label>
                <label className={styles.field}>
                  <span>Material date</span>
                  <input type="date" value={draft.publishedAt} onChange={(event) => update("publishedAt", event.target.value)} disabled={busy} />
                  <small>This dates the source material. It does not schedule social publication.</small>
                </label>
                <label className={`${styles.field} ${styles.newStoryWide}`}>
                  <span>Source URL (optional)</span>
                  <input type="url" value={draft.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://" disabled={busy} />
                </label>
              </div>
            </details>
          </div>

          {error ? (
            <p className={styles.newStoryError} role="alert">
              {error}
            </p>
          ) : null}

          <footer className={styles.newStoryFooter}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!canSubmit}
            >
              {busy ? "Creating…" : "Create story"}
            </button>
          </footer>
        </form>
      </section>
    </div>
    </ModalLayer>
  );
}
