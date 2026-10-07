import {
  TopicContextError,
  topicIdFromRequest,
} from "@/app/modules/topics/topic-context";
import { NextResponse } from "next/server";

import { TopicAccessDeniedError, requireTopicForRequest } from "./radar-api-auth";

/** The active topic named by `?topicId=`, which this request may use. */
export async function requireActiveRequestTopic(request: Request): Promise<string> {
  return (await requireTopicForRequest(request, topicIdFromRequest(request), { active: true })).id;
}

/** The topic named by `?topicId=` (active or not), which this request may use. */
export async function requireRequestTopic(request: Request): Promise<string> {
  return (await requireTopicForRequest(request, topicIdFromRequest(request))).id;
}

export function topicRequestErrorResponse(error: unknown): NextResponse | undefined {
  if (!(error instanceof TopicContextError)) {
    return undefined;
  }

  const status = error instanceof TopicAccessDeniedError
    ? error.status
    : error.message === "Topic was not found" ? 404 : 400;

  return NextResponse.json({ error: error.message }, { status });
}
