import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { uploadCreativeCharacterReference } from "@/app/modules/stories/manage-creative-characters";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ characterId: string }> };

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const characterId = await parseCharacterId(context);
  if (!characterId) {
    return noStoreJson({ error: "characterId must be a valid UUID" }, 400);
  }

  try {
    const form = await request.formData();
    if ([...form.keys()].some((key) => key !== "image")) {
      return noStoreJson({ error: "Only an image field may be provided" }, 400);
    }
    const image = form.get("image");
    if (!(image instanceof File)) {
      return noStoreJson({ error: "An image file is required" }, 400);
    }

    return noStoreJson(
      await uploadCreativeCharacterReference({
        topicId: await requireActiveRequestTopic(request),
        characterId,
        image,
      }),
      201,
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "upload the reference image");
  }
}

async function parseCharacterId(context: Context): Promise<string | undefined> {
  const { characterId } = await context.params;
  return UUID_PATTERN.test(characterId) ? characterId : undefined;
}