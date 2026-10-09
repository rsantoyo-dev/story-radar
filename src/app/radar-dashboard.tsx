"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { SignOutButton } from "./account/sign-out-button";
import { SIGNED_IN_CREDENTIAL } from "./modules/auth/session-credential";
import { AutoCollectionPanel } from "./auto-collection-panel";
import { DailyPreparationPanel } from "./daily-preparation-panel";
import { DailyEditorialPlannerPanel } from "./daily-editorial-planner-panel";
import { StoryPhotosPanel } from "./story-photos-panel";
import type { StoryContentEdition } from "./modules/stories/story-materials.types";

import { ActivityPanel } from "./activity-panel";
import { EditorialLinesPanel, type EditorialLinesData, type EditorialLineSelection } from "./editorial-lines-panel";
import { periodError } from "./editorial-period-controls";
import { CreativeProfilePanel } from "./creative-profile-panel";
import { InstagramGalleryPanel } from "./instagram-gallery-panel";
import { FacebookConnectionPanel } from "./facebook-connection-panel";
import { MetaConnectionPanel } from "./meta-connection-panel";
import { EditorialProfilePanel } from "./editorial-profile-panel";
import { UrgentStoriesBanner } from "./urgent-stories-banner";
import { AcquisitionLensesPanel } from "./acquisition-lenses-panel";
import { TopicOverviewPanel } from "./topic-overview-panel";
import { NewStoryDialog, type CreatedStory } from "./new-story-dialog";
import { AddSourceDialog, type AddedSource } from "./add-source-dialog";
import { ActionRow, Button, Dialog } from "./ui/primitives";
import { ModalLayer } from "./ui/modal-layer";
import { DisclosureActionMenu } from "./ui/disclosure-action-menu";
import { DemoCreditIndicator } from "./demo-credit-indicator";
import { useUnsavedBeforeUnload } from "./ui/use-unsaved-before-unload";
import styles from "./radar-dashboard.generated.module.css";
import {
  TopicConfigurationPanel,
  type DashboardTopic,
  type TopicConfigurationView,
} from "./topic-configuration-panel";
import { topicThemeStyle } from "@/design/topic-themes";
import { dashboardViewFromHash, DASHBOARD_VIEW_TITLES } from "./dashboard-navigation";
import { storyPublicationStage } from "./story-publication-stage";
import type { CreativeProfile } from "./modules/stories/creative-content.types";
import type { WorkspaceSourceCatalog } from "./modules/sources/workspace-source-catalog.repository";

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
    provider: string;
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
  | "active-selected"
  | "not-published-anywhere"
  | "scheduled-on-platform"
  | "published-on-platform";

/** Deep-link a Story review view: #stories/selected/unpublished, #stories/collected, … */
type StoryReviewView = {
  tab: "collected" | "selected";
  publicationFilter?: PublicationFilter;
};

type NavigationGlyph = "today" | "discover" | "production" | "publications" | "results" | "identity" | "strategy" | "sources" | "channels" | "help" | "admin";

function NavGlyph({ name }: { name: NavigationGlyph }) {
  const shapes = {
    today: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></>,
    discover: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    production: <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="m15 15 5 3-5 3z"/></>,
    publications: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></>,
    results: <><path d="M4 20V11M10 20V4M16 20v-7M22 20V8"/><path d="M2 20h22"/></>,
    identity: <><path d="m12 2 2.3 6.7L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.3z"/><path d="M19 19v3M17.5 20.5h3"/></>,
    strategy: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="18" r="2" fill="currentColor" stroke="none"/></>,
    sources: <><path d="M4 20a16 16 0 0 0-2-2M4 12a8 8 0 0 1 8 8M4 4a16 16 0 0 1 16 16"/><circle cx="4" cy="20" r="1" fill="currentColor" stroke="none"/></>,
    channels: <><circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></>,
    help: <><circle cx="12" cy="12" r="10"/><path d="M9.3 9a3 3 0 0 1 5.4 1.8c0 2-2.7 2.5-2.7 4.2M12 18h.01"/></>,
    admin: <><circle cx="12" cy="12" r="3"/><path d="M10 2h4l.7 2.4 2.2 1 2.2-1.2 2.8 2.8-1.2 2.2 1 2.2L24 12l-2.3.7-1 2.2 1.2 2.2-2.8 2.8-2.2-1.2-2.2 1L14 22h-4l-.7-2.3-2.2-1-2.2 1.2-2.8-2.8 1.2-2.2-1-2.2L0 12l2.3-.7 1-2.2-1.2-2.2 2.8-2.8 2.2 1.2 2.2-1z"/></>,
  } satisfies Record<NavigationGlyph, React.ReactNode>;
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">{shapes[name]}</svg>;
}

const STORY_REVIEW_ANCHOR = "stories";
const CANDIDATE_RESET_EVENT = "press-craftor:candidate-view-reset";

function navigationHash(hash: string): string {
  return hash || "#today";
}

function storyReviewHash(view: StoryReviewView): string {
  if (view.tab === "collected") return "#discover";
  const segment =
    view.publicationFilter === "active-selected" ? "active" :
    view.publicationFilter === "not-published-anywhere" ? "unpublished" : "all";
  return `#${STORY_REVIEW_ANCHOR}/selected/${segment}`;
}

function parseStoryReviewHash(hash: string): StoryReviewView | undefined {
  if (hash === "#discover" || hash === "#stories" || hash === `#${STORY_REVIEW_ANCHOR}/collected`) {
    return { tab: "collected" };
  }
  const match = /^#stories\/selected\/(all|active|unpublished)$/.exec(hash);
  if (!match) return undefined;
  return {
    tab: "selected",
    publicationFilter: match[1] === "active" ? "active-selected" :
      match[1] === "unpublished" ? "not-published-anywhere" : "all",
  };
}

function countActiveSelected(
  stories: readonly EditorialDashboardStory[],
): number {
  return stories.filter(
    (story) => storyPublicationStage(story).active,
  ).length;
}

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
  isOwnedContent?: boolean;
  title: string;
  url: string;
  contentStatus: "excerpt" | "full" | "likely-full" | "missing";
  publishedAt?: string;
  localScore: number;
  evaluationDecision?: "reject" | "review" | "shortlist";
  editorialPriority?: number;
  growthScore?: number;
  growthReason?: string;
  growthSignals?: EditorialGrowthSignals;
  editorialScore?: number;
  canadaRelevance?: number;
  aiRelevance?: number;
  socialPotential?: number;
  novelty?: number;
  reason: string;
  suggestedAngles: string[];
  riskFlags: string[];
  evaluatedAt?: string;
  reviewedAt?: string;
  enrichmentStatus?: "pending" | "completed" | "failed" | "blocked";
  enrichmentMethod?: "direct" | "reader";
  enrichmentWordCount?: number;
  enrichmentAttempts?: number;
  enrichmentError?: string;
  enrichedAt?: string;
  publications?: StoryPublication[];
  confirmedPublications?: {
    platform: "instagram" | "facebook";
    publishedAt: string;
    postUrl?: string;
    externalId: string;
  }[];
  /** Image URLs to try in order; the exact published cover comes first. */
  publicationThumbnails?: string[];
};

type EditorialCollectedStory = {
  storyId: string;
  sourceId: string;
  sourceName: string;
  isOwnedContent: boolean;
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
  duplicateOfStoryId?: string;
  duplicateOfTitle?: string;
  duplicateOfPublished?: boolean;
  reviewable: boolean;
  evaluationDecision?: "reject" | "review" | "shortlist";
  editorialPriority?: number;
  growthScore?: number;
  growthReason?: string;
  growthSignals?: EditorialGrowthSignals;
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
  lineContexts?: EditorialLinesData["associations"];
  storyId: string;
  sourceId: string;
  sourceName: string;
  isOwnedContent?: boolean;
  title: string;
  url: string;
  contentStatus: EditorialDashboardStory["contentStatus"];
  processingStatus?: EditorialCollectedStory["processingStatus"];
  publishedAt?: string;
  lastSeenAt?: string;
  localScore: number;
  reviewDecision?: "approved" | "rejected";
  duplicateOfStoryId?: string;
  duplicateOfTitle?: string;
  duplicateOfPublished?: boolean;
  reviewable?: boolean;
  evaluationDecision?: "reject" | "review" | "shortlist";
  editorialPriority?: number;
  growthScore?: number;
  growthReason?: string;
  growthSignals?: EditorialGrowthSignals;
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
  confirmedPublications?: EditorialDashboardStory["confirmedPublications"];
};

type EditorialGrowthSignals = {
  newAudienceReach?: number;
  viralPotential?: number;
  constructiveTension?: number;
  explainability?: number;
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
    semanticDuplicatesMarked?: number;
  };
};

type ClearResponse = {
  deleted: {
    deletedStories: number;
    deletedCollectionRuns: number;
    deletedEditorialEvaluationRuns: number;
    deletedCreativeAiRuns: number;
    deletedCreativeBriefs: number;
    deletedSocialPublications: number;
  };
  stats: DatabaseStats;
};

type EditorialEvaluationResponse = {
  status: "completed" | "no-candidates";
  provider: string;
  model: string;
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

export type StoryContentResponse = {
  editorial?: StoryContentEdition;
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
  | "unselect"
  | "promote"
  | "clear-duplicate"
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

type PendingPromotion = {
  topicId: string;
  storyId: string;
  title: string;
  isOriginalContent: boolean;
  duplicateStoryId: string | null;
  duplicateTitle?: string;
  aiDecision: "reject" | "review" | "shortlist" | undefined;
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

const COLLECTOR_SECRET_STORAGE_KEY = "story-radar:collector-secret";

/**
 * The Instagram connect button navigates away with window.location.href and
 * Meta's OAuth callback redirects back with a full page load, which remounts
 * this component and would otherwise drop the in-memory secret. sessionStorage
 * survives that reload but clears when the tab closes.
 */
function readStoredSecret(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(COLLECTOR_SECRET_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredSecret(secret: string): void {
  if (typeof window === "undefined") return;
  try {
    if (secret) {
      window.sessionStorage.setItem(COLLECTOR_SECRET_STORAGE_KEY, secret);
    } else {
      window.sessionStorage.removeItem(COLLECTOR_SECRET_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (private browsing, quota, disabled storage).
  }
}

/** The signed-in account in the top bar: email, workspace and role, and sign out. */
function AccountMenu({ account }: { account: { email: string; name?: string; workspaceName?: string; role?: string } }) {
  const label = (account.name?.trim() || account.email).slice(0, 1).toUpperCase();
  return <details className={styles.accountMenu}>
    <summary aria-label={`Signed in as ${account.email}`}>
      <span className={styles.accountAvatar} aria-hidden="true">{label}</span>
      <span className={styles.accountEmail}>{account.email}</span>
    </summary>
    <div className={styles.accountPanel}>
      <strong>{account.name?.trim() || account.email}</strong>
      <small>{account.email}</small>
      {account.workspaceName ? <small>{account.workspaceName}{account.role ? ` · ${account.role}` : ""}</small> : null}
      <SignOutButton size="compact" />
    </div>
  </details>;
}

export function RadarDashboard({
  account,
  initialTopicId,
  initialThemeStyle,
  initialTopics,
  initialPreferences,
}: {
  /** The signed-in user, when sign-in is required: the API trusts the session instead of the collector secret. */
  account?: { email: string; name?: string; workspaceName?: string; role?: string };
  initialTopicId: string;
  initialThemeStyle: CSSProperties;
  initialTopics: DashboardTopic[];
  initialPreferences: KeywordPreferences;
}) {
  const router = useRouter();
  // Signed in, the session authorizes requests: never send (or keep) the collector secret.
  const [secret, setSecretState] = useState(() => account ? "" : readStoredSecret());
  const setSecret = useCallback((next: string) => {
    setSecretState(next);
    writeStoredSecret(next);
  }, []);
  useEffect(() => { if (account) writeStoredSecret(""); }, [account]);
  const [topics, setTopics] = useState(initialTopics);
  const [selectedTopicId, setSelectedTopicId] = useState(initialTopicId);
  const selectedTopicIdRef = useRef(initialTopicId);
  const [lineSelection,setLineSelection]=useState<EditorialLineSelection>();
  const [lineData,setLineData]=useState<EditorialLinesData>();
  const [lineRefresh,setLineRefresh]=useState(0);
  // Unseen urgent stories for the selected Topic, reported by the Today banner.
  const [urgentCount,setUrgentCount]=useState(0);
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
  const [notice, setNotice] = useState<Notice>();
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [activeNavHash, setActiveNavHash] = useState("#today");
  const [sourceCatalog, setSourceCatalog] = useState<WorkspaceSourceCatalog>();
  const [sourceCatalogError, setSourceCatalogError] = useState<string>();
  const [sourceCatalogRefresh, setSourceCatalogRefresh] = useState(0);
  const [newStoryOpen, setNewStoryOpen] = useState(false);
  const [newTopicNonce, setNewTopicNonce] = useState(0);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [isTopicLoading, setIsTopicLoading] = useState(false);
  const [selectedCreativeProfile, setSelectedCreativeProfile] =
    useState<CreativeProfile>();
  const acceptSelectedCreativeProfile = useCallback((profile: CreativeProfile) => {
    // A request from a previous Topic can finish after the selector changes.
    if (selectedTopicIdRef.current === selectedTopicId) setSelectedCreativeProfile(profile);
  }, [selectedTopicId]);
  // Bumped by the Instagram connection panel (sync / disconnect / verify) so
  // the gallery below it refetches.
  const [metaRefreshToken, setMetaRefreshToken] = useState(0);
  const [facebookSelection, setFacebookSelection] = useState<{ topicId: string; selectionId: string }>();
  const clearFacebookSelection = useCallback(() => setFacebookSelection(undefined), []);

  // Returning from the standalone studio remounts the dashboard. Restore its
  // read-only data when this tab already has a collector connection, so the
  // editor does not have to reconnect just to find the same Story.
  useEffect(() => {
    const stored = readStoredSecret();
    // Signed in: the session cookie authorizes every request; no secret needed.
    if (!stored && !account) return;
    let cancelled = false;
    const topicId = initialTopicId;
    Promise.all([
      fetchDatabaseStats(stored, topicId),
      fetchKeywordPreferences(stored, topicId),
    ]).then(([nextStats, preferences]) => {
      if (cancelled || selectedTopicIdRef.current !== topicId) return;
      setStats(nextStats);
      setFavoredTerms(preferences.favoredTerms.join("\n"));
      setUnfavoredTerms(preferences.unfavoredTerms.join("\n"));
      setPreferencesUpdatedAt(preferences.updatedAt);
    }).catch((error) => {
      if (cancelled || selectedTopicIdRef.current !== topicId) return;
      setNotice({ tone: "error", title: "Topic data could not be loaded", message: getErrorMessage(error) });
    });
    return () => { cancelled = true; };
  }, [initialTopicId, account]);

  const isBusy = activeOperation !== undefined;
  const canAuthenticate = Boolean(account) || secret.trim().length > 0;
  // Panels still take a `secret` prop; signed in, they get the session placeholder.
  const panelSecret = account ? SIGNED_IN_CREDENTIAL : secret;
  const canDelete = canAuthenticate && confirmation === "DELETE" && !isBusy;
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId);
  const selectedTopicName = selectedTopic?.name ?? "this topic";
  const activeView = dashboardViewFromHash(activeNavHash);
  const selectedStories = stats?.editorial?.selectedStories ?? [];
  const productionStories = selectedStories.filter((story) => storyPublicationStage(story).active);
  const publishedStories = selectedStories
    .filter((story) => storyPublicationStage(story).publishedDestinations.length > 0)
    .sort((a, b) => {
      const latest = (story: EditorialDashboardStory) => {
        const publishedAt = storyPublicationStage(story).publishedDestinations[0]?.publishedAt;
        return publishedAt ? new Date(publishedAt).getTime() : 0;
      };
      return latest(b) - latest(a);
    });
  const pendingInstagramStories = selectedStories.filter((story) =>
    !storyPublicationStage(story).publishedDestinations.some((publication) => publication.platform === "instagram"),
  );
  const contextTabs: readonly [string, string][] =
    activeView === "discover" ? [["#discover", "Candidates"], ["#discover/search", "Search"], ["#optimization", "Diagnostics"]] :
    activeView === "strategy" ? [["#strategy", "Criteria"], ["#strategy/lines", "Lines"], ["#strategy/automation", "Automation"], ["#editorial-lenses", "Angles"], ["#preferences", "Preferences"]] :
    activeView === "identity" ? [["#creative-profile-identity", "Profile"], ["#creative-profile-voice", "Voice"], ["#creative-profile-brand", "Visual"], ["#creative-profile-characters", "Assets"]] :
    activeView === "sources" ? [["#sources/rss", "RSS"], ["#sources/ai", "AI research"], ["#sources/documents", "Documents"], ["#sources/manual", "Original content"]] :
    activeView === "publications" ? [["#publications", "To publish"], ["#publications/published", "Published"], ["#publications/history", "Instagram history"]] :
    activeView === "admin" ? [["#admin", "Status"], ["#admin/activity", "Activity"]] :
    [];

  useEffect(() => {
    const refresh = () => setSourceCatalogRefresh((current) => current + 1);
    window.addEventListener("workspace-sources-changed", refresh);
    return () => window.removeEventListener("workspace-sources-changed", refresh);
  }, []);

  useEffect(() => {
    if (!canAuthenticate) return;
    const controller = new AbortController();
    fetch("/api/radar/sources", {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${secret}` },
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load sources");
      return result as WorkspaceSourceCatalog;
    }).then((result) => {
      if (!controller.signal.aborted) {
        setSourceCatalog(result);
        setSourceCatalogError(undefined);
      }
    }).catch((error) => {
      if (!controller.signal.aborted) setSourceCatalogError(getErrorMessage(error));
    });
    return () => controller.abort();
  }, [canAuthenticate, secret, sourceCatalogRefresh]);

  useEffect(() => {
    function syncNavigation() {
      if (window.location.hash === "#configuration") {
        const url = new URL(window.location.href);
        url.hash = "topics";
        window.history.replaceState(null, "", url.toString());
      }
      setActiveNavHash(navigationHash(window.location.hash));
      requestAnimationFrame(() => {
        const hash = window.location.hash.slice(1);
        if (hash.startsWith("creative-profile-")) {
          document.getElementById(hash)?.scrollIntoView({ block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      });
    }
    syncNavigation();
    window.addEventListener("hashchange", syncNavigation);
    window.addEventListener("popstate", syncNavigation);
    return () => { window.removeEventListener("hashchange", syncNavigation); window.removeEventListener("popstate", syncNavigation); };
  }, []);

  useEffect(() => {
    if (!stats) return;
    const url = new URL(window.location.href);
    const returnContext = url.searchParams.get("returnContext");
    if (!returnContext) return;
    let scrollY: number | undefined;
    try {
      const saved = window.sessionStorage.getItem(`press-craftor:return:${returnContext}`);
      const context = saved ? JSON.parse(saved) as Record<string, unknown> : undefined;
      if (context?.topicId === selectedTopicId &&
          typeof context.scrollY === "number" && Number.isFinite(context.scrollY) && context.scrollY >= 0 &&
          typeof context.createdAt === "number" && Date.now() - context.createdAt < 15 * 60 * 1000) {
        scrollY = context.scrollY;
      }
      window.sessionStorage.removeItem(`press-craftor:return:${returnContext}`);
    } catch { /* Keep the current position when storage cannot be read. */ }
    url.searchParams.delete("returnContext");
    window.history.replaceState(window.history.state, "", url.toString());
    if (scrollY === undefined) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" }));
    return () => cancelAnimationFrame(frame);
  }, [selectedTopicId, stats]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const sidebar = sidebarRef.current;
    const menuButton = menuButtonRef.current;
    requestAnimationFrame(() => sidebar?.querySelector<HTMLElement>("button, a[href]")?.focus());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const focusable = [...sidebar.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); menuButton?.focus(); };
  }, [sidebarOpen]);

  // The Meta OAuth callback (/api/radar/meta/callback) is a full-page
  // redirect, so it reports its outcome via query params rather than a fetch
  // response. This must run in an effect, not a lazy useState initializer:
  // the page is server-rendered (see page.tsx's `connection()`), and reading
  // window.location during the initial render would make the client's first
  // pass diverge from the server-rendered HTML and produce a hydration
  // mismatch. Deferring to a post-mount, client-only effect keeps the first
  // paint identical to the server output; the one extra render this causes is
  // the price of applying a URL-only outcome safely.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const metaTopicId = params.get("metaTopicId");
    const metaConnected = params.get("metaConnected");
    const metaError = params.get("metaError");
    const facebookSelectionId = params.get("metaFacebookSelectionId");
    const channel = params.get("metaChannel") === "facebook" ? "Facebook" : "Instagram";
    if (!metaTopicId && !metaConnected && !metaError) return;

    // page.tsx selects metaTopicId on the server before hydration. A Facebook
    // return with a selection id is not finished yet: the Facebook panel opens
    // its Page picker instead of announcing a connection.
    const outcome: Notice | undefined = metaError
      ? { tone: "error", title: `${channel} connection failed`, message: metaError }
      : facebookSelectionId
        ? undefined
        : { tone: "success", title: "Instagram connected", message: "This topic can now publish to its connected Instagram account." };

    const url = new URL(window.location.href);
    for (const key of ["metaTopicId", "metaConnected", "metaError", "metaChannel", "metaFacebookSelectionId"]) url.searchParams.delete(key);
    if (metaTopicId && topics.some((topic) => topic.id === metaTopicId)) url.searchParams.set("topicId", metaTopicId);
    url.hash = "channels";
    window.history.replaceState(null, "", url.toString());
    queueMicrotask(() => {
      if (outcome) setNotice(outcome);
      if (metaTopicId && facebookSelectionId && !metaError) setFacebookSelection({ topicId: metaTopicId, selectionId: facebookSelectionId });
      setActiveNavHash("#channels");
    });
  }, [topics]);

  function goToStoryReview(view: StoryReviewView) {
    setSidebarOpen(false);
    if (typeof window !== "undefined") {
      if (view.tab === "collected") window.dispatchEvent(new Event(CANDIDATE_RESET_EVENT));
      window.location.hash = storyReviewHash(view);
    }
  }

  function openCreativeStory(storyId: string, options?: { editorialRunId?: string; draftId?: string; preparationRunId?: string; tab?: string }) {
    const url = new URL(`/topics/${encodeURIComponent(selectedTopicId)}/stories/${encodeURIComponent(storyId)}`, window.location.origin);
    url.searchParams.set("from", window.location.hash || "#production");
    try {
      const returnContext = crypto.randomUUID();
      window.sessionStorage.setItem(`press-craftor:return:${returnContext}`, JSON.stringify({
        topicId: selectedTopicId,
        storyId,
        scrollY: window.scrollY,
        createdAt: Date.now(),
      }));
      url.searchParams.set("returnContext", returnContext);
    } catch { /* The section link still works without session storage. */ }
    if (options?.editorialRunId) url.searchParams.set("editorialRunId", options.editorialRunId);
    if (options?.draftId) url.searchParams.set("draftId", options.draftId);
    if (options?.preparationRunId) url.searchParams.set("preparationRunId", options.preparationRunId);
    if (options?.tab) url.searchParams.set("tab", options.tab);
    router.push(url.pathname + url.search);
  }

  /**
   * The global "New story" action creates a manual (owned-content) story. It
   * then behaves like any other candidate: stats refresh, the inbox of the
   * chosen topic is shown, and the editor decides what happens next.
   */
  function handleStoryCreated(story: CreatedStory) {
    setNewStoryOpen(false);
    window.dispatchEvent(new Event("workspace-sources-changed"));
    if (story.topicId !== selectedTopicId) {
      handleTopicChange(story.topicId);
    } else {
      void fetchDatabaseStats(secret, story.topicId)
        .then(setStats)
        .catch(() => undefined);
    }
    setNotice({
      tone: "success",
      title: "Story created",
      message: `“${story.title}” was added to Stories and is ready for editorial and AI evaluation.`,
    });
    goToStoryReview({ tab: "collected" });
  }

  function handleSourceAdded(source: AddedSource) {
    setAddSourceOpen(false);
    window.dispatchEvent(new Event("workspace-sources-changed"));
    const targetTopicId = source.topicIds.includes(selectedTopicId) ? selectedTopicId : source.topicIds[0];
    if (targetTopicId && targetTopicId !== selectedTopicId) handleTopicChange(targetTopicId);
    if (source.sourceType === "article") {
      void fetchDatabaseStats(secret, targetTopicId ?? selectedTopicId).then((nextStats) => {
        if (selectedTopicIdRef.current === (targetTopicId ?? selectedTopicId)) setStats(nextStats);
      }).catch(() => undefined);
    }
    if (source.sourceType === "article") {
      goToStoryReview({ tab: "collected" });
    } else {
      window.location.assign(source.sourceType === "rss" ? "#sources/rss" : "#sources/documents");
    }
    setNotice({
      tone: "success",
      title: "Source added",
      message: source.sourceType === "article"
        ? "The article was added to Stories for editorial evaluation."
        : source.sourceType === "document"
          ? "The PDF was linked and queued for extraction."
          : "The feed was linked to the selected topics.",
    });
  }

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

  async function handleConnect() {
    if (!canAuthenticate || isBusy) return;
    await handleLoadStatus();
  }

  /** Forgets the collector secret (memory and sessionStorage) and returns the bar to its disconnected state. */
  function handleDisconnect() {
    if (isBusy) return;
    setSecret("");
    setStats(undefined);
  }

  async function handleCollect() {
    if (preferencesDirty) {
      showUnsavedPreferences();
      return;
    }

    const hours = parseMaxAgeHours(maxAgeHours);

    if (lineSelection?.topicId !== selectedTopicId || (lineSelection.period && periodError(lineSelection.period))) {
      return;
    }

    await runOperation("collect", async () => {
      const collection = await collectStories(secret, selectedTopicId, hours || 72, lineSelection?.topicId===selectedTopicId?lineSelection:undefined);
      setLineRefresh(n=>n+1);
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

      setStats(nextStats);
      setSelectedStoryIds([]);
      goToStoryReview({ tab: "collected" });
      return collectionNotice(collection, "Collection completed");
    });
  }

  async function handleClear() {
    if (!window.confirm(`Clear ${selectedTopic?.name ?? "this Topic"}'s editorial work? This removes its Story selections, creative briefs and drafts, generated asset records, evaluation and collection runs, and manual publication marks. Topic settings, source catalogs, and canonical Story records remain.`)) return;
    await runOperation("clear", async () => {
      const result = await clearDatabase(secret, selectedTopicId);

      setStats(result.stats);
      setSelectedStoryIds([]);
      setConfirmation("");
      return {
        tone: "success",
        title: "Data cleared",
        message: `${result.deleted.deletedStories} Topic Story selections, ${result.deleted.deletedCreativeBriefs} creative briefs and their versions, ${result.deleted.deletedCollectionRuns} collection runs, ${result.deleted.deletedEditorialEvaluationRuns + result.deleted.deletedCreativeAiRuns} AI runs, and ${result.deleted.deletedSocialPublications} manual publication marks were removed. Topic settings and source catalogs remain.`,
      };
    });
  }

  async function handleEvaluate(force = false) {
    if (preferencesDirty) {
      showUnsavedPreferences();
      return;
    }

    if (
      force &&
      !window.confirm(
        "Re-evaluate eligible stories with the current settings? Cached AI decisions will be ignored, while human approvals and rejections remain unchanged.",
      )
    ) {
      return;
    }

    await runOperation("evaluate", async () => {
      const evaluation = await evaluateStories(
        secret,
        selectedTopicId,
        force,
      );
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

      setStats(nextStats);
      setSelectedStoryIds([]);

      if (evaluation.status === "no-candidates") {
        return {
          tone: "success",
          title: force
            ? "No eligible stories to re-evaluate"
            : "Evaluation is up to date",
          message: force
            ? "No automatic, unreviewed stories currently meet the topic floor and freshness settings. Human decisions were left unchanged."
            : `${evaluation.candidatesScanned} candidates were scanned; ${evaluation.cachedStories} already had a current evaluation and did not consume AI.`,
        };
      }

      return {
        tone: "success",
        title: force
          ? "Editorial re-evaluation completed"
          : "Editorial evaluation completed",
        message: `${evaluation.evaluatedStories} stories were evaluated with ${formatEditorialProvider(evaluation.provider)} (${evaluation.model}), ${evaluation.cachedStories} were skipped by cache, and ${formatNumber(evaluation.usage.totalTokens)} tokens were consumed.`,
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

  async function handlePlannerSelect(storyId: string, title: string, decision: "review" | "shortlist") {
    if (!canAuthenticate || isBusy) throw new Error("Another operation is running. Please try again.");
    setActiveOperation("review");
    setActiveStoryId(storyId);
    try {
      if (decision === "review") {
        await promoteReviewCandidate(secret, selectedTopicId, storyId);
      } else {
        await reviewStories(secret, selectedTopicId, [storyId], "approved");
      }
      setSelectedStoryIds(ids => ids.filter(id => id !== storyId));
      setNotice({ tone: "success", title: "Story approved", message: `Your human approval for “${title}” is recorded.` });
      // Approval is already saved; a dashboard refresh failure must not report
      // the approval itself as failed or encourage a duplicate submission.
      const refreshed = await fetchDatabaseStats(secret, selectedTopicId).catch(() => undefined);
      if (refreshed) setStats(refreshed);
    } finally {
      setActiveOperation(undefined);
      setActiveStoryId(undefined);
    }
  }

  /** Resolves true once the stories left production; false when cancelled or refused. */
  async function handleUnselectStories(storyIds: string[]): Promise<boolean> {
    if (storyIds.length === 0) return false;

    const single = storyIds.length === 1;
    if (
      !window.confirm(
        single
          ? "Remove this story from production? It stays collected with its AI evaluation, drafts and publication records, and you can approve it again later. A Today run preparing it stops instead of selecting it again."
          : `Remove ${storyIds.length} stories from production? They stay collected with their AI evaluation, drafts and publication records, and you can approve them again later. Today runs preparing them stop instead of selecting them again.`,
      )
    ) {
      return false;
    }

    let unselected = false;
    await runOperation("unselect", async () => {
      const result = await unselectStories(secret, selectedTopicId, storyIds);
      unselected = true;
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);

      setStats(nextStats);
      setSelectedStoryIds([]);
      return {
        tone: "success",
        title: "Selection cleared",
        message: `${result.unselectedStories} ${result.unselectedStories === 1 ? "story was" : "stories were"} returned to the collected review queue.`,
      };
    });
    return unselected;
  }

  function handlePromoteReviewCandidate(
    storyId: string,
    title: string,
    decision?: "reject" | "review" | "shortlist",
  ) {
    if (!canAuthenticate || isBusy) return;
    const candidate = stats?.editorial?.collectedStories.find((story) => story.storyId === storyId);
    if (!candidate) return;
    setPendingPromotion({
      topicId: selectedTopicId,
      storyId,
      title,
      isOriginalContent: candidate.isOwnedContent,
      duplicateStoryId: candidate.duplicateOfStoryId ?? null,
      duplicateTitle: candidate.duplicateOfTitle,
      aiDecision: decision,
    });
  }

  async function confirmPromotion() {
    const pending = pendingPromotion;
    if (!pending || !canAuthenticate || isBusy || selectedTopicIdRef.current !== pending.topicId) return;
    const aiDecisionLabel = pending.aiDecision === "reject" ? "Reject" : "Review";

    setActiveOperation("promote");
    setActiveStoryId(pending.storyId);
    setNotice(undefined);

    try {
      if (pending.isOriginalContent) {
        await selectOriginalContent(secret, pending.topicId, pending.storyId, pending.duplicateStoryId);
      } else {
        await promoteReviewCandidate(secret, pending.topicId, pending.storyId);
      }
      let refreshFailed = false;
      try {
        const nextStats = await fetchDatabaseStats(secret, pending.topicId);
        if (selectedTopicIdRef.current === pending.topicId) setStats(nextStats);
      } catch {
        refreshFailed = true;
      }
      setNotice({
        tone: "success",
        title: "Story promoted to Selected",
        message: (pending.isOriginalContent
          ? `Your approval is recorded.${pending.duplicateStoryId ? " The duplicate flag was cleared." : ""} This Story is ready for Production.`
          : `Your human approval is recorded. The original AI decision remains ${aiDecisionLabel} for context.`) +
          (refreshFailed ? " The list could not refresh; reload the page to see the update." : ""),
      });
      setPendingPromotion(undefined);
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

  async function handleClearDuplicateFlag(storyId: string, title: string) {
    if (!canAuthenticate || isBusy) return;
    if (
      !window.confirm(
        `Mark “${title}” as not a duplicate? This permanently excludes it from future duplicate matching for this topic and returns it to the AI evaluation queue.`,
      )
    ) {
      return;
    }

    setActiveOperation("clear-duplicate");
    setActiveStoryId(storyId);
    setNotice(undefined);

    try {
      await clearDuplicateFlag(secret, selectedTopicId, storyId);
      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);
      setStats(nextStats);
      setNotice({
        tone: "success",
        title: "Duplicate flag cleared",
        message: "The story will be evaluated the next time this topic runs.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Duplicate flag could not be cleared",
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

  async function handleOpenManualStory(topicId: string, storyId: string) {
    if (!canAuthenticate || isBusy) return;
    if (topicId !== selectedTopicId && !handleTopicChange(topicId)) return;
    setActiveOperation("view");
    setActiveStoryId(storyId);
    setNotice(undefined);
    try {
      setContentViewer(await fetchStoryContent(secret, topicId, storyId));
    } catch (error) {
      setNotice({ tone: "error", title: "Content could not be loaded", message: getErrorMessage(error) });
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
        try {
          await upsertStoryPublication(secret, selectedTopicId, storyId, {
            platform,
            status,
          });
        } catch (error) {
          const message = getErrorMessage(error);
          if (
            /same news event/i.test(message) &&
            window.confirm(`${message}\n\nPublish it anyway?`)
          ) {
            await upsertStoryPublication(secret, selectedTopicId, storyId, {
              platform,
              status,
              overrideDuplicate: true,
            });
          } else {
            throw error;
          }
        }
      } else {
        await clearStoryPublication(secret, selectedTopicId, storyId, platform);
      }

      const nextStats = await fetchDatabaseStats(secret, selectedTopicId);
      const updatedStory = nextStats.editorial.selectedStories.find((story) => story.storyId === storyId);
      const updatedStage = updatedStory ? storyPublicationStage(updatedStory) : undefined;

      setStats(nextStats);
      setNotice({
        tone: "success",
        title: `${formatPublicationPlatform(platform)} tracking updated`,
        message: status === "published" && updatedStage
          ? updatedStage.active
            ? updatedStage.pendingPlatforms.length
              ? `${formatPublicationPlatform(platform)} is marked published. This Story stays in Production while ${updatedStage.pendingPlatforms.map((item) => formatPublicationPlatform(item as PublicationPlatform)).join(", ")} is pending.`
              : `${formatPublicationPlatform(platform)} is marked published. Check its publication records if it still appears in Production.`
            : `${formatPublicationPlatform(platform)} is marked published. This Story moved to Published.`
          : status
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

    if (!window.confirm(`Clear ${selectedTopic?.name ?? "this Topic"}'s editorial work and collect again? Existing creative briefs, drafts, generated asset records, and manual publication marks will be removed. Collection may fail after the clear.`)) return;

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
          ? "The data was cleared, but the new collection failed. Use ‘Search candidates’ to try again."
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
      return true;
    }

    // Signed in, a brand that has not finished its guided setup opens the setup instead.
    if (account && topics.find((topic) => topic.id === topicId)?.ready !== true) {
      router.push(`/?topicId=${encodeURIComponent(topicId)}`);
      return true;
    }

    if (
      preferencesDirty &&
      !window.confirm(
        "You have unsaved preferences for this topic. Switch topics without saving them?",
      )
    ) {
      return false;
    }

    selectedTopicIdRef.current = topicId;
    setPendingPromotion(undefined);
    setSelectedTopicId(topicId);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("topicId", topicId);
    window.history.replaceState(null, "", nextUrl.toString());
    setIsTopicLoading(canAuthenticate);
    setStats(undefined);
    setSelectedStoryIds([]);
    setContentViewer(undefined);
    setSelectedCreativeProfile(undefined);
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
    return true;
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
    } finally {
      if (selectedTopicIdRef.current === topicId) {
        setIsTopicLoading(false);
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
    <main
      className={styles.appShell}
      style={selectedCreativeProfile
        ? topicThemeStyle(selectedTopic?.themeKey, selectedCreativeProfile)
        : selectedTopicId === initialTopicId
          ? initialThemeStyle
          : topicThemeStyle(selectedTopic?.themeKey)}
    >
      <aside
        ref={sidebarRef}
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}
        aria-label="Primary navigation"
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>
            <span className={styles.logo} aria-hidden="true">
              <span />
            </span>
            <h1>Press Craftor</h1>
          </div>
          <button
            type="button"
            className={styles.closeSidebarButton}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            ×
          </button>
          <button type="button" className={styles.collapseSidebarButton} onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}>{sidebarCollapsed ? "›" : "‹"}</button>
        </div>

        <div className={styles.sidebarTopic}>
          {sidebarCollapsed ? (
            <button type="button" className={styles.sidebarTopicAvatar} onClick={() => setSidebarCollapsed(false)} aria-label={`${selectedTopicName}: expand the menu to switch brands`} title={selectedTopicName}>
              {selectedTopicName.slice(0, 1).toUpperCase()}
            </button>
          ) : <>
            <label className={styles.sidebarTopicPicker}>
              <span className={styles.sidebarTopicAvatar} aria-hidden="true">{selectedTopicName.slice(0, 1).toUpperCase()}</span>
              <select value={selectedTopicId} onChange={(event) => { if (handleTopicChange(event.target.value)) setSidebarOpen(false); }} disabled={isBusy || isTopicLoading} aria-label="Current brand">
                {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
              <span className={isTopicLoading ? styles.topicLoadingIndicator : styles.sidebarTopicChevron} aria-hidden="true">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                  {isTopicLoading ? <path d="M10 3a7 7 0 1 1-7 7" /> : <path d="m5 7.5 5 5 5-5" />}
                </svg>
              </span>
            </label>
            <a href="#topics" className={styles.sidebarTopicSettings} onClick={() => setSidebarOpen(false)}>Brand settings</a>
          </>}
        </div>

        <nav className={styles.sidebarNav} aria-label="Sections">
          <p className={styles.navLabel}>Daily work</p>
          {([
            ["#today", "Today", "today"],
            ["#discover", "Discover", "discover"],
            ["#production", "Production", "production"],
            ["#publications", "Publications", "publications"],
            ["#results", "Results", "results"],
          ] as const).map(([hash, label, icon]) => {
            const view = dashboardViewFromHash(hash);
            return (
              <a key={hash} href={hash} className={activeView === view ? styles.navActive : undefined} aria-current={activeView === view ? "page" : undefined} aria-label={label} title={sidebarCollapsed ? label : undefined} onClick={() => setSidebarOpen(false)}>
                <span className={styles.navIcon} aria-hidden="true"><NavGlyph name={icon} /></span>
                <span>{label}</span>
                {view === "production" && productionStories.length > 0 ? <span className={styles.navBadge} aria-label={`${productionStories.length} active selected stories`}>{productionStories.length}</span> : null}
                {view === "today" && urgentCount > 0 ? <span className={`${styles.navBadge} ${styles.navBadgeUrgent}`} aria-label={`${urgentCount} urgent ${urgentCount === 1 ? "story" : "stories"}`}>{urgentCount}</span> : null}
              </a>
            );
          })}
          <p className={styles.navLabel}>Brand</p>
          {([
            ["#identity", "Creative identity", "identity"],
            ["#strategy", "Editorial strategy", "strategy"],
            ["#sources", "Sources", "sources"],
            ["#channels", "Channels", "channels"],
          ] as const).map(([hash, label, icon]) => {
            const view = dashboardViewFromHash(hash);
            return (
              <a key={hash} href={hash} className={activeView === view ? styles.navActive : undefined} aria-current={activeView === view ? "page" : undefined} aria-label={label} title={sidebarCollapsed ? label : undefined} onClick={() => setSidebarOpen(false)}>
                <span className={styles.navIcon} aria-hidden="true"><NavGlyph name={icon} /></span>
                <span>{label}</span>
              </a>
            );
          })}
        </nav>
        <nav className={styles.sidebarBottomNav} aria-label="More options">
          <Link href={`/help?topicId=${encodeURIComponent(selectedTopicId)}`} onClick={() => setSidebarOpen(false)} aria-label="Help" title={sidebarCollapsed ? "Help" : undefined}><span className={styles.navIcon} aria-hidden="true"><NavGlyph name="help" /></span><span>Help</span></Link>
          <a href="#admin" className={activeView === "admin" ? styles.navActive : undefined} aria-current={activeView === "admin" ? "page" : undefined} onClick={() => setSidebarOpen(false)} aria-label="Administration" title={sidebarCollapsed ? "Administration" : undefined}><span className={styles.navIcon} aria-hidden="true"><NavGlyph name="admin" /></span><span>Administration</span></a>
        </nav>

        <div className={styles.sidebarFooter}>
          <p>Press Craftor · Editorial studio</p>
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

      {newStoryOpen ? (
        <NewStoryDialog
          topics={topics}
          initialTopicId={selectedTopicId}
          defaultLanguage={selectedCreativeProfile?.language}
          defaultRegion={selectedCreativeProfile?.region}
          secret={panelSecret}
          onClose={() => setNewStoryOpen(false)}
          onCreated={handleStoryCreated}
        />
      ) : null}

      {addSourceOpen ? (
        <AddSourceDialog
          topics={topics}
          initialTopicId={selectedTopicId}
          secret={panelSecret}
          onClose={() => setAddSourceOpen(false)}
          onCreated={handleSourceAdded}
        />
      ) : null}

      {pendingPromotion ? (
        <Dialog
          eyebrow="Editorial decision"
          title={pendingPromotion.isOriginalContent ? "Select original content" : "Promote to Selected"}
          onClose={() => setPendingPromotion(undefined)}
          canClose={activeOperation !== "promote"}
          footer={<ActionRow>
            <Button variant="secondary" data-initial-focus="" onClick={() => setPendingPromotion(undefined)} disabled={activeOperation === "promote"}>Cancel</Button>
            <Button variant="primary" onClick={() => void confirmPromotion()} busy={activeOperation === "promote"}>Select story</Button>
          </ActionRow>}
        >
          <p><strong>{pendingPromotion.title}</strong></p>
          <p>{pendingPromotion.isOriginalContent
            ? `The AI marked this original Story for ${pendingPromotion.aiDecision === "reject" ? "rejection" : pendingPromotion.aiDecision === "review" ? "review" : "editorial review"}, so it was not selected automatically. Your approval will move it to Production.`
            : `Your approval will move this Story to Selected. The AI ${pendingPromotion.aiDecision === "reject" ? "Reject" : "Review"} decision remains in its history.`}</p>
          {pendingPromotion.duplicateStoryId ? <p>Possible duplicate: {pendingPromotion.duplicateTitle ?? "another Story"}. Select only if these are distinct Stories; this clears the duplicate flag.</p> : null}
          {notice?.tone === "error" ? <p role="alert">{notice.message}</p> : null}
        </Dialog>
      ) : null}

      <div className={styles.appMain}>
        <header className={styles.topbar}>
          <div className={styles.topbarPrimary}>
            <div className={styles.topbarLeft}>
              <button ref={menuButtonRef} type="button" className={styles.menuButton} onClick={() => setSidebarOpen(true)} aria-label="Open menu" aria-expanded={sidebarOpen}>
                <span /><span /><span />
              </button>
            </div>
            <div className={styles.topbarGlobalActions}>
              {stats ? (
                <>
                  <div className={styles.splitAction} role="group" aria-label="Create content">
                    <button type="button" className={styles.newStoryButton} onClick={() => setNewStoryOpen(true)} disabled={!canAuthenticate || isTopicLoading || topics.length === 0}>＋ New story</button>
                    <DisclosureActionMenu label="More creation actions" className={styles.actionMenu} panelClassName={styles.actionMenuItems} iconClassName={styles.actionMenuChevron}>
                      <button type="button" onClick={() => setAddSourceOpen(true)}>Add source</button>
                      <button type="button" onClick={() => { setNewTopicNonce((current) => current + 1); window.location.hash = "#topics"; }}>New brand</button>
                      <a href="#topics">All brands</a>
                    </DisclosureActionMenu>
                  </div>
                  <a className={styles.topbarActionLink} href="#today">Today</a>
                  <DemoCreditIndicator secret={panelSecret} />
                  {account ? <AccountMenu account={account} /> : <div className={styles.topbarSession}>
                    <span className={`${styles.topbarStatus} ${styles.online}`} role="status" aria-label="Connected" title="Connected" />
                    <button type="button" className={styles.disconnectButton} onClick={handleDisconnect} disabled={isBusy} aria-label="Disconnect" title="Disconnect">
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M6 2.5H3.5A1.5 1.5 0 0 0 2 4v8a1.5 1.5 0 0 0 1.5 1.5H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M10 5l3 3-3 3M13 8H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>}
                </>
              ) : account ? (
                <AccountMenu account={account} />
              ) : (
                <form className={styles.secretControl} onSubmit={(event) => { event.preventDefault(); void handleConnect(); }}>
                  <label className={styles.secretField}><span>Collector secret</span><input type="password" aria-label="Collector secret" value={secret} onChange={(event) => { setSecret(event.target.value); setStats(undefined); }} placeholder="Paste secret" autoComplete="off" spellCheck={false} /></label>
                  <button type="submit" className={styles.secretConnectButton} disabled={!canAuthenticate || isBusy}>{activeOperation === "status" ? "Connecting…" : "Connect"}</button>
                  <span className={`${styles.topbarStatus} ${styles.idle}`} role="status" aria-label="Not connected" title="Not connected" />
                </form>
              )}
            </div>
          </div>
          <div className={styles.contextBar}>
            <div className={styles.contextHeading}>
              <span>{activeView === "topics" || activeView === "admin" ? "Workspace" : <>{selectedTopicName} · {activeView === "today" || activeView === "discover" || activeView === "production" || activeView === "publications" || activeView === "results" ? "Daily work" : "Brand"}</>}</span>
              <strong>{DASHBOARD_VIEW_TITLES[activeView]}</strong>
            </div>
            {contextTabs.length > 0 ? <nav className={styles.contextTabs} aria-label={`${DASHBOARD_VIEW_TITLES[activeView]} options`}>
              {contextTabs.map(([hash, label]) => {
                const current = activeNavHash === hash || (hash === "#discover" && ["#stories", "#stories/collected"].includes(activeNavHash)) || (hash === "#discover/search" && activeNavHash === "#collect") || (hash === "#strategy" && activeNavHash === "#editorial") || (hash === "#creative-profile-identity" && ["#identity", "#editorial-creative"].includes(activeNavHash)) || (hash === "#sources/rss" && activeNavHash === "#sources") || (hash === "#publications/history" && activeNavHash === "#editorial-instagram") || (hash === "#admin" && activeNavHash === "#settings");
                return <a key={hash} href={hash} className={current ? styles.contextTabActive : undefined} aria-current={current ? "page" : undefined}>{label}</a>;
              })}
            </nav> : null}
            <div className={styles.contextActions}>
              {activeView === "discover" && stats ? <a className={styles.contextSelectedLink} href="#production" aria-label={`Open ${productionStories.length} active selected stories in Production`}>Selected <span>{productionStories.length}</span> →</a> : null}
              {activeView === "sources" && stats ? <button type="button" className={styles.contextPrimaryAction} onClick={() => setAddSourceOpen(true)} disabled={!canAuthenticate || isTopicLoading}>＋ Add source</button> : null}
            </div>
          </div>
        </header>

        <div className={styles.page}>
          <div
            className={`${styles.shell} ${isTopicLoading ? styles.topicSwitching : ""}`}
            aria-busy={isTopicLoading}
            aria-label={isTopicLoading ? `Loading ${selectedTopicName}` : undefined}
          >

        <section id="overview" className={styles.anchorTarget} hidden={activeView !== "today"}>
          <UrgentStoriesBanner key={`urgent-${selectedTopicId}`} topicId={selectedTopicId} secret={panelSecret} onCountChange={setUrgentCount} onOpenStory={(storyId, preparationRunId) => openCreativeStory(storyId, { preparationRunId, tab: "script" })} />
          <DailyPreparationPanel onOpenDraft={(storyId,_title,draftId,preparationRunId)=>openCreativeStory(storyId,{draftId,preparationRunId,tab:"script"})} onUnselect={(storyId)=>handleUnselectStories([storyId])} key={`daily-${selectedTopicId}`} topicId={selectedTopicId} secret={panelSecret} disabled={!canAuthenticate || isBusy || isTopicLoading} refreshKey={stats} onViewContent={handleViewContent} onPrepareContent={handlePrepareContent} onSelect={handlePlannerSelect} preparingStoryId={activeOperation === "prepare" ? activeStoryId : undefined} onCompleted={()=>{void fetchDatabaseStats(secret,selectedTopicId).then(setStats).catch(()=>{});}} />
          <DailyEditorialPlannerPanel key={`planner-${selectedTopicId}`} topicId={selectedTopicId} secret={panelSecret} disabled={!canAuthenticate || isBusy} refreshKey={stats} onViewContent={handleViewContent} onPrepareContent={handlePrepareContent} onSelect={handlePlannerSelect} preparingStoryId={activeOperation === "prepare" ? activeStoryId : undefined} />
          <TopicOverviewPanel
            key={selectedTopicId}
            secret={panelSecret}
            topicId={selectedTopicId}
            topicName={selectedTopic?.name ?? "this topic"}
            topicDescription={selectedTopic?.description}
            disabled={isBusy || isTopicLoading}
          />
        </section>

        <div id="topics" className={styles.anchorTarget} hidden={activeView !== "topics"}>
          <TopicConfigurationPanel
            key={`topics-${newTopicNonce}`}
            view="topics"
            initialCreateTopic={newTopicNonce > 0}
            catalog={sourceCatalog}
            catalogError={sourceCatalogError}
            topics={topics}
            selectedTopicId={selectedTopicId}
            secret={panelSecret}
            disabled={isBusy}
            onTopicsChange={setTopics}
            onTopicChange={handleTopicChange}
            onCandidateCreated={() => {
              void fetchDatabaseStats(secret, selectedTopicId)
                .then(setStats)
                .catch(() => undefined);
            }}
          />
        </div>

        {(["rss", "ai", "documents", "manual"] as const satisfies readonly TopicConfigurationView[]).map((view) => (
          <div id={`sources/${view}`} className={styles.anchorTarget} key={view} hidden={activeView !== "sources" || (activeNavHash === "#sources" ? view !== "rss" : activeNavHash !== `#sources/${view}`)}>
            <TopicConfigurationPanel
              view={view}
              catalog={sourceCatalog}
              catalogError={sourceCatalogError}
              topics={topics}
              selectedTopicId={selectedTopicId}
              secret={panelSecret}
              disabled={isBusy}
              onTopicsChange={setTopics}
              onTopicChange={handleTopicChange}
              onNewStory={() => setNewStoryOpen(true)}
              onOpenStory={(topicId, storyId) => { void handleOpenManualStory(topicId, storyId); }}
              onCandidateCreated={() => {
                void fetchDatabaseStats(secret, selectedTopicId)
                  .then(setStats)
                  .catch(() => undefined);
              }}
            />
          </div>
        ))}

        <div id="editorial" className={styles.anchorTarget} hidden={activeView !== "strategy" || !["#strategy", "#editorial"].includes(activeNavHash)}>
          <EditorialProfilePanel
            topicId={selectedTopicId}
            secret={panelSecret}
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

        <div id="editorial-lenses" className={styles.anchorTarget} hidden={activeView !== "strategy" || activeNavHash !== "#editorial-lenses"}>
          <AcquisitionLensesPanel
            key={selectedTopicId}
            topicId={selectedTopicId}
            secret={panelSecret}
            disabled={isBusy}
          />
        </div>

        <div id="editorial-lines" className={styles.anchorTarget} hidden={activeView !== "strategy" || activeNavHash !== "#strategy/lines"}>
          <EditorialLinesPanel key={`strategy-${selectedTopicId}`} topicId={selectedTopicId} secret={panelSecret} disabled={isBusy} manageOnly refreshKey={lineRefresh} onLoaded={setLineData} />
        </div>

        <div id="strategy-automation" className={styles.anchorTarget} hidden={activeView !== "strategy" || activeNavHash !== "#strategy/automation"}>
          <AutoCollectionPanel key={`automation-${selectedTopicId}`} topicId={selectedTopicId} secret={panelSecret} disabled={isBusy} onOpenStory={(storyId, preparationRunId) => openCreativeStory(storyId, { preparationRunId, tab: "script" })} />
        </div>

        <div id="editorial-creative" className={styles.anchorTarget} hidden={activeView !== "identity"}>
          <CreativeProfilePanel
            key={selectedTopicId}
            section={activeNavHash === "#creative-profile-voice" ? "voice" : ["#creative-profile-brand", "#creative-profile-carousel"].includes(activeNavHash) ? "visual" : activeNavHash === "#creative-profile-characters" ? "assets" : "profile"}
            topicId={selectedTopicId}
            secret={panelSecret}
            disabled={isBusy}
            onProfileLoaded={acceptSelectedCreativeProfile}
            onProfileSaved={acceptSelectedCreativeProfile}
          />
        </div>

        <div id="editorial-meta" className={styles.anchorTarget} hidden={activeView !== "channels"}>
          <MetaConnectionPanel
            key={selectedTopicId}
            topicId={selectedTopicId}
            secret={panelSecret}
            disabled={isBusy}
            onConnectionChanged={() => setMetaRefreshToken((n) => n + 1)}
          />
        </div>

        <div id="editorial-facebook" className={styles.anchorTarget} hidden={activeView !== "channels"}>
          <FacebookConnectionPanel
            key={`facebook-${selectedTopicId}`}
            topicId={selectedTopicId}
            secret={panelSecret}
            disabled={isBusy}
            selectionId={facebookSelection?.topicId === selectedTopicId ? facebookSelection.selectionId : undefined}
            onSelectionHandled={clearFacebookSelection}
          />
        </div>

        <div id="editorial-instagram" className={styles.anchorTarget} hidden={activeView !== "results" && !(activeView === "publications" && ["#editorial-instagram", "#publications/history"].includes(activeNavHash))}>
          <InstagramGalleryPanel
            key={selectedTopicId}
            topicId={selectedTopicId}
            secret={panelSecret}
            disabled={isBusy}
            refreshToken={metaRefreshToken}
            onLinked={() => setMetaRefreshToken(n => n + 1)}
          />
        </div>

        <div id="collect" className={styles.anchorTarget} hidden={activeView !== "discover" || !["#discover/search", "#collect"].includes(activeNavHash)}>
          <form className={`${styles.panel} ${styles.discoverSearchPanel}`} role="search" aria-labelledby="discover-search-heading" onSubmit={(event) => { event.preventDefault(); void handleCollect(); }}>
            <div className={styles.discoverSearchHeading}>
              <div><h2 id="discover-search-heading">Search</h2><p>Find new candidates for this Topic.</p></div>
              <a href="#discover">View {stats?.editorial?.collectedStories.length ?? 0} candidates →</a>
            </div>

            <EditorialLinesPanel key={selectedTopicId} topicId={selectedTopicId} secret={panelSecret} disabled={isBusy} refreshKey={lineRefresh} onSelection={setLineSelection} onLoaded={setLineData}/>
            <div className={styles.buttonRow}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!canAuthenticate || isBusy || lineSelection?.topicId!==selectedTopicId || Boolean(lineSelection?.period && periodError(lineSelection.period))}
              >
                {activeOperation === "collect"
                  ? "Searching…"
                  : "Search candidates"}
              </button>
            </div>
          </form>
        </div>

        <div id="activity" className={styles.anchorTarget} hidden={activeView !== "admin" || activeNavHash !== "#admin/activity"}>
          <ActivityPanel secret={panelSecret} topics={topics} active={activeView === "admin" && activeNavHash === "#admin/activity"} />
        </div>

        <div id="settings" className={styles.anchorTarget} hidden={activeView !== "admin" || activeNavHash === "#admin/activity"}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionNumber}>01</p>
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

        <section id="preferences" className={`${styles.panel} ${styles.preferencesPanel} ${styles.anchorTarget}`} hidden={activeView !== "strategy" || activeNavHash !== "#preferences"}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.sectionNumber}>01</p>
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
                ? `Preferences saved · ${formatUtcDate(preferencesUpdatedAt)}`
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

        <div id="optimization" className={styles.anchorTarget} hidden={activeView !== "discover" || activeNavHash !== "#optimization"}>
          <OptimizationPanel run={stats?.latestCollectionRun} />
        </div>

        <section className={styles.workQueue} hidden={activeView !== "production"} aria-label="Stories in production">
          <div className={styles.queueHeading}>
            <div><p className={styles.kicker}>Production</p><h2>Selected · ready to work</h2></div>
            <span>{countLabel(productionStories.length, "story", "stories")}</span>
          </div>
          <p className={styles.queueIntro}>Approved stories stay here until their recorded destinations are published. If you posted outside Press Craftor, mark that destination as published below. A Story stays here while another destination is pending.</p>
          {productionStories.length ? (
            <div className={styles.queueList}>
              {productionStories.map((story) => {
                const associations = lineData?.topicId === selectedTopicId ? lineData.associations : [];
                const lineNames = [...new Set(associations.filter((item) => item.storyId === story.storyId).map((item) => item.context.name))];
                const publicationStage = storyPublicationStage(story);
                return <article className={styles.queueItem} key={story.storyId}>
                  <div><span className={styles.queueMeta}>{lineNames.length ? `${lineNames.join(", ")} · ` : ""}{story.sourceName} · {story.contentStatus === "missing" ? "Content missing" : story.contentStatus === "excerpt" ? "Excerpt only" : "Content available"}</span><h3>{story.title}</h3><p>{story.reason}</p>{publicationStage.pendingPlatforms.length ? <p className={styles.queueProgress}>Pending: {publicationStage.pendingPlatforms.map((platform) => formatPublicationPlatform(platform as PublicationPlatform)).join(", ")}{publicationStage.publishedDestinations.length ? ` · Published: ${publicationStage.publishedDestinations.map((publication) => formatPublicationPlatform(publication.platform as PublicationPlatform)).join(", ")}` : ""}</p> : null}</div>
                  <div className={styles.queueActions}>
                    <Button size="compact" onClick={() => { void handleViewContent(story.storyId); }} disabled={!canAuthenticate || isBusy}>Content</Button>
                    <Button size="compact" variant="primary" onClick={() => openCreativeStory(story.storyId, { tab: "script" })} disabled={!canAuthenticate || isBusy}>Open draft workspace</Button>
                    <details className={styles.queuePublicationDetails}>
                      <summary>Mark as published</summary>
                      <PublicationQuickControl
                        storyId={story.storyId}
                        publications={story.publications}
                        defaultStatus="published"
                        disabled={!canAuthenticate || isBusy}
                        isUpdating={activeOperation === "publication" && activeStoryId === story.storyId}
                        onUpdate={handlePublicationUpdate}
                      />
                    </details>
                    <Button size="compact" variant="quiet" onClick={() => { void handleUnselectStories([story.storyId]); }} disabled={!canAuthenticate || isBusy}>Unselect</Button>
                  </div>
                </article>;
              })}
            </div>
          ) : <div className={styles.queueEmpty}><strong>No active selected stories.</strong><p>{publishedStories.length ? "Completed stories are in Published. Select another candidate to start a new draft." : "Evaluate and approve a candidate to start production."}</p><a href={publishedStories.length ? "#publications/published" : "#discover"}>{publishedStories.length ? "View Published →" : "Go to Discover →"}</a></div>}
        </section>

        <div id="stories" className={styles.anchorTarget} hidden={!(activeView === "production" || (activeView === "discover" && !["#optimization", "#discover/search", "#collect"].includes(activeNavHash)))}>
          <StoryReviewDisclosure production={activeView === "production"} selectedCount={productionStories.length}>
          <EditorialEvaluationPanel
            key={`${selectedTopicId}:${activeView}`}
            topicId={selectedTopicId}
            initialTab={activeView === "production" ? "selected" : "collected"}
            editorial={stats?.editorial}
            lineData={lineData?.topicId===selectedTopicId?lineData:undefined}
            canEvaluate={canAuthenticate && !isBusy}
            isEvaluating={activeOperation === "evaluate"}
            onEvaluate={handleEvaluate}
            selectedStoryIds={selectedStoryIds}
            canReview={canAuthenticate && !isBusy}
            isReviewing={
              activeOperation === "review" || activeOperation === "unselect"
            }
            onToggleStory={toggleStorySelection}
            onToggleAll={toggleAllShortlistStories}
            onReview={handleReview}
            onUnselect={handleUnselectStories}
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
            canClearDuplicate={canAuthenticate && !isBusy}
            clearingDuplicateStoryId={
              activeOperation === "clear-duplicate" ? activeStoryId : undefined
            }
            onClearDuplicate={handleClearDuplicateFlag}
            canTrackPublications={canAuthenticate && !isBusy}
            updatingPublicationStoryId={
              activeOperation === "publication" ? activeStoryId : undefined
            }
            onUpdatePublication={handlePublicationUpdate}
            onOpenCreativeStory={(storyId, title, editorialRunId) => {
              void title;
              openCreativeStory(storyId, { editorialRunId, tab: "focus" });
            }}
          />
          </StoryReviewDisclosure>
        </div>

        <section className={styles.workQueue} hidden={activeView !== "publications" || activeNavHash !== "#publications"} aria-label="Pending publications">
          <div className={styles.queueHeading}><div><p className={styles.kicker}>Instagram</p><h2>Review before publishing</h2></div><span>{countLabel(pendingInstagramStories.length, "story", "stories")} without an Instagram publication record</span></div>
          <p className={styles.queueIntro}>Open the studio to check the script, images, and destination account before authorizing publication.</p>
          {pendingInstagramStories.length > 0 ? <div className={styles.queueList}>
            {pendingInstagramStories.map((story) => (
              <article className={styles.queueItem} key={story.storyId}>
                <div><span className={styles.queueMeta}>{story.sourceName}</span><h3>{story.title}</h3></div>
                <Button size="compact" variant="primary" onClick={() => openCreativeStory(story.storyId, { tab: "publication" })} disabled={!canAuthenticate || isBusy}>Review publication</Button>
              </article>
            ))}
          </div> : <div className={styles.queueEmpty}><strong>No selected stories pending for Instagram.</strong><p>Linked and tracked publications appear in Published.</p><a href="#publications/published">View Published →</a></div>}
        </section>

        <section className={styles.workQueue} hidden={activeView !== "publications" || activeNavHash !== "#publications/published"} aria-label="Published stories">
          <div className={styles.queueHeading}><div><p className={styles.kicker}>Publications</p><h2>Published stories</h2></div><span>{countLabel(publishedStories.length, "story", "stories")}</span></div>
          <p className={styles.queueIntro}>Stories with a confirmed Instagram post or a platform marked published in manual tracking. Editorial approval and draft history remain available.</p>
          {publishedStories.length ? <div className={styles.queueList}>
            {publishedStories.map((story) => {
              const stage = storyPublicationStage(story);
              return <article className={styles.queueItem} key={story.storyId}>
                <div className={styles.queuePublishedBody}>
                  <PublishedStoryThumbnail key={(story.publicationThumbnails ?? []).join(" ")} urls={story.publicationThumbnails ?? []} title={story.title} />
                  <div>
                    <span className={styles.queueMeta}>{story.sourceName}{stage.active ? " · Still in Production for another destination" : ""}</span>
                    <h3>{story.title}</h3>
                    <div className={styles.queuePublishedDestinations} aria-label="Published destinations">
                      {stage.publishedDestinations.map((publication) => {
                        const label = `${formatPublicationPlatform(publication.platform as PublicationPlatform)} · ${publication.source === "manual" ? "Marked published" : "Confirmed"}${publication.publishedAt ? ` · ${formatTableDate(String(publication.publishedAt))}` : ""}`;
                        return publication.postUrl ? <a key={publication.platform} href={publication.postUrl} target="_blank" rel="noopener noreferrer" aria-label={`View ${label} post in a new tab`}>{label} ↗</a> : <span key={publication.platform}>{label}</span>;
                      })}
                    </div>
                  </div>
                </div>
                <Button size="compact" onClick={() => openCreativeStory(story.storyId, { tab: "publication" })} disabled={!canAuthenticate || isBusy}>Open Story</Button>
              </article>;
            })}
          </div> : <div className={styles.queueEmpty}><strong>No published stories yet.</strong><p>When a selected Story is published and linked, it will appear here.</p><a href="#publications">Review publications →</a></div>}
        </section>

        {contentViewer ? (
          <StoryContentViewer
            key={`${selectedTopicId}:${contentViewer.storyId}`}
            content={contentViewer}
            secret={panelSecret}
            topicId={selectedTopicId}
            onSaved={setContentViewer}
            onClose={() => setContentViewer(undefined)}
          />
        ) : null}

        {notice ? (
          <div
            className={`${styles.notice} ${
              notice.tone === "success" ? styles.noticeSuccess : styles.noticeError
            }`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            <span aria-hidden="true">{notice.tone === "success" ? "✓" : "!"}</span>
            <div>
              <strong>{notice.title}</strong>
              <p>{notice.message}</p>
            </div>
          </div>
        ) : null}

        <section className={`${styles.panel} ${styles.dangerPanel}`} hidden={activeView !== "admin" || activeNavHash === "#admin/activity"}>
          <div className={styles.dangerCopy}>
            <p className={styles.sectionNumber}>06 · Danger zone</p>
            <h2>Clear or regenerate data</h2>
            <p>
              This clears the selected Topic&rsquo;s Story selections, creative
              briefs and draft versions, generated asset records, collection
              and evaluation runs, and manual publication marks. Topic settings,
              source catalogs, canonical Story records, and database structure
              remain. A new collection can fail after the clear.
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
          Search candidates to see collection metrics here.
        </div>
      )}
    </section>
  );
}

function StoryReviewDisclosure({ production, selectedCount, children }: {
  production: boolean;
  selectedCount: number;
  children: React.ReactNode;
}) {
  if (!production) return <>{children}</>;
  return <details className={styles.productionReviewDetails}>
    <summary>Advanced review · {selectedCount} selected {selectedCount === 1 ? "Story" : "Stories"}</summary>
    <p>The detailed evaluation table, filters, and bulk selection actions are here when you need them.</p>
    {children}
  </details>;
}

function EditorialEvaluationPanel({
  topicId, editorial, lineData, initialTab,
  canEvaluate,
  isEvaluating,
  onEvaluate,
  selectedStoryIds,
  canReview,
  isReviewing,
  onToggleStory,
  onToggleAll,
  onReview,
  onUnselect,
  canPrepare,
  preparingStoryId,
  viewingStoryId,
  onPrepareContent,
  onViewContent,
  canPromote,
  promotingStoryId,
  onPromote,
  canClearDuplicate,
  clearingDuplicateStoryId,
  onClearDuplicate,
  canTrackPublications,
  updatingPublicationStoryId,
  onUpdatePublication,
  onOpenCreativeStory,
}: {
  topicId: string;
  editorial?: EditorialDashboardStats;
  initialTab: "collected" | "selected";
  lineData?: EditorialLinesData;
  canEvaluate: boolean;
  isEvaluating: boolean;
  onEvaluate: (force?: boolean) => void;
  selectedStoryIds: string[];
  canReview: boolean;
  isReviewing: boolean;
  onToggleStory: (storyId: string) => void;
  onToggleAll: (storyIds: readonly string[]) => void;
  onReview: (decision: "approved" | "rejected") => void;
  onUnselect: (storyIds: string[]) => void;
  canPrepare: boolean;
  preparingStoryId?: string;
  viewingStoryId?: string;
  onPrepareContent: (storyId: string) => void;
  onViewContent: (storyId: string) => void;
  canPromote: boolean;
  promotingStoryId?: string;
  onPromote: (
    storyId: string,
    title: string,
    decision: EditorialTableStory["evaluationDecision"],
  ) => void;
  canClearDuplicate: boolean;
  clearingDuplicateStoryId?: string;
  onClearDuplicate: (storyId: string, title: string) => void;
  canTrackPublications: boolean;
  updatingPublicationStoryId?: string;
  onUpdatePublication: (
    storyId: string,
    platform: PublicationPlatform,
    status?: PublicationStatus,
  ) => void;
  onOpenCreativeStory: (storyId: string, title: string, editorialRunId?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"collected" | "selected">(
    initialTab,
  );
  const [collectedTableState, setCollectedTableState] =
    useState<StoryTableViewState>(() => createStoryTableViewState("collected"));
  const [selectedTableState, setSelectedTableState] =
    useState<StoryTableViewState>(() => createStoryTableViewState("selected"));
  const [lineFilter,setLineFilter]=useState("");
  const [candidateView, setCandidateView] = useState<CandidateView>("all");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateVisibleCount, setCandidateVisibleCount] = useState(25);
  const [detailedTableOpen, setDetailedTableOpen] = useState(false);
  const [viewRestored, setViewRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = window.sessionStorage.getItem(`press-craftor:review:${topicId}`);
        if (saved) {
          const state = JSON.parse(saved) as Record<string, unknown>;
          const collected = sanitizeStoryTableViewState(state.collected, "collected");
          const selected = sanitizeStoryTableViewState(state.selected, "selected");
          const deepLink = parseStoryReviewHash(window.location.hash);
          if (deepLink?.publicationFilter) {
            const target = deepLink.tab === "selected" ? selected : collected;
            target.publicationFilter = deepLink.publicationFilter;
          } else if (window.location.hash === "#production") {
            selected.publicationFilter = "active-selected";
          }
          setCollectedTableState(collected);
          setSelectedTableState(selected);
          setLineFilter(typeof state.lineFilter === "string" ? state.lineFilter : "");
          const savedView = state.candidateView;
          setCandidateView(
            savedView === "all" || savedView === "unevaluated" || savedView === "shortlist" || savedView === "evaluated"
              ? savedView
              : state.shortlistOnly === true ? "shortlist" : state.evaluatedOnly === true ? "evaluated" : "all",
          );
          setCandidateSearch(typeof state.candidateSearch === "string" ? state.candidateSearch : "");
          setCandidateVisibleCount(25);
        }
      } catch { /* Private browsing or an obsolete stored view uses defaults. */ }
      setViewRestored(true);
    });
    return () => { cancelled = true; };
  }, [topicId]);

  useEffect(() => {
    if (!viewRestored) return;
    try {
      window.sessionStorage.setItem(`press-craftor:review:${topicId}`, JSON.stringify({
        collected: collectedTableState,
        selected: selectedTableState,
        lineFilter,
        candidateView,
        candidateSearch,
      }));
    } catch { /* Filtering still works when storage is unavailable. */ }
  }, [topicId, viewRestored, collectedTableState, selectedTableState, lineFilter, candidateView, candidateSearch]);

  useEffect(() => {
    const resetCandidates = () => {
      setCandidateView("all");
      setCandidateSearch("");
      setCandidateVisibleCount(25);
      setLineFilter("");
      setCollectedTableState((current) => resetStoryTableFilters(current));
    };
    window.addEventListener(CANDIDATE_RESET_EVENT, resetCandidates);
    return () => window.removeEventListener(CANDIDATE_RESET_EVENT, resetCandidates);
  }, []);

  // A deep link (#stories/selected/unpublished) or the sidebar shortcut drives
  // the tab + publication filter. Bare #stories keeps whatever the user last had.
  useEffect(() => {
    function applyHash() {
      if (window.location.hash === "#production") {
        setActiveTab("selected");
        setSelectedTableState((current) => current.publicationFilter === "active-selected"
          ? current : { ...current, publicationFilter: "active-selected" });
        return;
      }
      const view = parseStoryReviewHash(window.location.hash);
      if (!view) return;
      setActiveTab(view.tab);
      if (view.publicationFilter) {
        const setter =
          view.tab === "selected"
            ? setSelectedTableState
            : setCollectedTableState;
        setter((current) => ({
          ...current,
          publicationFilter: view.publicationFilter as PublicationFilter,
        }));
      }
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("popstate", applyHash);
    return () => { window.removeEventListener("hashchange", applyHash); window.removeEventListener("popstate", applyHash); };
  }, []);

  function goToSelectedView(publicationFilter: PublicationFilter) {
    setActiveTab("selected");
    setSelectedTableState((current) => ({ ...current, publicationFilter }));
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", storyReviewHash({ tab: "selected", publicationFilter }));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }

  const collectedStories = editorial?.collectedStories ?? [];
  const selectedStories = editorial?.selectedStories ?? [];
  const publishedStoryCount = selectedStories.filter((story) => storyPublicationStage(story).publishedDestinations.length > 0).length;
  const evaluatedCount = collectedStories.filter((story) => story.evaluationDecision !== undefined).length;
  const unevaluatedCount = collectedStories.length - evaluatedCount;
  const readyToSelectCount = collectedStories.filter(isReadyToSelectCandidate).length;
  const activeSelectedCount = countActiveSelected(selectedStories);
  // Only stories still in production: Publications lists the published ones
  // from their selection, so clearing them would hide them there.
  const selectedStoryIdsForClear = selectedStories
    .filter((story) => storyPublicationStage(story).active)
    .map((story) => story.storyId);
  // Published has its own Publications view. This quick filter matches the
  // active Production queue, including Stories pending on another platform.
  const quickViews: {
    label: string;
    count: number;
    publicationFilter: PublicationFilter;
  }[] = [
    {
      label: "Active",
      count: activeSelectedCount,
      publicationFilter: "active-selected",
    },
    {
      label: "All records",
      count: selectedStories.length,
      publicationFilter: "all",
    },
  ];
  const localCandidateFloor =
    editorial?.configuration.effectiveCandidatePolicy?.localCandidateMinScore ??
    editorial?.configuration.minLocalScore ??
    25;
  const lineStories=(rows:EditorialTableStory[])=>rows.map(story=>({...story,lineContexts:lineData?.associations.filter(a=>a.storyId===story.storyId && (!lineFilter || lineFilter==="none" || a.context.lineId===lineFilter))??[]})).filter(story=>!lineFilter || (lineFilter==="none"?story.lineContexts.length===0:story.lineContexts.length>0));
  const normalizedCandidateSearch = candidateSearch.trim().toLocaleLowerCase();
  const filteredCollectedStories = filterTableStories(
    lineStories(collectedStories).filter((story) => {
      if (candidateView === "unevaluated" && story.evaluationDecision !== undefined) return false;
      if (candidateView === "shortlist" && !isReadyToSelectCandidate(story)) return false;
      if (candidateView === "evaluated" && story.evaluationDecision === undefined) return false;
      return !normalizedCandidateSearch || `${story.title} ${story.sourceName}`.toLocaleLowerCase().includes(normalizedCandidateSearch);
    }),
    collectedTableState,
    localCandidateFloor,
  );
  const sortedCollectedStories = [...filteredCollectedStories].sort((left, right) =>
    rankTableStories(left, right, collectedTableState.primaryRank, collectedTableState.secondaryRank),
  );
  const visibleCollectedStories = sortedCollectedStories.slice(0, candidateVisibleCount);
  const filteredSelectedStories = filterTableStories(
    lineStories(selectedStories),
    selectedTableState,
    localCandidateFloor,
  );
  const visibleShortlistIds = visibleCollectedStories
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
  const candidateViews: readonly { value: CandidateView; label: string; count: number }[] = [
    { value: "all", label: "All", count: collectedStories.length },
    { value: "unevaluated", label: "Needs evaluation", count: unevaluatedCount },
    { value: "shortlist", label: "Ready to select", count: readyToSelectCount },
    { value: "evaluated", label: "Evaluated", count: evaluatedCount },
  ];
  const candidateAdvancedCount = [
    lineFilter !== "",
    collectedTableState.publishedWithinDays !== undefined,
    collectedTableState.hideBelowTopicFloor,
    collectedTableState.minimumEditorialPriority !== undefined,
    collectedTableState.minimumGrowthScore !== undefined,
  ].filter(Boolean).length;
  const candidateFilterSummary = [
    lineFilter ? (lineFilter === "none" ? "No editorial line" : `Line: ${lineData?.lines.find((line) => line.id === lineFilter)?.name ?? "Selected line"}`) : undefined,
    collectedTableState.publishedWithinDays !== undefined ? `Last ${collectedTableState.publishedWithinDays === 1 ? "24 hours" : `${collectedTableState.publishedWithinDays} days`}` : undefined,
    collectedTableState.minimumEditorialPriority !== undefined ? `AI priority ≥ ${collectedTableState.minimumEditorialPriority}` : undefined,
    collectedTableState.minimumGrowthScore !== undefined ? `Growth ≥ ${collectedTableState.minimumGrowthScore}` : undefined,
    collectedTableState.hideBelowTopicFloor ? `Local score ≥ ${localCandidateFloor}` : undefined,
  ].filter((label): label is string => Boolean(label));

  function clearCandidateFilters() {
    setCandidateView("all");
    setCandidateSearch("");
    setCandidateVisibleCount(25);
    setLineFilter("");
    setCollectedTableState((current) => resetStoryTableFilters(current));
  }

  return (
    <section className={`${styles.panel} ${styles.editorialPanel} ${initialTab === "collected" ? styles.candidateWorkspace : ""}`}>
      {initialTab === "collected" ? <>
        <div className={styles.candidateHero}>
          <div>
            <p className={styles.kicker}>Discover / Candidates</p>
            <h2>Collected candidates</h2>
            <p>Scan what was found, evaluate new Stories, and move strong candidates into Production.</p>
          </div>
          <div className={styles.candidateHeroActions}>
            <a href="#discover/search">＋ Search for stories</a>
            <button type="button" className={styles.evaluateButton} onClick={() => onEvaluate(false)} disabled={!canEvaluate}>
              {isEvaluating ? "Evaluating…" : "Evaluate with AI"}
            </button>
          </div>
        </div>
        {editorial ? <div className={styles.candidateStageLinks}>
          <span>{collectedStories.length} collected</span>
          <a href="#production">{activeSelectedCount} selected →</a>
          <a href="#publications/published">{publishedStoryCount} published →</a>
        </div> : null}
      </> : <div className={styles.panelHeading}><div><h2>Selected records</h2></div></div>}

      {editorial ? (
        <>
          {initialTab === "collected" ? <details className={styles.candidateAiDetails}>
            <summary>AI evaluation activity <span>{editorial.today.remainingRuns} runs available today</span></summary>
            <p>Editorial AI ranks eligible candidates against this Topic’s criteria. Filters and scores below do not change the saved evaluation.</p>
            <p>Candidate floor {localCandidateFloor} · news window {editorial.configuration.effectiveCandidatePolicy?.freshness.newsMaxAgeHours ?? editorial.configuration.maxAgeHours} h · research window {editorial.configuration.effectiveCandidatePolicy?.freshness.researchMaxAgeHours ?? editorial.configuration.maxAgeHours} h · daily reset 00:00 UTC</p>
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
                {editorial.latestRun.evaluatedStories} evaluated by {formatEditorialProvider(editorial.latestRun.provider)} · {formatNumber(editorial.latestRun.totalTokens)} tokens
              </span>
              <span>
                {formatDate(editorial.latestRun.finishedAt ?? editorial.latestRun.startedAt)}
              </span>
            </div>
          ) : null}
            <button type="button" className={styles.reevaluateButton} onClick={() => onEvaluate(true)} disabled={!canEvaluate}>
              Re-evaluate with current settings
            </button>
          </details> : null}

          {initialTab === "collected" ? <div className={styles.candidateQueueControls}>
            <div className={styles.candidateViewButtons} role="group" aria-label="Candidate views">
              {candidateViews.map((view) => <button key={view.value} type="button" aria-pressed={candidateView === view.value} className={candidateView === view.value ? styles.candidateViewActive : undefined} onClick={() => { setCandidateView(view.value); setCandidateVisibleCount(25); }}>
                {view.label}<span>{view.count}</span>
              </button>)}
            </div>
            <div className={styles.candidateToolbar}>
              <div className={styles.candidateToolbarTop}>
                <label className={styles.candidateSearchField}>
                  <span>Find in candidates</span>
                  <input type="search" value={candidateSearch} onChange={(event) => { setCandidateSearch(event.currentTarget.value); setCandidateVisibleCount(25); }} placeholder="Search title or source" autoComplete="off" />
                </label>
                <label className={styles.candidateSortField}>
                  <span>Sort by</span>
                  <select value={collectedTableState.primaryRank} onChange={(event) => { setCollectedTableState((current) => ({ ...current, primaryRank: event.currentTarget.value as StoryRankKey })); setCandidateVisibleCount(25); }}>
                    <option value="publishedAt">Newest</option>
                    <option value="editorialPriority">AI priority</option>
                    <option value="growthScore">Growth potential</option>
                    <option value="localScore">Local score</option>
                  </select>
                </label>
                {(candidateView !== "all" || candidateSearch || candidateAdvancedCount > 0) ? <button type="button" className={styles.clearStoryFiltersButton} onClick={clearCandidateFilters}>Clear filters</button> : null}
              </div>
              <details className={styles.candidateFilterDetails}>
                <summary>More filters {candidateAdvancedCount > 0 ? <span>{candidateAdvancedCount} active</span> : null}</summary>
                <div className={styles.candidateFilterGrid}>
                  <label><span>Editorial line</span><select value={lineFilter} disabled={!lineData} onChange={(event) => { setLineFilter(event.currentTarget.value); setCandidateVisibleCount(25); }}>
                    <option value="">{lineData ? "All editorial lines" : "Loading editorial lines…"}</option>
                    <option value="none">Without a line</option>
                    {lineData?.lines.map((line) => <option key={line.id} value={line.id}>{line.name}{line.archived ? " (archived)" : ""}</option>)}
                  </select></label>
                  <label><span>Story date</span><select value={collectedTableState.publishedWithinDays ?? ""} onChange={(event) => { setCollectedTableState((current) => ({ ...current, publishedWithinDays: parsePublishedWithinDays(event.currentTarget.value) })); setCandidateVisibleCount(25); }}>
                    <option value="">Any time</option><option value="1">24 hours</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="90">90 days</option>
                  </select></label>
                  <label><span>AI priority at least</span><input type="number" min="0" max="100" inputMode="numeric" value={collectedTableState.minimumEditorialPriority ?? ""} onChange={(event) => { setCollectedTableState((current) => ({ ...current, minimumEditorialPriority: parseStoryScoreThreshold(event.currentTarget.value) })); setCandidateVisibleCount(25); }} placeholder="Any" /></label>
                  <label><span>Growth potential at least</span><input type="number" min="0" max="100" inputMode="numeric" value={collectedTableState.minimumGrowthScore ?? ""} onChange={(event) => { setCollectedTableState((current) => ({ ...current, minimumGrowthScore: parseStoryScoreThreshold(event.currentTarget.value) })); setCandidateVisibleCount(25); }} placeholder="Any" /></label>
                  <label><span>Then sort by</span><select value={collectedTableState.secondaryRank} onChange={(event) => { setCollectedTableState((current) => ({ ...current, secondaryRank: event.currentTarget.value as StoryRankKey })); setCandidateVisibleCount(25); }}>
                    <option value="publishedAt">Newest</option><option value="editorialPriority">AI priority</option><option value="growthScore">Growth potential</option><option value="localScore">Local score</option>
                  </select></label>
                  <label className={styles.candidateFloorControl}><input type="checkbox" checked={collectedTableState.hideBelowTopicFloor} onChange={(event) => { setCollectedTableState((current) => ({ ...current, hideBelowTopicFloor: event.currentTarget.checked })); setCandidateVisibleCount(25); }} /><span>Hide below local floor ({localCandidateFloor})</span></label>
                </div>
                <p>Score minimums hide Stories without an evaluation. The story date uses the source publication date when available.</p>
              </details>
              {candidateFilterSummary.length ? <div className={styles.candidateActiveFilters} aria-label="Active advanced filters">
                {candidateFilterSummary.map((label) => <span key={label}>{label}</span>)}
              </div> : null}
            </div>
          </div> : <>
            <div className={styles.storyWorkspaceHeader}><div><h3>Selected records</h3><p>Approved Stories and their publication records.</p></div></div>
            <div className={styles.buttonRow}><label className={styles.field}><span>Filter stories by editorial line</span><select value={lineFilter} disabled={!lineData} onChange={(event) => setLineFilter(event.target.value)}>
              <option value="">{lineData ? "All editorial lines" : "Loading editorial lines…"}</option><option value="none">Without a line (legacy stories)</option>
              {lineData?.lines.map((line) => <option key={line.id} value={line.id}>{line.name}{line.archived ? " (archived)" : ""}</option>)}
            </select></label></div>
          </>}

          {initialTab === "selected" ? <div className={styles.quickViews} aria-label="Quick views">
            {quickViews.map((view) => {
              const isActive = selectedTableState.publicationFilter === view.publicationFilter;
              return (
                <button
                  key={view.label}
                  type="button"
                  aria-pressed={isActive}
                  className={isActive ? styles.quickViewActive : ""}
                  onClick={() => goToSelectedView(view.publicationFilter)}
                >
                  {view.label}
                  <span>{view.count}</span>
                </button>
              );
            })}
          </div> : null}

          {activeTab === "collected" ? (
            <div>
              <div className={styles.candidateResultsHeading}>
                <div><h3>{candidateView === "all" ? "All candidates" : candidateView === "unevaluated" ? "Awaiting evaluation" : candidateView === "shortlist" ? "Ready to select" : "Evaluated candidates"}</h3><p>Approve AI shortlist Stories in a batch, or select original content individually after review. Other evaluated Stories can be promoted after review.</p></div>
                <span aria-live="polite">{filteredCollectedStories.length} match · {visibleCollectedStories.length} displayed</span>
              </div>

              {visibleShortlistIds.length > 0 || selectedStoryIds.length > 0 ? (
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
                    ? ` · ${hiddenSelectedCount} outside this page`
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

              <CandidateCards
                stories={visibleCollectedStories}
                totalStoryCount={collectedStories.length}
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
                canClearDuplicate={canClearDuplicate}
                clearingDuplicateStoryId={clearingDuplicateStoryId}
                onClearDuplicate={onClearDuplicate}
              />
              {visibleCollectedStories.length < filteredCollectedStories.length ? <button type="button" className={styles.candidateShowMore} onClick={() => setCandidateVisibleCount((current) => current + 25)}>
                Show {Math.min(25, filteredCollectedStories.length - visibleCollectedStories.length)} more <span>{filteredCollectedStories.length - visibleCollectedStories.length} remaining</span>
              </button> : null}
              <details className={styles.candidateDetailedTable} onToggle={(event) => setDetailedTableOpen(event.currentTarget.open)}>
                <summary>Detailed table <span>All signals and source details</span></summary>
                {detailedTableOpen ? <SortableStoriesTable
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
                canClearDuplicate={canClearDuplicate}
                clearingDuplicateStoryId={clearingDuplicateStoryId}
                onClearDuplicate={onClearDuplicate}
              /> : null}
              </details>
            </div>
          ) : (
            <div>
              <div className={styles.tableViewHeading}>
                <div>
                  <h3>Selected stories</h3>
                  <p>Human-approved stories ranked and ready for the next stage.</p>
                </div>
                <div className={styles.selectedTableActions}>
                  <span>
                    {filteredSelectedStories.length} of {selectedStories.length} shown
                  </span>
                  {selectedStoryIdsForClear.length > 0 ? (
                    <button
                      type="button"
                      className={styles.clearSelectedStoriesButton}
                      disabled={!canReview || isReviewing}
                      onClick={() => onUnselect(selectedStoryIdsForClear)}
                    >
                      {isReviewing
                        ? "Clearing…"
                        : `Unselect all in production (${selectedStoryIdsForClear.length})`}
                    </button>
                  ) : null}
                </div>
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
                onMinimumGrowthScoreChange={(minimumGrowthScore) =>
                  setSelectedTableState((current) => ({
                    ...current,
                    minimumGrowthScore,
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
                onResetFilters={() => {
                  setLineFilter("");
                  setSelectedTableState((current) => resetStoryTableFilters(current));
                }}
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
                canUnselect={canReview}
                isUnselecting={isReviewing}
                onUnselect={onUnselect}
              />
            </div>
          )}
        </>
      ) : (
        <div className={styles.optimizationEmpty}>
          Connect to view the AI budget and editorial evaluations.
        </div>
      )}
    </section>
  );
}

type StoryTableMode = "collected" | "selected";
type CandidateView = "all" | "unevaluated" | "shortlist" | "evaluated";
type StoryRankKey =
  | "publishedAt"
  | "editorialPriority"
  | "growthScore"
  | "localScore";
type StoryTableViewState = {
  primaryRank: StoryRankKey;
  secondaryRank: StoryRankKey;
  publishedWithinDays?: number;
  hideBelowTopicFloor: boolean;
  minimumEditorialPriority?: number;
  minimumGrowthScore?: number;
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
    publicationFilter: mode === "selected" ? "active-selected" : "all",
    publicationPlatform: "instagram",
  };
}

function sanitizeStoryTableViewState(value: unknown, mode: StoryTableMode): StoryTableViewState {
  const defaults = createStoryTableViewState(mode);
  if (!value || typeof value !== "object") return defaults;
  const saved = value as Partial<Record<keyof StoryTableViewState, unknown>>;
  const rankKeys: readonly StoryRankKey[] = ["publishedAt", "editorialPriority", "growthScore", "localScore"];
  const publicationFilters: readonly PublicationFilter[] = ["all", "active-selected", "not-published-anywhere", "scheduled-on-platform", "published-on-platform"];
  const boundedNumber = (candidate: unknown, max: number) =>
    typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 1 && candidate <= max
      ? candidate : undefined;
  return {
    primaryRank: rankKeys.includes(saved.primaryRank as StoryRankKey) ? saved.primaryRank as StoryRankKey : defaults.primaryRank,
    secondaryRank: rankKeys.includes(saved.secondaryRank as StoryRankKey) ? saved.secondaryRank as StoryRankKey : defaults.secondaryRank,
    publishedWithinDays: boundedNumber(saved.publishedWithinDays, 3650),
    hideBelowTopicFloor: saved.hideBelowTopicFloor === true,
    minimumEditorialPriority: boundedNumber(saved.minimumEditorialPriority, 100),
    minimumGrowthScore: boundedNumber(saved.minimumGrowthScore, 100),
    publicationFilter: publicationFilters.includes(saved.publicationFilter as PublicationFilter) ? saved.publicationFilter as PublicationFilter : defaults.publicationFilter,
    publicationPlatform: PUBLICATION_PLATFORMS.includes(saved.publicationPlatform as PublicationPlatform) ? saved.publicationPlatform as PublicationPlatform : defaults.publicationPlatform,
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
    minimumGrowthScore: undefined,
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

    if (
      filters.minimumGrowthScore !== undefined &&
      (story.growthScore === undefined ||
        story.growthScore < filters.minimumGrowthScore)
    ) {
      return false;
    }

    return storyMatchesPublicationFilter(story, filters);
  });
}

function isReadyToSelectCandidate(story: EditorialTableStory): boolean {
  return (story.reviewable === true && story.evaluationDecision === "shortlist") ||
    (story.isOwnedContent === true && story.processingStatus === "ready" && !story.reviewDecision);
}

function storyMatchesPublicationFilter(
  story: EditorialTableStory,
  filters: StoryTableViewState,
): boolean {
  if (filters.publicationFilter === "all") {
    return true;
  }

  const publications = story.publications ?? [];
  const stage = storyPublicationStage(story);

  if (filters.publicationFilter === "active-selected") {
    return stage.active;
  }
  if (filters.publicationFilter === "not-published-anywhere") {
    return stage.publishedDestinations.length === 0;
  }

  if (filters.publicationFilter === "published-on-platform") {
    return stage.publishedDestinations.some((publication) => publication.platform === filters.publicationPlatform);
  }
  return publications.some((publication) => publication.platform === filters.publicationPlatform && publication.status === "scheduled");
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
  onMinimumGrowthScoreChange,
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
  onMinimumGrowthScoreChange: (minimum: number | undefined) => void;
  showPublicationFilters?: boolean;
  onPublicationFilterChange?: (filter: PublicationFilter) => void;
  onPublicationPlatformChange?: (platform: PublicationPlatform) => void;
  onResetFilters: () => void;
}) {
  const hasActiveFilters =
    state.publishedWithinDays !== undefined ||
    state.hideBelowTopicFloor ||
    state.minimumEditorialPriority !== undefined ||
    state.minimumGrowthScore !== undefined ||
    state.publicationFilter !== "all";

  return (
    <div className={styles.storyFilterBar} aria-label="Story list controls">
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
            <option value="growthScore">Highest growth potential</option>
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
            <option value="growthScore">Highest growth potential</option>
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

        <label className={styles.storyFilterField}>
          <span>Growth potential at least</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            inputMode="numeric"
            value={state.minimumGrowthScore ?? ""}
            onChange={(event) =>
              onMinimumGrowthScoreChange(
                parseStoryScoreThreshold(event.currentTarget.value),
              )
            }
            placeholder="Any"
            aria-label="Minimum audience growth potential"
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
                <option value="active-selected">Active in Production</option>
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
        hides stories that have not been evaluated yet; a growth minimum hides
        stories without a growth evaluation.
        {showPublicationFilters
          ? " Publication status is tracked per platform."
          : ""}
      </small>
    </div>
  );
}

function CandidateCards({
  stories,
  totalStoryCount,
  primaryRank,
  secondaryRank,
  selectedStoryIds,
  onToggleStory,
  canPrepare,
  preparingStoryId,
  viewingStoryId,
  onPrepareContent,
  onViewContent,
  canPromote,
  promotingStoryId,
  onPromote,
  canClearDuplicate,
  clearingDuplicateStoryId,
  onClearDuplicate,
}: {
  stories: readonly EditorialTableStory[];
  totalStoryCount: number;
  primaryRank: StoryRankKey;
  secondaryRank: StoryRankKey;
  selectedStoryIds: readonly string[];
  onToggleStory: (storyId: string) => void;
  canPrepare: boolean;
  preparingStoryId?: string;
  viewingStoryId?: string;
  onPrepareContent: (storyId: string) => void;
  onViewContent: (storyId: string) => void;
  canPromote: boolean;
  promotingStoryId?: string;
  onPromote: (storyId: string, title: string, decision: EditorialTableStory["evaluationDecision"]) => void;
  canClearDuplicate: boolean;
  clearingDuplicateStoryId?: string;
  onClearDuplicate: (storyId: string, title: string) => void;
}) {
  if (stories.length === 0) {
    return <div className={styles.candidateEmpty}>
      <strong>{totalStoryCount ? "No candidates match this view" : "No candidates collected yet"}</strong>
      <p>{totalStoryCount ? "Try another view or clear the filters to see more Stories." : "Search an Editorial Line to bring Stories into this workspace."}</p>
      {!totalStoryCount ? <a href="#discover/search">Search for stories →</a> : null}
    </div>;
  }

  return <div className={styles.candidateCardList} aria-label="Collected candidates">
    {[...stories].sort((left, right) => rankTableStories(left, right, primaryRank, secondaryRank)).map((story) => {
      const selected = selectedStoryIds.includes(story.storyId);
      const storyDate = story.publishedAt ?? story.lastSeenAt;
      const decisionLabel = story.reviewDecision === "approved" ? "Selected" :
        story.reviewDecision === "rejected" ? "Rejected by editor" :
        isReadyToSelectCandidate(story) ? "Ready to select" :
        story.evaluationDecision === "review" ? "AI review" :
        story.evaluationDecision === "reject" ? "AI did not shortlist" :
        story.evaluationDecision === "shortlist" ? "Shortlisted" : "Needs evaluation";
      const decisionTone = story.reviewDecision === "approved" || isReadyToSelectCandidate(story) ? "positive" :
        story.reviewDecision === "rejected" || story.evaluationDecision === "reject" ? "negative" :
        story.evaluationDecision === "review" ? "warning" : "neutral";

      return <article className={`${styles.candidateCard} ${selected ? styles.candidateCardSelected : ""}`} key={story.storyId}>
        <div className={styles.candidateCardMain}>
          {story.reviewable ? <label className={styles.candidateCardSelect}>
            <input type="checkbox" checked={selected} onChange={() => onToggleStory(story.storyId)} aria-label={`Select ${story.title} for approval`} />
          </label> : <span className={styles.candidateCardSelectPlaceholder} aria-hidden="true" />}
          <div className={styles.candidateCardContent}>
            <div className={styles.candidateCardMeta}>
              <span>{story.sourceName}</span>
              {storyDate ? <time dateTime={storyDate}>{formatTableDate(storyDate)}</time> : <span>Date unavailable</span>}
              {story.lineContexts?.[0] ? <span>{story.lineContexts[0].context.name}</span> : null}
            </div>
            <h3>{story.isOwnedContent
              ? <button type="button" onClick={() => onViewContent(story.storyId)} disabled={!canPrepare}>{story.title}</button>
              : <a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}<span aria-hidden="true"> ↗</span></a>}</h3>
            <div className={styles.candidateCardBadges}>
              <StatusBadge tone={decisionTone}>{decisionLabel}</StatusBadge>
              <span>{formatContentStatus(story.contentStatus)}</span>
              {story.sourceId.startsWith("ai-research:") ? <span>AI research</span> : null}
              {story.isOwnedContent ? <span>Original content</span> : null}
              {story.isOwnedContent && story.evaluationDecision ? <span>AI: {story.evaluationDecision === "review" ? "Review" : story.evaluationDecision === "reject" ? "Reject" : "Shortlist"}</span> : null}
            </div>
            {story.reason ? <p className={styles.candidateCardReason}>{story.reason}</p> : null}
            {story.duplicateOfTitle ? <p className={styles.candidateCardWarning}>Possible duplicate: {story.duplicateOfTitle}</p> : null}
            {story.riskFlags.length ? <p className={styles.candidateCardWarning}>{story.riskFlags.slice(0, 2).join(" · ")}{story.riskFlags.length > 2 ? ` · +${story.riskFlags.length - 2} more` : ""}</p> : null}
          </div>
        </div>
        <div className={styles.candidateCardSignals} aria-label="Evaluation signals">
          <CandidateSignal label="AI priority" value={story.editorialPriority ?? story.editorialScore} />
          <CandidateSignal label="Growth potential" value={story.growthScore} />
        </div>
        <div className={styles.candidateCardActions}>
          <button type="button" onClick={() => onViewContent(story.storyId)} disabled={!canPrepare}>{viewingStoryId === story.storyId ? "Loading…" : story.contentStatus === "missing" ? "Add content" : "View content"}</button>
          {shouldPrepareStory(story) ? <button type="button" onClick={() => onPrepareContent(story.storyId)} disabled={!canPrepare}>{preparingStoryId === story.storyId ? "Preparing…" : prepareContentLabel(story)}</button> : null}
          {(story.isOwnedContent ? story.processingStatus === "ready" : story.evaluationDecision === "review" || story.evaluationDecision === "reject") && !story.reviewDecision ? <button type="button" onClick={() => onPromote(story.storyId, story.title, story.evaluationDecision)} disabled={!canPromote}>{promotingStoryId === story.storyId ? "Selecting…" : story.isOwnedContent ? "Select original content" : "Promote to selected"}</button> : null}
          {story.duplicateOfStoryId ? <button type="button" onClick={() => onClearDuplicate(story.storyId, story.title)} disabled={!canClearDuplicate} title="Clear the duplicate flag and send this Story to AI evaluation">{clearingDuplicateStoryId === story.storyId ? "Clearing…" : "Not a duplicate"}</button> : null}
        </div>
      </article>;
    })}
  </div>;
}

function CandidateSignal({ label, value }: { label: string; value?: number }) {
  const scored = typeof value === "number" && value > 0;
  return <div className={styles.candidateSignal}>
    <div><span>{label}</span><strong>{scored ? value : "—"}</strong></div>
    <div className={styles.candidateSignalTrack} aria-hidden="true"><span style={{ width: scored ? `${Math.min(100, value)}%` : "0%" }} /></div>
  </div>;
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
  canClearDuplicate = false,
  clearingDuplicateStoryId,
  onClearDuplicate,
  canTrackPublications = false,
  updatingPublicationStoryId,
  onUpdatePublication,
  onOpenCreativeStory,
  canUnselect = false,
  isUnselecting = false,
  onUnselect,
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
  onPromote?: (
    storyId: string,
    title: string,
    decision: EditorialTableStory["evaluationDecision"],
  ) => void;
  canClearDuplicate?: boolean;
  clearingDuplicateStoryId?: string;
  onClearDuplicate?: (storyId: string, title: string) => void;
  canTrackPublications?: boolean;
  updatingPublicationStoryId?: string;
  onUpdatePublication?: (
    storyId: string,
    platform: PublicationPlatform,
    status?: PublicationStatus,
  ) => void;
  onOpenCreativeStory?: (storyId: string, title: string, editorialRunId?: string) => void;
  canUnselect?: boolean;
  isUnselecting?: boolean;
  onUnselect?: (storyIds: string[]) => void;
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
            <TableHeader label="Growth potential" numeric />
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
            const isAiResearchStory = story.sourceId.startsWith("ai-research:");
            const isOwnedContentStory = story.isOwnedContent === true;

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
                  {isOwnedContentStory ? (
                    <button type="button" onClick={() => onViewContent?.(story.storyId)} disabled={!canPrepare}>{story.title}</button>
                  ) : (
                    <a href={story.url} target="_blank" rel="noreferrer">{story.title}</a>
                  )}
                  {isAiResearchStory ? (
                    <span className={`${styles.tableBadge} ${styles.aiResearchStoryBadge}`}>
                      Found by AI
                    </span>
                  ) : null}
                  {isOwnedContentStory ? (
                    <span className={`${styles.tableBadge} ${styles.tableBadgePositive}`}>
                      Manual story
                    </span>
                  ) : null}
                  {story.duplicateOfTitle ? (
                    <span
                      className={`${styles.tableBadge} ${
                        story.duplicateOfPublished
                          ? styles.tableBadgeNegative
                          : styles.tableBadgeWarning
                      }`}
                      title={`Same news event as: ${story.duplicateOfTitle}`}
                    >
                      Same event as “{story.duplicateOfTitle}”
                      {story.duplicateOfPublished ? " · already published" : ""}
                    </span>
                  ) : null}
                  {mode === "selected" ? (
                    <div>
                      <button
                        type="button"
                        className={styles.creativeStudioButton}
                        disabled={!canPrepare || !onOpenCreativeStory}
                        title="Open Creative studio to continue or create a draft"
                        onClick={() => onOpenCreativeStory?.(story.storyId, story.title, new Set(story.lineContexts?.map(c=>c.context.lineId)).size===1?story.lineContexts?.[0]?.runId:undefined)}
                      >
                        Open draft
                      </button>
                    </div>
                  ) : null}
                  {story.lineContexts?.map(a=><details key={a.runId}><summary>{a.context.name} · {a.context.mode}</summary><p>{a.context.query || a.context.objective}</p><small>{a.context.from??"No age cutoff"} → {a.context.to}. {story.publishedAt?"Publication date shown; current applicability must be checked.":"Publication date unknown; not confirmed as current news."}</small><p>{a.reasons.join(" · ")}</p></details>)}
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
                <td className={styles.sourceCell}>
                  <div className={styles.sourceCellContent}>
                    <span>{story.sourceName}</span>
                    {isAiResearchStory ? (
                      <span className={`${styles.tableBadge} ${styles.tableBadgePositive}`}>
                        AI research
                      </span>
                    ) : null}
                    {isOwnedContentStory ? (
                      <span className={`${styles.tableBadge} ${styles.tableBadgePositive}`}>
                        Manual story
                      </span>
                    ) : null}
                  </div>
                </td>
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
                    ) : null}
                  </div>
                </td>
                <ScoreCell value={story.localScore} />
                <ScoreCell
                  value={story.editorialPriority ?? story.editorialScore}
                  accent
                />
                <GrowthScoreCell
                  value={story.growthScore}
                  reason={story.growthReason}
                  signals={story.growthSignals}
                />
                <td>
                  <StatusBadge tone={evaluationDecisionTone(story.evaluationDecision)}>
                    {formatEvaluationDecision(story.evaluationDecision)}
                  </StatusBadge>
                </td>
                <td>
                  <StatusBadge tone={mode === "selected" ? "positive" : "neutral"}>
                    {mode === "selected"
                      ? (storyPublicationStage(story).active ? "Selected" : "Published")
                      : formatProcessingStatus(story.processingStatus)}
                  </StatusBadge>
                </td>
                {mode === "selected" ? (
                  <td className={styles.publicationStatusCell}>
                    <PublicationStatusChips
                      publications={story.publications}
                      confirmedPublications={story.confirmedPublications}
                    />
                  </td>
                ) : null}
                <td className={styles.contentActionsCell}>
                  {mode === "selected" ? (
                    <>
                      <button
                        type="button"
                        className={styles.unselectStoryButton}
                        disabled={!canUnselect || isUnselecting}
                        onClick={() => onUnselect?.([story.storyId])}
                      >
                        {isUnselecting ? "Clearing…" : "Unselect"}
                      </button>
                      <PublicationQuickControl
                        storyId={story.storyId}
                        publications={story.publications}
                        disabled={!canTrackPublications}
                        isUpdating={updatingPublicationStoryId === story.storyId}
                        onUpdate={onUpdatePublication}
                      />
                      <button
                          type="button"
                          className={styles.viewContentButton}
                          disabled={!canPrepare}
                          onClick={() => onViewContent?.(story.storyId)}
                        >
                          {viewingStoryId === story.storyId
                            ? "Loading…"
                            : story.contentStatus === "missing" ? "Add content / photos" : "View content"}
                        </button>
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
                      <button
                          type="button"
                          className={styles.viewContentButton}
                          disabled={!canPrepare}
                          onClick={() => onViewContent?.(story.storyId)}
                        >
                          {viewingStoryId === story.storyId
                            ? "Loading…"
                            : story.contentStatus === "missing" ? "Add content / photos" : "View content"}
                        </button>
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
                      {(isOwnedContentStory
                        ? story.processingStatus === "ready"
                        : story.evaluationDecision === "review" || story.evaluationDecision === "reject") &&
                      !story.reviewDecision ? (
                        <button
                          type="button"
                          className={styles.promoteStoryButton}
                          disabled={!canPromote}
                          onClick={() =>
                            onPromote?.(
                              story.storyId,
                              story.title,
                              story.evaluationDecision,
                            )
                          }
                        >
                          {promotingStoryId === story.storyId
                            ? "Selecting…"
                            : isOwnedContentStory
                              ? "Select original content"
                              : story.evaluationDecision === "reject"
                              ? "Override to selected"
                              : "Promote to selected"}
                        </button>
                      ) : null}
                      {story.duplicateOfStoryId ? (
                        <button
                          type="button"
                          className={styles.clearDuplicateButton}
                          disabled={!canClearDuplicate}
                          title="Clear the duplicate flag and send this Story to AI evaluation"
                          onClick={() =>
                            onClearDuplicate?.(story.storyId, story.title)
                          }
                        >
                          {clearingDuplicateStoryId === story.storyId
                            ? "Clearing…"
                            : "Not a duplicate"}
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

export function StoryContentViewer({
  content,
  secret, topicId, onSaved,
  onClose,
}: {
  content: StoryContentResponse;
  secret: string; topicId: string; onSaved: (content: StoryContentResponse) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(content.title);
  const [text, setText] = useState(content.text ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingExit, setPendingExit] = useState<"close" | "cancel">();
  const [history, setHistory] = useState<{ revision: number; title: string; text: string; createdAt: string }[]>();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const editingDirty = editing && (title !== content.title || text !== (content.text ?? ""));
  useUnsavedBeforeUnload(editingDirty);
  const wordCount = countTextWords(content.text);
  function requestClose() {
    if (busy) return;
    if (editingDirty) setPendingExit("close");
    else onClose();
  }
  function cancelEditing() {
    if (busy) return;
    if (editingDirty) setPendingExit("cancel");
    else { setTitle(content.title); setText(content.text ?? ""); setEditing(false); }
  }
  function discardAndExit() {
    if (pendingExit === "close") onClose();
    else { setTitle(content.title); setText(content.text ?? ""); setEditing(false); setPendingExit(undefined); }
  }
  async function save(closeAfter = false) {
    setBusy(true); setMessage("");
    try {
      const saved = await requestJson<StoryContentResponse>(topicUrl(`/api/radar/stories/${content.storyId}/content`, topicId), secret, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, text, expectedRevision: content.editorial?.revision ?? 0 }),
      });
      if (!mounted.current) return;
      onSaved(saved); setEditing(false); setHistory(undefined);
      setPendingExit(undefined);
      setMessage("Saved. Refresh the creative brief and draft to use this edition. Previous images remain in history.");
      if (closeAfter) onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function loadHistory() {
    setBusy(true);
    try { setHistory(await requestJson(topicUrl(`/api/radar/stories/${content.storyId}/content?history=true`, topicId), secret)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load history"); }
    finally { setBusy(false); }
  }

  return (
    <ModalLayer onClose={requestClose} canClose={!busy}>
    <div
      className={styles.contentViewerBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
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
            <p>{content.editorial ? `Editorial edition · v${content.editorial.revision}` : "Prepared story content"}</p>
            <h2 id="story-content-title">{content.title}</h2>
          </div>
          <button type="button" onClick={requestClose} disabled={busy} aria-label="Close content viewer">
            ×
          </button>
        </header>

        <div className={styles.contentViewerMeta}>
          <StatusBadge tone={content.source === "article" ? "positive" : "neutral"}>
            {content.editorial ? "Editorial working copy" : content.source === "article"
              ? content.enrichment?.method === "reader"
                ? "Article via Reader"
                : "Article page"
              : "RSS feed"}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {formatContentStatus(content.contentStatus)}
          </StatusBadge>
          <span>{formatNumber(wordCount)} words</span>
          {!content.editorial && content.enrichment?.byline ? (
            <span>By {content.enrichment.byline}</span>
          ) : null}
        </div>

        {!content.editorial && content.source === "rss" &&
        (content.enrichment?.status === "failed" ||
          content.enrichment?.status === "blocked") ? (
          <div className={styles.contentViewerWarning} role="status">
            <strong>Full article unavailable.</strong>
            <span>
              Showing the stored RSS excerpt.
              {content.enrichment.error
                ? ` ${content.enrichment.error}`
                : ""}
            </span>
          </div>
        ) : null}

        <div className={styles.contentViewerBody}>
          {pendingExit ? <div className={styles.contentViewerWarning} role="alert">
            <strong>Unsaved content changes</strong>
            <span>Save this edition or discard your edits before {pendingExit === "close" ? "closing" : "leaving edit mode"}.</span>
            <ActionRow>
              <Button variant="primary" disabled={busy || !title.trim() || !text.trim()} busy={busy} onClick={() => void save(pendingExit === "close")}>Save {pendingExit === "close" ? "and close" : "edition"}</Button>
              <Button variant="destructive" disabled={busy} onClick={discardAndExit}>Discard changes</Button>
              <Button variant="quiet" onClick={() => setPendingExit(undefined)}>Keep editing</Button>
            </ActionRow>
          </div> : null}
          <div className={styles.storyMaterials}>
            <button type="button" data-initial-focus disabled={busy} onClick={() => { if (editing) cancelEditing(); else setEditing(true); }}>{editing ? "Cancel editing" : "Edit content"}</button>
            {content.editorial ? <button type="button" disabled={busy} onClick={loadHistory}>Recent versions</button> : null}
            {message ? <p role="status">{message}</p> : null}
          </div>
          {editing ? <div className={styles.storyMaterialForm}>
            <label>Title<input value={title} maxLength={500} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
            <label>Editorial content<textarea rows={16} value={text} maxLength={100000} onChange={event => setText(event.target.value)} disabled={busy} /></label>
            <button type="button" disabled={busy || !title.trim() || !text.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save edition"}</button>
            {content.editorial ? <button type="button" disabled={busy} onClick={() => { setTitle(content.editorial!.original.title); setText(content.editorial!.original.text); }}>Use original in editor</button> : null}
          </div> : content.text ? (
            <p>{content.text}</p>
          ) : (
            <div className={styles.optimizationEmpty}>
              No readable story text is available yet.
            </div>
          )}

        {history ? <details open className={styles.storyMaterials}><summary>Last 20 editorial editions</summary>{history.map(version => <button type="button" disabled={busy} key={version.revision} onClick={() => { setTitle(version.title); setText(version.text); setEditing(true); }}>Edit a copy of v{version.revision} · {formatDate(version.createdAt)}</button>)}</details> : null}
        <StoryPhotosPanel secret={secret} topicId={topicId} storyId={content.storyId} />
        </div>
        <footer className={styles.contentViewerFooter}>
          {/^https?:\/\//i.test(content.url) ? <a href={content.url} target="_blank" rel="noreferrer">Open original source ↗</a> : <span>Created in Press Craftor · no public source URL</span>}
          {content.enrichment?.fetchedAt ? (
            <span>Fetched {formatDate(content.enrichment.fetchedAt)}</span>
          ) : null}
        </footer>
      </section>
    </div>
    </ModalLayer>
  );
}

function TableHeader({ label, numeric = false }: { label: string; numeric?: boolean }) {
  return (
    <th scope="col" className={numeric ? styles.numericColumn : undefined}>
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
      {value !== undefined && value >= 1 ? value : <span title="Not scored yet">—</span>}
    </td>
  );
}

function GrowthScoreCell({
  value,
  reason,
  signals,
}: {
  value?: number;
  reason?: string;
  signals?: EditorialGrowthSignals;
}) {
  const signalEntries = growthSignalEntries(signals);
  const hasBreakdown = Boolean(reason || signalEntries.length > 0);
  const tooltip = growthScoreTooltip(reason, signalEntries);
  const scoredValue = value !== undefined && value >= 1 ? value : undefined;
  const displayValue = scoredValue ?? "—";

  return (
    <td className={`${styles.scoreCell} ${styles.growthScoreCell}`}>
      {scoredValue !== undefined || hasBreakdown ? (
        <div className={styles.growthScoreSummary}>
          <strong title={tooltip}>{displayValue}</strong>
          {hasBreakdown ? (
            <details className={styles.growthScoreDetails}>
              <summary
                aria-label={`View growth-potential breakdown for ${displayValue}`}
                title={tooltip}
              >
                Signals
              </summary>
              <div className={styles.growthScorePopover}>
                {reason ? <p>{reason}</p> : null}
                {signalEntries.length > 0 ? (
                  <dl>
                    {signalEntries.map(([label, score]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{score}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        "—"
      )}
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
  confirmedPublications = [],
}: {
  publications?: readonly StoryPublication[];
  confirmedPublications?: readonly NonNullable<EditorialDashboardStory["confirmedPublications"]>[number][];
}) {
  if (publications.length === 0 && confirmedPublications.length === 0) {
    return <span className={styles.publicationNotTracked}>No manual tracking</span>;
  }

  return (
    <div className={styles.publicationStatusChips}>
      {(["instagram", "facebook"] as const).map((platform) => {
        const count = confirmedPublications.filter((publication) => publication.platform === platform).length;
        return count ? <StatusBadge key={platform} tone="positive">{`${formatPublicationPlatform(platform)} · ${count} confirmed ${count === 1 ? "post" : "posts"}`}</StatusBadge> : null;
      })}
      {publications.map((publication) => (
        <StatusBadge
          key={`${publication.platform}-${publication.status}-${publication.publishedAt ?? publication.scheduledAt ?? "current"}`}
          tone={publicationStatusTone(publication.status)}
        >
          {`Manual · ${formatPublicationPlatform(publication.platform)} · ${formatPublicationStatus(publication.status)}`}
        </StatusBadge>
      ))}
    </div>
  );
}

function PublicationQuickControl({
  storyId,
  publications,
  defaultStatus,
  disabled,
  isUpdating,
  onUpdate,
}: {
  storyId: string;
  publications?: readonly StoryPublication[];
  defaultStatus?: PublicationStatus;
  disabled: boolean;
  isUpdating: boolean;
  onUpdate?: (
    storyId: string,
    platform: PublicationPlatform,
    status?: PublicationStatus,
  ) => void;
}) {
  const [platform, setPlatform] = useState<PublicationPlatform>("instagram");
  const [draftStatus, setDraftStatus] = useState<PublicationStatus | "" | undefined>();
  const publication = publications?.find(
    (candidate) => candidate.platform === platform,
  );
  const savedStatus = publication?.status ?? "";
  const selectedStatus = draftStatus ?? defaultStatus ?? savedStatus;

  return (
    <div className={styles.publicationQuickControl}>
      <strong>Manual tracking</strong>
      <small>{defaultStatus === "published" ? "Record a post already live outside Press Craftor. This does not publish anything." : "This records an editorial note. It does not send or schedule a post."}</small>
      <label>
        <span>Platform</span>
        <select
          value={platform}
          disabled={disabled || isUpdating || !onUpdate}
          aria-label={`Choose a publication platform for ${storyId}`}
          onChange={(event) => { setPlatform(event.currentTarget.value as PublicationPlatform); setDraftStatus(undefined); }}
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
          value={selectedStatus}
          disabled={disabled || isUpdating || !onUpdate}
          aria-label={`Choose manual ${formatPublicationPlatform(platform)} tracking status for ${storyId}`}
          onChange={(event) => setDraftStatus(event.currentTarget.value as PublicationStatus | "")}
        >
          <option value="">Not tracked</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
        </select>
      </label>
      <Button size="compact" variant="secondary" disabled={disabled || isUpdating || !onUpdate || selectedStatus === savedStatus} busy={isUpdating} onClick={() => onUpdate?.(storyId, platform, selectedStatus || undefined)}>
        {isUpdating ? "Saving…" : defaultStatus === "published" && selectedStatus === "published" ? "Confirm published" : "Save manual status"}
      </Button>
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
  selection?: EditorialLineSelection,
): Promise<CollectionResponse> {
  return requestJson<CollectionResponse>(
    topicUrl(`/api/radar/collect?maxAgeHours=${maxAgeHours}`, topicId),
    secret,
    { method: "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(selection?{lineId:selection.lineId,query:selection.query,period:selection.period,requestId:crypto.randomUUID()}: {}) },
  );
}

async function evaluateStories(
  secret: string,
  topicId: string,
  force = false,
): Promise<EditorialEvaluationResponse> {
  return requestJson<EditorialEvaluationResponse>(
    topicUrl("/api/radar/evaluate", topicId),
    secret,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    },
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

async function unselectStories(
  secret: string,
  topicId: string,
  storyIds: string[],
): Promise<{ unselectedStories: number }> {
  return requestJson<{ unselectedStories: number }>(
    topicUrl("/api/radar/reviews", topicId),
    secret,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ storyIds }),
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

async function selectOriginalContent(
  secret: string,
  topicId: string,
  storyId: string,
  expectedDuplicateStoryId: string | null,
): Promise<{ storyId: string; selected: true; duplicateOverridden: boolean }> {
  return requestJson<{ storyId: string; selected: true; duplicateOverridden: boolean }>(
    topicUrl(`/api/radar/stories/${encodeURIComponent(storyId)}/select-owned`, topicId),
    secret,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmSelection: true, expectedDuplicateStoryId }),
    },
  );
}

async function clearDuplicateFlag(
  secret: string,
  topicId: string,
  storyId: string,
): Promise<{ storyId: string; cleared: true }> {
  return requestJson<{ storyId: string; cleared: true }>(
    topicUrl(
      `/api/radar/stories/${encodeURIComponent(storyId)}/clear-duplicate`,
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
  publication: Pick<StoryPublication, "platform" | "status"> & {
    overrideDuplicate?: boolean;
  },
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
    message: `${collection.persistence.persistedStories} stories processed: ${collection.counts.relevance.ready} ready, ${collection.counts.relevance.needsEnrichment} need enrichment, ${collection.counts.relevance.review} need review, and ${collection.counts.relevance.rejected} were rejected. ${collection.counts.duplicatesRemoved} batch duplicates were removed, ${collection.persistence.markedStoredDuplicates} stored duplicates were marked, and ${collection.persistence.semanticDuplicatesMarked ?? 0} same-event duplicates were caught semantically.`,
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

function countLabel(count: number, one: string, many: string): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

function formatEditorialProvider(provider: string): string {
  const names: Record<string, string> = {
    google: "Gemini",
    openai: "OpenAI Luna",
    groq: "Groq",
    cloudflare: "Cloudflare",
  };
  return names[provider] ?? provider;
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

function growthSignalEntries(
  signals?: EditorialGrowthSignals,
): Array<readonly [label: string, score: number]> {
  if (!signals) {
    return [];
  }

  const candidates: Array<readonly [string, number | undefined]> = [
    ["New audience", signals.newAudienceReach],
    ["Viral potential", signals.viralPotential],
    ["Constructive tension", signals.constructiveTension],
    ["Easy to explain", signals.explainability],
  ];

  return candidates.filter(
    (candidate): candidate is readonly [string, number] =>
      typeof candidate[1] === "number" && Number.isFinite(candidate[1]),
  );
}

function growthScoreTooltip(
  reason: string | undefined,
  signals: readonly (readonly [label: string, score: number])[],
): string | undefined {
  const parts = [
    reason?.trim(),
    ...signals.map(([label, score]) => `${label}: ${score}`),
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : undefined;
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
    case "growthScore":
      return story.growthScore;
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

/**
 * Cover of a published Story. Tries each candidate in order (the exact
 * published cover first, Instagram's expiring signed URL last) and falls back
 * to a neutral placeholder when none loads.
 */
function PublishedStoryThumbnail({ urls, title }: { urls: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const url = urls[index];
  if (!url) {
    return <div className={styles.queueThumbnailPlaceholder} aria-hidden="true">No image</div>;
  }
  return (
    // Remote, already-sized delivery images; next/image would need every
    // signed CDN host allow-listed.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.queueThumbnail}
      src={url}
      alt={`Cover of “${title}”`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}
