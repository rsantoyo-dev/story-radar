/**
 * Discover's candidate views, pure: where each collected story stands for the
 * editor (open, set aside by the collection, decided by the editor) and which
 * view shows it. The server's collected list is every story of the Topic, so
 * before this scope "All" and "Needs evaluation" counted the stories the
 * collection had set aside (below the local floor, the same news as another)
 * and the ones the editor had already decided: on 2026-10-19 canada en breve
 * showed 1,013 candidates, 778 of them set aside at collection, and "Needs
 * evaluation" never drained because the AI evaluation never scans a story
 * under the floor (findEditorialEvaluationCandidates). The dashboard reads
 * these; nothing here touches the saved evaluations or decisions.
 */
export type CandidateStage = "open" | "set-aside" | "decided";

export const CANDIDATE_VIEWS = ["all", "unevaluated", "shortlist", "evaluated", "set-aside", "decided"] as const;
export type CandidateView = (typeof CANDIDATE_VIEWS)[number];

/** What a view needs of a collected story (EditorialCollectedStory, as the dashboard holds it). */
export type CandidateStory = {
  processingStatus?: "new" | "needs-enrichment" | "ready" | "selected" | "rejected" | "published" | "failed";
  reviewDecision?: "approved" | "rejected";
  duplicateOfStoryId?: string;
  evaluationDecision?: "reject" | "review" | "shortlist";
  reviewable?: boolean;
  isOwnedContent?: boolean;
  localScore: number;
};

/** The view buttons, their heading over the list and the line under it. */
export const CANDIDATE_VIEW_LABELS: Record<CandidateView, { label: string; heading: string; note: string }> = {
  all: { label: "All", heading: "Open candidates", note: "Every story the collection kept and the editor has not decided. Approve AI shortlist Stories in a batch, or select original content individually after review." },
  unevaluated: { label: "Needs evaluation", heading: "Awaiting evaluation", note: "Open candidates the AI has not read yet. Evaluate with AI reads them against the Topic's criteria, newest and best scored first." },
  shortlist: { label: "Ready to select", heading: "Ready to select", note: "AI shortlist Stories without a decision, and original content ready for review. Approve them here to move them into Production." },
  evaluated: { label: "Evaluated", heading: "Evaluated candidates", note: "Open candidates with an AI evaluation. A Story the AI did not shortlist can still be promoted after review." },
  "set-aside": { label: "Set aside", heading: "Set aside at collection", note: "Below the Topic's local floor, the same news as another candidate, or failed in processing: the AI evaluation skips them. A duplicate can be cleared; the floor is set in the editorial profile." },
  decided: { label: "Decided", heading: "Decided by the editor", note: "Selected Stories continue in Production; rejected ones stay here for the record." },
};

/** An AI shortlist Story the editor has not decided, or original content ready for its review. */
export function isReadyToSelectCandidate(story: CandidateStory): boolean {
  return (story.reviewable === true && story.evaluationDecision === "shortlist") ||
    (story.isOwnedContent === true && story.processingStatus === "ready" && !story.reviewDecision);
}

/**
 * Where a story stands. Decided: the editor approved or rejected it, or it is
 * selected or published. Set aside: marked the same news as another, failed
 * in processing, or rejected by the collection under the local floor without
 * an AI evaluation (one the AI already read stays open whatever the floor is
 * today). Open otherwise, a rejected Story above the floor included: the AI
 * evaluation under a profile scans it.
 */
export function candidateStage(story: CandidateStory, localCandidateFloor: number): CandidateStage {
  if (story.reviewDecision || story.processingStatus === "selected" || story.processingStatus === "published") return "decided";
  if (story.duplicateOfStoryId || story.processingStatus === "failed") return "set-aside";
  if (story.processingStatus === "rejected" && story.evaluationDecision === undefined && story.localScore < localCandidateFloor) return "set-aside";
  return "open";
}

/** Whether a view shows a story: the four candidate views read the open stories only. */
export function matchesCandidateView(story: CandidateStory, view: CandidateView, localCandidateFloor: number): boolean {
  const stage = candidateStage(story, localCandidateFloor);
  switch (view) {
    case "set-aside": return stage === "set-aside";
    case "decided": return stage === "decided";
    case "all": return stage === "open";
    case "unevaluated": return stage === "open" && story.evaluationDecision === undefined;
    case "shortlist": return stage === "open" && isReadyToSelectCandidate(story);
    case "evaluated": return stage === "open" && story.evaluationDecision !== undefined;
  }
}

/** How many stories each view shows. */
export function candidateViewCounts(stories: readonly CandidateStory[], localCandidateFloor: number): Record<CandidateView, number> {
  const counts = Object.fromEntries(CANDIDATE_VIEWS.map((view) => [view, 0])) as Record<CandidateView, number>;
  for (const story of stories) for (const view of CANDIDATE_VIEWS) if (matchesCandidateView(story, view, localCandidateFloor)) counts[view] += 1;
  return counts;
}

/** The view a saved dashboard state names, the two flags older states kept included; "all" for anything else. */
export function parseCandidateView(saved: Record<string, unknown> | undefined): CandidateView {
  const view = saved?.candidateView;
  if (CANDIDATE_VIEWS.includes(view as CandidateView)) return view as CandidateView;
  return saved?.shortlistOnly === true ? "shortlist" : saved?.evaluatedOnly === true ? "evaluated" : "all";
}
