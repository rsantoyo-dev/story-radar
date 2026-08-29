import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  jsonObject,
  noStoreJson,
} from "@/app/api/radar/topics/topic-route-utils";
import {
  KnowledgeDocumentNotFoundError,
  KnowledgeDocumentValidationError,
} from "@/app/modules/documents/knowledge-document.types";
import { promoteKnowledgeChaptersToStory } from "@/app/modules/documents/promote-knowledge-section";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = {
  params: Promise<{ topicId: string; topicDocumentId: string }>;
};

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const { topicId, topicDocumentId } = await context.params;
    const topic = await requireTopic(topicId, { active: true });
    const body = await jsonObject(request);
    const chapterIds = chapterIdsFromBody(body.chapterIds);
    const title = optionalTitle(body.title);
    const result = await promoteKnowledgeChaptersToStory(
      topic.id,
      topicDocumentId,
      chapterIds,
      title,
    );
    return noStoreJson({ candidate: result }, result.created ? 201 : 200);
  } catch (error) {
    if (
      error instanceof TopicContextError ||
      error instanceof KnowledgeDocumentNotFoundError
    ) {
      return noStoreJson({ error: error.message }, 404);
    }
    if (error instanceof KnowledgeDocumentValidationError) {
      return noStoreJson({ error: error.message }, 400);
    }
    console.error("Failed to create a knowledge dossier", error);
    return noStoreJson({ error: "Unable to create the story dossier" }, 500);
  }
}

function chapterIdsFromBody(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 12 ||
    !value.every((item) => typeof item === "string" && item.trim())
  ) {
    throw new KnowledgeDocumentValidationError(
      "chapterIds must contain between 1 and 12 chapter IDs",
    );
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function optionalTitle(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new KnowledgeDocumentValidationError("title must be text");
  }
  const title = value.replace(/\s+/gu, " ").trim();
  if (!title) return undefined;
  if (title.length > 500) {
    throw new KnowledgeDocumentValidationError(
      "title must be 500 characters or fewer",
    );
  }
  return title;
}
