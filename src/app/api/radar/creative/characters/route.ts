import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  createCreativeCharacter,
  listCreativeCharacters,
} from "@/app/modules/stories/creative-characters.repository";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";
import { withApiLog } from "@/app/modules/observability/api-request-log";

export const runtime = "nodejs";

async function route_GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson(
      await listCreativeCharacters(await requireActiveRequestTopic(request)),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "load the supporting characters");
  }
}

async function route_POST(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson(
      await createCreativeCharacter(
        await requireActiveRequestTopic(request),
        await request.json(),
      ),
      201,
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "create the supporting character");
  }
}

export const GET = withApiLog(route_GET);
export const POST = withApiLog(route_POST);
