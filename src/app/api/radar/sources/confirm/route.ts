import { after } from "next/server";

import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { jsonObject, noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { enqueueKnowledgeDocument, enqueueUploadedKnowledgeDocument, processKnowledgeDocumentIngestion } from "@/app/modules/documents/ingest-knowledge-document";
import { buildKnowledgeDocumentObjectKey, putPrivateR2Object } from "@/app/modules/stories/r2-storage";
import { persistUnscoredStoryContribution } from "@/app/modules/stories/story-radar.repository";
import { detectUploadedPdf, detectUrlSource, SourceDetectionError } from "@/app/modules/sources/detect-source";
import { attachExistingKnowledgeDocument } from "@/app/modules/documents/knowledge-documents.repository";
import { attachRssSourceToTopic, createOrReuseRssSource } from "@/app/modules/topics/topic-catalog.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

export const maxDuration = 120;

export async function POST(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const isFile = request.headers.get("content-type")?.includes("multipart/form-data");
    const payload = isFile ? await readFilePayload(request) : await readUrlPayload(request);
    const topicIds = parseTopicIds(payload.topicIds);
    await Promise.all(topicIds.map((topicId) => requireTopic(topicId, { active: true })));
    const detected = payload.file
      ? await detectUploadedPdf(payload.file)
      : await detectUrlSource(payload.url!);

    if (detected.contribution.sourceType !== payload.sourceType || detected.fingerprint !== payload.fingerprint) {
      return noStoreJson({ error: "The source changed since preview. Detect it again before confirming." }, 409);
    }

    const contribution = detected.contribution;
    if (contribution.sourceType === "rss") {
      const url = contribution.provenance.sourceUrl;
      const feed = await createOrReuseRssSource({
        name: contribution.content.title ?? new URL(url).hostname,
        url, language: "unknown", region: "global", contentMode: "auto",
      });
      for (const topicId of topicIds) await attachRssSourceToTopic(topicId, feed.id);
      return noStoreJson({ sourceType: "rss", sourceId: feed.id, topicIds }, 201);
    }

    if (contribution.sourceType === "document") {
      let queued;
      if (payload.file) {
        if (!("bytes" in detected) || !(detected.bytes instanceof Uint8Array)) {
          throw new SourceDetectionError("The PDF upload must be detected again");
        }
        const objectKey = buildKnowledgeDocumentObjectKey(detected.fingerprint);
        await putPrivateR2Object({ objectKey, body: detected.bytes, contentType: "application/pdf" });
        queued = await enqueueUploadedKnowledgeDocument(topicIds[0], {
          canonicalUrl: contribution.provenance.sourceUrl,
          objectKey,
          name: contribution.provenance.originalFilename ?? "Uploaded PDF",
        });
      } else {
        queued = await enqueueKnowledgeDocument(topicIds[0], {
          url: contribution.provenance.sourceUrl, documentType: "other",
        });
      }
      for (const topicId of topicIds.slice(1)) {
        await attachExistingKnowledgeDocument(topicId, queued.documentId);
      }
      after(() => processKnowledgeDocumentIngestion(queued.runId));
      return noStoreJson({ sourceType: "document", documentId: queued.documentId, topicIds }, 202);
    }

    const url = contribution.provenance.sourceUrl;
    let storyId = "";
    for (const topicId of topicIds) {
      storyId = await persistUnscoredStoryContribution(topicId, {
        externalId: contribution.externalId,
        sourceId: "manual-url",
        sourceName: "Added article",
        title: contribution.content.title ?? new URL(url).hostname,
        url,
        content: {
          text: contribution.content.text,
          status: contribution.metadata.contentStatus === "likely-full" ? "likely-full" : "excerpt",
        },
        language: "unknown",
        region: "global",
        tags: ["added-url"],
        fetchedAt: contribution.acquiredAt,
      });
    }
    return noStoreJson({ sourceType: "article", storyId, topicIds }, 201);
  } catch (error) {
    if (error instanceof SourceDetectionError || error instanceof TypeError) {
      return noStoreJson({ error: error.message }, 400);
    }
    if (error instanceof TopicContextError) return noStoreJson({ error: error.message }, 404);
    console.error("Failed to confirm detected source", error);
    return noStoreJson({ error: "Unable to add this source" }, 500);
  }
}

type Payload = {
  url?: string;
  file?: File;
  sourceType: string;
  fingerprint: string;
  topicIds: unknown;
};

async function readUrlPayload(request: Request): Promise<Payload> {
  const body = await jsonObject(request);
  if (typeof body.url !== "string" || typeof body.sourceType !== "string" || typeof body.fingerprint !== "string") {
    throw new SourceDetectionError("Detect a URL before confirming it");
  }
  return { url: body.url, sourceType: body.sourceType, fingerprint: body.fingerprint, topicIds: body.topicIds };
}

async function readFilePayload(request: Request): Promise<Payload> {
  const form = await request.formData();
  const file = form.get("file");
  const sourceType = form.get("sourceType");
  const fingerprint = form.get("fingerprint");
  const topicIds = form.get("topicIds");
  if (!(file instanceof File) || typeof sourceType !== "string" || typeof fingerprint !== "string" || typeof topicIds !== "string") {
    throw new SourceDetectionError("Detect a PDF before confirming it");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(topicIds); }
  catch { throw new SourceDetectionError("Topic selection is invalid"); }
  return { file, sourceType, fingerprint, topicIds: parsed };
}

function parseTopicIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 ||
    value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new SourceDetectionError("Select between 1 and 20 topics");
  }
  return [...new Set(value as string[])];
}
