import assert from "node:assert/strict";
import test from "node:test";
import { CANDIDATE_VIEWS, CANDIDATE_VIEW_LABELS, candidateStage, candidateViewCounts, isReadyToSelectCandidate, matchesCandidateView, parseCandidateView, type CandidateStory } from "./discover-candidates.core";

const FLOOR = 25;
const story = (patch: Partial<CandidateStory> = {}): CandidateStory => ({ processingStatus: "new", localScore: 40, ...patch });

test("where a collected story stands: decided by the editor, set aside by the collection, or open", () => {
  assert.equal(candidateStage(story(), FLOOR), "open");
  assert.equal(candidateStage(story({ processingStatus: "needs-enrichment", evaluationDecision: "review" }), FLOOR), "open");
  assert.equal(candidateStage(story({ reviewDecision: "approved", processingStatus: "selected" }), FLOOR), "decided");
  assert.equal(candidateStage(story({ reviewDecision: "rejected", processingStatus: "rejected", localScore: 60 }), FLOOR), "decided", "the editor's rejection is a decision, not a collection filter");
  assert.equal(candidateStage(story({ processingStatus: "published" }), FLOOR), "decided");
  assert.equal(candidateStage(story({ duplicateOfStoryId: "s9" }), FLOOR), "set-aside", "the same news as another candidate");
  assert.equal(candidateStage(story({ processingStatus: "failed" }), FLOOR), "set-aside");
  assert.equal(candidateStage(story({ processingStatus: "rejected", localScore: 10 }), FLOOR), "set-aside", "rejected by the collection under the floor: the AI never scans it");
  assert.equal(candidateStage(story({ processingStatus: "rejected", localScore: 30 }), FLOOR), "open", "rejected but above the floor: the AI evaluation under a profile scans it");
  assert.equal(candidateStage(story({ processingStatus: "rejected", localScore: 10, evaluationDecision: "reject" }), FLOOR), "open", "a story the AI already read stays open whatever the floor is today");
  assert.equal(candidateStage(story({ processingStatus: "new", localScore: 0, isOwnedContent: true }), FLOOR), "open", "a contribution the editor added has no score yet and is not set aside");
});

test("the views: the four candidate views read the open stories only; set aside and decided have their own", () => {
  const open = story();
  const evaluated = story({ evaluationDecision: "review" });
  const ready = story({ evaluationDecision: "shortlist", reviewable: true });
  const owned = story({ processingStatus: "ready", isOwnedContent: true });
  const aside = story({ processingStatus: "rejected", localScore: 8 });
  const duplicate = story({ duplicateOfStoryId: "s1", evaluationDecision: "shortlist" });
  const selected = story({ reviewDecision: "approved", processingStatus: "selected", evaluationDecision: "shortlist" });
  const rejected = story({ reviewDecision: "rejected", processingStatus: "rejected" });
  const stories = [open, evaluated, ready, owned, aside, duplicate, selected, rejected];
  assert.deepEqual(candidateViewCounts(stories, FLOOR), { all: 4, unevaluated: 2, shortlist: 2, evaluated: 2, "set-aside": 2, decided: 2 });
  assert.deepEqual(stories.map((entry) => matchesCandidateView(entry, "unevaluated", FLOOR)), [true, false, false, true, false, false, false, false], "a set-aside story never counts as needing evaluation (778 of canada en breve's 1,013 did)");
  assert.deepEqual(stories.map((entry) => matchesCandidateView(entry, "shortlist", FLOOR)), [false, false, true, true, false, false, false, false], "a shortlisted duplicate or a selected story is not ready to select");
  assert.equal(isReadyToSelectCandidate(ready), true);
  assert.equal(isReadyToSelectCandidate(story({ evaluationDecision: "shortlist", reviewable: false })), false);
  assert.deepEqual(CANDIDATE_VIEWS.map((view) => CANDIDATE_VIEW_LABELS[view].label), ["All", "Needs evaluation", "Ready to select", "Evaluated", "Set aside", "Decided"]);
});

test("a saved dashboard state names its view; older states kept two flags; anything else is All", () => {
  assert.equal(parseCandidateView({ candidateView: "set-aside" }), "set-aside");
  assert.equal(parseCandidateView({ candidateView: "shortlist" }), "shortlist");
  assert.equal(parseCandidateView({ shortlistOnly: true }), "shortlist");
  assert.equal(parseCandidateView({ evaluatedOnly: true }), "evaluated");
  assert.equal(parseCandidateView({ candidateView: "everything" }), "all");
  assert.equal(parseCandidateView(undefined), "all");
});
