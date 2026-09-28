import "server-only";

import { readStoredCreativeProfile } from "@/app/modules/stories/creative-profile.repository";
import { topicThemeStyle } from "@/design/topic-themes";

/** One palette contract for dashboard, Story, Help, and their descendant dialogs. */
export async function resolveTopicUiTheme(topicId: string, themeKey: string) {
  const profile = await readStoredCreativeProfile(topicId);
  return topicThemeStyle(themeKey, profile);
}
