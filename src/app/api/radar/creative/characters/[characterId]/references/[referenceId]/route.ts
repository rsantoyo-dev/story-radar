import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { removeCreativeCharacterReference } from "@/app/modules/stories/creative-characters.repository";
import { readCreativeCharacterReference } from "@/app/modules/stories/manage-creative-characters";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = {
  params: Promise<{ characterId: string; referenceId: string }>;
};

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const ids = await parseIds(context);
  if (!ids) return noStoreJson({ error: "Character and reference IDs must be valid UUIDs" }, 400);

  try {
    const image = await readCreativeCharacterReference({
      topicId: await requireActiveRequestTopic(request),
      ...ids,
    });
    if (!image) return noStoreJson({ error: "The reference image was not found" }, 404);

    return new Response(image, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": image.type,
      },
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "load the reference image");
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const ids = await parseIds(context);
  if (!ids) return noStoreJson({ error: "Character and reference IDs must be valid UUIDs" }, 400);

  try {
    await removeCreativeCharacterReference(
      await requireActiveRequestTopic(request),
      ids.characterId,
      ids.referenceId,
    );
    return noStoreJson({ removed: true });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "remove the reference image");
  }
}

async function parseIds(
  context: Context,
): Promise<{ characterId: string; referenceId: string } | undefined> {
  const { characterId, referenceId } = await context.params;
  return UUID_PATTERN.test(characterId) && UUID_PATTERN.test(referenceId)
    ? { characterId, referenceId }
    : undefined;
}