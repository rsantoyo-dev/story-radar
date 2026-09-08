import { attachStoryContext } from "../editorial-lines/editorial-lines.repository";
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
    editorialRunId?: string;
  };

export async function collectAndPersistStoryCandidates(
  options: CollectAndPersistStoryCandidatesOptions,
) {
  const { topicId, retention, editorialRunId, ...collectionOptions } = options;
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
  const persistence = await persistStoryRadarResult(topicId, radar, retention, collectionOptions.editorialContext && editorialRunId ? (storyId, candidate) => attachStoryContext(topicId,storyId,editorialRunId,collectionOptions.editorialContext!,candidate.research?.reasons ?? candidate.relevance.reasons) : undefined);

  return {
    radar,
    persistence,
  };
}
