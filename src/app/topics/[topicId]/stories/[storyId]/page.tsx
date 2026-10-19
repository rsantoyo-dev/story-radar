import { requireTopicPageAccess } from "@/app/modules/auth/access";
import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { resolveTopicUiTheme } from "@/app/modules/topics/topic-ui-theme";
import { latestDraft2Session } from "@/app/modules/draft2/draft2-session.repository";
import { draft2StepHref } from "@/app/draft-2-canvas.core";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { PublishedStoryPageClient } from "./published-story-page-client";

type StoryPageParams = { topicId: string; storyId: string };
type StoryPageSearch = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The story's page since the studio retired (2026-10-19): every link that
 * opened the v1 studio (a draft, a preparation run, a tab) opens the story in
 * Draft 2 instead, on its publication step when the link asked for the
 * publication. A story published with the studio and never opened in Draft 2
 * keeps a page of its own: its Instagram results, and the way into Draft 2.
 */
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
  const context = { from: single(query.from), returnContext: single(query.returnContext) };
  const publication = single(query.tab) === "publication";
  const session = publication ? await latestDraft2Session(topicId, storyId).catch(() => undefined) : undefined;
  if (!publication || session) redirect(draft2StepHref(topicId, storyId, publication ? "publish" : undefined, context));
  const themeStyle = await resolveTopicUiTheme(topicId, topic.themeKey);
  return <PublishedStoryPageClient signedIn={Boolean(user)} topicId={topicId} topicName={topic.name} themeStyle={themeStyle} storyId={storyId} from={context.from} returnContext={context.returnContext} />;
}
