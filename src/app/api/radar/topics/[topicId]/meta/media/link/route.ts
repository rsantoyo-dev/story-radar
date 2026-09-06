import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  getInstagramMediaLinkOptions,
  InstagramMediaLinkError,
  linkInstagramMediaToStory,
  listInstagramMediaLinkBatches,
  listInstagramMediaLinkDrafts,
  SelectedStoryContentNotFoundError,
  type InstagramMediaLinkInput,
} from "@/app/modules/meta/link-instagram-media";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

/**
 * IG-04 link dialog data. Branches on the query param:
 * - `?externalId=` → approved stories + the URL-match suggestion for that post
 * - `?storyId=`    → drafts belonging to that story
 * - `?draftId=`    → image batches of that draft
 */
export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const q = new URL(request.url).searchParams;

    const externalId = q.get("externalId");
    if (externalId) {
      return noStoreJson(
        await getInstagramMediaLinkOptions(topicId, externalId),
      );
    }
    const storyId = q.get("storyId");
    if (storyId) {
      return noStoreJson({
        drafts: await listInstagramMediaLinkDrafts(topicId, storyId),
      });
    }
    const draftId = q.get("draftId");
    if (draftId) {
      return noStoreJson({
        batches: await listInstagramMediaLinkBatches(topicId, draftId),
      });
    }
    return noStoreJson(
      { error: "Provide externalId, storyId or draftId" },
      400,
    );
  } catch (error) {
    return metaMediaLinkRouteError(error);
  }
}

/**
 * Links, corrects or removes the story link on one imported publication.
 * `{ storyId: null }` clears it. Belonging checks (story approved, draft ∈
 * story, batch ∈ draft) happen in `linkInstagramMediaToStory`.
 */
export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const input = await parseLinkBody(request);
    return noStoreJson(await linkInstagramMediaToStory(topicId, input));
  } catch (error) {
    return metaMediaLinkRouteError(error);
  }
}

const ALLOWED_KEYS = new Set([
  "externalId",
  "storyId",
  "draftId",
  "batchId",
  "by",
]);

async function parseLinkBody(request: Request): Promise<InstagramMediaLinkInput> {
  const text = await request.text();
  if (!text.trim()) {
    throw new InstagramMediaLinkError("The request body must be an object");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new InstagramMediaLinkError("The request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new InstagramMediaLinkError("The request body must be an object");
  }
  const record = body as Record<string, unknown>;
  const unsupported = Object.keys(record).find((key) => !ALLOWED_KEYS.has(key));
  if (unsupported) {
    throw new InstagramMediaLinkError(`Unsupported field: ${unsupported}`);
  }

  const externalId = record.externalId;
  if (typeof externalId !== "string" || externalId.trim().length === 0) {
    throw new InstagramMediaLinkError("externalId is required");
  }

  if (!("storyId" in record)) {
    throw new InstagramMediaLinkError("storyId is required (use null to unlink)");
  }
  const storyId = record.storyId;
  if (storyId !== null && typeof storyId !== "string") {
    throw new InstagramMediaLinkError("storyId must be a string or null");
  }

  const draftId = optionalString(record.draftId, "draftId");
  const batchId = optionalString(record.batchId, "batchId");
  const by = optionalString(record.by, "by");
  if (by !== undefined && by !== null && by.length > 200) {
    throw new InstagramMediaLinkError("by must be at most 200 characters");
  }

  return {
    externalId,
    storyId,
    ...(draftId !== undefined ? { draftId } : {}),
    ...(batchId !== undefined ? { batchId } : {}),
    ...(by !== undefined ? { by } : {}),
  };
}

function optionalString(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new InstagramMediaLinkError(`${field} must be a string or null`);
  }
  return value;
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function metaMediaLinkRouteError(error: unknown) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof SelectedStoryContentNotFoundError) {
    return noStoreJson(
      { error: "The selected story is not approved in this topic" },
      400,
    );
  }
  if (error instanceof InstagramMediaLinkError) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error("Failed to link Instagram publication", error);
  return noStoreJson({ error: "Unable to link the Instagram publication" }, 500);
}
