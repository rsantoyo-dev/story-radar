import "server-only";

import {
  collectStoryCandidates,
  type CollectStoryCandidatesOptions,
} from "./collect-story-candidates";
import {
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
  const radar = await collectStoryCandidates(collectionOptions);
  const persistence = await persistStoryRadarResult(topicId, radar, retention);

  return {
    radar,
    persistence,
  };
}
