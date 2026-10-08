export type DailyPreparationStep =
  | "collect" | "evaluate" | "recommend" | "approve" | "content"
  | "focus" | "brief" | "draft" | "cover" | "approve-draft" | "images";
// "draft" is no longer part of the active sequence below — the single-shot
// pipeline writes the draft and its carousel script together, so the
// separate "draft" step it used to take is now folded into "brief" (see
// daily-preparation.ts). The id stays a valid DailyPreparationStep, and
// daily-preparation.ts keeps a legacy handler for it, purely so a run
// persisted mid-flight before this change keeps resolving instead of hitting
// "Unknown preparation stage" after a deploy.
export const DAILY_PREPARATION_STEPS: DailyPreparationStep[] =
  ["collect", "evaluate", "recommend", "approve", "content", "focus", "brief", "cover", "approve-draft", "images"];
// "recommend"/"brief" keep their original ids — only their display titles
// changed (Select/Draft) — so an in-flight or historical run row saved under
// an older step sequence still resolves to the same step.
export const DAILY_PREPARATION_TITLES: Record<DailyPreparationStep, string> = {
  collect: "Collect", evaluate: "Evaluate", recommend: "Select", approve: "Approve Story",
  content: "Content", focus: "Focus", brief: "Script", draft: "Carousel", cover: "Cover",
  "approve-draft": "Approve script", images: "Visuals",
};
export function preparationTarget(progress: DailyPreparationProgress): DailyPreparationStep {
  return progress.targetStep ?? (progress.mode === "draft" ? "brief" : "recommend");
}
export type DailyPreparationProgress = {
  targetStep?: DailyPreparationStep; completedStep?: DailyPreparationStep;
  mode?: "day" | "draft"; storyId?:string; storyTitle?:string; briefId?:string; draftId?:string;
  lineName: string; collected?: number; evaluated: number; evaluationBatches: number;
  collectionRunId?: string; evaluationWarning?: string; collectionWarning?: string;
  recommendationRunId?: string;
  /** Set by an explicit human "accept and continue" past a limited-evidence
   * brief (see BRIEF_EVIDENCE_REVIEW_MESSAGE) — scoped to that exact briefId,
   * so a later regenerated brief still needs its own review. */
  acknowledgedBriefId?: string;
  /** The focus step's suggested editorial angle, fed into the brief step. */
  editorialDirection?: string;
  /** The images step's created asset batch, for the panel to link into. */
  assetBatchId?: string;
  /** Who started the run: an editor, the scheduled reader, or a detected scoop. */
  trigger?: "manual" | "auto" | "scoop";
  /** The topic_scoops row a scoop run prepares. */
  scoopId?: string;
  /** Images were generated before the script's human approval (a scoop). */
  provisionalImages?: boolean;
  /** Ordered fallback stories: the recommendation, its alternatives, and other sources of the same event. */
  candidates?: { storyId: string; title?: string; via: "recommended" | "alternative" | "same-event" }[];
  /** Stories the run moved past, with why — never silently dropped. */
  skippedStories?: { storyId: string; title?: string; reason: string }[];
  /**
   * Explicitly chosen for this run: the system approves the script and the
   * images when their automated checks pass. Publishing stays manual.
   */
  autoApprove?: boolean;
  /** When each step finished, for the panel's timeline. */
  stepTimes?: Partial<Record<DailyPreparationStep, string>>;
  /** Plain-language log of what happened, newest last (bounded). */
  activity?: { at: string; text: string; kind?: "skip" | "auto" }[];
  /** Why the planner chose this story, and what else it considered. */
  selection?: { reason?: string; summary?: string; alternatives: string[] };
  /** The script the run produced, at a glance. */
  draftSummary?: { format: string; slides: number; hook?: string };
  /** The review run for a cover the tournament changed, reused if the step is retried. */
  coverReviewRequestId?: string;
  /** What the system approved on its own, for the audit trail. */
  autoApproved?: { draftId?: string; draftApprovedAt?: string; assetIds?: string[]; imagesApprovedAt?: string };
};
/** The brief step's contentSufficiency checkpoint message — a human already
 * reviewing it in the workspace can override it once for this exact brief;
 * a shared constant keeps the throw site and the panel's button in sync. */
export const BRIEF_EVIDENCE_REVIEW_MESSAGE =
  "The creative brief needs more evidence. Review the content and brief before continuing.";
export type DailyPreparationRun = {
  id:string;topicId:string;lineId:string;timezone:string;status:string;step:string;
  progress:DailyPreparationProgress;error:string|null;startedAt:string;updatedAt:string;
};
export const DAILY_PREPARATION_LABELS:Record<string,string>={
  collect:"Collecting stories…", evaluate:"Evaluating stories with AI…",
  recommend:"Selecting today’s story…", approve:"Approving the selected story…",
  content:"Preparing and checking article content…", focus:"Suggesting an editorial focus…",
  brief:"Creating the script and carousel…", draft:"Generating the carousel…", cover:"Choosing the strongest cover…",
  "approve-draft":"Approving the script…", images:"Generating visuals…",
};

/** Mirrors StoryTextCall (creative-text-accounting.repository) for the client. */
export type PreparationTextCall = {
  id: string; operation: string; provider: string; model: string; status: string;
  startedAt: string; finishedAt: string | null; creditMicros: number | null;
};
const CALL_LABELS: Record<string, string> = {
  editorial_focus: "Editorial focus", creative_brief: "Brief", creative_critic: "Critic review",
  creative_draft_repair: "Script repair", creative_grounding_audit: "Fact audit",
  creative_editorial_final_audit: "Final editorial audit", creative_editorial_targeted_patch: "Targeted fix",
  creative_narrative_replan: "Narrative replan", companion_instagram_story: "Companion story",
  companion_story_terra_critic: "Companion review",
};
/** A readable name for one AI call; the first full script is "Script", later ones are rewrites. */
export function preparationCallLabel(call: PreparationTextCall, earlier: PreparationTextCall[]): string {
  if (call.operation === "creative_draft") return earlier.some(c => c.operation === "creative_draft") ? "Script rewrite" : "Script";
  // Untagged JSON calls: Gemini's brief or critic before calls carried their purpose, or a fallback provider.
  if (call.operation === "creative_json") return call.provider === "google" ? "Brief or critic review" : "AI step (fallback provider)";
  return CALL_LABELS[call.operation] ?? call.operation.replace(/_/g, " ");
}
/** "gpt-6.1-sol" → "GPT-6.1 Sol", "gemini-3.8-flash" → "Gemini 3.8 Flash". */
export function preparationModelLabel(model: string): string {
  return model.split("/").pop()!.split("-").map((part, index) =>
    index === 0 && /^gpt$/i.test(part) ? "GPT" : /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1),
  ).join(" ").replace(/^GPT (\S+)/, "GPT-$1");
}
