import { getStoryKeywordPreferences } from "@/app/modules/stories/story-preferences.repository";
import {
  getDefaultTopic,
  listTopics,
} from "@/app/modules/topics/topic-catalog.repository";
import { connection } from "next/server";
import { resolveTopicUiTheme } from "@/app/modules/topics/topic-ui-theme";

import { RadarDashboard } from "./radar-dashboard";

export default async function Home({ searchParams }: { searchParams: Promise<{ topicId?: string | string[]; metaTopicId?: string | string[] }> }) {
  await connection();

  const [defaultTopic, topics, query] = await Promise.all([
    getDefaultTopic(),
    listTopics(),
    searchParams,
  ]);
  const requestedTopicId = typeof query.metaTopicId === "string" ? query.metaTopicId : typeof query.topicId === "string" ? query.topicId : undefined;
  const selectedTopic = topics.find((topic) => topic.id === requestedTopicId && topic.isActive) ?? defaultTopic;
  const preferences = await getStoryKeywordPreferences(selectedTopic.id);
  const initialThemeStyle = await resolveTopicUiTheme(selectedTopic.id, selectedTopic.themeKey);

  return (
    <RadarDashboard
      initialTopicId={selectedTopic.id}
      initialThemeStyle={initialThemeStyle}
      initialTopics={topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
        ...(topic.description ? { description: topic.description } : {}),
        themeKey: topic.themeKey,
        isActive: topic.isActive,
      }))}
      initialPreferences={{
        favoredTerms: preferences.favoredTerms,
        unfavoredTerms: preferences.unfavoredTerms,
        ...(preferences.updatedAt
          ? { updatedAt: preferences.updatedAt.toISOString() }
          : {}),
      }}
    />
  );
}
