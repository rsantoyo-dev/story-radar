import { requireTopicPageAccess } from "@/app/modules/auth/access";
import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { resolveTopicUiTheme } from "@/app/modules/topics/topic-ui-theme";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { Draft2Canvas } from "@/app/draft-2-canvas";
import { isDraft2Step } from "@/app/draft-2-canvas.core";

type Draft2PageParams = { topicId: string; storyId: string; step?: string[] };
type Draft2PageSearch = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The Draft 2 canvas of a story: same access and brand theme as the story
 * page. `/draft-2` is the overview and `/draft-2/<step>` a step's own
 * screen; the canvas switches between them in the browser without leaving
 * this page, so a run in progress keeps going while the editor moves.
 */
export default async function Draft2Page({
  params,
  searchParams,
}: {
  params: Promise<Draft2PageParams>;
  searchParams: Promise<Draft2PageSearch>;
}) {
  await connection();
  const [{ topicId, storyId, step }, query] = await Promise.all([params, searchParams]);
  if (step && (step.length > 1 || !isDraft2Step(step[0]))) notFound();
  const { user } = await requireTopicPageAccess(topicId, "viewer", `/topics/${encodeURIComponent(topicId)}/stories/${encodeURIComponent(storyId)}/draft-2${step ? `/${step[0]}` : ""}`);
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
