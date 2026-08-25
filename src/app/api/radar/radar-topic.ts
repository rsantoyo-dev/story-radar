import {
  TopicContextError,
  requireTopic,
  topicIdFromRequest,
} from "@/app/modules/topics/topic-context";
import { NextResponse } from "next/server";

export async function requireActiveRequestTopic(request: Request): Promise<string> {
  return (await requireTopic(topicIdFromRequest(request), { active: true })).id;
}

export async function requireRequestTopic(request: Request): Promise<string> {
  return (await requireTopic(topicIdFromRequest(request))).id;
}

export function topicRequestErrorResponse(error: unknown): NextResponse | undefined {
  if (!(error instanceof TopicContextError)) {
    return undefined;
  }

  const status = error.message === "Topic was not found" ? 404 : 400;

  return NextResponse.json({ error: error.message }, { status });
}
