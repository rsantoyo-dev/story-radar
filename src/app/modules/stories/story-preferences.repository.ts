import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { radarPreferences } from "@/db/schema";
import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";

import {
  DEFAULT_STORY_KEYWORD_PREFERENCES,
  type StoryKeywordPreferences,
} from "./story-relevance.config";

const LEGACY_PREFERENCES_ID = "default";

export type StoredStoryKeywordPreferences = StoryKeywordPreferences & {
  updatedAt?: Date;
};

/**
 * Preferences are state owned by a topic. The legacy `default` row remains in
 * place so existing installations can be migrated without losing data.
 */
export async function getStoryKeywordPreferences(
  topicId: string,
): Promise<StoredStoryKeywordPreferences> {
  const [stored] = await db
    .select({
      favoredTerms: radarPreferences.favoredTerms,
      unfavoredTerms: radarPreferences.unfavoredTerms,
      updatedAt: radarPreferences.updatedAt,
    })
    .from(radarPreferences)
    .where(eq(radarPreferences.id, preferencesId(topicId)))
    .limit(1);

  if (stored) {
    return stored;
  }

  const topic = await getTopicById(topicId);

  return topic
    ? {
        // A new topic starts with its own name as an editorial signal instead
        // of silently inheriting the old Tech/Canada preferences. The user can
        // refine this list in the dashboard before collecting.
        favoredTerms: [topic.name],
        unfavoredTerms: [],
      }
    : {
        favoredTerms: [...DEFAULT_STORY_KEYWORD_PREFERENCES.favoredTerms],
        unfavoredTerms: [...DEFAULT_STORY_KEYWORD_PREFERENCES.unfavoredTerms],
      };
}

export async function saveStoryKeywordPreferences(
  topicId: string,
  preferences: StoryKeywordPreferences,
): Promise<StoredStoryKeywordPreferences> {
  const [stored] = await db
    .insert(radarPreferences)
    .values({
      id: preferencesId(topicId),
      favoredTerms: preferences.favoredTerms,
      unfavoredTerms: preferences.unfavoredTerms,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: radarPreferences.id,
      set: {
        favoredTerms: preferences.favoredTerms,
        unfavoredTerms: preferences.unfavoredTerms,
        updatedAt: new Date(),
      },
    })
    .returning({
      favoredTerms: radarPreferences.favoredTerms,
      unfavoredTerms: radarPreferences.unfavoredTerms,
      updatedAt: radarPreferences.updatedAt,
    });

  if (!stored) {
    throw new Error("Story keyword preferences could not be saved");
  }

  return stored;
}

export function preferencesId(topicId: string): string {
  return `topic:${topicId}`;
}

export { LEGACY_PREFERENCES_ID };
