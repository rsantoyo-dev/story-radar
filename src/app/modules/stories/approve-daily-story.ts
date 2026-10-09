import "server-only";
import { getSelectedStoryContent, SelectedStoryContentNotFoundError } from "./story-content.repository";
import { getEditorialProfile } from "./editorial-profile.repository";
import { plannerInputs } from "./daily-editorial-planner.repository";
import { getEditorialEvaluationPublicConfig } from "./editorial-evaluation.config";
import { promoteEditorialReviewCandidate, reviewEditorialShortlist, storyIsSelected } from "./story-editorial.repository";

/** The story is no longer a planner candidate (rejected, duplicate, aged out). */
export class DailyStoryNotEligibleError extends Error {}

/** Whether the story is still selected for production; an editor may have unselected it. */
export async function dailyStoryIsSelected(topicId: string, storyId: string) {
  return storyIsSelected(topicId, storyId);
}

/** Reuse the planner card's approval actions; retries keep an existing approval. */
export async function approveDailyStory(topicId: string, storyId: string) {
  try {
    await getSelectedStoryContent(topicId, storyId);
    return;
  } catch (error) {
    if (!(error instanceof SelectedStoryContentNotFoundError)) throw error;
  }
  const { candidates } = await plannerInputs(topicId, await getEditorialProfile(topicId), new Date());
  const candidate = candidates.find(candidate => candidate.storyId === storyId);
  if (!candidate) throw new DailyStoryNotEligibleError("The recommended story is no longer eligible for approval");
  const configuration = getEditorialEvaluationPublicConfig();
  if (candidate.decision === "shortlist") {
    await reviewEditorialShortlist(topicId, [storyId], "approved", configuration);
  } else if (candidate.decision === "review") {
    await promoteEditorialReviewCandidate(topicId, storyId, configuration);
  } else {
    throw new DailyStoryNotEligibleError("The recommended story is no longer eligible for approval");
  }
}
