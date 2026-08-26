"use client";

import { type ReactNode, useEffect, useState } from "react";

import styles from "./topic-configuration-panel.generated.module.css";

export type DashboardTopic = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
};

type TopicSource = {
  id: string;
  topicSourceId: string;
  name: string;
  url: string;
  language: string;
  region: string;
  contentMode: "excerpt" | "full" | "auto";
  pollEveryMinutes: number;
  enabled: boolean;
  tags: string[];
  priority: number;
  sourceEnabled: boolean;
  topicEnabled: boolean;
};

type SourceDraft = {
  name: string;
  url: string;
  language: string;
  region: string;
  contentMode: TopicSource["contentMode"];
  pollEveryMinutes: string;
  tags: string;
  priority: string;
  enabled: boolean;
};

const EMPTY_SOURCE: SourceDraft = {
  name: "",
  url: "",
  language: "en",
  region: "global",
  contentMode: "auto",
  pollEveryMinutes: "60",
  tags: "",
  priority: "0",
  enabled: true,
};

export function TopicConfigurationPanel({
  topics,
  selectedTopicId,
  secret,
  disabled,
  onTopicsChange,
  onTopicChange,
}: {
  topics: DashboardTopic[];
  selectedTopicId: string;
  secret: string;
  disabled: boolean;
  onTopicsChange: (topics: DashboardTopic[]) => void;
  onTopicChange: (topicId: string) => void;
}) {
  const [sourceResult, setSourceResult] = useState<{
    topicId: string;
    sources: TopicSource[];
  }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [editingTopic, setEditingTopic] = useState(false);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceFormTopicId, setSourceFormTopicId] = useState<string>();
  const [editingSource, setEditingSource] = useState<TopicSource>();
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(EMPTY_SOURCE);
  const [preview, setPreview] = useState<{
    topicId: string;
    topicSourceId: string;
    items: { title: string; url: string }[];
  }>();

  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId);
  const canUseApi = secret.trim().length > 0;
  const sources = sourceResult?.topicId === selectedTopicId
    ? sourceResult.sources
    : undefined;
  const sourceFormVisible = showSourceForm && sourceFormTopicId === selectedTopicId;

  useEffect(() => {
    if (!canUseApi || !selectedTopicId) {
      return;
    }

    const controller = new AbortController();

    requestJson<{ sources: TopicSource[] }>(
      `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources`,
      secret,
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setError(undefined);
        setSourceResult({ topicId: selectedTopicId, sources: response.sources });
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(errorMessage(loadError));
      });

    return () => controller.abort();
  }, [canUseApi, secret, selectedTopicId]);

  function changeTopic(topicId: string) {
    if (topicId === selectedTopicId || disabled) return;
    onTopicChange(topicId);
  }

  async function createTopic() {
    if (!topicName.trim()) {
      setError("A topic name is required.");
      return;
    }

    await run("create-topic", async () => {
      const response = await requestJson<{ topic: DashboardTopic }>(
        "/api/radar/topics",
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: topicName,
            description: topicDescription || undefined,
          }),
        },
      );
      const nextTopics = [...topics, response.topic].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      onTopicsChange(nextTopics);
      setTopicName("");
      setTopicDescription("");
      setShowTopicForm(false);
      setNotice(`“${response.topic.name}” was created. Add RSS sources after selecting it.`);
      onTopicChange(response.topic.id);
    });
  }

  async function saveTopic() {
    if (!selectedTopic || !topicName.trim()) {
      setError("A topic name is required.");
      return;
    }

    await run("save-topic", async () => {
      const response = await requestJson<{ topic: DashboardTopic }>(
        `/api/radar/topics/${encodeURIComponent(selectedTopic.id)}`,
        secret,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: topicName,
            description: topicDescription || null,
          }),
        },
      );
      onTopicsChange(
        topics.map((topic) =>
          topic.id === response.topic.id ? response.topic : topic,
        ),
      );
      setEditingTopic(false);
      setNotice("Topic details saved.");
    });
  }

  function openTopicEdit() {
    if (!selectedTopic) return;
    setTopicName(selectedTopic.name);
    setTopicDescription(selectedTopic.description ?? "");
    setEditingTopic(true);
    setShowTopicForm(false);
  }

  function openNewSource() {
    setEditingSource(undefined);
    setSourceDraft(EMPTY_SOURCE);
    setSourceFormTopicId(selectedTopicId);
    setShowSourceForm(true);
    setPreview(undefined);
  }

  function openSourceEdit(source: TopicSource) {
    setEditingSource(source);
    setSourceDraft({
      name: source.name,
      url: source.url,
      language: source.language,
      region: source.region,
      contentMode: source.contentMode,
      pollEveryMinutes: String(source.pollEveryMinutes),
      tags: source.tags.join(", "),
      priority: String(source.priority),
      enabled: source.topicEnabled,
    });
    setSourceFormTopicId(selectedTopicId);
    setShowSourceForm(true);
    setPreview(undefined);
  }

  async function saveSource() {
    if (!sourceDraft.name.trim() || !sourceDraft.url.trim()) {
      setError("RSS source name and URL are required.");
      return;
    }

    const source = {
      name: sourceDraft.name,
      url: sourceDraft.url,
      language: sourceDraft.language,
      region: sourceDraft.region,
      contentMode: sourceDraft.contentMode,
      pollEveryMinutes: Number(sourceDraft.pollEveryMinutes),
    };
    const link = {
      enabled: sourceDraft.enabled,
      tags: parseTags(sourceDraft.tags),
      priority: Number(sourceDraft.priority),
    };

    await run(editingSource ? "save-source" : "add-source", async () => {
      if (editingSource) {
        await requestJson(
          `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources/${encodeURIComponent(editingSource.topicSourceId)}`,
          secret,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source, link }),
          },
        );
      } else {
        await requestJson(
          `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources`,
          secret,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source, link }),
          },
        );
      }

      await reloadSources();
      setShowSourceForm(false);
      setSourceFormTopicId(undefined);
      setEditingSource(undefined);
      setSourceDraft(EMPTY_SOURCE);
      setNotice(editingSource ? "RSS source settings saved." : "RSS source added to this topic.");
    });
  }

  async function toggleSource(source: TopicSource) {
    await run(`toggle:${source.topicSourceId}`, async () => {
      await requestJson(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources/${encodeURIComponent(source.topicSourceId)}`,
        secret,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: { enabled: !source.topicEnabled } }),
        },
      );
      await reloadSources();
    });
  }

  async function detachSource(source: TopicSource) {
    if (!window.confirm(`Remove “${source.name}” from ${selectedTopic?.name ?? "this topic"}?`)) {
      return;
    }

    await run(`remove:${source.topicSourceId}`, async () => {
      await requestJson(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources/${encodeURIComponent(source.topicSourceId)}`,
        secret,
        { method: "DELETE" },
      );
      await reloadSources();
      setNotice("The RSS source was removed from this topic. Its reusable feed record was kept.");
    });
  }

  async function previewSource(source: TopicSource) {
    await run(`preview:${source.topicSourceId}`, async () => {
      const response = await requestJson<{
        items: { title: string; url: string }[];
      }>(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources/${encodeURIComponent(source.topicSourceId)}/preview`,
        secret,
        { method: "POST" },
      );
      setPreview({
        topicId: selectedTopicId,
        topicSourceId: source.topicSourceId,
        items: response.items,
      });
    });
  }

  async function reloadSources() {
    const response = await requestJson<{ sources: TopicSource[] }>(
      `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources`,
      secret,
    );
    setSourceResult({ topicId: selectedTopicId, sources: response.sources });
  }

  async function run(action: string, task: () => Promise<void>) {
    if (!canUseApi || disabled || busy) return;
    setBusy(action);
    setError(undefined);
    setNotice(undefined);
    try {
      await task();
    } catch (operationError) {
      setError(errorMessage(operationError));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="topic-configuration-title">
      <div className={styles.heading}>
        <div>
          <p>Topic configuration</p>
          <h2 id="topic-configuration-title">Separate your editorial streams</h2>
          <small>Feeds, tags, preferences, reviews, AI usage, and creative work stay scoped to the selected topic.</small>
        </div>
        <span className={styles.count}>
          {sources ? `${sources.filter((source) => source.enabled).length} active feeds` : "RSS setup"}
        </span>
      </div>

      <div className={styles.topicRow}>
        <label>
          <span>Active topic</span>
          <select
            value={selectedTopicId}
            onChange={(event) => changeTopic(event.target.value)}
            disabled={disabled || Boolean(busy)}
          >
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id} disabled={!topic.isActive}>
                {topic.name}{topic.isActive ? "" : " · inactive"}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.topicActions}>
          <button type="button" onClick={() => setShowTopicForm(true)} disabled={!canUseApi || disabled || Boolean(busy)}>
            New topic
          </button>
          <button type="button" onClick={openTopicEdit} disabled={!canUseApi || disabled || Boolean(busy)}>
            Edit topic
          </button>
        </div>
      </div>

      {!canUseApi ? (
        <p className={styles.locked}>Enter the collector secret below to manage topics and RSS sources.</p>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {showTopicForm || editingTopic ? (
        <form
          className={styles.topicForm}
          onSubmit={(event) => {
            event.preventDefault();
            void (editingTopic ? saveTopic() : createTopic());
          }}
        >
          <label>
            <span>Topic name</span>
            <input value={topicName} onChange={(event) => setTopicName(event.target.value)} maxLength={120} />
          </label>
          <label>
            <span>Description</span>
            <input value={topicDescription} onChange={(event) => setTopicDescription(event.target.value)} maxLength={1000} placeholder="Audience or editorial focus" />
          </label>
          <div>
            <button type="submit" disabled={Boolean(busy)}>{editingTopic ? "Save topic" : "Create topic"}</button>
            <button type="button" onClick={() => { setShowTopicForm(false); setEditingTopic(false); }} disabled={Boolean(busy)}>Cancel</button>
          </div>
        </form>
      ) : null}

      <div className={styles.sourcesHeading}>
        <div>
          <h3>RSS sources</h3>
          <p>Adding a source here attaches it only to {selectedTopic?.name ?? "this topic"}.</p>
        </div>
        <button type="button" onClick={openNewSource} disabled={!canUseApi || disabled || Boolean(busy)}>
          Add RSS source
        </button>
      </div>

      {sourceFormVisible ? (
        <form
          className={styles.sourceForm}
          onSubmit={(event) => {
            event.preventDefault();
            void saveSource();
          }}
        >
          <strong>{editingSource ? "Edit RSS source" : "Add an RSS source"}</strong>
          <div className={styles.formGrid}>
            <Field label="Name"><input value={sourceDraft.name} onChange={(event) => setSourceDraft({ ...sourceDraft, name: event.target.value })} maxLength={160} /></Field>
            <Field label="Feed URL"><input type="url" value={sourceDraft.url} onChange={(event) => setSourceDraft({ ...sourceDraft, url: event.target.value })} placeholder="https://example.com/feed.xml" /></Field>
            <Field label="Language"><input value={sourceDraft.language} onChange={(event) => setSourceDraft({ ...sourceDraft, language: event.target.value })} maxLength={32} /></Field>
            <Field label="Region"><input value={sourceDraft.region} onChange={(event) => setSourceDraft({ ...sourceDraft, region: event.target.value })} maxLength={80} /></Field>
            <Field label="Content mode"><select value={sourceDraft.contentMode} onChange={(event) => setSourceDraft({ ...sourceDraft, contentMode: event.target.value as SourceDraft["contentMode"] })}><option value="auto">Auto detect</option><option value="excerpt">Excerpt</option><option value="full">Full content</option></select></Field>
            <Field label="Poll interval (minutes)"><input type="number" min="5" max="1440" value={sourceDraft.pollEveryMinutes} onChange={(event) => setSourceDraft({ ...sourceDraft, pollEveryMinutes: event.target.value })} /></Field>
            <Field label="Topic tags"><input value={sourceDraft.tags} onChange={(event) => setSourceDraft({ ...sourceDraft, tags: event.target.value })} placeholder="psychology, wellbeing" /></Field>
            <Field label="Priority (0–100)"><input type="number" min="0" max="100" value={sourceDraft.priority} onChange={(event) => setSourceDraft({ ...sourceDraft, priority: event.target.value })} /></Field>
          </div>
          <label className={styles.toggle}><input type="checkbox" checked={sourceDraft.enabled} onChange={(event) => setSourceDraft({ ...sourceDraft, enabled: event.target.checked })} /> Enable this source for the topic</label>
          <p>Connection fields are shared when the same feed is attached to another topic; tags, priority, and enabled state are topic-specific.</p>
          <div className={styles.formActions}>
            <button type="submit" disabled={Boolean(busy)}>{editingSource ? "Save source" : "Add source"}</button>
            <button type="button" onClick={() => { setShowSourceForm(false); setSourceFormTopicId(undefined); setEditingSource(undefined); }} disabled={Boolean(busy)}>Cancel</button>
          </div>
        </form>
      ) : null}

      {!canUseApi ? null : !sources ? <p className={styles.loading}>Loading RSS sources…</p> : sources.length === 0 ? (
        <div className={styles.empty}><strong>No RSS sources yet.</strong><span>Add a feed before collecting this topic.</span></div>
      ) : (
        <ul className={styles.sourceList}>
          {sources.map((source) => (
            <li key={source.topicSourceId}>
              <div className={styles.sourceCopy}>
                <div><strong>{source.name}</strong><span className={source.enabled ? styles.enabled : styles.disabled}>{source.enabled ? "Active" : source.sourceEnabled ? "Disabled for this topic" : "Feed inactive"}</span></div>
                <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
                <small>{source.language} · {source.region} · every {source.pollEveryMinutes} min · priority {source.priority}{source.tags.length ? ` · ${source.tags.join(", ")}` : ""}</small>
              </div>
              <div className={styles.sourceActions}>
                <button type="button" onClick={() => void previewSource(source)} disabled={Boolean(busy)}>Preview</button>
                <button type="button" onClick={() => openSourceEdit(source)} disabled={Boolean(busy)}>Edit</button>
                <button type="button" onClick={() => void toggleSource(source)} disabled={Boolean(busy)}>{source.topicEnabled ? "Disable" : "Enable"}</button>
                <button type="button" className={styles.remove} onClick={() => void detachSource(source)} disabled={Boolean(busy)}>Remove</button>
              </div>
              {preview?.topicId === selectedTopicId && preview.topicSourceId === source.topicSourceId ? (
                <div className={styles.preview}>
                  <strong>Latest feed items</strong>
                  {preview.items.length ? <ol>{preview.items.slice(0, 3).map((item) => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></li>)}</ol> : <span>No readable items were found.</span>}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span>{label}</span>{children}</label>;
}

async function requestJson<T>(url: string, secret: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, Authorization: `Bearer ${secret.trim()}` },
  });
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  if (!response.ok) throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  return payload as T;
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(/[,\n]+/).map((tag) => tag.trim()).filter(Boolean))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
