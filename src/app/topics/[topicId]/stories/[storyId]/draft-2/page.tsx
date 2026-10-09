import { requireTopicPageAccess } from "@/app/modules/auth/access";
import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { resolveTopicUiTheme } from "@/app/modules/topics/topic-ui-theme";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { Draft2Canvas } from "@/app/draft-2-canvas";

type Draft2PageParams = { topicId: string; storyId: string };
type Draft2PageSearch = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The Draft 2 canvas of a story: same access and brand theme as the story page. */
export default async function Draft2Page({
  params,
  searchParams,
}: {
  params: Promise<Draft2PageParams>;
  searchParams: Promise<Draft2PageSearch>;
}) {
  await connection();
  const [{ topicId, storyId }, query] = await Promise.all([params, searchParams]);
  const { user } = await requireTopicPageAccess(topicId, "viewer", `/topics/${encodeURIComponent(topicId)}/stories/${encodeURIComponent(storyId)}/draft-2`);
  const topic = await getTopicById(topicId);
  if (!topic) notFound();
  // A brand still in its guided setup has no studio yet.
  if (user && topic.setupCompletedAt === null) redirect(`/?topicId=${encodeURIComponent(topicId)}`);
  const themeStyle = await resolveTopicUiTheme(topicId, topic.themeKey);

  return <Draft2Canvas
    signedIn={Boolean(user)}
    topicId={topicId}
    topicName={topic.name}
    themeStyle={themeStyle}
    storyId={storyId}
    from={single(query.from)}
    returnContext={single(query.returnContext)}
  />;
}
