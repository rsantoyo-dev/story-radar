import "server-only";

import { createHash } from "node:crypto";

import { extractPdfDocument } from "./extract-pdf-document";
import { fetchPublicPdf, normalizeKnowledgeDocumentUrl } from "./fetch-public-pdf";
import {
  completeKnowledgeDocumentIngestion,
  createKnowledgeIngestionRun,
  createOrAttachKnowledgeDocument,
  failKnowledgeDocumentIngestion,
  getKnowledgeDocumentForIngestion,
  updateKnowledgeIngestionProgress,
} from "./knowledge-documents.repository";
import type { CreateKnowledgeDocumentInput } from "./knowledge-document.types";

const PDF_EXTRACTION_VERSION = "pdf-extraction-v2";

export async function enqueueKnowledgeDocument(
  topicId: string,
  input: CreateKnowledgeDocumentInput,
): Promise<{ documentId: string; topicDocumentId: string; runId: string }> {
  const canonicalUrl = normalizeKnowledgeDocumentUrl(input.url);
  const attached = await createOrAttachKnowledgeDocument(topicId, {
    ...input,
    canonicalUrl,
  });
  const runId = await createKnowledgeIngestionRun(attached.documentId);
  return { ...attached, runId };
}

export async function processKnowledgeDocumentIngestion(runId: string): Promise<void> {
  try {
    const document = await getKnowledgeDocumentForIngestion(runId);
    await updateKnowledgeIngestionProgress(runId, { stage: "fetching" });
    const fetched = await fetchPublicPdf(document.sourceUrl);
    // Extraction behavior is part of the immutable version identity. This
    // allows a retry to preserve the old version while rebuilding sections
    // when hierarchy/page-label handling improves for the same PDF bytes.
    const contentHash = createHash("sha256")
      .update(PDF_EXTRACTION_VERSION)
      .update("\0")
      .update(fetched.bytes)
      .digest("hex");

    await updateKnowledgeIngestionProgress(runId, { stage: "extracting" });
    const extracted = await extractPdfDocument(
      fetched.bytes,
      fallbackTitle(document.canonicalUrl),
      (pagesProcessed, pagesTotal) => updateKnowledgeIngestionProgress(runId, {
        stage: "extracting",
        pagesProcessed,
        pagesTotal,
      }),
    );

    await updateKnowledgeIngestionProgress(runId, {
      stage: "persisting",
      pagesProcessed: extracted.pageCount,
      pagesTotal: extracted.pageCount,
    });
    await completeKnowledgeDocumentIngestion({
      runId,
      documentId: document.documentId,
      contentHash,
      title: extracted.title,
      author: extracted.author,
      subject: extracted.subject,
      pageCount: extracted.pageCount,
      sourceLastModified: fetched.lastModified,
      sections: extracted.sections,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF ingestion error";
    await failKnowledgeDocumentIngestion(runId, message).catch((persistenceError) => {
      console.error("Unable to persist PDF ingestion failure", persistenceError);
    });
    console.error("Knowledge document ingestion failed", { runId, error });
  }
}

function fallbackTitle(canonicalUrl: string): string {
  const pathname = new URL(canonicalUrl).pathname;
  const filename = pathname.split("/").filter(Boolean).at(-1) ?? "Knowledge document";
  return decodeURIComponent(filename).replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
}
