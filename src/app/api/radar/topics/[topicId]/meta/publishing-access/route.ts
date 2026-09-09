import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { checkInstagramPublishingAccess } from "@/app/modules/meta/check-instagram-publishing-access";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Explicit read-only verification; no media, approval or connection mutations. */
export async function POST(request: Request, context: { params: Promise<{ topicId: string }> }) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const { topicId } = await context.params;
    await requireTopic(topicId, { active: true });
    return noStoreJson(await checkInstagramPublishingAccess(topicId));
  } catch (error) {
    if (error instanceof TopicContextError) return noStoreJson({ error: error.message }, 404);
    // No raw provider/crypto errors: those can contain tokens and request URLs.
    return noStoreJson({ error: "Unable to verify Instagram publishing access" }, 503);
  }
}
