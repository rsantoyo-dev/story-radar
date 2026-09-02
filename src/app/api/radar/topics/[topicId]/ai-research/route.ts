import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  AiResearchSourceNotFoundError,
  AiResearchSourceValidationError,
  getAiResearchSourceConfig,
  saveAiResearchSourceConfig,
} from "@/app/modules/sources/ai-research/ai-research.repository";
import type { UpdateAiResearchSourceInput } from "@/app/modules/sources/ai-research/ai-research.types";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

import { jsonObject, noStoreJson } from "../../topic-route-utils";

type Context = { params: Promise<{ topicId: string }> };

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson({
      source: await getAiResearchSourceConfig(await topicIdFromContext(context)),
    });
  } catch (error) {
    return errorResponse(error, "load AI research settings");
  }
}

export async function PUT(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson({
      source: await saveAiResearchSourceConfig(
        await topicIdFromContext(context),
        (await jsonObject(request)) as UpdateAiResearchSourceInput,
      ),
    });
  } catch (error) {
    return errorResponse(error, "save AI research settings");
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId)).id;
}

function errorResponse(error: unknown, action: string) {
  if (error instanceof TopicContextError || error instanceof AiResearchSourceNotFoundError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof AiResearchSourceValidationError) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error(`Unable to ${action}`, error);
  return noStoreJson({ error: `Unable to ${action}` }, 500);
}
