import { requireTopicPageAccess } from "@/app/modules/auth/access";
import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { resolveTopicUiTheme } from "@/app/modules/topics/topic-ui-theme";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { StoryWorkspacePageClient } from "./story-workspace-page-client";

type StoryPageParams = { topicId: string; storyId: string };
type StoryPageSearch = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<StoryPageParams>;
  searchParams: Promise<StoryPageSearch>;
}) {
  await connection();
  const [{ topicId, storyId }, query] = await Promise.all([params, searchParams]);
  const { user } = await requireTopicPageAccess(topicId, "viewer", `/topics/${encodeURIComponent(topicId)}/stories/${encodeURIComponent(storyId)}`);
  const topic = await getTopicById(topicId);
  if (!topic) notFound();
  // A brand still in its guided setup has no studio yet.
  if (user && topic.setupCompletedAt === null) redirect(`/?topicId=${encodeURIComponent(topicId)}`);
  const themeStyle = await resolveTopicUiTheme(topicId, topic.themeKey);

  return <StoryWorkspacePageClient
    signedIn={Boolean(user)}
    topicId={topicId}
    topicName={topic.name}
    themeStyle={themeStyle}
    storyId={storyId}
    from={single(query.from)}
    returnContext={single(query.returnContext)}
    initialTab={single(query.tab)}
    initialDraftId={single(query.draftId)}
    initialEditorialRunId={single(query.editorialRunId)}
    initialPreparationRunId={single(query.preparationRunId)}
  />;
}
