"use client";

import { useRef, useState } from "react";

import { CreativeDraftWorkspace } from "./creative-draft-workspace";
import { EditorialProfilePanel } from "./editorial-profile-panel";
import styles from "./radar-dashboard.generated.module.css";
import {
  TopicConfigurationPanel,
  type DashboardTopic,
} from "./topic-configuration-panel";

type DatabaseStats = {
  stories: number;
  storySources: number;
  collectionRuns: number;
  collectionSourceRuns: number;
  storiesByStatus: Record<string, number>;
  editorial: EditorialDashboardStats;
  latestCollectionRun?: {
    id: string;
    status: "completed" | "partial" | "failed";
    startedAt: string;
    finishedAt: string;
    includedItems: number;
    fetchedItems: number;
    filteredOutItems: number;
    duplicatesRemoved: number;
    exactDuplicatesRemoved: number;
    similarDuplicatesRemoved: number;
    readyItems: number;
    needsEnrichmentItems: number;
    reviewItems: number;
    rejectedItems: number;
    failedSources: number;
  };
};

type EditorialDashboardStats = {
  configuration: {
    provider: string;
    model: string;
    promptVersion: string;
    maxRunsPerDay: number;
    maxStoriesPerRun: number;
    maxStoriesPerDay: number;
    maxContentCharacters: number;
    maxAgeHours: number;
    minLocalScore: number;
    effectiveCandidatePolicy?: {
      localCandidateMinScore: number;
      freshness: {
        newsMaxAgeHours: number;
        researchMaxAgeHours: number;
      };
    };
  };
  totalRuns: number;
  totalEvaluations: number;
  decisions: Partial<Record<"reject" | "review" | "shortlist", number>>;
  today: {
    runs: number;
    stories: number;
    evaluatedStories: number;
    promptTokens: number;
    outputTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
    maxRuns: number;
    maxStories: number;
    remainingRuns: number;
    remainingStories: number;
  };
  latestRun?: {
    id: string;
    status: "running" | "completed" | "failed";
    model: string;
    modelVersion?: string;
    requestedStories: number;
    evaluatedStories: number;
    cachedStories: number;
    totalTokens: number;
    startedAt: string;
    finishedAt?: string;
    error?: string;
  };
  collectedStories: EditorialCollectedStory[];
  shortlist: EditorialDashboardStory[];
  selectedStories: EditorialDashboardStory[];
};

const PUBLICATION_PLATFORMS = [
  "instagram",
  "linkedin",
  "tiktok",
  "facebook",
  "x",
  "youtube",
  "newsletter",
] as const;

type PublicationPlatform = (typeof PUBLICATION_PLATFORMS)[number];
type PublicationStatus = "draft" | "scheduled" | "published";
type PublicationFilter =
  | "all"
  | "not-published-anywhere"
  | "scheduled-on-platform"
  | "published-on-platform";

type StoryPublication = {
  platform: PublicationPlatform;
  status: PublicationStatus;
  scheduledAt?: string;
  publishedAt?: string;
  postUrl?: string;
  note?: string;
};

type EditorialDashboardStory = {
  storyId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  contentStatus: "excerpt" | "full" | "likely-full" | "missing";
  publishedAt?: string;
  localScore: number;
  evaluationDecision: "reject" | "review" | "shortlist";
  editorialPriority?: number;
  editorialScore: number;
  canadaRelevance: number;
  aiRelevance: number;
  socialPotential: number;
  novelty: number;
  reason: string;
  suggestedAngles: string[];
  riskFlags: string[];
  evaluatedAt: string;
  reviewedAt?: string;
  enrichmentStatus?: "pending" | "completed" | "failed" | "blocked";
  enrichmentMethod?: "direct" | "reader";
  enrichmentWordCount?: number;
  enrichmentAttempts?: number;
  enrichmentError?: string;
  enrichedAt?: string;
  publications?: StoryPublication[];
};

type EditorialCollectedStory = {
  storyId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  contentStatus: "excerpt" | "full" | "likely-full" | "missing";
  processingStatus:
    | "new"
    | "needs-enrichment"
    | "ready"
    | "selected"
    | "rejected"
    | "published"
    | "failed";
  publishedAt?: string;
  lastSeenAt: string;
  localScore: number;
  reviewDecision?: "approved" | "rejected";
  reviewable: boolean;
  evaluationDecision?: "reject" | "review" | "shortlist";
  editorialPriority?: number;
  editorialScore?: number;
  canadaRelevance?: number;
  aiRelevance?: number;
  socialPotential?: number;
  novelty?: number;
  reason?: string;
  suggestedAngles: string[];
  riskFlags: string[];
  evaluatedAt?: string;
};

type EditorialTableStory = {
  storyId: string;
  sourceName: string;
  title: string;
  url: string;
  contentStatus: EditorialDashboardStory["contentStatus"];
  processingStatus?: EditorialCollectedStory["processingStatus"];
  publishedAt?: string;
  lastSeenAt?: string;
  localScore: number;
  reviewDecision?: "approved" | "rejected";
  reviewable?: boolean;
  evaluationDecision?: "reject" | "review" | "shortlist";
  editorialPriority?: number;
  editorialScore?: number;
  canadaRelevance?: number;
  aiRelevance?: number;
  socialPotential?: number;
  novelty?: number;
  reason?: string;
  suggestedAngles: string[];
  riskFlags: string[];
  reviewedAt?: string;
  enrichmentStatus?: EditorialDashboardStory["enrichmentStatus"];
  enrichmentMethod?: EditorialDashboardStory["enrichmentMethod"];
  enrichmentWordCount?: number;
  enrichmentAttempts?: number;
  enrichmentError?: string;
  enrichedAt?: string;
  publications?: StoryPublication[];
};

type CollectionResponse = {
  sources: {
    requested: number;
    successful: number;
    failed: number;
  };
  counts: {
    duplicatesRemoved: number;
    relevance: {
      ready: number;
      needsEnrichment: number;
      review: number;
      rejected: number;
    };
  };
  persistence: {
    persistedStories: number;
    markedStoredDuplicates: number;
  };
};

type ClearResponse = {
  deleted: {
    deletedStories: number;
    deletedCollectionRuns: number;
    deletedEditorialEvaluationRuns: number;
    deletedSocialPublications: number;
  };
  stats: DatabaseStats;
};

type EditorialEvaluationResponse = {
  status: "completed" | "no-candidates";
  evaluatedStories: number;
  candidatesScanned: number;
  cachedStories: number;
  usage: {
    totalTokens: number;
  };
};

type StoryReviewResponse = {
  decision: "approved" | "rejected";
  reviewedStories: number;
};

type StoryContentResponse = {
  storyId: string;
  title: string;
  url: string;
  text?: string;
  contentStatus: EditorialDashboardStory["contentStatus"];
  source: "rss" | "article";
  outcome?: "prepared" | "already-ready";
  enrichment?: {
    status: "pending" | "completed" | "failed" | "blocked";
    method: "direct" | "reader";
    wordCount?: number;
    resolvedUrl?: string;
    articleTitle?: string;
    byline?: string;
    attempts: number;
    error?: string;
    fetchedAt?: string;
    updatedAt: string;
  };
};

type KeywordPreferences = {
  favoredTerms: string[];
  unfavoredTerms: string[];
  updatedAt?: string;
};

type Operation =
  | "status"
  | "collect"
  | "evaluate"
  | "review"
  | "promote"
  | "prepare"
  | "view"
  | "publication"
  | "preferences"
  | "clear"
  | "regenerate";

type Notice = {
  tone: "success" | "error";
  title: string;
  message: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  "needs-enrichment": "Needs enrichment",
  ready: "Ready",
  selected: "Selected",
  rejected: "Rejected",
  published: "Published",
  failed: "Failed",
};

export function RadarDashboard({
  initialTopicId,
  initialTopics,
  initialPreferences,
}: {
  initialTopicId: string;
  initialTopics: DashboardTopic[];
  initialPreferences: KeywordPreferences;
}) {
  const [secret, setSecret] = useState("");
  const [topics, setTopics] = useState(initialTopics);
  const [selectedTopicId, setSelectedTopicId] = useState(initialTopicId);
  const selectedTopicIdRef = useRef(initialTopicId);
  const [maxAgeHours, setMaxAgeHours] = useState("72");
  const [confirmation, setConfirmation] = useState("");
  const [favoredTerms, setFavoredTerms] = useState(
    initialPreferences.favoredTerms.join("\n"),
  );
  const [unfavoredTerms, setUnfavoredTerms] = useState(
    initialPreferences.unfavoredTerms.join("\n"),
  );
  const [preferencesUpdatedAt, setPreferencesUpdatedAt] = useState(
    initialPreferences.updatedAt,
  );
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [stats, setStats] = useState<DatabaseStats>();
  const [activeOperation, setActiveOperation] = useState<Operation>();
  const [activeStoryId, setActiveStoryId] = useState<string>();
  const [contentViewer, setContentViewer] = useState<StoryContentResponse>();
  const [creativeStory, setCreativeStory] = useState<{
    storyId: string;
    title: string;
  }>();
  const [notice, setNotice] = useState<Notice>();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isBusy = activeOperation !== undefined;
  const canAuthenticate = secret.trim().length > 0;
  const canDelete = canAuthenticate && confirmation === "DELETE" && !isBusy;

  async function handleLoadStatus() {
    await runOperation("status", async () => {
      const [nextStats, preferences] = await Promise.all([
        fetchDatabaseStats(secret, selectedTopicId),
        fetchKeywordPreferences(secret, selectedTopicId),
      ]);

      setStats(nextStats);
      setSelectedStoryIds([]);
      setFavoredTerms(preferences.favoredTerms.join("\n"));
      setUnfavoredTerms(preferences.unfavoredTerms.join("\n"));
      setPreferencesUpdatedAt(preferences.updatedAt);
      setPreferencesDirty(false);
      return {
        tone: "success",
        title: "Connection verified",
        message: `Neon responded successfully. ${nextStats.stories} stories are currently stored.`,
      };
    });
  }

  async function handleCollect() {
    if (preferencesDirty) {
      showUnsavedPreferences();
      return;
    }

    const hours = parseMaxAgeHours(maxAgeHours);

    if (!hours) {
      showInvalidHours();
      return;
    }

    await runOperation("collect", async () => {
      const collection = await collectStories(secret, selectedTopicId, hours);
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

      setStats(nextStats);
      setSelectedStoryIds([]);
      return collectionNotice(collection, "Collection completed");
    });
  }

  async function handleClear() {
    await runOperation("clear", async () => {
      const result = await clearDatabase(secret, selectedTopicId);

      setStats(result.stats);
      setSelectedStoryIds([]);
      setConfirmation("");
      return {
        tone: "success",
        title: "Data cleared",
        message: `${result.deleted.deletedStories} stories, ${result.deleted.deletedCollectionRuns} collection runs, ${result.deleted.deletedEditorialEvaluationRuns} AI runs, and ${result.deleted.deletedSocialPublications} publication marks were removed. The schema remains intact.`,
      };
    });
  }

  async function handleEvaluate() {
    if (preferencesDirty) {
      showUnsavedPreferences();
      return;
    }

    await runOperation("evaluate", async () => {
      const evaluation = await evaluateStories(secret, selectedTopicId);
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

      setStats(nextStats);
      setSelectedStoryIds([]);

      if (evaluation.status === "no-candidates") {
        return {
          tone: "success",
          title: "Evaluation is up to date",
          message: `${evaluation.candidatesScanned} candidates were scanned; ${evaluation.cachedStories} already had a current evaluation and did not consume AI.`,
        };
      }

      return {
        tone: "success",
        title: "Editorial evaluation completed",
        message: `${evaluation.evaluatedStories} stories were evaluated with Gemini, ${evaluation.cachedStories} were skipped by cache, and ${formatNumber(evaluation.usage.totalTokens)} tokens were consumed.`,
      };
    });
  }

  async function handleReview(decision: "approved" | "rejected") {
    if (selectedStoryIds.length === 0) {
      setNotice({
        tone: "error",
        title: "No stories selected",
        message: "Select at least one shortlisted story before saving a decision.",
      });
      return;
    }

    await runOperation("review", async () => {
      const review = await reviewStories(
        secret,
        selectedTopicId,
        selectedStoryIds,
        decision,
      );
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

      setStats(nextStats);
      setSelectedStoryIds([]);

      return {
        tone: "success",
        title:
          decision === "approved"
            ? "Stories approved"
            : "Stories rejected",
        message: `${review.reviewedStories} ${review.reviewedStories === 1 ? "story was" : "stories were"} ${decision}.`,
      };
    });
  }

  async function handlePromoteReviewCandidate(
    storyId: string,
    title: string,
  ) {
    if (!canAuthenticate || isBusy) return;
    if (
      !window.confirm(
        `Promote “${title}” to Selected? This records a human approval while preserving the AI decision as Review.`,
      )
    ) {
      return;
    }

    setActiveOperation("promote");
    setActiveStoryId(storyId);
    setNotice(undefined);

    try {
      await promoteReviewCandidate(secret, selectedTopicId, storyId);
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);
      setStats(nextStats);
      setNotice({
        tone: "success",
        title: "Story promoted to Selected",
        message:
          "Your human approval is recorded. The original AI decision remains Review for context.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Story could not be promoted",
        message: getErrorMessage(error),
      });
    } finally {
      setActiveOperation(undefined);
      setActiveStoryId(undefined);
    }
  }

  async function handlePrepareContent(storyId: string) {
    if (!canAuthenticate || isBusy) {
      return;
    }

    setActiveOperation("prepare");
    setActiveStoryId(storyId);
    setNotice(undefined);

    try {
      const content = await prepareStoryContent(secret, selectedTopicId, storyId);
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

      setStats(nextStats);
      setContentViewer(content);
      setNotice({
        tone: "success",
        title:
          content.outcome === "already-ready"
            ? "Content already ready"
            : "Article content prepared",
        message: content.text
          ? `${formatNumber(countTextWords(content.text))} words are available from ${content.source === "article" ? "the article page" : "the RSS feed"}. Run Evaluate with AI to refresh an unselected story’s recommendation.`
          : "No readable text is currently available.",
      });
    } catch (error) {
      setStats(
        await fetchDatabaseStats(secret, selectedTopicId).catch(() => stats),
      );
      setNotice({
        tone: "error",
        title: "Content could not be prepared",
        message: getErrorMessage(error),
      });
    } finally {
      setActiveOperation(undefined);
      setActiveStoryId(undefined);
    }
  }

  async function handleViewContent(storyId: string) {
    if (!canAuthenticate || isBusy) {
      return;
    }

    setActiveOperation("view");
    setActiveStoryId(storyId);
    setNotice(undefined);

    try {
      setContentViewer(
        await fetchStoryContent(secret, selectedTopicId, storyId),
      );
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Content could not be loaded",
        message: getErrorMessage(error),
      });
    } finally {
      setActiveOperation(undefined);
      setActiveStoryId(undefined);
    }
  }

  async function handlePublicationUpdate(
    storyId: string,
    platform: PublicationPlatform,
    status?: PublicationStatus,
  ) {
    if (!canAuthenticate || isBusy) {
      return;
    }

    setActiveOperation("publication");
    setActiveStoryId(storyId);
    setNotice(undefined);

    try {
      if (status) {
        await upsertStoryPublication(secret, selectedTopicId, storyId, {
          platform,
          status,
        });
      } else {
        await clearStoryPublication(secret, selectedTopicId, storyId, platform);
      }

      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

      setStats(nextStats);
      setNotice({
        tone: "success",
        title: `${formatPublicationPlatform(platform)} tracking updated`,
        message: status
          ? `${formatPublicationPlatform(platform)} is now marked ${formatPublicationStatus(status).toLowerCase()} for this story.`
          : `This story is no longer tracked on ${formatPublicationPlatform(platform)}.`,
      });
    } catch (error) {
      setStats(
        await fetchDatabaseStats(secret, selectedTopicId).catch(() => stats),
      );
      setNotice({
        tone: "error",
        title: "Publication tracking could not be updated",
        message: getErrorMessage(error),
      });
    } finally {
      setActiveOperation(undefined);
      setActiveStoryId(undefined);
    }
  }

  function toggleStorySelection(storyId: string) {
    setSelectedStoryIds((current) =>
      current.includes(storyId)
        ? current.filter((candidate) => candidate !== storyId)
        : [...current, storyId],
    );
  }

  function toggleAllShortlistStories(visibleShortlistIds: readonly string[]) {
    const allVisibleSelected =
      visibleShortlistIds.length > 0 &&
      visibleShortlistIds.every((storyId) => selectedStoryIds.includes(storyId));

    setSelectedStoryIds((current) => {
      if (allVisibleSelected) {
        return current.filter(
          (storyId) => !visibleShortlistIds.includes(storyId),
        );
      }

      return [...new Set([...current, ...visibleShortlistIds])];
    });
  }

  async function handleRegenerate() {
    if (preferencesDirty) {
      showUnsavedPreferences();
      return;
    }

    const hours = parseMaxAgeHours(maxAgeHours);

    if (!hours) {
      showInvalidHours();
      return;
    }

    let databaseWasCleared = false;

    await runOperation(
      "regenerate",
      async () => {
        await clearDatabase(secret, selectedTopicId);
        databaseWasCleared = true;

        const collection = await collectStories(secret, selectedTopicId, hours);
        const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

        setStats(nextStats);
        setSelectedStoryIds([]);
        setConfirmation("");
        return collectionNotice(collection, "Radar regenerated");
      },
      () =>
        databaseWasCleared
          ? "The data was cleared, but the new collection failed. Use ‘Collect and save’ to try again."
          : undefined,
    );
  }

  function showInvalidHours() {
    setNotice({
      tone: "error",
      title: "Invalid time window",
      message: "Hours must be a number greater than zero.",
    });
  }

  function showUnsavedPreferences() {
    setNotice({
      tone: "error",
      title: "Unsaved preferences",
      message: "Save the favored and unfavored terms before collecting.",
    });
  }

  async function handleSavePreferences() {
    await runOperation("preferences", async () => {
      const preferences = await saveKeywordPreferences(secret, selectedTopicId, {
        favoredTerms: parseTerms(favoredTerms),
        unfavoredTerms: parseTerms(unfavoredTerms),
      });

      setFavoredTerms(preferences.favoredTerms.join("\n"));
      setUnfavoredTerms(preferences.unfavoredTerms.join("\n"));
      setPreferencesUpdatedAt(preferences.updatedAt);
      setPreferencesDirty(false);

      return {
        tone: "success",
        title: "Preferences saved",
        message: "The new editorial weights will apply to the next collection.",
      };
    });
  }

  function handleTopicChange(topicId: string) {
    if (topicId === selectedTopicId) {
      return;
    }

    if (
      preferencesDirty &&
      !window.confirm(
        "You have unsaved preferences for this topic. Switch topics without saving them?",
      )
    ) {
      return;
    }

    selectedTopicIdRef.current = topicId;
    setSelectedTopicId(topicId);
    setStats(undefined);
    setSelectedStoryIds([]);
    setContentViewer(undefined);
    setCreativeStory(undefined);
    setConfirmation("");
    setFavoredTerms("");
    setUnfavoredTerms("");
    setPreferencesUpdatedAt(undefined);
    setPreferencesDirty(false);
    setNotice({
      tone: "success",
      title: "Topic changed",
      message: "Loading this topic's independent radar data and preferences.",
    });

    if (canAuthenticate) {
      void loadSelectedTopic(topicId);
    }
  }

  async function loadSelectedTopic(topicId: string) {
    try {
      const [nextStats, preferences] = await Promise.all([
        fetchDatabaseStats(secret, topicId),
        fetchKeywordPreferences(secret, topicId),
      ]);

      if (selectedTopicIdRef.current !== topicId) {
        return;
      }

      setStats(nextStats);
      setFavoredTerms(preferences.favoredTerms.join("\n"));
      setUnfavoredTerms(preferences.unfavoredTerms.join("\n"));
      setPreferencesUpdatedAt(preferences.updatedAt);
      setPreferencesDirty(false);
    } catch (error) {
      if (selectedTopicIdRef.current === topicId) {
        setNotice({
          tone: "error",
          title: "Topic data could not be loaded",
          message: getErrorMessage(error),
        });
      }
    }
  }

  async function runOperation(
    operation: Operation,
    task: () => Promise<Notice>,
    errorOverride?: () => string | undefined,
  ) {
    if (!canAuthenticate || isBusy) {
      return;
    }

    setActiveOperation(operation);
    setNotice(undefined);

    try {
      setNotice(await task());
    } catch (error) {
      setNotice({
        tone: "error",
        title: "The operation could not be completed",
        message: errorOverride?.() ?? getErrorMessage(error),
      });
    } finally {
      setActiveOperation(undefined);
    }
  }

  return (
    <main className={styles.appShell}>
      <aside
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
        aria-label="Primary navigation"
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>
            <span className={styles.logo} aria-hidden="true">
              <span />
            </span>
            <div>
              <p className={styles.eyebrow}>Control center</p>
              <h1>Press Craftor</h1>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeSidebarButton}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        <nav className={styles.sidebarNav}>
          <p className={styles.navLabel}>Workspace</p>
          <a href="#overview" onClick={() => setSidebarOpen(false)}>
            <span className={styles.navIcon} aria-hidden="true">⌂</span>
            Overview
          </a>
          <a href="#configuration" onClick={() => setSidebarOpen(false)}>
            <span className={styles.navIcon} aria-hidden="true">◈</span>
            Topics & sources
          </a>
          <a href="#editorial" onClick={() => setSidebarOpen(false)}>
            <span className={styles.navIcon} aria-hidden="true">✦</span>
            Editorial AI
          </a>
          <a href="#stories" onClick={() => setSidebarOpen(false)}>
            <span className={styles.navIcon} aria-hidden="true">▤</span>
            Story review
          </a>
          <a href="#optimization" onClick={() => setSidebarOpen(false)}>
            <span className={styles.navIcon} aria-hidden="true">◌</span>
            Optimization
          </a>
          <a href="#settings" onClick={() => setSidebarOpen(false)}>
            <span className={styles.navIcon} aria-hidden="true">⚙</span>
            System settings
          </a>
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.environment}>Neon · Development</span>
          <p>Editorial operations workspace</p>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className={styles.sidebarBackdrop}
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}

      <div className={styles.appMain}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
            >
              <span />
              <span />
              <span />
            </button>
            <div className={styles.currentTopic}>
              <span className={styles.topbarLabel}>Current topic</span>
              <div className={styles.topicSelectWrap}>
                <select
                  value={selectedTopicId}
                  onChange={(event) => handleTopicChange(event.target.value)}
                  disabled={isBusy}
                  aria-label="Current topic"
                >
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true">⌄</span>
              </div>
            </div>
          </div>

          <div className={styles.topbarTools}>
            <div className={styles.secretControl}>
              <label className={styles.secretField}>
                <span>Collector secret</span>
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder="Paste secret"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <span className={`${styles.topbarStatus} ${stats ? styles.online : styles.idle}`}>
                {stats ? "Connected" : "Not checked"}
              </span>
            </div>
          </div>
        </header>

        <div className={styles.page}>
          <div className={styles.shell}>

        <section id="overview" className={`${styles.hero} ${styles.anchorTarget}`}>
          <div>
            <p className={styles.kicker}>RSS intelligence pipeline</p>
            <h2>Operate your radar from one place.</h2>
            <p>
              Check system health, collect normalized stories, and review the
              strongest editorial candidates without touching the database schema.
            </p>
          </div>
          <div className={styles.heroMetric}>
            <span>Stories</span>
            <strong>{stats ? formatNumber(stats.stories) : "—"}</strong>
            <small>{stats ? "stored in Neon" : "load system status"}</small>
          </div>
        </section>

        <div id="configuration" className={styles.anchorTarget}>
          <TopicConfigurationPanel
            topics={topics}
            selectedTopicId={selectedTopicId}
            secret={secret}
            disabled={isBusy}
            onTopicsChange={setTopics}
            onTopicChange={handleTopicChange}
          />
        </div>

        <div id="editorial" className={styles.anchorTarget}>
          <EditorialProfilePanel
            topicId={selectedTopicId}
            secret={secret}
            disabled={isBusy}
            onProfileSaved={(profile, reactivatedStories) => {
              setMaxAgeHours(
                String(
                  Math.max(
                    profile.freshness.newsMaxAgeHours,
                    profile.freshness.researchMaxAgeHours,
                  ),
                ),
              );

              if (reactivatedStories > 0) {
                void fetchDatabaseStats(secret, profile.topicId)
                  .then((nextStats) => {
                    if (selectedTopicIdRef.current === profile.topicId) {
                      setStats(nextStats);
                    }
                  })
                  .catch(() => undefined);
              }
            }}
          />
        </div>

        <div id="settings" className={`${styles.mainGrid} ${styles.anchorTarget}`}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionNumber}>01</p>
                <h2>Collection</h2>
              </div>
            </div>

            <label className={styles.field}>
              <span>Story window</span>
              <div className={styles.inputSuffix}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxAgeHours}
                  onChange={(event) => setMaxAgeHours(event.target.value)}
                />
                <span>hours</span>
              </div>
              <small>
                RSS collection window. Saving an editorial profile updates this
                to its longest configured news or research window.
              </small>
            </label>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleLoadStatus}
                disabled={!canAuthenticate || isBusy}
              >
                {activeOperation === "status" ? "Checking…" : "Check status"}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleCollect}
                disabled={!canAuthenticate || isBusy}
              >
                {activeOperation === "collect"
                  ? "Collecting…"
                  : "Collect and save"}
              </button>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionNumber}>02</p>
                <h2>Database status</h2>
              </div>
            </div>

            <div className={styles.statsGrid}>
              <Metric label="Stories" value={stats?.stories} />
              <Metric label="Sources" value={stats?.storySources} />
              <Metric label="Collection runs" value={stats?.collectionRuns} />
              <Metric label="Source checks" value={stats?.collectionSourceRuns} />
            </div>

            <div className={styles.statusList}>
              <p>Editorial workflow</p>
              {stats && Object.keys(stats.storiesByStatus).length > 0 ? (
                Object.entries(stats.storiesByStatus)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([status, value]) => (
                    <div key={status}>
                      <span>{STATUS_LABELS[status] ?? status}</span>
                      <strong>{formatNumber(value)}</strong>
                    </div>
                  ))
              ) : (
                <div className={styles.emptyState}>No data has been loaded yet.</div>
              )}
            </div>

            {stats?.latestCollectionRun ? (
              <div className={styles.lastRun}>
                <span>Latest run</span>
                <strong>{formatDate(stats.latestCollectionRun.finishedAt)}</strong>
                <small>
                  {stats.latestCollectionRun.includedItems} stories · {stats.latestCollectionRun.failedSources} failed sources
                </small>
              </div>
            ) : null}
          </section>
        </div>

        <section className={`${styles.panel} ${styles.preferencesPanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.sectionNumber}>03</p>
              <h2>Editorial preferences</h2>
            </div>
            <span className={preferencesDirty ? styles.unsavedBadge : styles.savedBadge}>
              {preferencesDirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>

          <div className={styles.preferencesIntro}>
            <p>
              Add one word or phrase per line. Title matches have double weight;
              favored terms increase relevance and unfavored terms reduce it.
            </p>
            <span>+15 / −15 base</span>
          </div>

          <div className={styles.preferencesGrid}>
            <label className={styles.termField}>
              <span className={styles.favoredLabel}>Favored</span>
              <textarea
                value={favoredTerms}
                onChange={(event) => {
                  setFavoredTerms(event.target.value);
                  setPreferencesDirty(true);
                }}
                placeholder={"psychology\nwellbeing\nresearch"}
                rows={7}
                spellCheck={false}
              />
              <small>Priority topics and locations.</small>
            </label>

            <label className={styles.termField}>
              <span className={styles.unfavoredLabel}>Unfavored</span>
              <textarea
                value={unfavoredTerms}
                onChange={(event) => {
                  setUnfavoredTerms(event.target.value);
                  setPreferencesDirty(true);
                }}
                placeholder={"india\ncoupon\nwebinar"}
                rows={7}
                spellCheck={false}
              />
              <small>They lower the score without automatically rejecting a story.</small>
            </label>
          </div>

          <div className={styles.preferencesFooter}>
            <small>
              {preferencesUpdatedAt
                ? `Saved in Neon · ${formatUtcDate(preferencesUpdatedAt)}`
                : "They remain available when story data is cleared."}
            </small>
            <button
              type="button"
              className={styles.savePreferencesButton}
              onClick={handleSavePreferences}
              disabled={!canAuthenticate || !preferencesDirty || isBusy}
            >
              {activeOperation === "preferences"
                ? "Saving…"
                : "Save preferences"}
            </button>
          </div>
        </section>

        <div id="optimization" className={styles.anchorTarget}>
          <OptimizationPanel run={stats?.latestCollectionRun} />
        </div>

        <div id="stories" className={styles.anchorTarget}>
          <EditorialEvaluationPanel
            key={selectedTopicId}
            editorial={stats?.editorial}
            canEvaluate={canAuthenticate && !isBusy}
            isEvaluating={activeOperation === "evaluate"}
            onEvaluate={handleEvaluate}
            selectedStoryIds={selectedStoryIds}
            canReview={canAuthenticate && !isBusy}
            isReviewing={activeOperation === "review"}
            onToggleStory={toggleStorySelection}
            onToggleAll={toggleAllShortlistStories}
            onReview={handleReview}
            canPrepare={canAuthenticate && !isBusy}
            preparingStoryId={
              activeOperation === "prepare" ? activeStoryId : undefined
            }
            viewingStoryId={
              activeOperation === "view" ? activeStoryId : undefined
            }
            onPrepareContent={handlePrepareContent}
            onViewContent={handleViewContent}
            canPromote={canAuthenticate && !isBusy}
            promotingStoryId={
              activeOperation === "promote" ? activeStoryId : undefined
            }
            onPromote={handlePromoteReviewCandidate}
            canTrackPublications={canAuthenticate && !isBusy}
            updatingPublicationStoryId={
              activeOperation === "publication" ? activeStoryId : undefined
            }
            onUpdatePublication={handlePublicationUpdate}
            onOpenCreativeStory={(storyId, title) => {
              setContentViewer(undefined);
              setCreativeStory({ storyId, title });
            }}
          />
        </div>

        {contentViewer ? (
          <StoryContentViewer
            content={contentViewer}
            onClose={() => setContentViewer(undefined)}
          />
        ) : null}

        {creativeStory ? (
          <CreativeDraftWorkspace
            topicId={selectedTopicId}
            storyId={creativeStory.storyId}
            storyTitle={creativeStory.title}
            secret={secret}
            onClose={() => setCreativeStory(undefined)}
          />
        ) : null}

        {notice ? (
          <div
            className={`${styles.notice} ${
              notice.tone === "success" ? styles.noticeSuccess : styles.noticeError
            }`}
            role="status"
          >
            <span aria-hidden="true">{notice.tone === "success" ? "✓" : "!"}</span>
            <div>
              <strong>{notice.title}</strong>
              <p>{notice.message}</p>
            </div>
          </div>
        ) : null}

        <section className={`${styles.panel} ${styles.dangerPanel}`}>
          <div className={styles.dangerCopy}>
            <p className={styles.sectionNumber}>06 · Danger zone</p>
            <h2>Clear or regenerate data</h2>
            <p>
              This removes stories, sources, publication tracking, and execution
              history. Tables, indexes, migrations, and editorial preferences
              remain intact.
            </p>
          </div>

          <div className={styles.dangerActions}>
            <label className={styles.field}>
              <span>Type DELETE to confirm</span>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </label>
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleClear}
                disabled={!canDelete}
              >
                {activeOperation === "clear" ? "Clearing…" : "Clear data"}
              </button>
              <button
                type="button"
                className={styles.regenerateButton}
                onClick={handleRegenerate}
                disabled={!canDelete}
              >
                {activeOperation === "regenerate"
                  ? "Regenerating…"
                  : "Clear and collect"}
              </button>
            </div>
          </div>
        </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value === undefined ? "—" : formatNumber(value)}</strong>
    </div>
  );
}

function OptimizationPanel({
  run,
}: {
  run?: NonNullable<DatabaseStats["latestCollectionRun"]>;
}) {
  const radarReduction = run
    ? percentage(run.filteredOutItems + run.duplicatesRemoved, run.fetchedItems)
    : 0;
  const protectedFromAi = run
    ? run.needsEnrichmentItems + run.reviewItems + run.rejectedItems
    : 0;
  const aiProtection = run
    ? percentage(protectedFromAi, run.includedItems)
    : 0;

  return (
    <section className={`${styles.panel} ${styles.optimizationPanel}`}>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.sectionNumber}>04</p>
          <h2>Deduplication and optimization</h2>
        </div>
        <span className={styles.runBadge}>Latest run</span>
      </div>

      {run ? (
        <>
          <div className={styles.optimizationMetrics}>
            <OptimizationMetric
              label="RSS entries"
              value={run.fetchedItems}
              detail="received"
            />
            <OptimizationMetric
              label="Outside window"
              value={run.filteredOutItems}
              detail="ignored by age"
            />
            <OptimizationMetric
              label="Duplicates"
              value={run.duplicatesRemoved}
              detail={`${run.exactDuplicatesRemoved} exact · ${run.similarDuplicatesRemoved} similar`}
            />
            <OptimizationMetric
              label="Final candidates"
              value={run.includedItems}
              detail="scored without AI"
            />
          </div>

          <div className={styles.efficiencyGrid}>
            <EfficiencyBar
              label="Radar reduction"
              value={radarReduction}
              detail={`${formatNumber(run.filteredOutItems + run.duplicatesRemoved)} entries never reached the editorial database`}
            />
            <EfficiencyBar
              label="AI call protection"
              value={aiProtection}
              detail={`${formatNumber(protectedFromAi)} candidates stopped; ${formatNumber(run.readyItems)} ready for AI`}
            />
          </div>

          <div className={styles.relevanceStrip}>
            <span><strong>{run.readyItems}</strong> ready</span>
            <span><strong>{run.needsEnrichmentItems}</strong> need enrichment</span>
            <span><strong>{run.reviewItems}</strong> need review</span>
            <span><strong>{run.rejectedItems}</strong> noise</span>
          </div>
        </>
      ) : (
        <div className={styles.optimizationEmpty}>
          Check status to load metrics from the latest collection.
        </div>
      )}
    </section>
  );
}

function EditorialEvaluationPanel({
  editorial,
  canEvaluate,
  isEvaluating,
  onEvaluate,
  selectedStoryIds,
  canReview,
  isReviewing,
  onToggleStory,
  onToggleAll,
  onReview,
  canPrepare,
  preparingStoryId,
  viewingStoryId,
  onPrepareContent,
  onViewContent,
  canPromote,
  promotingStoryId,
  onPromote,
  canTrackPublications,
  updatingPublicationStoryId,
  onUpdatePublication,
  onOpenCreativeStory,
}: {
  editorial?: EditorialDashboardStats;
  canEvaluate: boolean;
  isEvaluating: boolean;
  onEvaluate: () => void;
  selectedStoryIds: string[];
  canReview: boolean;
  isReviewing: boolean;
  onToggleStory: (storyId: string) => void;
  onToggleAll: (storyIds: readonly string[]) => void;
  onReview: (decision: "approved" | "rejected") => void;
  canPrepare: boolean;
  preparingStoryId?: string;
  viewingStoryId?: string;
  onPrepareContent: (storyId: string) => void;
  onViewContent: (storyId: string) => void;
  canPromote: boolean;
  promotingStoryId?: string;
  onPromote: (storyId: string, title: string) => void;
  canTrackPublications: boolean;
  updatingPublicationStoryId?: string;
  onUpdatePublication: (
    storyId: string,
    platform: PublicationPlatform,
    status?: PublicationStatus,
  ) => void;
  onOpenCreativeStory: (storyId: string, title: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"collected" | "selected">(
    "collected",
  );
  const [collectedTableState, setCollectedTableState] =
    useState<StoryTableViewState>(() => createStoryTableViewState("collected"));
  const [selectedTableState, setSelectedTableState] =
    useState<StoryTableViewState>(() => createStoryTableViewState("selected"));
  const shortlist = editorial?.shortlist ?? [];
  const collectedStories = editorial?.collectedStories ?? [];
  const selectedStories = editorial?.selectedStories ?? [];
  const localCandidateFloor =
    editorial?.configuration.effectiveCandidatePolicy?.localCandidateMinScore ??
    editorial?.configuration.minLocalScore ??
    25;
  const filteredCollectedStories = filterTableStories(
    collectedStories,
    collectedTableState,
    localCandidateFloor,
  );
  const filteredSelectedStories = filterTableStories(
    selectedStories,
    selectedTableState,
    localCandidateFloor,
  );
  const visibleShortlistIds = filteredCollectedStories
    .filter(
      (story) =>
        story.reviewable === true && story.evaluationDecision === "shortlist",
    )
    .map((story) => story.storyId);
  const allVisibleShortlistSelected =
    visibleShortlistIds.length > 0 &&
    visibleShortlistIds.every((storyId) => selectedStoryIds.includes(storyId));
  const hiddenSelectedCount = selectedStoryIds.filter(
    (storyId) => !visibleShortlistIds.includes(storyId),
  ).length;
  const canSubmitReview =
    canReview && selectedStoryIds.length > 0 && !isReviewing;

  return (
    <section className={`${styles.panel} ${styles.editorialPanel}`}>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.sectionNumber}>05</p>
          <h2>AI editorial evaluation</h2>
        </div>
        <span className={styles.aiBadge}>
          {editorial?.configuration.model ?? "Gemini"}
        </span>
      </div>

      <div className={styles.editorialIntro}>
        <div>
          <p>
            Gemini ranks eligible candidates against this topic’s editorial
            profile, with a maximum of {editorial?.configuration.maxContentCharacters ?? 500} characters per story.
          </p>
          <small>
            AI floor {editorial?.configuration.effectiveCandidatePolicy?.localCandidateMinScore ?? editorial?.configuration.minLocalScore ?? 25} · news {editorial?.configuration.effectiveCandidatePolicy?.freshness.newsMaxAgeHours ?? editorial?.configuration.maxAgeHours ?? 72} h · research {editorial?.configuration.effectiveCandidatePolicy?.freshness.researchMaxAgeHours ?? editorial?.configuration.maxAgeHours ?? 72} h · daily reset at 00:00 UTC
          </small>
        </div>
        <button
          type="button"
          className={styles.evaluateButton}
          onClick={onEvaluate}
          disabled={!canEvaluate}
        >
          {isEvaluating ? "Evaluating…" : "Evaluate with AI"}
        </button>
      </div>

      {editorial ? (
        <>
          <div className={styles.aiMetrics}>
            <OptimizationMetric
              label="Runs today"
              value={editorial.today.runs}
              detail={`${editorial.today.remainingRuns} of ${editorial.today.maxRuns} available`}
            />
            <OptimizationMetric
              label="Stories today"
              value={editorial.today.stories}
              detail={`${editorial.today.remainingStories} of ${editorial.today.maxStories} available`}
            />
            <OptimizationMetric
              label="Tokens today"
              value={editorial.today.totalTokens}
              detail={`${formatNumber(editorial.today.thoughtsTokens)} thinking tokens`}
            />
            <OptimizationMetric
              label="Pending shortlist"
              value={editorial.shortlist.length}
              detail={`${formatNumber(editorial.totalEvaluations)} stored evaluations`}
            />
          </div>

          {editorial.latestRun ? (
            <div className={styles.aiRunSummary}>
              <span>
                Latest run: <strong>{editorial.latestRun.status}</strong>
              </span>
              <span>
                {editorial.latestRun.evaluatedStories} evaluated · {formatNumber(editorial.latestRun.totalTokens)} tokens
              </span>
              <span>
                {formatDate(editorial.latestRun.finishedAt ?? editorial.latestRun.startedAt)}
              </span>
            </div>
          ) : null}

          <div className={styles.storyWorkspaceHeader}>
            <div>
              <h3>Editorial workspace</h3>
              <p>
                Combine filters, then rank top stories by a first and second
                criterion.
              </p>
            </div>
            <div className={styles.storyTabs} role="tablist" aria-label="Story views">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "collected"}
                className={activeTab === "collected" ? styles.activeStoryTab : ""}
                onClick={() => setActiveTab("collected")}
              >
                Collected stories
                <span>{editorial.collectedStories.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "selected"}
                className={activeTab === "selected" ? styles.activeStoryTab : ""}
                onClick={() => setActiveTab("selected")}
              >
                Selected stories
                <span>{editorial.selectedStories.length}</span>
              </button>
            </div>
          </div>

          {activeTab === "collected" ? (
            <div role="tabpanel">
              <div className={styles.tableViewHeading}>
                <div>
                  <h3>Collected stories</h3>
                  <p>
                    All persisted stories. AI shortlist rows can be approved or rejected.
                  </p>
                </div>
                <span>
                  {filteredCollectedStories.length} of {collectedStories.length} shown
                </span>
              </div>

              <StoryListControls
                state={collectedTableState}
                totalCount={collectedStories.length}
                shownCount={filteredCollectedStories.length}
                localCandidateFloor={localCandidateFloor}
                onPrimaryRankChange={(primaryRank) =>
                  setCollectedTableState((current) =>
                    ({ ...current, primaryRank }),
                  )
                }
                onSecondaryRankChange={(secondaryRank) =>
                  setCollectedTableState((current) =>
                    ({ ...current, secondaryRank }),
                  )
                }
                onPublishedWithinDaysChange={(publishedWithinDays) =>
                  setCollectedTableState((current) => ({
                    ...current,
                    publishedWithinDays,
                  }))
                }
                onHideBelowTopicFloorChange={(hideBelowTopicFloor) =>
                  setCollectedTableState((current) => ({
                    ...current,
                    hideBelowTopicFloor,
                  }))
                }
                onMinimumEditorialPriorityChange={(minimumEditorialPriority) =>
                  setCollectedTableState((current) => ({
                    ...current,
                    minimumEditorialPriority,
                  }))
                }
                onResetFilters={() =>
                  setCollectedTableState((current) => resetStoryTableFilters(current))
                }
              />

              {shortlist.length > 0 ? (
              <div className={styles.reviewToolbar}>
                <label className={styles.selectAllControl}>
                  <input
                    type="checkbox"
                    checked={allVisibleShortlistSelected}
                    onChange={() => onToggleAll(visibleShortlistIds)}
                    disabled={visibleShortlistIds.length === 0}
                  />
                  <span>
                    {allVisibleShortlistSelected
                      ? "Clear visible selection"
                      : "Select visible shortlist"}
                  </span>
                </label>
                <span className={styles.selectionCount}>
                  {selectedStoryIds.length} selected
                  {hiddenSelectedCount > 0
                    ? ` · ${hiddenSelectedCount} hidden by filters`
                    : ""}
                </span>
                <div className={styles.reviewActions}>
                  <button
                    type="button"
                    className={styles.rejectStoriesButton}
                    onClick={() => onReview("rejected")}
                    disabled={!canSubmitReview}
                  >
                    {isReviewing ? "Saving…" : "Reject"}
                  </button>
                  <button
                    type="button"
                    className={styles.approveStoriesButton}
                    onClick={() => onReview("approved")}
                    disabled={!canSubmitReview}
                  >
                    {isReviewing ? "Saving…" : "Approve"}
                  </button>
                </div>
              </div>
              ) : null}

              <SortableStoriesTable
                stories={filteredCollectedStories}
                totalStoryCount={collectedStories.length}
                mode="collected"
                primaryRank={collectedTableState.primaryRank}
                secondaryRank={collectedTableState.secondaryRank}
                selectedStoryIds={selectedStoryIds}
                onToggleStory={onToggleStory}
                canPrepare={canPrepare}
                preparingStoryId={preparingStoryId}
                viewingStoryId={viewingStoryId}
                onPrepareContent={onPrepareContent}
                onViewContent={onViewContent}
                canPromote={canPromote}
                promotingStoryId={promotingStoryId}
                onPromote={onPromote}
              />
            </div>
          ) : (
            <div role="tabpanel">
              <div className={styles.tableViewHeading}>
                <div>
                  <h3>Selected stories</h3>
                  <p>Human-approved stories ranked and ready for the next stage.</p>
                </div>
                <span>
                  {filteredSelectedStories.length} of {selectedStories.length} shown
                </span>
              </div>

              <StoryListControls
                state={selectedTableState}
                totalCount={selectedStories.length}
                shownCount={filteredSelectedStories.length}
                localCandidateFloor={localCandidateFloor}
                onPrimaryRankChange={(primaryRank) =>
                  setSelectedTableState((current) =>
                    ({ ...current, primaryRank }),
                  )
                }
                onSecondaryRankChange={(secondaryRank) =>
                  setSelectedTableState((current) =>
                    ({ ...current, secondaryRank }),
                  )
                }
                onPublishedWithinDaysChange={(publishedWithinDays) =>
                  setSelectedTableState((current) => ({
                    ...current,
                    publishedWithinDays,
                  }))
                }
                onHideBelowTopicFloorChange={(hideBelowTopicFloor) =>
                  setSelectedTableState((current) => ({
                    ...current,
                    hideBelowTopicFloor,
                  }))
                }
                onMinimumEditorialPriorityChange={(minimumEditorialPriority) =>
                  setSelectedTableState((current) => ({
                    ...current,
                    minimumEditorialPriority,
                  }))
                }
                showPublicationFilters
                onPublicationFilterChange={(publicationFilter) =>
                  setSelectedTableState((current) => ({
                    ...current,
                    publicationFilter,
                  }))
                }
                onPublicationPlatformChange={(publicationPlatform) =>
                  setSelectedTableState((current) => ({
                    ...current,
                    publicationPlatform,
                  }))
                }
                onResetFilters={() =>
                  setSelectedTableState((current) => resetStoryTableFilters(current))
                }
              />

              <SortableStoriesTable
                stories={filteredSelectedStories}
                totalStoryCount={selectedStories.length}
                mode="selected"
                primaryRank={selectedTableState.primaryRank}
                secondaryRank={selectedTableState.secondaryRank}
                canPrepare={canPrepare}
                preparingStoryId={preparingStoryId}
                viewingStoryId={viewingStoryId}
                onPrepareContent={onPrepareContent}
                onViewContent={onViewContent}
                canTrackPublications={canTrackPublications}
                updatingPublicationStoryId={updatingPublicationStoryId}
                onUpdatePublication={onUpdatePublication}
                onOpenCreativeStory={onOpenCreativeStory}
              />
            </div>
          )}
        </>
      ) : (
        <div className={styles.optimizationEmpty}>
          Check status to load the AI budget and editorial evaluations.
        </div>
      )}
    </section>
  );
}

type StoryTableMode = "collected" | "selected";
type StoryRankKey = "publishedAt" | "editorialPriority" | "localScore";
type StoryTableViewState = {
  primaryRank: StoryRankKey;
  secondaryRank: StoryRankKey;
  publishedWithinDays?: number;
  hideBelowTopicFloor: boolean;
  minimumEditorialPriority?: number;
  publicationFilter: PublicationFilter;
  publicationPlatform: PublicationPlatform;
};

function createStoryTableViewState(
  mode: StoryTableMode,
): StoryTableViewState {
  return {
    primaryRank: mode === "selected" ? "editorialPriority" : "publishedAt",
    secondaryRank: mode === "selected" ? "publishedAt" : "editorialPriority",
    hideBelowTopicFloor: false,
    publicationFilter: "all",
    publicationPlatform: "instagram",
  };
}

function resetStoryTableFilters(
  current: StoryTableViewState,
): StoryTableViewState {
  return {
    ...current,
    publishedWithinDays: undefined,
    hideBelowTopicFloor: false,
    minimumEditorialPriority: undefined,
    publicationFilter: "all",
    publicationPlatform: "instagram",
  };
}

function filterTableStories(
  stories: readonly EditorialTableStory[],
  filters: StoryTableViewState,
  localCandidateFloor: number,
): EditorialTableStory[] {
  const publishedAfter =
    filters.publishedWithinDays === undefined
      ? undefined
      : Date.now() - filters.publishedWithinDays * 24 * 60 * 60 * 1000;

  return stories.filter((story) => {
    if (publishedAfter !== undefined) {
      const dateValue = story.publishedAt ?? story.lastSeenAt;
      const timestamp = dateValue ? new Date(dateValue).getTime() : NaN;

      if (!Number.isFinite(timestamp) || timestamp < publishedAfter) {
        return false;
      }
    }

    if (filters.hideBelowTopicFloor && story.localScore < localCandidateFloor) {
      return false;
    }

    const editorialPriority = story.editorialPriority ?? story.editorialScore;

    if (
      filters.minimumEditorialPriority !== undefined &&
      (editorialPriority === undefined ||
        editorialPriority < filters.minimumEditorialPriority)
    ) {
      return false;
    }

    return storyMatchesPublicationFilter(story, filters);
  });
}

function storyMatchesPublicationFilter(
  story: EditorialTableStory,
  filters: StoryTableViewState,
): boolean {
  if (filters.publicationFilter === "all") {
    return true;
  }

  const publications = story.publications ?? [];

  if (filters.publicationFilter === "not-published-anywhere") {
    return !publications.some(
      (publication) => publication.status === "published",
    );
  }

  const expectedStatus =
    filters.publicationFilter === "scheduled-on-platform"
      ? "scheduled"
      : "published";

  return publications.some(
    (publication) =>
      publication.platform === filters.publicationPlatform &&
      publication.status === expectedStatus,
  );
}

function StoryListControls({
  state,
  totalCount,
  shownCount,
  localCandidateFloor,
  onPrimaryRankChange,
  onSecondaryRankChange,
  onPublishedWithinDaysChange,
  onHideBelowTopicFloorChange,
  onMinimumEditorialPriorityChange,
  showPublicationFilters = false,
  onPublicationFilterChange,
  onPublicationPlatformChange,
  onResetFilters,
}: {
  state: StoryTableViewState;
  totalCount: number;
  shownCount: number;
  localCandidateFloor: number;
  onPrimaryRankChange: (rank: StoryRankKey) => void;
  onSecondaryRankChange: (rank: StoryRankKey) => void;
  onPublishedWithinDaysChange: (days: number | undefined) => void;
  onHideBelowTopicFloorChange: (enabled: boolean) => void;
  onMinimumEditorialPriorityChange: (minimum: number | undefined) => void;
  showPublicationFilters?: boolean;
  onPublicationFilterChange?: (filter: PublicationFilter) => void;
  onPublicationPlatformChange?: (platform: PublicationPlatform) => void;
  onResetFilters: () => void;
}) {
  const hasActiveFilters =
    state.publishedWithinDays !== undefined ||
    state.hideBelowTopicFloor ||
    state.minimumEditorialPriority !== undefined ||
    state.publicationFilter !== "all";

  return (
    <div className={styles.storyFilterBar} aria-label="News list controls">
      <div className={styles.storyFilterFields}>
        <label className={styles.storyFilterField}>
          <span>Top results: first</span>
          <select
            value={state.primaryRank}
            onChange={(event) =>
              onPrimaryRankChange(event.currentTarget.value as StoryRankKey)
            }
          >
            <option value="publishedAt">Newest</option>
            <option value="editorialPriority">Highest AI priority</option>
            <option value="localScore">Highest local score</option>
          </select>
        </label>

        <label className={styles.storyFilterField}>
          <span>Then</span>
          <select
            value={state.secondaryRank}
            onChange={(event) =>
              onSecondaryRankChange(event.currentTarget.value as StoryRankKey)
            }
          >
            <option value="publishedAt">Newest</option>
            <option value="editorialPriority">Highest AI priority</option>
            <option value="localScore">Highest local score</option>
          </select>
        </label>

        <label className={styles.storyFilterField}>
          <span>Story date</span>
          <select
            value={state.publishedWithinDays ?? ""}
            onChange={(event) =>
              onPublishedWithinDaysChange(
                parsePublishedWithinDays(event.currentTarget.value),
              )
            }
          >
            <option value="">Any time</option>
            <option value="1">24 hours</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </label>

        <label className={styles.storyFilterField}>
          <span>AI priority at least</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            inputMode="numeric"
            value={state.minimumEditorialPriority ?? ""}
            onChange={(event) =>
              onMinimumEditorialPriorityChange(
                parseStoryScoreThreshold(event.currentTarget.value),
              )
            }
            placeholder="Any"
            aria-label="Minimum AI editorial priority"
          />
        </label>

        {showPublicationFilters ? (
          <>
            <label className={styles.storyFilterField}>
              <span>Publication state</span>
              <select
                value={state.publicationFilter}
                onChange={(event) =>
                  onPublicationFilterChange?.(
                    event.currentTarget.value as PublicationFilter,
                  )
                }
              >
                <option value="all">All</option>
                <option value="not-published-anywhere">
                  Not published anywhere
                </option>
                <option value="scheduled-on-platform">Scheduled</option>
                <option value="published-on-platform">Published</option>
              </select>
            </label>

            <label className={styles.storyFilterField}>
              <span>Publication platform</span>
              <select
                value={state.publicationPlatform}
                onChange={(event) =>
                  onPublicationPlatformChange?.(
                    event.currentTarget.value as PublicationPlatform,
                  )
                }
              >
                {PUBLICATION_PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {formatPublicationPlatform(platform)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      <label className={styles.topicFloorControl}>
        <input
          type="checkbox"
          checked={state.hideBelowTopicFloor}
          onChange={(event) =>
            onHideBelowTopicFloorChange(event.currentTarget.checked)
          }
        />
        <span>Hide below local floor ({localCandidateFloor})</span>
      </label>

      {hasActiveFilters ? (
        <button
          type="button"
          className={styles.clearStoryFiltersButton}
          onClick={onResetFilters}
        >
          Clear filters
        </button>
      ) : null}

      <span className={styles.storyFilterCount} aria-live="polite">
        {shownCount} of {totalCount} shown
      </span>
      <small className={styles.storyFilterHint}>
        Active filters combine. Results use First, then Then. An AI minimum
        hides stories that have not been evaluated yet.
        {showPublicationFilters
          ? " Publication status is tracked per platform."
          : ""}
      </small>
    </div>
  );
}

function SortableStoriesTable({
  stories,
  totalStoryCount,
  mode,
  primaryRank,
  secondaryRank,
  selectedStoryIds = [],
  onToggleStory,
  canPrepare = false,
  preparingStoryId,
  viewingStoryId,
  onPrepareContent,
  onViewContent,
  canPromote = false,
  promotingStoryId,
  onPromote,
  canTrackPublications = false,
  updatingPublicationStoryId,
  onUpdatePublication,
  onOpenCreativeStory,
}: {
  stories: readonly EditorialTableStory[];
  totalStoryCount: number;
  mode: StoryTableMode;
  primaryRank: StoryRankKey;
  secondaryRank: StoryRankKey;
  selectedStoryIds?: string[];
  onToggleStory?: (storyId: string) => void;
  canPrepare?: boolean;
  preparingStoryId?: string;
  viewingStoryId?: string;
  onPrepareContent?: (storyId: string) => void;
  onViewContent?: (storyId: string) => void;
  canPromote?: boolean;
  promotingStoryId?: string;
  onPromote?: (storyId: string, title: string) => void;
  canTrackPublications?: boolean;
  updatingPublicationStoryId?: string;
  onUpdatePublication?: (
    storyId: string,
    platform: PublicationPlatform,
    status?: PublicationStatus,
  ) => void;
  onOpenCreativeStory?: (storyId: string, title: string) => void;
}) {
  const sortedStories = [...stories].sort((left, right) =>
    rankTableStories(left, right, primaryRank, secondaryRank),
  );

  if (stories.length === 0) {
    return (
      <div className={styles.optimizationEmpty}>
        {totalStoryCount > 0
          ? "No stories match the current filters."
          : mode === "selected"
            ? "Approved stories will appear here."
            : "No collected stories are currently stored."}
      </div>
    );
  }

  return (
    <div className={styles.storyTableShell}>
      <table className={styles.storyTable}>
        <thead>
          <tr>
            {mode === "collected" ? (
              <th className={styles.selectionColumn} aria-label="Select" />
            ) : null}
            <TableHeader label="Story date" />
            <TableHeader label="Story" />
            <TableHeader label="Source" />
            <TableHeader label="Content" />
            <TableHeader label="Local" numeric />
            <TableHeader label="Editorial priority" numeric />
            <TableHeader label="AI decision" />
            <TableHeader label="Workflow" />
            {mode === "selected" ? <TableHeader label="Publication" /> : null}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sortedStories.map((story) => {
            const selected = selectedStoryIds.includes(story.storyId);
            const effectiveDate = story.publishedAt ?? story.lastSeenAt;

            return (
              <tr
                key={story.storyId}
                className={selected ? styles.selectedTableRow : undefined}
              >
                {mode === "collected" ? (
                  <td className={styles.selectionColumn}>
                    {story.reviewable ? (
                      <input
                        type="checkbox"
                        className={styles.storyCheckbox}
                        checked={selected}
                        onChange={() => onToggleStory?.(story.storyId)}
                        aria-label={`Select ${story.title}`}
                      />
                    ) : (
                      <span className={styles.unavailableSelection}>—</span>
                    )}
                  </td>
                ) : null}
                <td className={styles.dateCell}>
                  {effectiveDate ? (
                    <time dateTime={effectiveDate}>{formatTableDate(effectiveDate)}</time>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={styles.storyTitleCell}>
                  <a href={story.url} target="_blank" rel="noreferrer">
                    {story.title}
                  </a>
                  {story.reason ? <small>{story.reason}</small> : null}
                  {story.riskFlags.length > 0 ? (
                    <div className={styles.tableRiskFlags}>
                      {story.riskFlags.map((risk) => (
                        <span key={risk}>{risk}</span>
                      ))}
                    </div>
                  ) : null}
                  <a
                    className={styles.storySourceLink}
                    href={story.url}
                    target="_blank"
                    rel="noreferrer"
                    title={story.url}
                  >
                    <span>{story.url}</span>
                    <strong aria-hidden="true">↗</strong>
                  </a>
                </td>
                <td className={styles.sourceCell}>{story.sourceName}</td>
                <td>
                  <div className={styles.contentStatusCell}>
                    <StatusBadge tone="neutral">
                      {formatContentStatus(story.contentStatus)}
                    </StatusBadge>
                    {story.enrichmentStatus ? (
                      <small
                        className={
                          story.enrichmentStatus === "completed"
                            ? styles.enrichmentComplete
                            : story.enrichmentStatus === "blocked" ||
                                story.enrichmentStatus === "failed"
                              ? styles.enrichmentProblem
                              : undefined
                        }
                        title={story.enrichmentError}
                      >
                        {formatEnrichmentStatus(story.enrichmentStatus)}
                        {story.enrichmentStatus === "completed" &&
                        story.enrichmentMethod === "reader"
                          ? " via Reader"
                          : ""}
                        {story.enrichmentWordCount !== undefined
                          ? ` · ${formatNumber(story.enrichmentWordCount)} words`
                          : ""}
                      </small>
                    ) : mode === "selected" ? (
                      <small>RSS only</small>
                    ) : null}
                  </div>
                </td>
                <ScoreCell value={story.localScore} />
                <ScoreCell
                  value={story.editorialPriority ?? story.editorialScore}
                  accent
                />
                <td>
                  <StatusBadge tone={evaluationDecisionTone(story.evaluationDecision)}>
                    {formatEvaluationDecision(story.evaluationDecision)}
                  </StatusBadge>
                </td>
                <td>
                  <StatusBadge tone={mode === "selected" ? "positive" : "neutral"}>
                    {mode === "selected"
                      ? "Selected"
                      : formatProcessingStatus(story.processingStatus)}
                  </StatusBadge>
                </td>
                {mode === "selected" ? (
                  <td className={styles.publicationStatusCell}>
                    <PublicationStatusChips
                      publications={story.publications}
                    />
                  </td>
                ) : null}
                <td className={styles.contentActionsCell}>
                  {mode === "selected" ? (
                    <>
                      <PublicationQuickControl
                        storyId={story.storyId}
                        publications={story.publications}
                        disabled={!canTrackPublications}
                        isUpdating={updatingPublicationStoryId === story.storyId}
                        onUpdate={onUpdatePublication}
                      />
                      <button
                        type="button"
                        className={styles.creativeStudioButton}
                        disabled={!canPrepare}
                        onClick={() =>
                          onOpenCreativeStory?.(story.storyId, story.title)
                        }
                      >
                        Creative studio
                      </button>
                      {story.contentStatus !== "missing" ? (
                        <button
                          type="button"
                          className={styles.viewContentButton}
                          disabled={!canPrepare}
                          onClick={() => onViewContent?.(story.storyId)}
                        >
                          {viewingStoryId === story.storyId
                            ? "Loading…"
                            : "View content"}
                        </button>
                      ) : null}
                      {shouldPrepareStory(story) ? (
                        <button
                          type="button"
                          className={styles.prepareTableButton}
                          disabled={!canPrepare}
                          onClick={() => onPrepareContent?.(story.storyId)}
                        >
                          {preparingStoryId === story.storyId
                            ? "Preparing…"
                            : prepareContentLabel(story)}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {story.contentStatus !== "missing" ? (
                        <button
                          type="button"
                          className={styles.viewContentButton}
                          disabled={!canPrepare}
                          onClick={() => onViewContent?.(story.storyId)}
                        >
                          {viewingStoryId === story.storyId
                            ? "Loading…"
                            : "View content"}
                        </button>
                      ) : null}
                      {shouldPrepareStory(story) ? (
                        <button
                          type="button"
                          className={styles.prepareTableButton}
                          disabled={!canPrepare}
                          onClick={() => onPrepareContent?.(story.storyId)}
                        >
                          {preparingStoryId === story.storyId
                            ? "Preparing…"
                            : prepareContentLabel(story)}
                        </button>
                      ) : null}
                      {story.evaluationDecision === "review" &&
                      !story.reviewDecision ? (
                        <button
                          type="button"
                          className={styles.promoteStoryButton}
                          disabled={!canPromote}
                          onClick={() =>
                            onPromote?.(story.storyId, story.title)
                          }
                        >
                          {promotingStoryId === story.storyId
                            ? "Promoting…"
                            : "Promote to selected"}
                        </button>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StoryContentViewer({
  content,
  onClose,
}: {
  content: StoryContentResponse;
  onClose: () => void;
}) {
  const wordCount = content.enrichment?.wordCount ?? countTextWords(content.text);

  return (
    <div
      className={styles.contentViewerBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className={styles.contentViewer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-content-title"
      >
        <header className={styles.contentViewerHeader}>
          <div>
            <p>Prepared story content</p>
            <h2 id="story-content-title">{content.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close content viewer">
            ×
          </button>
        </header>

        <div className={styles.contentViewerMeta}>
          <StatusBadge tone={content.source === "article" ? "positive" : "neutral"}>
            {content.source === "article"
              ? content.enrichment?.method === "reader"
                ? "Article via Reader"
                : "Article page"
              : "RSS feed"}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {formatContentStatus(content.contentStatus)}
          </StatusBadge>
          <span>{formatNumber(wordCount)} words</span>
          {content.enrichment?.byline ? (
            <span>By {content.enrichment.byline}</span>
          ) : null}
        </div>

        <div className={styles.contentViewerBody}>
          {content.text ? (
            <p>{content.text}</p>
          ) : (
            <div className={styles.optimizationEmpty}>
              No readable story text is available yet.
            </div>
          )}
        </div>

        <footer className={styles.contentViewerFooter}>
          <a href={content.url} target="_blank" rel="noreferrer">
            Open original story ↗
          </a>
          {content.enrichment?.fetchedAt ? (
            <span>Fetched {formatDate(content.enrichment.fetchedAt)}</span>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function TableHeader({ label, numeric = false }: { label: string; numeric?: boolean }) {
  return (
    <th className={numeric ? styles.numericColumn : undefined}>
      <span className={styles.tableHeaderLabel}>{label}</span>
    </th>
  );
}

function ScoreCell({
  value,
  accent = false,
}: {
  value?: number;
  accent?: boolean;
}) {
  return (
    <td className={`${styles.scoreCell} ${accent ? styles.accentScoreCell : ""}`}>
      {value ?? "—"}
    </td>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: string;
  tone: "neutral" | "positive" | "warning" | "negative";
}) {
  return (
    <span className={`${styles.tableBadge} ${badgeToneClass(tone)}`}>
      {children}
    </span>
  );
}

function PublicationStatusChips({
  publications = [],
}: {
  publications?: readonly StoryPublication[];
}) {
  if (publications.length === 0) {
    return <span className={styles.publicationNotTracked}>Not tracked</span>;
  }

  return (
    <div className={styles.publicationStatusChips}>
      {publications.map((publication) => (
        <StatusBadge
          key={`${publication.platform}-${publication.status}-${publication.publishedAt ?? publication.scheduledAt ?? "current"}`}
          tone={publicationStatusTone(publication.status)}
        >
          {`${formatPublicationPlatform(publication.platform)} · ${formatPublicationStatus(publication.status)}`}
        </StatusBadge>
      ))}
    </div>
  );
}

function PublicationQuickControl({
  storyId,
  publications,
  disabled,
  isUpdating,
  onUpdate,
}: {
  storyId: string;
  publications?: readonly StoryPublication[];
  disabled: boolean;
  isUpdating: boolean;
  onUpdate?: (
    storyId: string,
    platform: PublicationPlatform,
    status?: PublicationStatus,
  ) => void;
}) {
  const [platform, setPlatform] = useState<PublicationPlatform>("instagram");
  const publication = publications?.find(
    (candidate) => candidate.platform === platform,
  );

  return (
    <div className={styles.publicationQuickControl}>
      <label>
        <span>Platform</span>
        <select
          value={platform}
          disabled={disabled || isUpdating || !onUpdate}
          aria-label={`Choose a publication platform for ${storyId}`}
          onChange={(event) =>
            setPlatform(event.currentTarget.value as PublicationPlatform)
          }
        >
          {PUBLICATION_PLATFORMS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {formatPublicationPlatform(candidate)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select
          value={publication?.status ?? ""}
          disabled={disabled || isUpdating || !onUpdate}
          aria-label={`Update ${formatPublicationPlatform(platform)} tracking for ${storyId}`}
          onChange={(event) => {
            const value = event.currentTarget.value;

            onUpdate?.(
              storyId,
              platform,
              value === "" ? undefined : (value as PublicationStatus),
            );
          }}
        >
          <option value="">Not tracked</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
        </select>
      </label>
      {isUpdating ? <small>Saving…</small> : null}
    </div>
  );
}

function OptimizationMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className={styles.optimizationMetric}>
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      <small>{detail}</small>
    </div>
  );
}

function EfficiencyBar({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className={styles.efficiencyItem}>
      <div>
        <span>{label}</span>
        <strong>{formatPercentage(value)}</strong>
      </div>
      <div className={styles.progressTrack} aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </div>
      <small>{detail}</small>
    </div>
  );
}

async function fetchDatabaseStats(
  secret: string,
  topicId: string,
): Promise<DatabaseStats> {
  return requestJson<DatabaseStats>(topicUrl("/api/radar/admin", topicId), secret);
}

async function fetchKeywordPreferences(
  secret: string,
  topicId: string,
): Promise<KeywordPreferences> {
  return requestJson<KeywordPreferences>(
    topicUrl("/api/radar/preferences", topicId),
    secret,
  );
}

async function saveKeywordPreferences(
  secret: string,
  topicId: string,
  preferences: Omit<KeywordPreferences, "updatedAt">,
): Promise<KeywordPreferences> {
  return requestJson<KeywordPreferences>(
    topicUrl("/api/radar/preferences", topicId),
    secret,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferences),
    },
  );
}

async function collectStories(
  secret: string,
  topicId: string,
  maxAgeHours: number,
): Promise<CollectionResponse> {
  return requestJson<CollectionResponse>(
    topicUrl(`/api/radar/collect?maxAgeHours=${maxAgeHours}`, topicId),
    secret,
    { method: "POST" },
  );
}

async function evaluateStories(
  secret: string,
  topicId: string,
): Promise<EditorialEvaluationResponse> {
  return requestJson<EditorialEvaluationResponse>(
    topicUrl("/api/radar/evaluate", topicId),
    secret,
    { method: "POST" },
  );
}

async function reviewStories(
  secret: string,
  topicId: string,
  storyIds: string[],
  decision: "approved" | "rejected",
): Promise<StoryReviewResponse> {
  return requestJson<StoryReviewResponse>(
    topicUrl("/api/radar/reviews", topicId),
    secret,
    {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
      body: JSON.stringify({ storyIds, decision }),
    },
  );
}

async function fetchStoryContent(
  secret: string,
  topicId: string,
  storyId: string,
): Promise<StoryContentResponse> {
  return requestJson<StoryContentResponse>(
    topicUrl(`/api/radar/stories/${encodeURIComponent(storyId)}/content`, topicId),
    secret,
  );
}

async function prepareStoryContent(
  secret: string,
  topicId: string,
  storyId: string,
): Promise<StoryContentResponse> {
  return requestJson<StoryContentResponse>(
    topicUrl(`/api/radar/stories/${encodeURIComponent(storyId)}/content`, topicId),
    secret,
    { method: "POST" },
  );
}

async function promoteReviewCandidate(
  secret: string,
  topicId: string,
  storyId: string,
): Promise<{ storyId: string; promoted: true }> {
  return requestJson<{ storyId: string; promoted: true }>(
    topicUrl(
      `/api/radar/stories/${encodeURIComponent(storyId)}/promote`,
      topicId,
    ),
    secret,
    { method: "POST" },
  );
}

async function upsertStoryPublication(
  secret: string,
  topicId: string,
  storyId: string,
  publication: Pick<StoryPublication, "platform" | "status">,
): Promise<unknown> {
  return requestJson<unknown>(
    topicUrl(
      `/api/radar/stories/${encodeURIComponent(storyId)}/publications`,
      topicId,
    ),
    secret,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(publication),
    },
  );
}

async function clearStoryPublication(
  secret: string,
  topicId: string,
  storyId: string,
  platform: PublicationPlatform,
): Promise<unknown> {
  return requestJson<unknown>(
    topicUrl(
      `/api/radar/stories/${encodeURIComponent(storyId)}/publications`,
      topicId,
    ),
    secret,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ platform }),
    },
  );
}

async function clearDatabase(
  secret: string,
  topicId: string,
): Promise<ClearResponse> {
  return requestJson<ClearResponse>(topicUrl("/api/radar/admin", topicId), secret, {
    method: "DELETE",
    headers: {
      "X-Radar-Confirm": "DELETE",
    },
  });
}

function topicUrl(path: string, topicId: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}topicId=${encodeURIComponent(topicId)}`;
}

async function requestJson<T>(
  url: string,
  secret: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...init.headers,
      Authorization: `Bearer ${secret.trim()}`,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return payload as T;
}

function collectionNotice(
  collection: CollectionResponse,
  title: string,
): Notice {
  return {
    tone: "success",
    title,
    message: `${collection.persistence.persistedStories} stories processed: ${collection.counts.relevance.ready} ready, ${collection.counts.relevance.needsEnrichment} need enrichment, ${collection.counts.relevance.review} need review, and ${collection.counts.relevance.rejected} were rejected. ${collection.counts.duplicatesRemoved} batch duplicates were removed and ${collection.persistence.markedStoredDuplicates} stored duplicates were marked.`,
  };
}

function parseMaxAgeHours(value: string): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseTerms(value: string): string[] {
  return [...new Set(value.split(/[\n,]+/).map((term) => term.trim()).filter(Boolean))];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function shouldPrepareStory(story: EditorialTableStory): boolean {
  return (
    story.contentStatus !== "full" &&
    story.enrichmentStatus !== "completed"
  );
}

function prepareContentLabel(story: EditorialTableStory): string {
  if (
    story.enrichmentStatus === "failed" ||
    story.enrichmentStatus === "blocked" ||
    story.enrichmentStatus === "pending"
  ) {
    return "Retry preparation";
  }

  return story.contentStatus === "likely-full"
    ? "Improve content"
    : "Prepare content";
}

function formatEnrichmentStatus(
  status: NonNullable<EditorialTableStory["enrichmentStatus"]>,
): string {
  switch (status) {
    case "completed":
      return "Article prepared";
    case "pending":
      return "Preparation pending";
    case "blocked":
      return "Publisher blocked";
    case "failed":
      return "Preparation failed";
  }
}

function countTextWords(value: string | undefined): number {
  return value?.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-CA").format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatUtcDate(value: string): string {
  const [date, time = ""] = value.split("T");

  return `${date} ${time.slice(0, 5)} UTC`;
}

function formatTableDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function parseStoryScoreThreshold(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function parsePublishedWithinDays(value: string): number | undefined {
  if (value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function rankTableStories(
  left: EditorialTableStory,
  right: EditorialTableStory,
  primaryRank: StoryRankKey,
  secondaryRank: StoryRankKey,
): number {
  const primaryComparison = compareStoryRank(left, right, primaryRank);

  if (primaryComparison !== 0) {
    return primaryComparison;
  }

  if (secondaryRank !== primaryRank) {
    const secondaryComparison = compareStoryRank(left, right, secondaryRank);

    if (secondaryComparison !== 0) {
      return secondaryComparison;
    }
  }

  const titleComparison = left.title.localeCompare(right.title, "en", {
    sensitivity: "base",
  });

  return titleComparison !== 0
    ? titleComparison
    : left.storyId.localeCompare(right.storyId);
}

function compareStoryRank(
  left: EditorialTableStory,
  right: EditorialTableStory,
  rank: StoryRankKey,
): number {
  const leftValue = storyRankValue(left, rank);
  const rightValue = storyRankValue(right, rank);

  if (leftValue === undefined && rightValue === undefined) {
    return 0;
  }

  if (leftValue === undefined) {
    return 1;
  }

  if (rightValue === undefined) {
    return -1;
  }

  return rightValue - leftValue;
}

function storyRankValue(
  story: EditorialTableStory,
  rank: StoryRankKey,
): number | undefined {
  switch (rank) {
    case "publishedAt": {
      const value = story.publishedAt ?? story.lastSeenAt;
      const timestamp = value ? new Date(value).getTime() : NaN;

      return Number.isFinite(timestamp) ? timestamp : undefined;
    }
    case "localScore":
      return story.localScore;
    case "editorialPriority":
      return story.editorialPriority ?? story.editorialScore;
  }
}

function formatEvaluationDecision(
  decision: EditorialTableStory["evaluationDecision"],
): string {
  switch (decision) {
    case "shortlist":
      return "Shortlist";
    case "review":
      return "Review";
    case "reject":
      return "Reject";
    default:
      return "Not evaluated";
  }
}

function evaluationDecisionTone(
  decision: EditorialTableStory["evaluationDecision"],
): "neutral" | "positive" | "warning" | "negative" {
  switch (decision) {
    case "shortlist":
      return "positive";
    case "review":
      return "warning";
    case "reject":
      return "negative";
    default:
      return "neutral";
  }
}

function formatProcessingStatus(
  status: EditorialTableStory["processingStatus"],
): string {
  return status ? (STATUS_LABELS[status] ?? status) : "—";
}

function formatPublicationPlatform(platform: PublicationPlatform): string {
  switch (platform) {
    case "instagram":
      return "Instagram";
    case "linkedin":
      return "LinkedIn";
    case "tiktok":
      return "TikTok";
    case "facebook":
      return "Facebook";
    case "x":
      return "X";
    case "youtube":
      return "YouTube";
    case "newsletter":
      return "Newsletter";
  }
}

function formatPublicationStatus(status: PublicationStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "published":
      return "Published";
  }
}

function publicationStatusTone(
  status: PublicationStatus,
): "neutral" | "positive" | "warning" | "negative" {
  switch (status) {
    case "published":
      return "positive";
    case "scheduled":
      return "warning";
    case "draft":
      return "neutral";
  }
}

function badgeToneClass(
  tone: "neutral" | "positive" | "warning" | "negative",
): string {
  switch (tone) {
    case "positive":
      return styles.tableBadgePositive;
    case "warning":
      return styles.tableBadgeWarning;
    case "negative":
      return styles.tableBadgeNegative;
    case "neutral":
      return styles.tableBadgeNeutral;
  }
}

function percentage(value: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 1,
  }).format(value) + "%";
}

function formatContentStatus(
  status: EditorialDashboardStory["contentStatus"],
): string {
  switch (status) {
    case "full":
      return "full";
    case "likely-full":
      return "likely full";
    case "excerpt":
      return "excerpt";
    case "missing":
      return "missing";
  }
}
