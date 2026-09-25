import { EditorialLineError } from "@/app/modules/editorial-lines/editorial-lines";
import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  createCreativeBrief,
  suggestEditorialFocus,
  CreativeDraftValidationError,
  getCreativeWorkspaceState,
} from "@/app/modules/stories/manage-creative-content";
import {
  CREATIVE_CONVERSION_GOALS,
  CREATIVE_FRAMING_STRATEGIES,
  CREATIVE_STORY_STRUCTURES,
  isCreativeConversionGoal,
  isCreativeFramingStrategy,
  isCreativeStoryStructure,
  type CreativeBriefOverrides,
} from "@/app/modules/stories/creative-content.types";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../creative-route-error";

export const runtime = "nodejs";
// Brief/draft generation chains several model calls and a bounded editorial
// review; the generator enforces its own time budget inside this limit.
export const maxDuration = 300;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ storyId: string }> };

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const storyId = await parseId(context);

  if (!storyId) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  try {
    return noStoreJson(
      await getCreativeWorkspaceState(
        await requireActiveRequestTopic(request),
        storyId,
        new URL(request.url).searchParams.get("preparationRunId") || undefined,
      ),
    );
  } catch (error) {
    if(error instanceof EditorialLineError)return noStoreJson({error:error.message},error.status);
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "read the creative workspace");
  }
}

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const preparationRunId = new URL(request.url).searchParams.get("preparationRunId") || undefined;
  if (preparationRunId && !UUID_PATTERN.test(preparationRunId)) {
    return noStoreJson({ error: "preparationRunId must be a valid UUID" }, 400);
  }
  const storyId = await parseId(context);

  if (!storyId) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  try {
    const { editorialDirection, overrides } = await parseCreativeBriefRequest(request);
    if (new URL(request.url).searchParams.get("action") === "editorial-focus") {
      const params = new URL(request.url).searchParams;
      return noStoreJson(await suggestEditorialFocus(
        await requireActiveRequestTopic(request), storyId, editorialDirection,
        params.get("editorialRunId") || undefined, preparationRunId,
        params.get("timezone") || "UTC",
      ));
    }
    return noStoreJson(
      await createCreativeBrief(
        await requireActiveRequestTopic(request),
        storyId,
        editorialDirection,
        new URL(request.url).searchParams.get("editorialRunId") || undefined,
        preparationRunId,
        Boolean(preparationRunId),
        overrides,
      ),
    );
  } catch (error) {
    if(error instanceof EditorialLineError)return noStoreJson({error:error.message},error.status);
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "create the creative brief");
  }
}

async function parseCreativeBriefRequest(
  request: Request,
): Promise<{ editorialDirection?: string; overrides?: CreativeBriefOverrides }> {
  const text = await request.text();
  if (!text.trim()) return {};
  const body = JSON.parse(text) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CreativeDraftValidationError("A JSON object is required");
  }
  const record = body as Record<string, unknown>;
  const value = record.editorialDirection;
  if (value !== undefined && value !== null && value !== "" && typeof value !== "string") {
    throw new CreativeDraftValidationError(
      "editorialDirection must be text",
    );
  }
  return {
    ...(typeof value === "string" && value !== "" ? { editorialDirection: value } : {}),
    ...(record.overrides !== undefined ? { overrides: parseBriefOverrides(record.overrides) } : {}),
  };
}

function parseBriefOverrides(value: unknown): CreativeBriefOverrides | undefined {
  if (value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CreativeDraftValidationError("overrides must be an object");
  }
  const record = value as Record<string, unknown>;
  const overrides: CreativeBriefOverrides = {};
  const present = (field: unknown) => field !== undefined && field !== null && field !== "";
  if (present(record.storyStructure)) {
    if (!isCreativeStoryStructure(record.storyStructure)) {
      throw new CreativeDraftValidationError(`overrides.storyStructure must be one of: ${CREATIVE_STORY_STRUCTURES.join(", ")}`);
    }
    overrides.storyStructure = record.storyStructure;
  }
  if (present(record.framingStrategy)) {
    if (!isCreativeFramingStrategy(record.framingStrategy)) {
      throw new CreativeDraftValidationError(`overrides.framingStrategy must be one of: ${CREATIVE_FRAMING_STRATEGIES.join(", ")}`);
    }
    overrides.framingStrategy = record.framingStrategy;
  }
  if (present(record.conversionGoal)) {
    if (!isCreativeConversionGoal(record.conversionGoal)) {
      throw new CreativeDraftValidationError(`overrides.conversionGoal must be one of: ${CREATIVE_CONVERSION_GOALS.join(", ")}`);
    }
    overrides.conversionGoal = record.conversionGoal;
  }
  return Object.keys(overrides).length ? overrides : undefined;
}

async function parseId(context: Context): Promise<string | undefined> {
  const { storyId } = await context.params;
  return UUID_PATTERN.test(storyId) ? storyId : undefined;
}
