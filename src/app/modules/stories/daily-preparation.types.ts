export type DailyPreparationStep = "collect" | "evaluate" | "recommend" | "content" | "brief" | "draft";
export const DAILY_PREPARATION_STEPS: DailyPreparationStep[] = ["collect", "evaluate", "recommend", "content", "brief", "draft"];
export const DAILY_PREPARATION_TITLES: Record<DailyPreparationStep, string> = { collect: "Collect", evaluate: "Evaluate", recommend: "Recommend", content: "Content", brief: "Brief", draft: "Draft" };
export function preparationTarget(progress: DailyPreparationProgress): DailyPreparationStep {
  return progress.targetStep ?? (progress.mode === "draft" ? "draft" : "recommend");
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
export const DAILY_PREPARATION_LABELS:Record<string,string>={collect:"Collecting stories…",evaluate:"Evaluating stories with AI…",recommend:"Preparing today’s recommendation…",content:"Preparing and checking article content…",brief:"Creating creative brief…",draft:"Generating draft…"};
