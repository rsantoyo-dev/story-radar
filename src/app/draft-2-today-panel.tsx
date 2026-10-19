"use client";
import { useEffect, useState } from "react";
import { Button, StatusBadge, type StatusTone } from "@/app/ui/primitives";
import { ranAt, type Draft2StepKey } from "./draft-2-canvas.core";
import { TODAY_GROUPS, todayCards, type TodayCard, type TodayGroup, type TodayStory } from "./draft-2-today.core";
import type { Draft2SessionSummary } from "./modules/draft2/draft2-session.repository";
import styles from "./radar-dashboard.generated.module.css";

const GROUP_TONE: Record<TodayGroup, StatusTone> = { "needs-you": "warning", running: "info", "to-publish": "success", waiting: "neutral", "published-today": "success", "not-started": "neutral" };
/** How often Today reads the sessions again while one is running. */
const REFRESH_MS = 30_000;

/**
 * Today's board of Draft 2 (2026-10-19): every story in production once, in
 * the group its latest session puts it in, with where it stands, when it
 * last moved and what it cost; each card opens the story's screen in the
 * canvas. The sessions are read again every half minute while one runs.
 */
export function Draft2TodayPanel({ topicId, secret, stories, disabled, refreshKey, onOpen }: {
  topicId: string;
  secret: string;
  /** The stories in production and the ones published, as the dashboard has them. */
  stories: readonly TodayStory[];
  disabled: boolean;
  /** Changes when the dashboard's data did: the sessions are read again. */
  refreshKey?: unknown;
  onOpen: (storyId: string, step?: Draft2StepKey) => void;
}) {
  const [sessions, setSessions] = useState<Draft2SessionSummary[]>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const running = sessions?.some((session) => session.alive) ?? false;
  useEffect(() => {
    if (!secret.trim() || !topicId) return;
    const controller = new AbortController();
    fetch(`/api/radar/draft2/sessions?topicId=${encodeURIComponent(topicId)}`, { headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not read the Draft 2 sessions."); return body as { sessions: Draft2SessionSummary[] }; })
      .then((body) => { if (!controller.signal.aborted) { setSessions(body.sessions); setError(undefined); } })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not read the Draft 2 sessions."); });
    return () => controller.abort();
  }, [topicId, secret, refreshKey, tick]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((value) => value + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [running]);
  const now = new Date();
  const cards = sessions ? todayCards(stories, sessions, now) : [];
  const groups = TODAY_GROUPS.map((group) => ({ ...group, cards: cards.filter((card) => card.group === group.key) })).filter((group) => group.cards.length);
  return <section className={styles.workQueue} aria-label="Draft 2 today">
    <div className={styles.queueHeading}>
      <div><p className={styles.kicker}>Draft 2</p><h2>Today</h2></div>
      <span>{sessions ? `${stories.length} ${stories.length === 1 ? "story" : "stories"} in production · ${cards.filter((card) => card.group === "needs-you").length} need you` : "Reading the sessions…"}</span>
    </div>
    {error ? <p className={styles.queueIntro} role="alert">{error}</p> : null}
    {sessions && !groups.length ? <div className={styles.queueEmpty}><strong>Nothing in production.</strong><p>Select a story in Discover, or write one of your own, and Draft 2 starts from its facts.</p><a href="#discover">Open Discover →</a></div> : null}
    {groups.map((group) => <div key={group.key} className={styles.queueList} role="group" aria-label={group.title}>
      <div><h3 className={styles.queueMeta}>{group.title} · {group.cards.length}</h3><p className={styles.queueIntro}>{group.detail}</p></div>
      {group.cards.map((card) => <TodayCardView key={card.story.storyId} card={card} tone={GROUP_TONE[card.group]} now={now} disabled={disabled} onOpen={onOpen} />)}
    </div>)}
  </section>;
}

function TodayCardView({ card, tone, now, disabled, onOpen }: { card: TodayCard; tone: StatusTone; now: Date; disabled: boolean; onOpen: (storyId: string, step?: Draft2StepKey) => void }) {
  const { story, session } = card;
  const when = session ? ranAt(session.updatedAt, now) : "";
  return <article className={styles.queueItem}>
    <div>
      <span className={styles.queueMeta}>{story.sourceName}{when ? ` · ${when}` : ""}{session ? ` · ${session.pipeline}` : ""}</span>
      <h3>{story.title}</h3>
      <p><StatusBadge tone={tone}>{TODAY_GROUPS.find((group) => group.key === card.group)?.title}</StatusBadge> {card.line}</p>
    </div>
    <div className={styles.queueActions}>
      <Button size="compact" variant={card.group === "needs-you" || card.group === "to-publish" ? "primary" : "secondary"} disabled={disabled} onClick={() => onOpen(story.storyId, card.step)}>
        {card.group === "not-started" ? "Start Draft 2" : card.group === "to-publish" ? "Publish" : card.group === "published-today" ? "Open" : "Open"}
      </Button>
    </div>
  </article>;
}
