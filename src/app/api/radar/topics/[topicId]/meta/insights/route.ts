import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { topicInstagramInsights } from "@/app/modules/meta/instagram-insights";
import { TopicContextError, requireTopic } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };
const PERIODS = new Set([7, 30, 90]);

/**
 * The topic's Instagram posts with their readings over time, for the
 * dashboard's performance view: `days` is the period (7, 30 or 90; absent
 * for every post), and the posts of the period before it come too, for the
 * comparison. Read-only: never calls Graph.
 */
export async function GET(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const { topicId } = await context.params;
    const topic = await requireTopic(topicId, { active: true });
    const raw = new URL(request.url).searchParams.get("days");
    const days = raw === null || raw === "" ? null : Number(raw);
    if (days !== null && !PERIODS.has(days)) return noStoreJson({ error: "days must be 7, 30 or 90, or absent for every post" }, 400);
    return noStoreJson(await topicInstagramInsights(topic.id, { days }));
  } catch (error) {
    if (error instanceof TopicContextError) return noStoreJson({ error: error.message }, 404);
    console.error("Failed to read Instagram insights", error);
    return noStoreJson({ error: "Unable to read Instagram insights" }, 500);
  }
}
