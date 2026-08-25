import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  deleteStorySocialPublication,
  listStoryPublications,
  parseSocialPublicationPlatform,
  parseStorySocialPublicationInput,
  SelectedStoryPublicationNotFoundError,
  SocialPublicationValidationError,
  upsertStorySocialPublication,
} from "@/app/modules/stories/social-publications.repository";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const UPSERT_FIELDS = new Set([
  "platform",
  "status",
  "scheduledAt",
  "publishedAt",
  "postUrl",
  "note",
]);
const DELETE_FIELDS = new Set(["platform"]);

type Context = { params: Promise<{ storyId: string }> };

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const storyId = await parseStoryId(context);
  if (!storyId) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  try {
    const publications = await listStoryPublications(
      await requireActiveRequestTopic(request),
      [storyId],
    );
    return noStoreJson({ publications });
  } catch (error) {
    return publicationRouteError(error, "read publication tracking");
  }
}

export async function PUT(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const storyId = await parseStoryId(context);
  if (!storyId) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  try {
    const input = parseUpsertPublicationInput(await request.json());
    const publication = await upsertStorySocialPublication(
      await requireActiveRequestTopic(request),
      storyId,
      input,
    );
    return noStoreJson({ publication });
  } catch (error) {
    return publicationRouteError(error, "save publication tracking");
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const storyId = await parseStoryId(context);
  if (!storyId) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  try {
    const platform = parseDeletePlatform(await request.json());
    const deleted = await deleteStorySocialPublication(
      await requireActiveRequestTopic(request),
      storyId,
      platform,
    );
    return noStoreJson({ deleted });
  } catch (error) {
    return publicationRouteError(error, "clear publication tracking");
  }
}

async function parseStoryId(context: Context): Promise<string | undefined> {
  const { storyId } = await context.params;
  return UUID_PATTERN.test(storyId) ? storyId : undefined;
}

function parseDeletePlatform(value: unknown) {
  if (!isRecord(value)) {
    throw new SocialPublicationValidationError(
      "The request body must be an object",
    );
  }
  assertAllowedFields(value, DELETE_FIELDS);
  return parseSocialPublicationPlatform(value.platform);
}

function parseUpsertPublicationInput(value: unknown) {
  if (!isRecord(value)) {
    return parseStorySocialPublicationInput(value);
  }

  assertAllowedFields(value, UPSERT_FIELDS);
  assertOptionalIsoDate(value.scheduledAt, "scheduledAt");
  assertOptionalIsoDate(value.publishedAt, "publishedAt");
  return parseStorySocialPublicationInput(value);
}

function assertAllowedFields(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
): void {
  const unsupported = Object.keys(value).find((key) => !allowedFields.has(key));
  if (unsupported) {
    throw new SocialPublicationValidationError(
      `Unsupported publication field: ${unsupported}`,
    );
  }
}

function assertOptionalIsoDate(value: unknown, field: string): void {
  if (value === undefined || value === null || value === "") return;

  if (typeof value !== "string" || value !== value.trim()) {
    throw new SocialPublicationValidationError(
      `${field} must be an ISO date or timestamp`,
    );
  }

  if (!DATE_ONLY_PATTERN.test(value) && !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new SocialPublicationValidationError(
      `${field} must be YYYY-MM-DD or an ISO timestamp with a timezone`,
    );
  }

  const datePart = value.slice(0, 10);
  if (!isValidCalendarDate(datePart) || Number.isNaN(new Date(value).getTime())) {
    throw new SocialPublicationValidationError(`${field} must be a valid date`);
  }

  if (value.length > 10) {
    const time = value.slice(11, 19);
    const [hour, minute, second] = time.split(":").map(Number);
    const offset = value.match(/([+-])(\d{2}):(\d{2})$/);
    if (
      hour === undefined ||
      minute === undefined ||
      second === undefined ||
      hour > 23 ||
      minute > 59 ||
      second > 59 ||
      (offset !== null &&
        (Number(offset[2]) > 23 || Number(offset[3]) > 59))
    ) {
      throw new SocialPublicationValidationError(`${field} must be a valid date`);
    }
  }
}

function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function publicationRouteError(error: unknown, operation: string): NextResponse {
  const topicError = topicRequestErrorResponse(error);
  if (topicError) return topicError;

  if (error instanceof SyntaxError) {
    return noStoreJson({ error: "The JSON body is invalid" }, 400);
  }

  if (error instanceof SocialPublicationValidationError) {
    return noStoreJson({ error: error.message }, 400);
  }

  if (error instanceof SelectedStoryPublicationNotFoundError) {
    return noStoreJson({ error: error.message }, 404);
  }

  console.error(`Failed to ${operation}`, error);
  return noStoreJson(
    { error: `The server could not ${operation}` },
    500,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function noStoreJson(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
