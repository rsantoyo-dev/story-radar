import "server-only";

import {
  getTopicById,
} from "./topic-catalog.repository";
import type { Topic } from "@/db/schema";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TopicContextError extends Error {}

/**
 * Until authentication is introduced, every server request is constrained to
 * the seeded default workspace. The browser never supplies a workspace id.
 */
export async function requireTopic(
  topicId: string | null | undefined,
  options: { active?: boolean } = {},
): Promise<Topic> {
  if (!topicId || !UUID_PATTERN.test(topicId)) {
    throw new TopicContextError("topicId must be a valid UUID");
  }

  const topic = await getTopicById(topicId);

  if (!topic) {
    throw new TopicContextError("Topic was not found");
  }

  if (options.active && !topic.isActive) {
    throw new TopicContextError("Topic is inactive");
  }

  return topic;
}

export function topicIdFromRequest(request: Request): string | undefined {
  const value = new URL(request.url).searchParams.get("topicId")?.trim();

  return value || undefined;
}

export function topicIdFromPayload(value: unknown): string | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("topicId" in value) ||
    typeof value.topicId !== "string"
  ) {
    return undefined;
  }

  return value.topicId.trim() || undefined;
}
