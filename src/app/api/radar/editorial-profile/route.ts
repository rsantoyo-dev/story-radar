import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  EditorialProfileNotFoundError,
  EditorialProfileValidationError,
  getEditorialProfile,
  parseEditorialProfileInput,
  saveEditorialProfile,
} from "@/app/modules/stories/editorial-profile.repository";
import { NextResponse } from "next/server";

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
    return noStoreJson(
      await getEditorialProfile(await requireRequestTopic(request)),
    );
  } catch (error) {
    return editorialProfileErrorResponse(error, "read the editorial profile");
  }
}

async function route_PUT(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const input = parseEditorialProfileInput(await request.json());

    return noStoreJson(
      await saveEditorialProfile(await requireRequestTopic(request), input),
    );
  } catch (error) {
    return editorialProfileErrorResponse(error, "save the editorial profile");
  }
}

function editorialProfileErrorResponse(error: unknown, operation: string) {
  const topicError = topicRequestErrorResponse(error);
  if (topicError) return topicError;

  if (error instanceof EditorialProfileNotFoundError) {
    return noStoreJson({ error: error.message }, 404);
  }

  if (error instanceof SyntaxError) {
    return noStoreJson({ error: "The JSON body is invalid" }, 400);
  }

  if (error instanceof EditorialProfileValidationError) {
    return noStoreJson({ error: error.message }, 400);
  }

  console.error(`Failed to ${operation}`, error);
  return noStoreJson({ error: `Unable to ${operation}` }, 500);
}

function noStoreJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withApiLog(route_GET);
export const PUT = withApiLog(route_PUT);
