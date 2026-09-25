import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { jsonObject, noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  attachExistingKnowledgeDocument,
  detachKnowledgeDocument,
} from "@/app/modules/documents/knowledge-documents.repository";
import { KnowledgeDocumentNotFoundError } from "@/app/modules/documents/knowledge-document.types";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ documentId: string }> };

async function update(request: Request, context: Context, attach: boolean) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const { documentId } = await context.params;
    const body = await jsonObject(request);
    const topic = await requireTopic(body.topicId as string, { active: attach });
    if (attach) await attachExistingKnowledgeDocument(topic.id, documentId);
    else await detachKnowledgeDocument(topic.id, documentId);
    return noStoreJson({ attached: attach });
  } catch (error) {
    if (error instanceof TopicContextError || error instanceof KnowledgeDocumentNotFoundError) {
      return noStoreJson({ error: error.message }, 404);
    }
    console.error("Failed to update document topic attachment", error);
    return noStoreJson({ error: "Unable to update document attachment" }, 500);
  }
}

export async function POST(request: Request, context: Context) {
  return update(request, context, true);
}

export async function DELETE(request: Request, context: Context) {
  return update(request, context, false);
}
