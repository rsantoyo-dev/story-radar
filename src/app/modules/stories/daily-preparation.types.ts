export type DailyPreparationStep =
  | "collect" | "evaluate" | "recommend" | "approve" | "content"
  | "focus" | "brief" | "draft" | "approve-draft" | "images";
// "draft" is no longer part of the active sequence below — the single-shot
// pipeline writes the draft and its carrousel script together, so the
// separate "draft" step it used to take is now folded into "brief" (see
// daily-preparation.ts). The id stays a valid DailyPreparationStep, and
// daily-preparation.ts keeps a legacy handler for it, purely so a run
// persisted mid-flight before this change keeps resolving instead of hitting
// "Unknown preparation stage" after a deploy.
export const DAILY_PREPARATION_STEPS: DailyPreparationStep[] =
  ["collect", "evaluate", "recommend", "approve", "content", "focus", "brief", "approve-draft", "images"];
// "recommend"/"brief" keep their original ids — only their display titles
// changed (Select/Draft) — so an in-flight or historical run row saved under
// an older step sequence still resolves to the same step.
export const DAILY_PREPARATION_TITLES: Record<DailyPreparationStep, string> = {
  collect: "Collect", evaluate: "Evaluate", recommend: "Select", approve: "Approve",
  content: "Content", focus: "Focus", brief: "Draft", draft: "Carrousel",
  "approve-draft": "Approve draft", images: "Images",
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
  brief:"Creating the draft and carrousel…", draft:"Generating the carrousel…",
  "approve-draft":"Approving the draft…", images:"Generating images…",
};
