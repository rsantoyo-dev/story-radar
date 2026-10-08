import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  getCreativeProfile,
  parseCreativeProfileInput,
  saveCreativeProfile,
} from "@/app/modules/stories/creative-profile.repository";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../creative-route-error";
import {
  requireRequestTopic,
  topicRequestErrorResponse,
} from "../radar-topic";
import { withApiLog } from "@/app/modules/observability/api-request-log";

export const runtime = "nodejs";

async function route_GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson(await getCreativeProfile(await requireRequestTopic(request)));
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "read the creative profile");
  }
}

async function route_PUT(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const value: unknown = await request.json();
    const preserveExistingBrandOverlay =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      !("brandOverlay" in value);
    const input = parseCreativeProfileInput(value);
    const { profile, visualPolicyChange } = await saveCreativeProfile(
      await requireRequestTopic(request),
      input,
      { preserveExistingBrandOverlay },
    );
    return noStoreJson({
      ...profile,
      ...(visualPolicyChange ? { visualPolicyChange } : {}),
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "save the creative profile");
  }
}

export const GET = withApiLog(route_GET);
export const PUT = withApiLog(route_PUT);
