import { getStoryKeywordPreferences } from "@/app/modules/stories/story-preferences.repository";
import { currentWorkspace, requirePageAccess } from "@/app/modules/auth/access";
import {
  DEFAULT_WORKSPACE_ID,
  getDefaultTopic,
  listTopics,
} from "@/app/modules/topics/topic-catalog.repository";
import { connection } from "next/server";
import { resolveTopicUiTheme } from "@/app/modules/topics/topic-ui-theme";

import { getTopicSetupStatus } from "@/app/modules/topics/topic-setup";

import { FirstTopicSetup } from "./account/first-topic-setup";
import { RadarDashboard } from "./radar-dashboard";
import { TopicSetupWizard } from "./topic-setup-wizard";

type HomeQuery = {
  topicId?: string | string[];
  metaTopicId?: string | string[];
  metaConnected?: string | string[];
  metaError?: string | string[];
  metaFacebookSelectionId?: string | string[];
};

export default async function Home({ searchParams }: { searchParams: Promise<HomeQuery> }) {
  await connection();
  // Signed in: the member's own workspace. Sign-in off: the default workspace, as before.
  const { user, workspaces } = await requirePageAccess("/");
  const workspace = user ? currentWorkspace(workspaces) : undefined;
  const workspaceId = workspace?.workspaceId ?? DEFAULT_WORKSPACE_ID;

  const [topics, query] = await Promise.all([listTopics(workspaceId), searchParams]);
  if (user && !topics.length) {
    return <FirstTopicSetup email={user.email} workspaceName={workspace?.name ?? "Your workspace"} />;
  }
  // Signed in, a brand opens the studio only after its guided setup; the default is a ready brand.
  const ready = (topic: (typeof topics)[number]) => !user || topic.setupCompletedAt !== null;
  const defaultTopic = workspaceId === DEFAULT_WORKSPACE_ID
    ? await getDefaultTopic()
    : topics.find((topic) => topic.isActive && ready(topic)) ?? topics.find((topic) => topic.isActive) ?? topics[0]!;
  const requestedTopicId = typeof query.metaTopicId === "string" ? query.metaTopicId : typeof query.topicId === "string" ? query.topicId : undefined;
  const selectedTopic = topics.find((topic) => topic.id === requestedTopicId && topic.isActive) ?? defaultTopic;

  if (user && !ready(selectedTopic)) {
    return <TopicSetupWizard
      topic={{ id: selectedTopic.id, name: selectedTopic.name }}
      topics={topics.filter((topic) => topic.isActive).map((topic) => ({ id: topic.id, name: topic.name, ready: ready(topic) }))}
      account={{ email: user.email, name: user.name, workspaceName: workspace?.name ?? "", role: workspace?.role ?? "viewer" }}
      themeStyle={await resolveTopicUiTheme(selectedTopic.id, selectedTopic.themeKey)}
      initialStatus={await getTopicSetupStatus(selectedTopic.id)}
      meta={{
        ...(typeof query.metaFacebookSelectionId === "string" && query.metaTopicId === selectedTopic.id ? { facebookSelectionId: query.metaFacebookSelectionId } : {}),
        ...(query.metaConnected === "1" && query.metaTopicId === selectedTopic.id ? { connected: true } : {}),
        ...(typeof query.metaError === "string" && query.metaTopicId === selectedTopic.id ? { error: query.metaError } : {}),
      }}
    />;
  }
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
        ready: ready(topic),
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
