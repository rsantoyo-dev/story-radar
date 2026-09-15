import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { jsonObject, noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  AcquisitionLensError,
  parseTopicAcquisitionTaxonomyPublication,
} from "@/app/modules/stories/acquisition-lenses";
import {
  getCurrentTopicAcquisitionTaxonomy,
  publishTopicAcquisitionTaxonomy,
  TopicAcquisitionTaxonomyConflictError,
  TopicAcquisitionTaxonomyNotFoundError,
} from "@/app/modules/stories/topic-acquisition-lenses.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

export const runtime = "nodejs";

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson({ taxonomy: await getCurrentTopicAcquisitionTaxonomy(await topicIdFromContext(context)) });
  } catch (error) {
    return taxonomyErrorResponse(error, "load the acquisition taxonomy");
  }
}

export async function PUT(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const input = parseTopicAcquisitionTaxonomyPublication(
      await jsonObject(request),
    );
    return noStoreJson({ taxonomy: await publishTopicAcquisitionTaxonomy(topicId, input) }, 201);
  } catch (error) {
    return taxonomyErrorResponse(error, "publish the acquisition taxonomy");
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function taxonomyErrorResponse(error: unknown, action: string) {
  if (error instanceof TopicContextError || error instanceof TopicAcquisitionTaxonomyNotFoundError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof AcquisitionLensError || error instanceof SyntaxError) {
    return noStoreJson({ error: error instanceof SyntaxError ? "The JSON body is invalid" : error.message }, 400);
  }
  if (error instanceof TopicAcquisitionTaxonomyConflictError) {
    return noStoreJson({ error: error.message }, 409);
  }

  console.error(`Failed to ${action}`, error);
  return noStoreJson({ error: `Unable to ${action}` }, 500);
}
