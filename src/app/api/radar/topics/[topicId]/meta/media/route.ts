import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { isInstagramMediaFormat } from "@/app/modules/meta/instagram-media-format";
import {
  getConnectedInstagramAccount,
  getTopicMetaConnectionStatus,
} from "@/app/modules/meta/topic-meta-connections.repository";
import { listTopicInstagramMedia } from "@/app/modules/meta/topic-instagram-media.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * IG-03 gallery feed: one keyset page of the topic's imported Instagram
 * publications for its current connected account, newest first, with the
 * active account and last successful sync so the panel is self-contained.
 * Read-only — never calls Graph.
 */
export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const status = await getTopicMetaConnectionStatus(topicId);
    const account = await getConnectedInstagramAccount(topicId);

    const base = {
      state: status.state,
      account: account ? { igUsername: account.igUsername } : null,
      lastMediaSyncAt: status.lastMediaSyncAt ?? null,
    };
    if (!account) {
      return noStoreJson({ ...base, items: [] });
    }

    const url = new URL(request.url);
    const filters = parseFilters(url);
    if ("error" in filters) {
      return noStoreJson({ error: filters.error }, 400);
    }

    const { items, nextCursor } = await listTopicInstagramMedia(
      topicId,
      account.igUserId,
      filters.value,
    );
    return noStoreJson({
      ...base,
      items,
      ...(nextCursor ? { nextCursor } : {}),
    });
  } catch (error) {
    return metaMediaRouteError(error);
  }
}

function parseFilters(url: URL):
  | {
      value: {
        limit?: number;
        cursor?: string;
        format?: ReturnType<typeof asFormat>;
        linked?: "linked" | "pending";
        from?: string;
        to?: string;
      };
    }
  | { error: string } {
  const q = url.searchParams;

  const format = q.get("format") ?? undefined;
  if (format !== undefined && !isInstagramMediaFormat(format)) {
    return { error: "format must be image, carousel, reel or video" };
  }
  const linked = q.get("linked") ?? undefined;
  if (linked !== undefined && linked !== "linked" && linked !== "pending") {
    return { error: "linked must be 'linked' or 'pending'" };
  }
  for (const key of ["from", "to"] as const) {
    const value = q.get(key);
    if (value !== null && !DATE_ONLY.test(value)) {
      return { error: `${key} must be a YYYY-MM-DD date` };
    }
  }
  const limitRaw = q.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 60)) {
    return { error: "limit must be an integer from 1 to 60" };
  }

  return {
    value: {
      ...(limit !== undefined ? { limit } : {}),
      ...(q.get("cursor") ? { cursor: q.get("cursor")! } : {}),
      ...(format ? { format: asFormat(format) } : {}),
      ...(linked ? { linked } : {}),
      ...(q.get("from") ? { from: q.get("from")! } : {}),
      ...(q.get("to") ? { to: q.get("to")! } : {}),
    },
  };
}

function asFormat(value: string) {
  return value as "image" | "carousel" | "reel" | "video";
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function metaMediaRouteError(error: unknown) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  console.error("Failed to read Instagram publications", error);
  return noStoreJson({ error: "Unable to read Instagram publications" }, 500);
}
