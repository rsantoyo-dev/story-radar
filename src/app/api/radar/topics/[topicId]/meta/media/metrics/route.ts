import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { MetaIntegrationConfigError } from "@/app/modules/meta/meta-integration.config";
import {
  InstagramMediaMetricsError,
  refreshInstagramMediaMetrics,
} from "@/app/modules/meta/refresh-instagram-media-metrics";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

/**
 * Refreshes current Instagram insights for this topic's publications (IG-05).
 * No body / `{}` refreshes the most-recent accessible publications;
 * `{ externalId }` refreshes just that one and returns its fresh item. A Graph
 * failure comes back in the 200 body (`error` / per-publication `failed`), not
 * as a non-2xx — the same convention as the sync route.
 */
export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const options = await parseMetricsBody(request);
    return noStoreJson(await refreshInstagramMediaMetrics(topicId, options));
  } catch (error) {
    return metaMediaMetricsRouteError(error);
  }
}

const ALLOWED_KEYS = new Set(["externalId", "limit"]);

async function parseMetricsBody(
  request: Request,
): Promise<{ externalId?: string; limit?: number }> {
  const text = await request.text();
  if (!text.trim()) return {};

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new InstagramMediaMetricsError("The request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new InstagramMediaMetricsError("The request body must be an object");
  }
  const record = body as Record<string, unknown>;
  const unsupported = Object.keys(record).find((key) => !ALLOWED_KEYS.has(key));
  if (unsupported) {
    throw new InstagramMediaMetricsError(`Unsupported field: ${unsupported}`);
  }

  const options: { externalId?: string; limit?: number } = {};

  const externalId = record.externalId;
  if (externalId !== undefined && externalId !== null && externalId !== "") {
    if (typeof externalId !== "string" || externalId.length > 512) {
      throw new InstagramMediaMetricsError(
        "externalId must be a string of up to 512 characters",
      );
    }
    options.externalId = externalId;
  }

  const limit = record.limit;
  if (limit !== undefined && limit !== null) {
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new InstagramMediaMetricsError("limit must be an integer from 1 to 50");
    }
    options.limit = limit;
  }

  return options;
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function metaMediaMetricsRouteError(error: unknown) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof InstagramMediaMetricsError) {
    return noStoreJson({ error: error.message }, 400);
  }
  if (error instanceof MetaIntegrationConfigError) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error("Failed to refresh Instagram publication metrics", error);
  return noStoreJson(
    { error: "Unable to refresh Instagram publication metrics" },
    500,
  );
}
