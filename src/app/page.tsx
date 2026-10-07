import { getStoryKeywordPreferences } from "@/app/modules/stories/story-preferences.repository";
import { currentWorkspace, requirePageAccess } from "@/app/modules/auth/access";
import {
  DEFAULT_WORKSPACE_ID,
  getDefaultTopic,
  listTopics,
} from "@/app/modules/topics/topic-catalog.repository";
import { connection } from "next/server";
import { resolveTopicUiTheme } from "@/app/modules/topics/topic-ui-theme";

import { FirstTopicSetup } from "./account/first-topic-setup";
import { RadarDashboard } from "./radar-dashboard";

export default async function Home({ searchParams }: { searchParams: Promise<{ topicId?: string | string[]; metaTopicId?: string | string[] }> }) {
  await connection();
  // Signed in: the member's own workspace. Sign-in off: the default workspace, as before.
  const { user, workspaces } = await requirePageAccess("/");
  const workspace = user ? currentWorkspace(workspaces) : undefined;
  const workspaceId = workspace?.workspaceId ?? DEFAULT_WORKSPACE_ID;

  const [topics, query] = await Promise.all([listTopics(workspaceId), searchParams]);
  if (user && !topics.length) {
    return <FirstTopicSetup email={user.email} workspaceName={workspace?.name ?? "Your workspace"} />;
  }
  const defaultTopic = workspaceId === DEFAULT_WORKSPACE_ID
    ? await getDefaultTopic()
    : topics.find((topic) => topic.isActive) ?? topics[0]!;
  const requestedTopicId = typeof query.metaTopicId === "string" ? query.metaTopicId : typeof query.topicId === "string" ? query.topicId : undefined;
  const selectedTopic = topics.find((topic) => topic.id === requestedTopicId && topic.isActive) ?? defaultTopic;
  const preferences = await getStoryKeywordPreferences(selectedTopic.id);
  const initialThemeStyle = await resolveTopicUiTheme(selectedTopic.id, selectedTopic.themeKey);

  return (
    <RadarDashboard
      {...(user ? { account: { email: user.email, name: user.name, workspaceName: workspace?.name ?? "", role: workspace?.role ?? "viewer" } } : {})}
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
