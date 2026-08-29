import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  jsonObject,
  noStoreJson,
} from "@/app/api/radar/topics/topic-route-utils";
import {
  enqueueKnowledgeDocument,
  processKnowledgeDocumentIngestion,
} from "@/app/modules/documents/ingest-knowledge-document";
import { listTopicKnowledgeDocuments } from "@/app/modules/documents/knowledge-documents.repository";
import {
  KnowledgeDocumentValidationError,
  type CreateKnowledgeDocumentInput,
} from "@/app/modules/documents/knowledge-document.types";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";
import { after } from "next/server";

type Context = { params: Promise<{ topicId: string }> };

export const maxDuration = 120;

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    return noStoreJson({ documents: await listTopicKnowledgeDocuments(topicId) });
  } catch (error) {
    return documentRouteError(error, "load knowledge documents");
  }
}

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const input = parseCreateInput(await jsonObject(request));
    const queued = await enqueueKnowledgeDocument(topicId, input);

    after(() => processKnowledgeDocumentIngestion(queued.runId));
    return noStoreJson({ queued }, 202);
  } catch (error) {
    return documentRouteError(error, "queue the knowledge document");
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function parseCreateInput(body: Record<string, unknown>): CreateKnowledgeDocumentInput {
  if (typeof body.url !== "string" || !body.url.trim()) {
    throw new KnowledgeDocumentValidationError("A PDF URL is required");
  }
  return {
    url: body.url,
    ...(typeof body.documentType === "string"
      ? { documentType: body.documentType as CreateKnowledgeDocumentInput["documentType"] }
      : {}),
    ...(typeof body.language === "string" ? { language: body.language } : {}),
    ...(typeof body.publisher === "string" ? { publisher: body.publisher } : {}),
    ...(Array.isArray(body.tags) && body.tags.every((tag) => typeof tag === "string")
      ? { tags: body.tags as string[] }
      : {}),
    ...(typeof body.priority === "number" ? { priority: body.priority } : {}),
  };
}

function documentRouteError(error: unknown, action: string) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof KnowledgeDocumentValidationError) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error(`Failed to ${action}`, error);
  return noStoreJson({ error: `Unable to ${action}` }, 500);
}
