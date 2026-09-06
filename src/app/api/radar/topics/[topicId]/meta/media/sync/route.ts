import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { MetaIntegrationConfigError } from "@/app/modules/meta/meta-integration.config";
import {
  InstagramMediaSyncError,
  syncInstagramMediaPage,
} from "@/app/modules/meta/sync-instagram-media";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

/**
 * Imports one page of the connected Instagram account's published media
 * (IG-02). No body imports the newest page; `{ after: <cursor> }` continues
 * with older publications. A sync failure is returned in the body (with
 * `error`), not as a non-2xx — the same convention as the verify route.
 */
export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const after = await parseAfter(request);
    return noStoreJson(await syncInstagramMediaPage(topicId, { after }));
  } catch (error) {
    return metaMediaSyncRouteError(error);
  }
}

async function parseAfter(request: Request): Promise<string | undefined> {
  const text = await request.text();
  if (!text.trim()) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new InstagramMediaSyncError("The request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new InstagramMediaSyncError("The request body must be an object");
  }
  const record = body as Record<string, unknown>;
  const unsupported = Object.keys(record).find((key) => key !== "after");
  if (unsupported) {
    throw new InstagramMediaSyncError(`Unsupported field: ${unsupported}`);
  }
  const after = record.after;
  if (after === undefined || after === null || after === "") return undefined;
  if (typeof after !== "string" || after.length > 512) {
    throw new InstagramMediaSyncError("after must be a string of up to 512 characters");
  }
  return after;
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function metaMediaSyncRouteError(error: unknown) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof InstagramMediaSyncError) {
    return noStoreJson({ error: error.message }, 400);
  }
  if (error instanceof MetaIntegrationConfigError) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error("Failed to sync Instagram media", error);
  return noStoreJson({ error: "Unable to sync Instagram publications" }, 500);
}
