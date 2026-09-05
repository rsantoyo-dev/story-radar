import "server-only";

import {
  collectStoryCandidates,
  type CollectStoryCandidatesOptions,
} from "./collect-story-candidates";
import {
  getRecentTopicStoryTitles,
  persistStoryRadarResult,
  type StoryRadarRetentionOptions,
} from "./story-radar.repository";

export type CollectAndPersistStoryCandidatesOptions =
  CollectStoryCandidatesOptions & {
    topicId: string;
    retention?: StoryRadarRetentionOptions;
  };

export async function collectAndPersistStoryCandidates(
  options: CollectAndPersistStoryCandidatesOptions,
) {
  const { topicId, retention, ...collectionOptions } = options;
  const now = collectionOptions.now ?? new Date();
  const aiResearch = collectionOptions.aiResearch?.config.enabled
    ? {
        ...collectionOptions.aiResearch,
        alreadyCovered: await getRecentTopicStoryTitles(topicId, now),
      }
    : collectionOptions.aiResearch;
  const radar = await collectStoryCandidates({
    ...collectionOptions,
    now,
    aiResearch,
  });
  const persistence = await persistStoryRadarResult(topicId, radar, retention);

  return {
    radar,
    persistence,
  };
}
