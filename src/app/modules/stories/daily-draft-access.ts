import "server-only";
import { getSelectedStoryContent } from "./story-content.repository";

/** Daily preparation uses the same persisted approval as the ordinary workspace. */
export async function getDailyDraftStory(topicId:string,storyId:string,runId?:string,workspace=false) {
  // Keep the signature compatible with historical runs and workspace callers.
  void runId;
  void workspace;
  return getSelectedStoryContent(topicId,storyId);
}
