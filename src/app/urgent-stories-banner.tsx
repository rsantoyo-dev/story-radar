"use client";

import { useEffect, useState } from "react";

import { loadAutoCollection, markUrgent, URGENT_STORIES_CHANGED } from "./auto-collection-client";
import { ageLabel, needsAttention, urgentStatus, type UrgentStory } from "./auto-collection-view";
import styles from "./radar-dashboard.generated.module.css";
import { ActionRow, Button, StatusBadge } from "./ui/primitives";

/** The banner reads the database only; this keeps an open app current without spending AI. */
const REFRESH_MS = 5 * 60_000;

/**
 * Today's first block when the automatic reader flagged a story worth
 * publishing now: what it is, which signals qualified it and where its
 * preparation stands. Hidden when nothing needs the editor.
 */
export function UrgentStoriesBanner({ topicId, secret, onOpenStory, onCountChange }: {
  topicId: string;
  secret: string;
  onOpenStory: (storyId: string, preparationRunId?: string) => void;
  onCountChange?: (count: number) => void;
}) {
  const [stories, setStories] = useState<UrgentStory[]>([]);
  const [autoPrepare, setAutoPrepare] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!secret.trim() || !topicId) return;
    const controller = new AbortController();
    const load = () => loadAutoCollection(topicId, secret, controller.signal).then((state) => {
      if (controller.signal.aborted) return;
      setStories(state.scoops.filter(needsAttention));
      setAutoPrepare(state.settings?.autoPrepareScoops ?? true);
    }).catch(() => { /* Optional: a failed refresh keeps what is shown. */ });
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [topicId, secret, revision]);

  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === topicId) setRevision((n) => n + 1); };
    window.addEventListener(URGENT_STORIES_CHANGED, changed);
    return () => window.removeEventListener(URGENT_STORIES_CHANGED, changed);
  }, [topicId]);

  useEffect(() => { onCountChange?.(stories.length); }, [stories.length, onCountChange]);

  async function act(story: UrgentStory, action: "seen" | "dismiss") {
    setBusy(story.id); setError(undefined);
    try {
      setStories((await markUrgent(topicId, secret, story.id, action)).filter(needsAttention));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update the urgent story");
    } finally {
      setBusy(undefined);
    }
  }

  async function open(story: UrgentStory) {
    setBusy(story.id);
    // Opening it is seeing it; the studio opens even if this fails.
    await markUrgent(topicId, secret, story.id, "seen").catch(() => undefined);
    onOpenStory(story.storyId, story.preparationRunId);
  }

  if (!stories.length) return null;
  return <section className={styles.urgentBanner} aria-label="Urgent stories">
    <div>
      <p className={styles.urgentBannerEyebrow}>Urgent</p>
      <h2>{stories.length === 1 ? "1 story is worth publishing now" : `${stories.length} stories are worth publishing now`}</h2>
    </div>
    {error ? <p className={styles.urgentReasons} role="alert">{error}</p> : null}
    <ul className={styles.urgentList}>
      {stories.map((story) => {
        const status = urgentStatus(story, autoPrepare);
        return <li key={story.id} className={styles.urgentItem}>
          <div className={styles.urgentItemHeading}>
            <strong>{story.storyTitle ?? "Untitled story"}</strong>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <p className={styles.urgentReasons}>{story.reasons.join(" · ")} · flagged {ageLabel(story.detectedAt)}</p>
          {story.message ? <p className={styles.urgentReasons}>{story.message}</p> : null}
          <ActionRow>
            <Button size="compact" variant="primary" busy={busy === story.id} onClick={() => void open(story)}>Open</Button>
            <Button size="compact" variant="quiet" disabled={busy === story.id} onClick={() => void act(story, "seen")}>Mark as seen</Button>
            <Button size="compact" variant="quiet" disabled={busy === story.id} onClick={() => void act(story, "dismiss")}>Dismiss</Button>
          </ActionRow>
        </li>;
      })}
    </ul>
    <p className={styles.urgentReasons}><a href="#strategy/automation">Automatic reader settings</a></p>
  </section>;
}
