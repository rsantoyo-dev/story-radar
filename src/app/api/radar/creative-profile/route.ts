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

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson(await getCreativeProfile(await requireRequestTopic(request)));
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "read the creative profile");
  }
}

export async function PUT(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const value: unknown = await request.json();
    const preserveExistingBrandOverlay =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      !("brandOverlay" in value);
    const input = parseCreativeProfileInput(value);
    return noStoreJson(
      await saveCreativeProfile(await requireRequestTopic(request), input, {
        preserveExistingBrandOverlay,
      }),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "save the creative profile");
  }
}
