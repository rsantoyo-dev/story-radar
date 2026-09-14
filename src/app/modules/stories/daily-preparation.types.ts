export type DailyPreparationStep = "collect" | "evaluate" | "recommend" | "content" | "brief" | "draft";
export type DailyPreparationProgress = {
  mode?: "day" | "draft"; storyId?:string; storyTitle?:string; briefId?:string; draftId?:string;
  lineName: string; collected?: number; evaluated: number; evaluationBatches: number;
  collectionRunId?: string; evaluationWarning?: string; collectionWarning?: string;
  recommendationRunId?: string;
};
export type DailyPreparationRun = {
  id:string;topicId:string;lineId:string;timezone:string;status:string;step:string;
  progress:DailyPreparationProgress;error:string|null;startedAt:string;updatedAt:string;
};
export const DAILY_PREPARATION_LABELS:Record<string,string>={collect:"Collecting stories…",evaluate:"Evaluating stories with AI…",recommend:"Preparing today’s recommendation…",content:"Preparing and checking article content…",brief:"Creating creative brief…",draft:"Generating draft…"};
