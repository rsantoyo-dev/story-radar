import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  KnowledgeDocumentNotFoundError,
  KnowledgeDocumentValidationError,
} from "@/app/modules/documents/knowledge-document.types";
import { promoteKnowledgeChapterToStory } from "@/app/modules/documents/promote-knowledge-section";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = {
  params: Promise<{
    topicId: string;
    topicDocumentId: string;
    chapterId: string;
  }>;
};

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const { topicId, topicDocumentId, chapterId } = await context.params;
    const topic = await requireTopic(topicId, { active: true });
    const result = await promoteKnowledgeChapterToStory(
      topic.id,
      topicDocumentId,
      chapterId,
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
      return noStoreJson({ error: error.message }, 409);
    }
    console.error("Failed to create a knowledge chapter candidate", error);
    return noStoreJson({ error: "Unable to create the chapter candidate" }, 500);
  }
}
