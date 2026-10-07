import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { EditorialLineError } from "@/app/modules/editorial-lines/editorial-lines";
import {
  AutoCollectionValidationError,
  getAutoCollectionSettings,
  listTopicScoops,
  saveAutoCollectionSettings,
  updateTopicScoop,
} from "@/app/modules/stories/auto-collection.repository";
import { previewScoops } from "@/app/modules/stories/auto-collection";
import { TopicContextError } from "@/app/modules/topics/topic-context";

import { topicFromContext, type TopicRouteContext } from "../meta/facebook/facebook-route-utils";

/**
 * GET settings + recent scoops. GET ?preview=1[&minGrowth=&minEditorial=&maxAgeHours=]
 * lists which recent stories would qualify — read-only, spends no AI.
 * PUT settings; PATCH {scoopId, action: "seen"|"dismiss"}.
 */
export async function GET(request: Request, context: TopicRouteContext) {
  const params = new URL(request.url).searchParams;
  if (params.get("preview") === "1") {
    return handle(request, context, async (topicId) => {
      const saved = await getAutoCollectionSettings(topicId);
      const number = (name: string, fallback: number) => {
        const value = Number(params.get(name));
        return Number.isInteger(value) && value >= 1 && value <= 100 ? value : fallback;
      };
      const thresholds = {
        scoopMinGrowth: number("minGrowth", saved?.scoopMinGrowth ?? 85),
        scoopMinEditorial: number("minEditorial", saved?.scoopMinEditorial ?? 80),
        scoopMaxAgeHours: Math.min(72, number("maxAgeHours", saved?.scoopMaxAgeHours ?? 6)),
      };
      return { thresholds, candidates: await previewScoops(topicId, thresholds) };
    });
  }
  return handle(request, context, async (topicId) => ({ settings: await getAutoCollectionSettings(topicId) ?? null, scoops: await listTopicScoops(topicId) }));
}

export async function PUT(request: Request, context: TopicRouteContext) {
  return handle(request, context, async (topicId) => ({ settings: await saveAutoCollectionSettings(topicId, await request.json().catch(() => undefined)) }));
}

export async function PATCH(request: Request, context: TopicRouteContext) {
  return handle(request, context, async (topicId) => {
    const body = (await request.json().catch(() => undefined)) as { scoopId?: unknown; action?: unknown } | undefined;
    if (typeof body?.scoopId !== "string") throw new AutoCollectionValidationError("scoopId is required.");
    return { scoops: await updateTopicScoop(topicId, body.scoopId, body.action) };
  });
}

async function handle(request: Request, context: TopicRouteContext, run: (topicId: string) => Promise<unknown>) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topic = await topicFromContext(context);
    return noStoreJson(await run(topic.id));
  } catch (error) {
    if (error instanceof TopicContextError) return noStoreJson({ error: error.message }, 404);
    if (error instanceof AutoCollectionValidationError || error instanceof EditorialLineError) return noStoreJson({ error: error.message }, 400);
    console.error("Auto collection settings request failed", error);
    return noStoreJson({ error: "Unable to update the automatic reader" }, 500);
  }
}
