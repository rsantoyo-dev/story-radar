import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { connection } from "next/server";
import { notFound } from "next/navigation";

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
  const topic = await getTopicById(topicId);
  if (!topic) notFound();

  return <StoryWorkspacePageClient
    topicId={topicId}
    topicName={topic.name}
    topicThemeKey={topic.themeKey}
    storyId={storyId}
    from={single(query.from)}
    initialTab={single(query.tab)}
    initialDraftId={single(query.draftId)}
    initialEditorialRunId={single(query.editorialRunId)}
    initialPreparationRunId={single(query.preparationRunId)}
  />;
}
