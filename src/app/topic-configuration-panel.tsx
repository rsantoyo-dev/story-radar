"use client";

import { EditorialLinesPanel } from "./editorial-lines-panel";
import { type ReactNode, useEffect, useState } from "react";

import {
  DEFAULT_TOPIC_THEME_KEY,
  TOPIC_THEMES,
} from "@/design/topic-themes";
import type { WorkspaceSourceCatalog } from "@/app/modules/sources/workspace-source-catalog.repository";

import styles from "./topic-configuration-panel.generated.module.css";

export type DashboardTopic = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  themeKey: string;
  isActive: boolean;
};

export type TopicConfigurationView = "topics" | "rss" | "ai" | "documents" | "manual";

const VIEW_HEADING: Record<TopicConfigurationView, { eyebrow: string; title: string; description: string }> = {
  topics: {
    eyebrow: "Workspace",
    title: "Topics",
    description: "Manage publications and their editorial lines.",
  },
  rss: {
    eyebrow: "Sources",
    title: "RSS feeds",
    description: "Manage feeds connected to the selected topic.",
  },
  ai: {
    eyebrow: "Sources",
    title: "AI research",
    description: "Configure web-grounded discovery for the selected topic.",
  },
  documents: {
    eyebrow: "Sources",
    title: "Documents",
    description: "Manage page-linked knowledge documents for the selected topic.",
  },
  manual: {
    eyebrow: "Sources",
    title: "Manual stories",
    description: "Create and review stories supplied by your team.",
  },
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
  uploaded?: boolean;
  originalFilename?: string;
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
  view,
  topics,
  selectedTopicId,
  secret,
  disabled,
  onTopicsChange,
  onTopicChange,
  onCandidateCreated,
  onNewStory,
  onOpenStory,
  catalog,
  catalogError,
}: {
  view: TopicConfigurationView;
  topics: DashboardTopic[];
  selectedTopicId: string;
  secret: string;
  disabled: boolean;
  onTopicsChange: (topics: DashboardTopic[]) => void;
  onTopicChange: (topicId: string) => void;
  onCandidateCreated?: () => void;
  onNewStory?: () => void;
  onOpenStory?: (topicId: string, storyId: string) => void;
  catalog?: WorkspaceSourceCatalog;
  catalogError?: string;
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
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceFormTopicId, setSourceFormTopicId] = useState<string>();
  const [editingSource, setEditingSource] = useState<TopicSource>();
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(EMPTY_SOURCE);
  const [feedTopicIds, setFeedTopicIds] = useState<string[]>([selectedTopicId]);
  const [documentTopicIds, setDocumentTopicIds] = useState<string[]>([selectedTopicId]);
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [filterTopicId, setFilterTopicId] = useState("");
  const [feedStatusFilter, setFeedStatusFilter] = useState("all");
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
    const refresh = () => setCatalogRefresh((current) => current + 1);
    window.addEventListener("workspace-sources-changed", refresh);
    return () => window.removeEventListener("workspace-sources-changed", refresh);
  }, []);

  useEffect(() => {
    if (!canUseApi || !selectedTopicId || view !== "rss") {
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
  }, [canUseApi, secret, selectedTopicId, view, catalogRefresh]);

  useEffect(() => {
    if (!canUseApi || !selectedTopicId || view !== "ai") return;
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
  }, [canUseApi, secret, selectedTopicId, view, catalogRefresh]);

  useEffect(() => {
    if (!canUseApi || !selectedTopicId || view !== "documents") return;
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
  }, [canUseApi, secret, selectedTopicId, view, catalogRefresh]);

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
      notifyCatalogChanged();
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
      notifyCatalogChanged();
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
    setEditingSource(undefined);
    setSourceDraft(EMPTY_SOURCE);
    setFeedTopicIds([selectedTopicId]);
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
          "/api/radar/sources/rss",
          secret,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source, link, topicIds: feedTopicIds }),
          },
        );
      }

      await reloadSources();
      notifyCatalogChanged();
      setShowSourceForm(false);
      setSourceFormTopicId(undefined);
      setEditingSource(undefined);
      setSourceDraft(EMPTY_SOURCE);
      window.dispatchEvent(new CustomEvent("editorial-lines-changed", {detail:selectedTopicId}));
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
      notifyCatalogChanged();
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
      notifyCatalogChanged();
      window.dispatchEvent(new CustomEvent("editorial-lines-changed", {detail:selectedTopicId}));
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
      notifyCatalogChanged();
      window.dispatchEvent(new CustomEvent("editorial-lines-changed", {detail:selectedTopicId}));
      setNotice("AI research settings saved. It will run with the next collection.");
    });
  }

  async function addKnowledgeDocument() {
    if (!documentDraft.url.trim()) {
      setError("A PDF URL is required.");
      return;
    }

    await run("add-document", async () => {
      const queued = await requestJson<{ queued: { documentId: string } }>(
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
      for (const topicId of documentTopicIds.filter((id) => id !== selectedTopicId)) {
          await requestJson(`/api/radar/sources/documents/${encodeURIComponent(queued.queued.documentId)}/topics`, secret, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topicId }),
          });
      }
      await reloadDocuments();
      notifyCatalogChanged();
      setDocumentDraft(EMPTY_DOCUMENT);
      setShowDocumentForm(false);
      setNotice("PDF queued. Extraction continues in the background.");
    });
  }

  async function toggleTopicFeed(feed: NonNullable<typeof catalog>["rss"][number]) {
    const link = feed.topics.find((item) => item.topicId === selectedTopicId);
    await run(`topic-feed:${feed.id}`, async () => {
      if (link) {
        await requestJson(`/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources/${encodeURIComponent(link.topicSourceId)}`, secret, { method: "DELETE" });
      } else {
        await requestJson(`/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources`, secret, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: feed.id }),
        });
      }
      notifyCatalogChanged();
      setNotice(link ? "Feed unlinked from this topic." : "Feed linked to this topic.");
    });
  }

  async function toggleTopicDocument(document: NonNullable<typeof catalog>["documents"][number]) {
    const attached = document.topics.some((item) => item.topicId === selectedTopicId);
    await run(`topic-document:${document.id}`, async () => {
      await requestJson(`/api/radar/sources/documents/${encodeURIComponent(document.id)}/topics`, secret, {
        method: attached ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selectedTopicId }),
      });
      notifyCatalogChanged();
      setNotice(attached ? "Document unlinked from this topic." : "Document linked to this topic.");
    });
  }

  async function unlinkWorkspaceFeed(topicId: string, topicSourceId: string) {
    await run(`unlink-feed:${topicSourceId}`, async () => {
      await requestJson(`/api/radar/topics/${encodeURIComponent(topicId)}/sources/${encodeURIComponent(topicSourceId)}`, secret, { method: "DELETE" });
      notifyCatalogChanged();
      setNotice("Feed unlinked. Its workspace record was kept.");
    });
  }

  async function linkWorkspaceFeed(sourceId: string) {
    await run(`link-feed:${sourceId}`, async () => {
      await requestJson(`/api/radar/topics/${encodeURIComponent(selectedTopicId)}/sources`, secret, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      notifyCatalogChanged();
      setNotice("Existing feed linked to this topic.");
    });
  }

  async function deleteWorkspaceFeed(sourceId: string) {
    if (!window.confirm("Delete this unlinked feed from the workspace?")) return;
    await run(`delete-feed:${sourceId}`, async () => {
      await requestJson(`/api/radar/sources/rss/${encodeURIComponent(sourceId)}`, secret, { method: "DELETE" });
      notifyCatalogChanged();
      setNotice("Feed deleted.");
    });
  }

  async function unlinkWorkspaceDocument(topicId: string, documentId: string) {
    await run(`unlink-document:${documentId}:${topicId}`, async () => {
      await requestJson(`/api/radar/sources/documents/${encodeURIComponent(documentId)}/topics`, secret, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topicId }),
      });
      notifyCatalogChanged();
      setNotice("Document unlinked. Its workspace record and extracted versions were kept.");
    });
  }

  async function retryWorkspaceDocument(topicId: string, topicDocumentId: string) {
    await run(`retry-workspace-document:${topicDocumentId}`, async () => {
      await requestJson(`/api/radar/topics/${encodeURIComponent(topicId)}/documents/${encodeURIComponent(topicDocumentId)}/ingest`, secret, { method: "POST" });
      notifyCatalogChanged();
      setNotice("Document ingestion queued again.");
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
      notifyCatalogChanged();
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
    <section className={styles.panel} aria-labelledby={`configuration-${view}-title`}>
      <div className={styles.heading}>
        <div>
          <p>{VIEW_HEADING[view].eyebrow}</p>
          <h2 id={`configuration-${view}-title`}>{VIEW_HEADING[view].title}</h2>
          <small>{VIEW_HEADING[view].description}</small>
        </div>
        {view !== "topics" ? <span className={styles.count}>{selectedTopic?.name ?? "Select a topic"}</span> : null}
      </div>

      {!canUseApi ? (
        <p className={styles.locked}>Enter the collector secret below to manage topics and sources.</p>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {catalogError ? <p className={styles.error} role="alert">{catalogError}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {view === "topics" ? <>
      <EditorialLinesPanel key={selectedTopicId} topicId={selectedTopicId} secret={secret} disabled={disabled || Boolean(busy)} manageOnly/>
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

      <div className={styles.linkedSources}>
        <div>
          <h3>Linked RSS feeds</h3>
          <a href="#sources/rss">Manage RSS feeds ↗</a>
          {!catalog ? <p className={styles.loading}>Loading feeds…</p> : catalog.rss.length === 0 ? (
            <p className={styles.empty}>No workspace feeds yet.</p>
          ) : catalog.rss.map((feed) => (
            <label key={feed.id} className={styles.linkChoice}>
              <input type="checkbox" checked={feed.topics.some((item) => item.topicId === selectedTopicId)} onChange={() => void toggleTopicFeed(feed)} disabled={!canUseApi || disabled || Boolean(busy)} />
              <span>{feed.name}</span>
            </label>
          ))}
        </div>
        <div>
          <h3>Linked documents</h3>
          <a href="#sources/documents">Manage documents ↗</a>
          {!catalog ? <p className={styles.loading}>Loading documents…</p> : catalog.documents.length === 0 ? (
            <p className={styles.empty}>No workspace documents yet.</p>
          ) : catalog.documents.map((document) => (
            <label key={document.id} className={styles.linkChoice}>
              <input type="checkbox" checked={document.topics.some((item) => item.topicId === selectedTopicId)} onChange={() => void toggleTopicDocument(document)} disabled={!canUseApi || disabled || Boolean(busy)} />
              <span>{document.latestVersion?.title ?? document.originalFilename ?? document.canonicalUrl}</span>
            </label>
          ))}
        </div>
        <div>
          <h3>AI research</h3>
          <p>Research instructions belong to each topic.</p>
          <a href="#sources/ai">Configure this topic ↗</a>
        </div>
      </div>

      </> : null}

      {view === "rss" ? <div className={styles.sourcesContent}>
          <div className={styles.catalogFilters}>
            <label>Topic
              <select value={filterTopicId} onChange={(event) => setFilterTopicId(event.target.value)}>
                <option value="">All topics</option>
                {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
            </label>
            <label>Status
              <select value={feedStatusFilter} onChange={(event) => setFeedStatusFilter(event.target.value)}>
                <option value="all">All feeds</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="unlinked">Unlinked</option>
              </select>
            </label>
          </div>
          {!catalog ? <p className={styles.loading}>Loading workspace feeds…</p> : (
            <ul className={styles.catalogList}>
              {catalog.rss.filter((feed) =>
                (!filterTopicId || feed.topics.some((link) => link.topicId === filterTopicId)) &&
                (feedStatusFilter === "all" ||
                  (feedStatusFilter === "active" && feed.isActive) ||
                  (feedStatusFilter === "inactive" && !feed.isActive) ||
                  (feedStatusFilter === "unlinked" && feed.topics.length === 0)),
              ).map((feed) => (
                <li key={feed.id}>
                  <strong>{feed.name}</strong>
                  <a href={feed.url} target="_blank" rel="noreferrer">{feed.url}</a>
                  <small>{feed.isActive ? "Active" : "Inactive"} · Last recorded poll: {feed.lastPoll ? `${new Date(feed.lastPoll.at).toLocaleString()} (${feed.lastPoll.status})` : "None"}</small>
                  <div className={styles.catalogLinks}>
                    {feed.topics.length ? feed.topics.map((link) => (
                      <span key={link.topicSourceId}>
                        {link.topicName} · priority {link.priority} · {link.enabled ? "enabled" : "disabled"}
                        <button type="button" onClick={() => void unlinkWorkspaceFeed(link.topicId, link.topicSourceId)} disabled={disabled || Boolean(busy)} aria-label={`Unlink ${feed.name} from ${link.topicName}`}>Unlink</button>
                      </span>
                    )) : <span>Not linked to a topic</span>}
                  </div>
                  {!feed.topics.some((link) => link.topicId === selectedTopicId) ? <button type="button" onClick={() => void linkWorkspaceFeed(feed.id)} disabled={disabled || Boolean(busy)}>Link to {selectedTopic?.name ?? "selected topic"}</button> : null}
                  {feed.topics.length === 0 ? <button type="button" onClick={() => void deleteWorkspaceFeed(feed.id)} disabled={disabled || Boolean(busy)}>Delete feed</button> : null}
                </li>
              ))}
            </ul>
          )}
          <div className={styles.sourcesHeading}>
            <div>
              <h3>Feed settings for {selectedTopic?.name ?? "this topic"}</h3>
              <p>Add a feed to one or more topics, or edit this topic&apos;s links below.</p>
            </div>
            <button type="button" onClick={openNewSource} disabled={!canUseApi || disabled || Boolean(busy)}>
              Add feed
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
          <label className={styles.toggle}><input type="checkbox" checked={sourceDraft.enabled} onChange={(event) => setSourceDraft({ ...sourceDraft, enabled: event.target.checked })} /> Enable this source for linked topics</label>
          {!editingSource ? (
            <fieldset className={styles.topicChoices}>
              <legend>Link to topics</legend>
              {topics.filter((topic) => topic.isActive).map((topic) => (
                <label key={topic.id}>
                  <input type="checkbox" checked={feedTopicIds.includes(topic.id)} onChange={(event) => setFeedTopicIds((current) => event.target.checked ? [...current, topic.id] : current.filter((id) => id !== topic.id))} />
                  {topic.name}
                </label>
              ))}
            </fieldset>
          ) : null}
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
      </div> : null}

      {view === "ai" ? <div className={styles.sourcesContent}>
          <p>AI research is configured separately for each topic. It is not a shared feed.</p>
          {!catalog ? <p className={styles.loading}>Loading topic research…</p> : (
            <ul className={styles.catalogList}>
              {catalog.aiResearch.map((source) => (
                <li key={source.topicId}>
                  <strong>{source.topicName}</strong>
                  <small>{source.enabled ? "Active" : "Inactive"} · Model: {source.model} · Last recorded run: {source.latestRun ? `${new Date(source.latestRun.at).toLocaleString()} (${source.latestRun.status})` : "None"}</small>
                  <p>{source.instruction ? `${source.instruction.slice(0, 180)}${source.instruction.length > 180 ? "…" : ""}` : "No instructions configured."}</p>
                  <button type="button" onClick={() => onTopicChange(source.topicId)} disabled={disabled || Boolean(busy) || source.topicId === selectedTopicId}>Edit settings</button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.knowledgeHeading}>
            <div>
              <h3>Settings for {selectedTopic?.name ?? "this topic"}</h3>
              <p>Use web search to discover cited stories for this topic.</p>
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
      </div> : null}

      {view === "manual" ? <div className={styles.sourcesContent}>
        <div className={styles.sourcesHeading}>
          <div>
            <h3>Stories supplied by your team</h3>
            <p>These stories enter the same editorial review as collected material.</p>
          </div>
          <button type="button" onClick={onNewStory} disabled={!canUseApi || disabled || Boolean(busy)}>New story</button>
        </div>
        <div className={styles.catalogFilters}>
          <label>Topic
            <select value={filterTopicId} onChange={(event) => setFilterTopicId(event.target.value)}>
              <option value="">All topics</option>
              {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </select>
          </label>
        </div>
        {!catalog ? <p className={styles.loading}>Loading manual stories…</p> : catalog.manual.length === 0 ? (
          <p className={styles.empty}>No manual stories yet.</p>
        ) : (
          <ul className={styles.catalogList}>
            {catalog.manual.filter((entry) => !filterTopicId || entry.topicId === filterTopicId).map((entry) => (
              <li key={entry.id}>
                <strong>{entry.title}</strong>
                <small>{entry.topicName} · {entry.contentType} · {new Date(entry.publishedAt).toLocaleDateString()}</small>
                <button type="button" onClick={() => onOpenStory?.(entry.topicId, entry.storyId)} disabled={!canUseApi || disabled || Boolean(busy)}>Open story</button>
              </li>
            ))}
          </ul>
        )}
      </div> : null}

      {view === "documents" ? <div className={styles.sourcesContent}>
          {!catalog ? <p className={styles.loading}>Loading workspace documents…</p> : (
            <ul className={styles.catalogList}>
              {catalog.documents.map((document) => (
                <li key={document.id}>
                  <strong>{document.latestVersion?.title ?? document.originalFilename ?? document.canonicalUrl}</strong>
                  {document.uploaded ? <small>Uploaded PDF</small> : <a href={document.canonicalUrl} target="_blank" rel="noreferrer">{document.canonicalUrl}</a>}
                  <small>{document.documentType} · {document.latestRun ? `${document.latestRun.status} (${new Date(document.latestRun.at).toLocaleString()})` : "Not ingested"}{document.latestVersion ? ` · ${document.latestVersion.pageCount} pages` : ""}</small>
                  <div className={styles.catalogLinks}>
                    {document.topics.length ? document.topics.map((link) => (
                      <span key={link.topicDocumentId}>
                        {link.topicName} · priority {link.priority}
                        <button type="button" onClick={() => { onTopicChange(link.topicId); }} disabled={disabled || Boolean(busy)}>View in topic</button>
                        <button type="button" onClick={() => void unlinkWorkspaceDocument(link.topicId, document.id)} disabled={disabled || Boolean(busy)} aria-label={`Unlink document from ${link.topicName}`}>Unlink</button>
                        {document.latestRun?.status === "failed" ? <button type="button" onClick={() => void retryWorkspaceDocument(link.topicId, link.topicDocumentId)} disabled={disabled || Boolean(busy)}>Retry</button> : null}
                      </span>
                    )) : <span>Not linked to a topic</span>}
                  </div>
                  {!document.topics.some((link) => link.topicId === selectedTopicId) ? <button type="button" onClick={() => void toggleTopicDocument(document)} disabled={disabled || Boolean(busy)}>Link to {selectedTopic?.name ?? "selected topic"}</button> : null}
                </li>
              ))}
            </ul>
          )}
          <div className={styles.knowledgeHeading}>
            <div>
              <h3>Documents for {selectedTopic?.name ?? "this topic"}</h3>
              <p>Guidelines, reports, studies, and manuals are extracted into page-linked sections.</p>
            </div>
            <button
              type="button"
              onClick={() => { setDocumentTopicIds([selectedTopicId]); setShowDocumentForm(true); }}
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
              <fieldset className={styles.topicChoices}>
                <legend>Link to topics</legend>
                {topics.filter((topic) => topic.isActive).map((topic) => (
                  <label key={topic.id}>
                    <input type="checkbox" checked={documentTopicIds.includes(topic.id)} disabled={topic.id === selectedTopicId} onChange={(event) => setDocumentTopicIds((current) => event.target.checked ? [...current, topic.id] : current.filter((id) => id !== topic.id))} />
                    {topic.name}
                  </label>
                ))}
              </fieldset>
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
                        <strong>{document.latestVersion?.title ?? document.originalFilename ?? "PDF awaiting extraction"}</strong>
                        <span className={run?.status === "failed" ? styles.failed : run?.status === "completed" ? styles.enabled : styles.processing}>
                          {knowledgeRunLabel(run)}
                        </span>
                      </div>
                      {document.uploaded ? <small>Uploaded PDF</small> : <a href={document.canonicalUrl} target="_blank" rel="noreferrer">{document.canonicalUrl}</a>}
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
      : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span>{label}</span>{children}</label>;
}

function notifyCatalogChanged() {
  window.dispatchEvent(new Event("workspace-sources-changed"));
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
