"use client";

import { useEffect, useState } from "react";

import { ActionRow, Button, FormField, InlineNotice, SectionHeader, Surface } from "./ui/primitives";
import type { StoryEditorFact } from "./modules/stories/story-editor-facts.repository";

import styles from "./creative-draft-workspace.generated.module.css";

/**
 * Editor-provided evidence for this story. A fact added here joins the brief's
 * facts (marked as the editor's), can be ticked on any slide, and supports the
 * copy that uses it — the guards and the automated review treat it as evidence
 * instead of flagging it. Removing it keeps it in history.
 */
export function EditorFactsPanel({ topicId, storyId, secret, disabled, onChanged }: {
  topicId: string;
  storyId: string;
  secret: string;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const [facts, setFacts] = useState<StoryEditorFact[]>();
  const [statement, setStatement] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const url = `/api/radar/stories/${encodeURIComponent(storyId)}/editor-facts?topicId=${encodeURIComponent(topicId)}`;

  useEffect(() => {
    const controller = new AbortController();
    request<{ facts: StoryEditorFact[] }>(url, secret, { signal: controller.signal })
      .then((body) => { if (!controller.signal.aborted) setFacts(body.facts); })
      .catch((requestError) => { if (!controller.signal.aborted) setError(message(requestError)); });
    return () => controller.abort();
  }, [url, secret]);

  async function add() {
    if (busy || !statement.trim()) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const body = await request<{ fact: StoryEditorFact }>(url, secret, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement, ...(sourceUrl.trim() ? { sourceUrl } : {}) }),
      });
      setFacts((current) => [...(current ?? []), body.fact]);
      setStatement(""); setSourceUrl("");
      setNotice(`Added as ${body.fact.factId}. Tick it under “Facts used in this slide” on the slide that uses it, then save.`);
      onChanged();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function remove(fact: StoryEditorFact) {
    if (busy || !window.confirm(`Remove ${fact.factId}? Slides that use it will need other support. It stays in history.`)) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const body = await request<{ facts: StoryEditorFact[] }>(url, secret, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: fact.id }),
      });
      setFacts(body.facts);
      onChanged();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  }

  const locked = disabled || busy;
  return <Surface tone="subtle" className={styles.editorFacts} aria-labelledby="editor-facts-title">
    <SectionHeader
      level={3}
      eyebrow="Your evidence"
      title="Editor facts"
      description="Add something you know that the sources do not say, such as a local detail or a date. It becomes a fact you can use on any slide, marked as yours."
    />
    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
    {facts?.length ? <ul className={styles.editorFactList}>
      {facts.map((fact) => <li key={fact.id}>
        <div>
          <strong>{fact.factId}</strong>
          <p>{fact.statement}</p>
          {fact.sourceUrl ? <a href={fact.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a> : null}
        </div>
        <Button size="compact" variant="quiet" disabled={locked} onClick={() => void remove(fact)}>Remove</Button>
      </li>)}
    </ul> : null}
    <FormField label="Fact" description="Write it as a plain statement, e.g. “Fall colours usually peak in the third week of October.”">
      <textarea rows={2} value={statement} maxLength={500} disabled={locked} onChange={(event) => setStatement(event.target.value)} />
    </FormField>
    <FormField label="Source link" optional>
      <input type="url" value={sourceUrl} placeholder="https://" disabled={locked} onChange={(event) => setSourceUrl(event.target.value)} />
    </FormField>
    <ActionRow>
      <Button variant="secondary" disabled={locked || !statement.trim()} busy={busy} onClick={() => void add()}>
        {busy ? "Saving…" : "Add fact"}
      </Button>
    </ActionRow>
  </Surface>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

async function request<T>(url: string, secret: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret.trim()}`);
  const response = await fetch(url, { ...init, cache: "no-store", headers });
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  if (!response.ok) throw new Error(payload?.error ?? `Request failed (${response.status})`);
  return payload as T;
}
