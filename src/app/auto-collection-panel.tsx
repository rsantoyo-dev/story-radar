"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  loadAutoCollection,
  markUrgent,
  previewUrgent,
  saveAutoCollection,
  URGENT_STORIES_CHANGED,
  type SavedAutoCollection,
  type UrgentPreview,
} from "./auto-collection-client";
import {
  activeWindowHours,
  ageLabel,
  DEFAULT_AUTO_COLLECTION,
  hourLabel,
  INTERVAL_HOURS,
  passesPerDay,
  URGENT_PREPARATIONS_PER_DAY,
  urgentStatus,
  type AutoCollectionForm,
  type UrgentStory,
} from "./auto-collection-view";
import { isValidTimeZone } from "./editorial-period-controls";
import type { EditorialLine } from "./modules/editorial-lines/editorial-lines";
import styles from "./radar-dashboard.generated.module.css";
import { ActionRow, Button, EmptyState, FormField, InlineNotice, LoadingState, SectionHeader, StatusBadge, Surface } from "./ui/primitives";
import { useUnsavedBeforeUnload } from "./ui/use-unsaved-before-unload";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function formFrom(settings: SavedAutoCollection | null, lines: EditorialLine[]): AutoCollectionForm {
  if (settings) {
    return {
      enabled: settings.enabled, lineId: settings.lineId, intervalHours: settings.intervalHours, timezone: settings.timezone,
      activeFromHour: settings.activeFromHour, activeToHour: settings.activeToHour, scoopEnabled: settings.scoopEnabled,
      scoopMinGrowth: settings.scoopMinGrowth, scoopMinEditorial: settings.scoopMinEditorial,
      scoopMaxAgeHours: settings.scoopMaxAgeHours, autoPrepareScoops: settings.autoPrepareScoops,
    };
  }
  const active = lines.filter((line) => !line.archived);
  const line = active.find((candidate) => candidate.isDefault) ?? active[0];
  return { ...DEFAULT_AUTO_COLLECTION, lineId: line?.id ?? "", timezone: line?.timezone || "America/Toronto" };
}

const dateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * Editorial strategy → Automation: the per-Topic scheduled reader. Every few
 * hours inside its active window it collects, evaluates and selects stories
 * with one editorial line, so they are ready when the editor opens the app,
 * and flags urgent stories above explicit thresholds. It never approves or
 * publishes anything.
 */
export function AutoCollectionPanel({ topicId, secret, disabled = false, onOpenStory }: {
  topicId: string;
  secret: string;
  disabled?: boolean;
  onOpenStory: (storyId: string, preparationRunId?: string) => void;
}) {
  const [lines, setLines] = useState<EditorialLine[]>();
  const [saved, setSaved] = useState<SavedAutoCollection | null>();
  const [form, setForm] = useState<AutoCollectionForm>();
  const [urgent, setUrgent] = useState<UrgentStory[]>([]);
  const [preview, setPreview] = useState<UrgentPreview[]>();
  const [busy, setBusy] = useState<"save" | "preview" | string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [revision, setRevision] = useState(0);

  const baseline = saved === undefined || !lines ? undefined : formFrom(saved, lines);
  const dirty = Boolean(form && baseline && JSON.stringify(form) !== JSON.stringify(baseline));
  useUnsavedBeforeUnload(dirty);

  useEffect(() => {
    if (!secret.trim() || !topicId) return;
    const controller = new AbortController();
    Promise.all([
      loadAutoCollection(topicId, secret, controller.signal),
      fetch(`/api/radar/topics/${encodeURIComponent(topicId)}/editorial-lines`, {
        headers: { Authorization: `Bearer ${secret.trim()}` }, cache: "no-store", signal: controller.signal,
      }).then(async (response) => {
        const value = (await response.json().catch(() => ({}))) as { lines?: EditorialLine[]; error?: string };
        if (!response.ok) throw new Error(value.error ?? "Unable to load the editorial lines");
        return value.lines ?? [];
      }),
    ]).then(([state, loadedLines]) => {
      if (controller.signal.aborted) return;
      setLines(loadedLines);
      setSaved(state.settings);
      setUrgent(state.scoops);
      setForm((current) => current ?? formFrom(state.settings, loadedLines));
      setError(undefined);
    }).catch((loadError) => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load the automatic reader");
    });
    return () => controller.abort();
  }, [topicId, secret, revision]);

  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === topicId) setRevision((n) => n + 1); };
    window.addEventListener(URGENT_STORIES_CHANGED, changed);
    return () => window.removeEventListener(URGENT_STORIES_CHANGED, changed);
  }, [topicId]);

  if (!form || !lines || saved === undefined) {
    return <Surface aria-label="Automatic reader">
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : <LoadingState>Loading the automatic reader…</LoadingState>}
    </Surface>;
  }

  const activeLines = lines.filter((line) => !line.archived);
  const update = (patch: Partial<AutoCollectionForm>) => { setForm({ ...form, ...patch }); setNotice(undefined); };
  const number = (value: string) => Number.parseInt(value, 10);
  const timezoneError = isValidTimeZone(form.timezone) ? undefined : "Choose a valid IANA time zone, such as America/Toronto.";
  const passes = passesPerDay(form);
  const locked = disabled || busy !== undefined;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || locked) return;
    if (!form.lineId) { setError("Choose the editorial line the reader uses."); return; }
    if (timezoneError) { setError(timezoneError); return; }
    setBusy("save"); setError(undefined); setNotice(undefined);
    try {
      const { settings } = await saveAutoCollection(topicId, secret, form);
      setSaved(settings);
      setForm(formFrom(settings, lines ?? []));
      setNotice(settings.enabled
        ? "Saved. The reader starts its first pass within 15 minutes, inside its active hours."
        : "Saved. The reader is off for this topic.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the automatic reader");
    } finally {
      setBusy(undefined);
    }
  }

  async function runPreview() {
    if (!form || locked) return;
    setBusy("preview"); setError(undefined);
    try {
      setPreview((await previewUrgent(topicId, secret, form)).candidates);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to preview urgent stories");
    } finally {
      setBusy(undefined);
    }
  }

  async function act(story: UrgentStory, action: "seen" | "dismiss") {
    if (locked) return;
    setBusy(story.id); setError(undefined);
    try {
      setUrgent(await markUrgent(topicId, secret, story.id, action));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update the urgent story");
    } finally {
      setBusy(undefined);
    }
  }

  return <Surface aria-label="Automatic reader" className={styles.autoPanel}>
    <SectionHeader
      eyebrow="Automation"
      title="Automatic reader"
      description="Collects, evaluates and selects this topic's stories in the background, so they are ready when you open the app. It never approves or publishes anything."
      actions={<StatusBadge tone={saved?.enabled ? "success" : "neutral"}>{saved?.enabled ? "On" : "Off"}</StatusBadge>}
    />
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

    <form className={styles.autoPanel} onSubmit={save}>
      <label className={styles.autoToggle}>
        <input type="checkbox" checked={form.enabled} disabled={locked} onChange={(event) => update({ enabled: event.target.checked })} />
        <span><strong>Run the automatic reader</strong><small>Each pass collects from the line&apos;s sources, evaluates the new stories and leaves the best ones selected for review.</small></span>
      </label>

      <div className={styles.autoGrid}>
        <FormField label="Editorial line" description="Its sources, period and criteria drive every pass.">
          <select value={form.lineId} disabled={locked} onChange={(event) => update({ lineId: event.target.value })}>
            <option value="" disabled>Choose an editorial line</option>
            {activeLines.map((line) => <option key={line.id} value={line.id}>{line.name}{line.isDefault ? " · default" : ""}</option>)}
          </select>
        </FormField>
        <FormField label="Run every" description="Hours between passes.">
          <select value={form.intervalHours} disabled={locked} onChange={(event) => update({ intervalHours: number(event.target.value) })}>
            {INTERVAL_HOURS.map((hours) => <option key={hours} value={hours}>{hours === 1 ? "1 hour" : `${hours} hours`}</option>)}
          </select>
        </FormField>
        <FormField label="Active from" description="Passes start only inside these hours, on the topic's clock.">
          <select value={form.activeFromHour} disabled={locked} onChange={(event) => update({ activeFromHour: number(event.target.value) })}>
            {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
          </select>
        </FormField>
        <FormField label="Active until">
          <select value={form.activeToHour} disabled={locked} onChange={(event) => update({ activeToHour: number(event.target.value) })}>
            {HOURS.map((hour) => hour + 1).map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
          </select>
        </FormField>
        <FormField label="Time zone" error={timezoneError}>
          <input value={form.timezone} disabled={locked} onChange={(event) => update({ timezone: event.target.value })} placeholder="America/Toronto" />
        </FormField>
      </div>
      <p className={styles.autoMeta}>
        About {passes} {passes === 1 ? "pass" : "passes"} a day, {hourLabel(form.activeFromHour)}–{hourLabel(form.activeToHour)} ({activeWindowHours(form.activeFromHour, form.activeToHour)} h). Each pass spends AI evaluation credits.
      </p>

      <fieldset className={styles.autoFieldset}>
        <legend>Urgent stories</legend>
        <label className={styles.autoToggle}>
          <input type="checkbox" checked={form.scoopEnabled} disabled={locked} onChange={(event) => update({ scoopEnabled: event.target.checked })} />
          <span><strong>Flag urgent stories</strong><small>A story is urgent only when all three signals clear their thresholds. It then appears at the top of Today.</small></span>
        </label>
        <div className={styles.autoGrid}>
          <FormField label="Growth score at least" description="1–100: how strongly it can win new readers.">
            <input type="number" min={1} max={100} value={form.scoopMinGrowth} disabled={locked || !form.scoopEnabled} onChange={(event) => update({ scoopMinGrowth: number(event.target.value) || 1 })} />
          </FormField>
          <FormField label="Editorial score at least" description="1–100: how valuable it is for this line.">
            <input type="number" min={1} max={100} value={form.scoopMinEditorial} disabled={locked || !form.scoopEnabled} onChange={(event) => update({ scoopMinEditorial: number(event.target.value) || 1 })} />
          </FormField>
          <FormField label="Published within (hours)" description="Older stories are never urgent.">
            <input type="number" min={1} max={72} value={form.scoopMaxAgeHours} disabled={locked || !form.scoopEnabled} onChange={(event) => update({ scoopMaxAgeHours: number(event.target.value) || 1 })} />
          </FormField>
        </div>
        <label className={styles.autoToggle}>
          <input type="checkbox" checked={form.autoPrepareScoops} disabled={locked || !form.scoopEnabled} onChange={(event) => update({ autoPrepareScoops: event.target.checked })} />
          <span><strong>Prepare urgent stories ahead</strong><small>Writes the brief and the carousel draft, at most {URGENT_PREPARATIONS_PER_DAY} a day. You still review, approve and publish.</small></span>
        </label>
        <ActionRow>
          <Button size="compact" busy={busy === "preview"} disabled={locked || !form.scoopEnabled} onClick={() => void runPreview()}>Preview with these thresholds</Button>
          <small className={styles.autoMeta}>Checks the stories evaluated in the last day. Spends no AI.</small>
        </ActionRow>
        {preview ? (preview.length ? <ul className={styles.urgentList} aria-label="Stories these thresholds would check">
          {preview.map((candidate) => <li key={candidate.storyId} className={styles.urgentItem}>
            <div className={styles.urgentItemHeading}>
              <strong>{candidate.title ?? "Untitled story"}</strong>
              <StatusBadge tone={candidate.qualifies ? "warning" : "neutral"}>{candidate.qualifies ? "Would be urgent" : "Not urgent"}</StatusBadge>
            </div>
            <p className={styles.urgentReasons}>{candidate.reasons.join(" · ") || "No growth score yet."}</p>
          </li>)}
        </ul> : <EmptyState title="No recent story clears these thresholds">Lower a threshold to see which stories come close.</EmptyState>) : null}
      </fieldset>

      <ActionRow>
        <Button type="submit" variant="primary" busy={busy === "save"} disabled={locked || (!dirty && saved !== null)}>Save automation</Button>
        {dirty ? <small className={styles.autoMeta}>Unsaved changes</small> : null}
      </ActionRow>
    </form>

    <p className={styles.autoMeta}>
      Last pass: {dateTime(saved?.lastRunAt)} · Next pass: {saved?.enabled ? dateTime(saved?.nextRunAt) : "off"} · The scheduler checks every 15 minutes.
    </p>

    <section aria-label="Recent urgent stories" className={styles.autoPanel}>
      <SectionHeader level={3} title="Recent urgent stories" description="Every story the reader flagged, with the signals that qualified it." />
      {urgent.length ? <ul className={styles.urgentList}>
        {urgent.map((story) => {
          const status = urgentStatus(story, form.autoPrepareScoops);
          return <li key={story.id} className={styles.urgentItem}>
            <div className={styles.urgentItemHeading}>
              <strong>{story.storyTitle ?? "Untitled story"}</strong>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>
            <p className={styles.urgentReasons}>{story.reasons.join(" · ")} · flagged {ageLabel(story.detectedAt)}</p>
            {story.message ? <p className={styles.urgentReasons}>{story.message}</p> : null}
            <ActionRow>
              <Button size="compact" variant="primary" disabled={locked} onClick={() => onOpenStory(story.storyId, story.preparationRunId)}>Open</Button>
              {!story.seen && story.status !== "dismissed" ? <Button size="compact" variant="quiet" busy={busy === story.id} disabled={locked} onClick={() => void act(story, "seen")}>Mark as seen</Button> : null}
              {story.status !== "dismissed" ? <Button size="compact" variant="quiet" busy={busy === story.id} disabled={locked} onClick={() => void act(story, "dismiss")}>Dismiss</Button> : null}
            </ActionRow>
          </li>;
        })}
      </ul> : <EmptyState title="No urgent story yet">When a story clears every threshold, it appears here and at the top of Today.</EmptyState>}
    </section>
  </Surface>;
}
