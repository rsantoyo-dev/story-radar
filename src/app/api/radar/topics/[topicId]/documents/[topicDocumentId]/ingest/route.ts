import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { processKnowledgeDocumentIngestion } from "@/app/modules/documents/ingest-knowledge-document";
import { createKnowledgeIngestionRunForTopicDocument } from "@/app/modules/documents/knowledge-documents.repository";
import { KnowledgeDocumentNotFoundError } from "@/app/modules/documents/knowledge-document.types";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";
import { after } from "next/server";

type Context = {
  params: Promise<{ topicId: string; topicDocumentId: string }>;
};

export const maxDuration = 120;

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const { topicId, topicDocumentId } = await context.params;
    const topic = await requireTopic(topicId, { active: true });
    const runId = await createKnowledgeIngestionRunForTopicDocument(
      topic.id,
      topicDocumentId,
    );
    after(() => processKnowledgeDocumentIngestion(runId));
    return noStoreJson({ queued: { runId } }, 202);
  } catch (error) {
    if (error instanceof TopicContextError || error instanceof KnowledgeDocumentNotFoundError) {
      return noStoreJson({ error: error.message }, 404);
    }
    console.error("Failed to retry knowledge document ingestion", error);
    return noStoreJson({ error: "Unable to retry the knowledge document" }, 500);
  }
}
