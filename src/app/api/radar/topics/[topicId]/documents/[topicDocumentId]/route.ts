import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { getTopicKnowledgeDocumentDetails } from "@/app/modules/documents/knowledge-documents.repository";
import { KnowledgeDocumentNotFoundError } from "@/app/modules/documents/knowledge-document.types";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = {
  params: Promise<{ topicId: string; topicDocumentId: string }>;
};

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const { topicId, topicDocumentId } = await context.params;
    const topic = await requireTopic(topicId);
    return noStoreJson(
      await getTopicKnowledgeDocumentDetails(topic.id, topicDocumentId),
    );
  } catch (error) {
    if (error instanceof TopicContextError || error instanceof KnowledgeDocumentNotFoundError) {
      return noStoreJson({ error: error.message }, 404);
    }
    console.error("Failed to load knowledge document details", error);
    return noStoreJson({ error: "Unable to load the knowledge document" }, 500);
  }
}
