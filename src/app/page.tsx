import { getStoryKeywordPreferences } from "@/app/modules/stories/story-preferences.repository";
import {
  getDefaultTopic,
  listTopics,
} from "@/app/modules/topics/topic-catalog.repository";
import { connection } from "next/server";

import { RadarDashboard } from "./radar-dashboard";

export default async function Home() {
  await connection();

  const [defaultTopic, topics] = await Promise.all([
    getDefaultTopic(),
    listTopics(),
  ]);
  const preferences = await getStoryKeywordPreferences(defaultTopic.id);

  return (
    <RadarDashboard
      initialTopicId={defaultTopic.id}
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
