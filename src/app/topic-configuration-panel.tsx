"use client";

import { type ReactNode, useEffect, useState } from "react";

import {
  DEFAULT_TOPIC_THEME_KEY,
  TOPIC_THEMES,
} from "@/design/topic-themes";

import styles from "./topic-configuration-panel.generated.module.css";

export type DashboardTopic = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  themeKey: string;
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

type AiResearchSource = {
  enabled: boolean;
  instruction: string;
  orientation: "informative" | "trend" | "provocative";
  resultLimit: number;
  lookbackHours: number;
  language: string;
  region: string;
  includeContent: boolean;
  priority: number;
};

type KnowledgeDocument = {
  topicDocumentId: string;
  documentId: string;
  canonicalUrl: string;
  documentType: "guideline" | "report" | "study" | "manual" | "other";
  language: string;
  publisher?: string;
  enabled: boolean;
  tags: string[];
  priority: number;
  createdAt: string;
  latestVersion?: {
    id: string;
    title: string;
    pageCount: number;
    sectionCount: number;
    extractedAt: string;
  };
  latestRun?: {
    id: string;
    status: "queued" | "processing" | "completed" | "failed";
    stage: "queued" | "fetching" | "extracting" | "persisting" | "completed" | "failed";
    pagesProcessed: number;
    pagesTotal?: number;
    error?: string;
    updatedAt: string;
  };
};

type KnowledgeDocumentDraft = {
  url: string;
  documentType: KnowledgeDocument["documentType"];
  language: string;
  publisher: string;
  tags: string;
  priority: string;
};

const EMPTY_DOCUMENT: KnowledgeDocumentDraft = {
  url: "",
  documentType: "guideline",
  language: "fr",
  publisher: "",
  tags: "",
  priority: "50",
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
  onCandidateCreated,
}: {
  topics: DashboardTopic[];
  selectedTopicId: string;
  secret: string;
  disabled: boolean;
  onTopicsChange: (topics: DashboardTopic[]) => void;
  onTopicChange: (topicId: string) => void;
  onCandidateCreated?: () => void;
}) {
  const [sourceResult, setSourceResult] = useState<{
    topicId: string;
    sources: TopicSource[];
  }>();
  const [aiResearchResult, setAiResearchResult] = useState<{
    topicId: string;
    source: AiResearchSource;
  }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [topicThemeKey, setTopicThemeKey] = useState<string>(DEFAULT_TOPIC_THEME_KEY);
  const [editingTopic, setEditingTopic] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceFormTopicId, setSourceFormTopicId] = useState<string>();
  const [editingSource, setEditingSource] = useState<TopicSource>();
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(EMPTY_SOURCE);
  const [documentResult, setDocumentResult] = useState<{
    topicId: string;
    documents: KnowledgeDocument[];
  }>();
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [documentDraft, setDocumentDraft] = useState<KnowledgeDocumentDraft>(EMPTY_DOCUMENT);
  const [selectedKnowledgeChapterIds, setSelectedKnowledgeChapterIds] = useState<string[]>([]);
  const [knowledgeDossierTitle, setKnowledgeDossierTitle] = useState("");
  const [documentDetails, setDocumentDetails] = useState<{
    topicId: string;
    topicDocumentId: string;
    chapters: Array<{
      id: string;
      heading: string;
      pageStart: number;
      pageEnd: number;
      printedPageStart?: number;
      printedPageEnd?: number;
      characterCount: number;
      partCount: number;
      candidateStoryId?: string;
      hasPartialCandidate: boolean;
    }>;
  }>();
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
  const aiResearch = aiResearchResult?.topicId === selectedTopicId
    ? aiResearchResult.source
    : undefined;
  const sourceFormVisible = showSourceForm && sourceFormTopicId === selectedTopicId;
  const documents = documentResult?.topicId === selectedTopicId
    ? documentResult.documents
    : undefined;

  useEffect(() => {
    if (!canUseApi || !selectedTopicId || !showSources) {
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
  }, [canUseApi, secret, selectedTopicId, showSources]);

  useEffect(() => {
    if (!canUseApi || !selectedTopicId || !showSources) return;
    const controller = new AbortController();

    requestJson<{ source: AiResearchSource }>(
      `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/ai-research`,
      secret,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setAiResearchResult({ topicId: selectedTopicId, source: response.source });
        }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(errorMessage(loadError));
      });

    return () => controller.abort();
  }, [canUseApi, secret, selectedTopicId, showSources]);

  useEffect(() => {
    if (!canUseApi || !selectedTopicId || !showSources) return;
    const controller = new AbortController();

    requestJson<{ documents: KnowledgeDocument[] }>(
      `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/documents`,
      secret,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setDocumentResult({ topicId: selectedTopicId, documents: response.documents });
        }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(errorMessage(loadError));
      });

    return () => controller.abort();
  }, [canUseApi, secret, selectedTopicId, showSources]);

  useEffect(() => {
    const hasActiveIngestion = documents?.some(
      (document) => document.latestRun?.status === "queued" || document.latestRun?.status === "processing",
    );
    if (!hasActiveIngestion || !canUseApi) return;

    const timer = window.setTimeout(() => {
      requestJson<{ documents: KnowledgeDocument[] }>(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/documents`,
        secret,
      )
        .then((response) => setDocumentResult({ topicId: selectedTopicId, documents: response.documents }))
        .catch((loadError) => setError(errorMessage(loadError)));
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [canUseApi, documents, secret, selectedTopicId]);

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
            themeKey: topicThemeKey,
          }),
        },
      );
      const nextTopics = [...topics, response.topic].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      onTopicsChange(nextTopics);
      setTopicName("");
      setTopicDescription("");
      setTopicThemeKey(DEFAULT_TOPIC_THEME_KEY);
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
            themeKey: topicThemeKey,
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
    setTopicThemeKey(selectedTopic.themeKey);
    setEditingTopic(true);
    setShowTopicForm(false);
  }

  function openNewSource() {
    setShowSources(true);
    setEditingSource(undefined);
    setSourceDraft(EMPTY_SOURCE);
    setSourceFormTopicId(selectedTopicId);
    setShowSourceForm(true);
    setPreview(undefined);
  }

  function openSourceEdit(source: TopicSource) {
    setShowSources(true);
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

  async function saveAiResearch() {
    if (!aiResearch) return;
    await run("save-ai-research", async () => {
      const response = await requestJson<{ source: AiResearchSource }>(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/ai-research`,
        secret,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(aiResearch),
        },
      );
      setAiResearchResult({ topicId: selectedTopicId, source: response.source });
      setNotice("AI research settings saved. It will run with the next collection.");
    });
  }

  async function addKnowledgeDocument() {
    if (!documentDraft.url.trim()) {
      setError("A PDF URL is required.");
      return;
    }

    await run("add-document", async () => {
      await requestJson(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/documents`,
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: documentDraft.url,
            documentType: documentDraft.documentType,
            language: documentDraft.language,
            publisher: documentDraft.publisher || undefined,
            tags: parseTags(documentDraft.tags),
            priority: Number(documentDraft.priority),
          }),
        },
      );
      await reloadDocuments();
      setDocumentDraft(EMPTY_DOCUMENT);
      setShowDocumentForm(false);
      setNotice("PDF queued. Extraction continues in the background.");
    });
  }

  async function retryKnowledgeDocument(document: KnowledgeDocument) {
    await run(`retry-document:${document.topicDocumentId}`, async () => {
      await requestJson(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/documents/${encodeURIComponent(document.topicDocumentId)}/ingest`,
        secret,
        { method: "POST" },
      );
      await reloadDocuments();
      setNotice("PDF ingestion queued again.");
    });
  }

  async function showKnowledgeDocumentSections(
    document: KnowledgeDocument,
    forceReload = false,
  ) {
    await run(`view-document:${document.topicDocumentId}`, async () => {
      if (
        documentDetails?.topicId === selectedTopicId &&
        documentDetails.topicDocumentId === document.topicDocumentId &&
        !forceReload
      ) {
        setDocumentDetails(undefined);
        setSelectedKnowledgeChapterIds([]);
        setKnowledgeDossierTitle("");
        return;
      }
      const response = await requestJson<{
        chapters: Array<{
          id: string;
          heading: string;
          pageStart: number;
          pageEnd: number;
          printedPageStart?: number;
          printedPageEnd?: number;
          characterCount: number;
          partCount: number;
          candidateStoryId?: string;
          hasPartialCandidate: boolean;
        }>;
      }>(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/documents/${encodeURIComponent(document.topicDocumentId)}`,
        secret,
      );
      setDocumentDetails({
        topicId: selectedTopicId,
        topicDocumentId: document.topicDocumentId,
        chapters: response.chapters,
      });
      setSelectedKnowledgeChapterIds([]);
      setKnowledgeDossierTitle("");
    });
  }

  async function reloadDocuments() {
    const response = await requestJson<{ documents: KnowledgeDocument[] }>(
      `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/documents`,
      secret,
    );
    setDocumentResult({ topicId: selectedTopicId, documents: response.documents });
  }

  async function createKnowledgeCandidate(
    document: KnowledgeDocument,
    chapter: {
      id: string;
      heading: string;
      pageStart: number;
      pageEnd: number;
    },
  ) {
    await run(`create-candidate:${chapter.id}`, async () => {
      const response = await requestJson<{
        candidate: { storyId: string; created: boolean; title: string };
      }>(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/documents/${encodeURIComponent(document.topicDocumentId)}/chapters/${encodeURIComponent(chapter.id)}/candidate`,
        secret,
        { method: "POST" },
      );
      await showKnowledgeDocumentSections(document, true);
      onCandidateCreated?.();
      setNotice(
        response.candidate.created
          ? `“${response.candidate.title}” was added to Stories and is ready for AI evaluation.`
          : `“${response.candidate.title}” is already a story candidate.`,
      );
    });
  }

  function toggleKnowledgeChapter(chapterId: string) {
    setSelectedKnowledgeChapterIds((current) =>
      current.includes(chapterId)
        ? current.filter((id) => id !== chapterId)
        : [...current, chapterId],
    );
  }

  async function createKnowledgeDossier(document: KnowledgeDocument) {
    if (selectedKnowledgeChapterIds.length < 2) {
      setError("Select at least two chapters to build a dossier.");
      return;
    }
    await run(`create-dossier:${document.topicDocumentId}`, async () => {
      const response = await requestJson<{
        candidate: { storyId: string; created: boolean; title: string };
      }>(
        `/api/radar/topics/${encodeURIComponent(selectedTopicId)}/documents/${encodeURIComponent(document.topicDocumentId)}/dossiers`,
        secret,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterIds: selectedKnowledgeChapterIds,
            title: knowledgeDossierTitle || undefined,
          }),
        },
      );
      await showKnowledgeDocumentSections(document, true);
      onCandidateCreated?.();
      setNotice(
        response.candidate.created
          ? `Dossier “${response.candidate.title}” was added to Stories with ${selectedKnowledgeChapterIds.length} chapters.`
          : `Dossier “${response.candidate.title}” already exists in Stories.`,
      );
    });
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
          {sources || documents || aiResearch
            ? `${sources?.filter((source) => source.enabled).length ?? 0} feeds · ${aiResearch?.enabled ? "AI research" : "no AI research"} · ${documents?.filter((document) => document.enabled).length ?? 0} documents`
            : "Source setup"}
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
        <p className={styles.locked}>Enter the collector secret below to manage topics and sources.</p>
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
          <label className={styles.themeField}>
            <span>Topic theme</span>
            <select value={topicThemeKey} onChange={(event) => setTopicThemeKey(event.target.value)}>
              {TOPIC_THEMES.map((theme) => (
                <option key={theme.key} value={theme.key}>{theme.label}</option>
              ))}
            </select>
          </label>
          <div>
            <button type="submit" disabled={Boolean(busy)}>{editingTopic ? "Save topic" : "Create topic"}</button>
            <button type="button" onClick={() => { setShowTopicForm(false); setEditingTopic(false); }} disabled={Boolean(busy)}>Cancel</button>
          </div>
        </form>
      ) : null}

      <details
        className={styles.sourcesDisclosure}
        open={showSources}
        onToggle={(event) => setShowSources(event.currentTarget.open)}
      >
        <summary>
          <span>
            <strong>Sources</strong>
            <small>Manage feed connections for {selectedTopic?.name ?? "this topic"}.</small>
          </span>
          <span className={styles.disclosureState}>{showSources ? "Hide" : "Manage"}</span>
        </summary>

        <div className={styles.sourcesContent}>
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

          <div className={styles.knowledgeHeading}>
            <div>
              <h3>AI research</h3>
              <p>Use Luna web search to discover cited, recent stories for this topic.</p>
            </div>
          </div>

          {!canUseApi ? null : !aiResearch ? (
            <p className={styles.loading}>Loading AI research settings…</p>
          ) : (
            <form
              className={styles.sourceForm}
              onSubmit={(event) => {
                event.preventDefault();
                void saveAiResearch();
              }}
            >
              <strong>Web-grounded AI collector</strong>
              <div className={styles.formGrid}>
                <Field label="What should AI find?">
                  <textarea
                    value={aiResearch.instruction}
                    onChange={(event) => setAiResearchResult({
                      topicId: selectedTopicId,
                      source: { ...aiResearch, instruction: event.target.value },
                    })}
                    maxLength={2000}
                    placeholder="Find practical news relevant to this topic, oriented toward…"
                    rows={4}
                  />
                </Field>
                <Field label="Orientation">
                  <select
                    value={aiResearch.orientation}
                    onChange={(event) => setAiResearchResult({
                      topicId: selectedTopicId,
                      source: {
                        ...aiResearch,
                        orientation: event.target.value as AiResearchSource["orientation"],
                      },
                    })}
                  >
                    <option value="informative">Informative</option>
                    <option value="trend">Trend-focused</option>
                    <option value="provocative">Provocative</option>
                  </select>
                </Field>
                <Field label="Look back (hours)">
                  <input type="number" min="1" max="8760" value={aiResearch.lookbackHours} onChange={(event) => setAiResearchResult({ topicId: selectedTopicId, source: { ...aiResearch, lookbackHours: Number(event.target.value) } })} />
                </Field>
                <Field label="Stories to return">
                  <input type="number" min="1" max="10" value={aiResearch.resultLimit} onChange={(event) => setAiResearchResult({ topicId: selectedTopicId, source: { ...aiResearch, resultLimit: Number(event.target.value) } })} />
                </Field>
                <Field label="Language">
                  <input value={aiResearch.language} maxLength={32} onChange={(event) => setAiResearchResult({ topicId: selectedTopicId, source: { ...aiResearch, language: event.target.value } })} />
                </Field>
                <Field label="Region">
                  <input value={aiResearch.region} maxLength={80} onChange={(event) => setAiResearchResult({ topicId: selectedTopicId, source: { ...aiResearch, region: event.target.value } })} />
                </Field>
                <Field label="Priority (0–100)">
                  <input type="number" min="0" max="100" value={aiResearch.priority} onChange={(event) => setAiResearchResult({ topicId: selectedTopicId, source: { ...aiResearch, priority: Number(event.target.value) } })} />
                </Field>
              </div>
              <label className={styles.toggle}><input type="checkbox" checked={aiResearch.enabled} onChange={(event) => setAiResearchResult({ topicId: selectedTopicId, source: { ...aiResearch, enabled: event.target.checked } })} /> Enable AI research for this topic</label>
              <label className={styles.toggle}><input type="checkbox" checked={aiResearch.includeContent} onChange={(event) => setAiResearchResult({ topicId: selectedTopicId, source: { ...aiResearch, includeContent: event.target.checked } })} /> Include the AI&apos;s grounded summary as a story excerpt</label>
              <p>AI returns only articles found through web search. The source URL is retained, and the normal story evaluation still runs after collection.</p>
              <div className={styles.formActions}>
                <button type="submit" disabled={Boolean(busy)}>Save AI research</button>
              </div>
            </form>
          )}

          <div className={styles.knowledgeHeading}>
            <div>
              <h3>Knowledge documents</h3>
              <p>Guidelines, reports, studies, and manuals are extracted into page-linked sections.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowDocumentForm(true)}
              disabled={!canUseApi || disabled || Boolean(busy)}
            >
              Add PDF
            </button>
          </div>

          {showDocumentForm ? (
            <form
              className={styles.sourceForm}
              onSubmit={(event) => {
                event.preventDefault();
                void addKnowledgeDocument();
              }}
            >
              <strong>Add a public PDF</strong>
              <div className={styles.formGrid}>
                <Field label="PDF URL">
                  <input
                    type="url"
                    value={documentDraft.url}
                    onChange={(event) => setDocumentDraft({ ...documentDraft, url: event.target.value })}
                    placeholder="https://example.org/guide.pdf"
                  />
                </Field>
                <Field label="Document type">
                  <select
                    value={documentDraft.documentType}
                    onChange={(event) => setDocumentDraft({
                      ...documentDraft,
                      documentType: event.target.value as KnowledgeDocumentDraft["documentType"],
                    })}
                  >
                    <option value="guideline">Guideline</option>
                    <option value="report">Report</option>
                    <option value="study">Study</option>
                    <option value="manual">Manual</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Language">
                  <input value={documentDraft.language} onChange={(event) => setDocumentDraft({ ...documentDraft, language: event.target.value })} maxLength={32} />
                </Field>
                <Field label="Publisher">
                  <input value={documentDraft.publisher} onChange={(event) => setDocumentDraft({ ...documentDraft, publisher: event.target.value })} maxLength={200} placeholder="INSPQ" />
                </Field>
                <Field label="Topic tags">
                  <input value={documentDraft.tags} onChange={(event) => setDocumentDraft({ ...documentDraft, tags: event.target.value })} placeholder="postpartum, mental health" />
                </Field>
                <Field label="Priority (0–100)">
                  <input type="number" min="0" max="100" value={documentDraft.priority} onChange={(event) => setDocumentDraft({ ...documentDraft, priority: event.target.value })} />
                </Field>
              </div>
              <p>The source must be a public PDF under 40 MB. Page numbers are preserved for editorial citations.</p>
              <div className={styles.formActions}>
                <button type="submit" disabled={Boolean(busy)}>Add and extract</button>
                <button type="button" onClick={() => setShowDocumentForm(false)} disabled={Boolean(busy)}>Cancel</button>
              </div>
            </form>
          ) : null}

          {!canUseApi ? null : !documents ? (
            <p className={styles.loading}>Loading knowledge documents…</p>
          ) : documents.length === 0 ? (
            <div className={styles.empty}>
              <strong>No knowledge documents yet.</strong>
              <span>Add a public PDF to build the topic&apos;s durable evidence library.</span>
            </div>
          ) : (
            <ul className={styles.documentList}>
              {documents.map((document) => {
                const run = document.latestRun;
                const progress = run?.pagesTotal
                  ? Math.round((run.pagesProcessed / run.pagesTotal) * 100)
                  : undefined;
                const detailsVisible =
                  documentDetails?.topicId === selectedTopicId &&
                  documentDetails.topicDocumentId === document.topicDocumentId;
                return (
                  <li key={document.topicDocumentId}>
                    <div className={styles.sourceCopy}>
                      <div>
                        <strong>{document.latestVersion?.title ?? "PDF awaiting extraction"}</strong>
                        <span className={run?.status === "failed" ? styles.failed : run?.status === "completed" ? styles.enabled : styles.processing}>
                          {knowledgeRunLabel(run)}
                        </span>
                      </div>
                      <a href={document.canonicalUrl} target="_blank" rel="noreferrer">{document.canonicalUrl}</a>
                      <small>
                        {document.documentType} · {document.language}
                        {document.publisher ? ` · ${document.publisher}` : ""}
                        {document.latestVersion ? ` · ${document.latestVersion.pageCount} pages · ${document.latestVersion.sectionCount} technical chunks` : ""}
                        {progress !== undefined && run?.status === "processing" ? ` · ${progress}%` : ""}
                      </small>
                      {run?.error ? <span className={styles.inlineError}>{run.error}</span> : null}
                    </div>
                    <div className={styles.sourceActions}>
                      {document.latestVersion ? (
                        <button type="button" onClick={() => void showKnowledgeDocumentSections(document)} disabled={Boolean(busy)}>
                          {detailsVisible ? "Hide chapters" : "View chapters"}
                        </button>
                      ) : null}
                      {run?.status === "failed" ? (
                        <button type="button" onClick={() => void retryKnowledgeDocument(document)} disabled={Boolean(busy)}>Retry</button>
                      ) : null}
                    </div>
                    {detailsVisible ? (
                      <div className={styles.documentSections}>
                        <strong>Editorial chapters</strong>
                        <div className={styles.dossierBuilder}>
                          <div>
                            <strong>Build a multi-chapter story</strong>
                            <small>
                              Select related chapters to create one evidence dossier before AI evaluation.
                              Chapters already used in another story remain reusable here.
                            </small>
                          </div>
                          <label className={styles.dossierTitle}>
                            <span>Working title (optional)</span>
                            <input
                              value={knowledgeDossierTitle}
                              onChange={(event) => setKnowledgeDossierTitle(event.target.value)}
                              placeholder="Pregnancy stages for first-time mothers"
                              maxLength={500}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void createKnowledgeDossier(document)}
                            disabled={Boolean(busy) || selectedKnowledgeChapterIds.length < 2}
                          >
                            Create dossier from {selectedKnowledgeChapterIds.length} chapters
                          </button>
                        </div>
                        <ol>
                          {documentDetails.chapters.map((chapter) => (
                            <li key={chapter.id}>
                              <div>
                                <label className={styles.chapterSelect}>
                                  <input
                                    type="checkbox"
                                    checked={selectedKnowledgeChapterIds.includes(chapter.id)}
                                    onChange={() => toggleKnowledgeChapter(chapter.id)}
                                    aria-label={`Select ${chapter.heading} for a story dossier`}
                                  />
                                  <span>{chapter.heading}</span>
                                </label>
                                <small>
                                  {chapter.printedPageStart !== undefined && chapter.printedPageEnd !== undefined
                                    ? `Printed pages ${chapter.printedPageStart}–${chapter.printedPageEnd} · `
                                    : ""}
                                  PDF pages {chapter.pageStart}–{chapter.pageEnd} · {chapter.characterCount.toLocaleString()} characters
                                  {chapter.partCount > 1 ? ` · ${chapter.partCount} internal chunks joined` : ""}
                                </small>
                              </div>
                              {chapter.candidateStoryId ? (
                                <span className={styles.candidateReady}>In Stories · reusable</span>
                              ) : chapter.hasPartialCandidate ? (
                                <span className={styles.candidateReady}>Parts in Stories · reusable</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void createKnowledgeCandidate(document, chapter)}
                                  disabled={Boolean(busy)}
                                >
                                  Create chapter story
                                </button>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>
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

function knowledgeRunLabel(run: KnowledgeDocument["latestRun"]): string {
  if (!run) return "Queued";
  if (run.status === "failed") return "Failed";
  if (run.status === "completed") return "Ready";
  if (run.stage === "fetching") return "Downloading";
  if (run.stage === "extracting") return run.pagesTotal
    ? `Extracting ${run.pagesProcessed}/${run.pagesTotal}`
    : "Extracting";
  if (run.stage === "persisting") return "Saving sections";
  return "Queued";
}
