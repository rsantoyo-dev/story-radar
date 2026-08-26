import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  archiveCreativeCharacter,
  updateCreativeCharacter,
} from "@/app/modules/stories/creative-characters.repository";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ characterId: string }> };

export async function PATCH(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const characterId = await parseCharacterId(context);
  if (!characterId) {
    return noStoreJson({ error: "characterId must be a valid UUID" }, 400);
  }

  try {
    return noStoreJson(
      await updateCreativeCharacter(
        await requireActiveRequestTopic(request),
        characterId,
        await request.json(),
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "update the supporting character");
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const characterId = await parseCharacterId(context);
  if (!characterId) {
    return noStoreJson({ error: "characterId must be a valid UUID" }, 400);
  }

  try {
    await archiveCreativeCharacter(
      await requireActiveRequestTopic(request),
      characterId,
    );
    return noStoreJson({ archived: true });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "remove the supporting character");
  }
}

async function parseCharacterId(context: Context): Promise<string | undefined> {
  const { characterId } = await context.params;
  return UUID_PATTERN.test(characterId) ? characterId : undefined;
}