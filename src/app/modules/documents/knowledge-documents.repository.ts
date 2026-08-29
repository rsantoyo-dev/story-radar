import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { DEFAULT_WORKSPACE_ID } from "@/app/modules/topics/topic-catalog.repository";
import { db } from "@/db/client";
import {
  knowledgeDocumentIngestionRuns,
  knowledgeDocumentSections,
  knowledgeDocuments,
  knowledgeDocumentVersions,
  storyKnowledgeOrigins,
  topicKnowledgeDocuments,
} from "@/db/schema";

import type {
  CreateKnowledgeDocumentInput,
  ExtractedKnowledgeSection,
  KnowledgeDocumentSummary,
  KnowledgeDocumentType,
  KnowledgeIngestionStage,
  KnowledgeIngestionStatus,
} from "./knowledge-document.types";
import {
  KnowledgeDocumentNotFoundError,
  KnowledgeDocumentValidationError,
} from "./knowledge-document.types";
import { groupKnowledgeSectionsIntoChapters } from "./knowledge-chapters";

type CreateOrAttachInput = CreateKnowledgeDocumentInput & {
  canonicalUrl: string;
};

export async function createOrAttachKnowledgeDocument(
  topicId: string,
  input: CreateOrAttachInput,
): Promise<{ documentId: string; topicDocumentId: string }> {
  const normalized = normalizeInput(input);
  const [created] = await db
    .insert(knowledgeDocuments)
    .values({
      workspaceId: DEFAULT_WORKSPACE_ID,
      canonicalUrl: normalized.canonicalUrl,
      sourceUrl: normalized.canonicalUrl,
      documentType: normalized.documentType,
      language: normalized.language,
      publisher: normalized.publisher ?? null,
    })
    .onConflictDoNothing({
      target: [knowledgeDocuments.workspaceId, knowledgeDocuments.canonicalUrl],
    })
    .returning({ id: knowledgeDocuments.id });

  const documentId = created?.id ?? (await findDocumentId(normalized.canonicalUrl));
  const [attached] = await db
    .insert(topicKnowledgeDocuments)
    .values({
      workspaceId: DEFAULT_WORKSPACE_ID,
      topicId,
      documentId,
      enabled: true,
      tags: normalized.tags,
      priority: normalized.priority,
    })
    .onConflictDoUpdate({
      target: [topicKnowledgeDocuments.topicId, topicKnowledgeDocuments.documentId],
      set: {
        enabled: true,
        tags: normalized.tags,
        priority: normalized.priority,
        updatedAt: new Date(),
      },
    })
    .returning({ id: topicKnowledgeDocuments.id });

  if (!attached) throw new Error("The document could not be attached to the topic");
  return { documentId, topicDocumentId: attached.id };
}

export async function createKnowledgeIngestionRun(documentId: string): Promise<string> {
  const [run] = await db
    .insert(knowledgeDocumentIngestionRuns)
    .values({ documentId })
    .returning({ id: knowledgeDocumentIngestionRuns.id });
  if (!run) throw new Error("The document ingestion run could not be created");
  return run.id;
}

export async function createKnowledgeIngestionRunForTopicDocument(
  topicId: string,
  topicDocumentId: string,
): Promise<string> {
  const [row] = await db
    .select({ documentId: topicKnowledgeDocuments.documentId })
    .from(topicKnowledgeDocuments)
    .where(and(
      eq(topicKnowledgeDocuments.id, topicDocumentId),
      eq(topicKnowledgeDocuments.topicId, topicId),
    ))
    .limit(1);
  if (!row) throw new KnowledgeDocumentNotFoundError("The document was not found in this topic");
  return createKnowledgeIngestionRun(row.documentId);
}

export async function getKnowledgeDocumentForIngestion(runId: string): Promise<{
  documentId: string;
  sourceUrl: string;
  canonicalUrl: string;
}> {
  const [row] = await db
    .select({
      documentId: knowledgeDocuments.id,
      sourceUrl: knowledgeDocuments.sourceUrl,
      canonicalUrl: knowledgeDocuments.canonicalUrl,
    })
    .from(knowledgeDocumentIngestionRuns)
    .innerJoin(
      knowledgeDocuments,
      eq(knowledgeDocuments.id, knowledgeDocumentIngestionRuns.documentId),
    )
    .where(eq(knowledgeDocumentIngestionRuns.id, runId))
    .limit(1);

  if (!row) throw new KnowledgeDocumentNotFoundError("The ingestion run was not found");
  return row;
}

export async function updateKnowledgeIngestionProgress(
  runId: string,
  input: {
    stage: KnowledgeIngestionStage;
    pagesProcessed?: number;
    pagesTotal?: number;
  },
): Promise<void> {
  await db
    .update(knowledgeDocumentIngestionRuns)
    .set({
      status: input.stage === "completed" ? "completed" : "processing",
      stage: input.stage,
      ...(input.pagesProcessed !== undefined
        ? { pagesProcessed: input.pagesProcessed }
        : {}),
      ...(input.pagesTotal !== undefined ? { pagesTotal: input.pagesTotal } : {}),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocumentIngestionRuns.id, runId));
}

export async function completeKnowledgeDocumentIngestion(input: {
  runId: string;
  documentId: string;
  contentHash: string;
  title: string;
  author?: string;
  subject?: string;
  edition?: string;
  pageCount: number;
  sourceLastModified?: string;
  sections: readonly ExtractedKnowledgeSection[];
}): Promise<void> {
  const existing = await findDocumentVersion(input.documentId, input.contentHash);
  const now = new Date();

  if (existing) {
    await db.batch([
      db.update(knowledgeDocumentIngestionRuns).set({
        status: "completed",
        stage: "completed",
        pagesProcessed: existing.pageCount,
        pagesTotal: existing.pageCount,
        error: null,
        finishedAt: now,
        updatedAt: now,
      }).where(eq(knowledgeDocumentIngestionRuns.id, input.runId)),
      db.update(knowledgeDocuments).set({ updatedAt: now })
        .where(eq(knowledgeDocuments.id, input.documentId)),
    ]);
    return;
  }

  const versionId = randomUUID();
  await db.batch([
    db.insert(knowledgeDocumentVersions).values({
      id: versionId,
      documentId: input.documentId,
      contentHash: input.contentHash,
      title: input.title,
      author: input.author ?? null,
      subject: input.subject ?? null,
      edition: input.edition ?? null,
      pageCount: input.pageCount,
      sectionCount: input.sections.length,
      sourceLastModified: input.sourceLastModified ?? null,
      extractedAt: now,
    }),
    db.insert(knowledgeDocumentSections).values(
      input.sections.map((section) => ({
        documentVersionId: versionId,
        ordinal: section.ordinal,
        heading: section.heading,
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
        printedPageStart: section.printedPageStart ?? null,
        printedPageEnd: section.printedPageEnd ?? null,
        text: section.text,
        textHash: section.textHash,
        characterCount: section.characterCount,
      })),
    ),
    db.update(knowledgeDocumentIngestionRuns).set({
      status: "completed",
      stage: "completed",
      pagesProcessed: input.pageCount,
      pagesTotal: input.pageCount,
      error: null,
      finishedAt: now,
      updatedAt: now,
    }).where(eq(knowledgeDocumentIngestionRuns.id, input.runId)),
    db.update(knowledgeDocuments).set({ updatedAt: now })
      .where(eq(knowledgeDocuments.id, input.documentId)),
  ]);
}

export async function failKnowledgeDocumentIngestion(
  runId: string,
  error: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(knowledgeDocumentIngestionRuns)
    .set({
      status: "failed",
      stage: "failed",
      error: error.slice(0, 2_000),
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(knowledgeDocumentIngestionRuns.id, runId));
}

export async function listTopicKnowledgeDocuments(
  topicId: string,
): Promise<KnowledgeDocumentSummary[]> {
  const rows = await db
    .select({
      topicDocumentId: topicKnowledgeDocuments.id,
      documentId: knowledgeDocuments.id,
      canonicalUrl: knowledgeDocuments.canonicalUrl,
      documentType: knowledgeDocuments.documentType,
      language: knowledgeDocuments.language,
      publisher: knowledgeDocuments.publisher,
      enabled: topicKnowledgeDocuments.enabled,
      tags: topicKnowledgeDocuments.tags,
      priority: topicKnowledgeDocuments.priority,
      createdAt: topicKnowledgeDocuments.createdAt,
    })
    .from(topicKnowledgeDocuments)
    .innerJoin(
      knowledgeDocuments,
      eq(knowledgeDocuments.id, topicKnowledgeDocuments.documentId),
    )
    .where(eq(topicKnowledgeDocuments.topicId, topicId))
    .orderBy(desc(topicKnowledgeDocuments.createdAt));

  return Promise.all(rows.map(async (row) => {
    const [[version], [run]] = await Promise.all([
      db.select().from(knowledgeDocumentVersions)
        .where(eq(knowledgeDocumentVersions.documentId, row.documentId))
        .orderBy(desc(knowledgeDocumentVersions.extractedAt)).limit(1),
      db.select().from(knowledgeDocumentIngestionRuns)
        .where(eq(knowledgeDocumentIngestionRuns.documentId, row.documentId))
        .orderBy(desc(knowledgeDocumentIngestionRuns.startedAt)).limit(1),
    ]);

    return {
      topicDocumentId: row.topicDocumentId,
      documentId: row.documentId,
      canonicalUrl: row.canonicalUrl,
      documentType: row.documentType as KnowledgeDocumentType,
      language: row.language,
      ...(row.publisher ? { publisher: row.publisher } : {}),
      enabled: row.enabled,
      tags: row.tags,
      priority: row.priority,
      createdAt: row.createdAt.toISOString(),
      ...(version ? {
        latestVersion: {
          id: version.id,
          title: version.title,
          pageCount: version.pageCount,
          sectionCount: version.sectionCount,
          extractedAt: version.extractedAt.toISOString(),
        },
      } : {}),
      ...(run ? {
        latestRun: {
          id: run.id,
          status: run.status as KnowledgeIngestionStatus,
          stage: run.stage as KnowledgeIngestionStage,
          pagesProcessed: run.pagesProcessed,
          ...(run.pagesTotal !== null ? { pagesTotal: run.pagesTotal } : {}),
          ...(run.error ? { error: run.error } : {}),
          startedAt: run.startedAt.toISOString(),
          ...(run.finishedAt ? { finishedAt: run.finishedAt.toISOString() } : {}),
          updatedAt: run.updatedAt.toISOString(),
        },
      } : {}),
    };
  }));
}

export async function getTopicKnowledgeDocumentDetails(
  topicId: string,
  topicDocumentId: string,
): Promise<{
  document: KnowledgeDocumentSummary;
  chapters: Array<{
    id: string;
    heading: string;
    pageStart: number;
    pageEnd: number;
    printedPageStart?: number;
    printedPageEnd?: number;
    characterCount: number;
    partCount: number;
    sectionIds: string[];
    candidateStoryId?: string;
    hasPartialCandidate: boolean;
  }>;
  sections: Array<{
    id: string;
    ordinal: number;
    heading: string;
    pageStart: number;
    pageEnd: number;
    printedPageStart?: number;
    printedPageEnd?: number;
    characterCount: number;
    candidateStoryId?: string;
  }>;
}> {
  const document = (await listTopicKnowledgeDocuments(topicId)).find(
    (candidate) => candidate.topicDocumentId === topicDocumentId,
  );
  if (!document) {
    throw new KnowledgeDocumentNotFoundError("The document was not found in this topic");
  }
  if (!document.latestVersion) return { document, chapters: [], sections: [] };

  const sections = await db
    .select({
      id: knowledgeDocumentSections.id,
      ordinal: knowledgeDocumentSections.ordinal,
      heading: knowledgeDocumentSections.heading,
      pageStart: knowledgeDocumentSections.pageStart,
      pageEnd: knowledgeDocumentSections.pageEnd,
      printedPageStart: knowledgeDocumentSections.printedPageStart,
      printedPageEnd: knowledgeDocumentSections.printedPageEnd,
      characterCount: knowledgeDocumentSections.characterCount,
      candidateStoryId: storyKnowledgeOrigins.storyId,
    })
    .from(knowledgeDocumentSections)
    .leftJoin(
      storyKnowledgeOrigins,
      and(
        eq(storyKnowledgeOrigins.sectionId, knowledgeDocumentSections.id),
        eq(storyKnowledgeOrigins.topicId, topicId),
      ),
    )
    .where(eq(
      knowledgeDocumentSections.documentVersionId,
      document.latestVersion.id,
    ))
    .orderBy(knowledgeDocumentSections.ordinal);
  const uniqueSections = [...new Map(
    sections.map((section) => [section.id, section]),
  ).values()];
  const mappedSections = uniqueSections.map((section) => ({
    id: section.id,
    ordinal: section.ordinal,
    heading: section.heading,
    pageStart: section.pageStart,
    pageEnd: section.pageEnd,
    ...(section.printedPageStart !== null
      ? { printedPageStart: section.printedPageStart }
      : {}),
    ...(section.printedPageEnd !== null
      ? { printedPageEnd: section.printedPageEnd }
      : {}),
    characterCount: section.characterCount,
    ...(section.candidateStoryId
      ? { candidateStoryId: section.candidateStoryId }
      : {}),
  }));
  const chapters = groupKnowledgeSectionsIntoChapters(mappedSections);

  return {
    document,
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      heading: chapter.heading,
      pageStart: chapter.pageStart,
      pageEnd: chapter.pageEnd,
      ...(chapter.printedPageStart !== undefined
        ? { printedPageStart: chapter.printedPageStart }
        : {}),
      ...(chapter.printedPageEnd !== undefined
        ? { printedPageEnd: chapter.printedPageEnd }
        : {}),
      characterCount: chapter.characterCount,
      partCount: chapter.partCount,
      sectionIds: chapter.sectionIds,
      ...(chapter.candidateStoryId
        ? { candidateStoryId: chapter.candidateStoryId }
        : {}),
      hasPartialCandidate: chapter.hasPartialCandidate,
    })),
    sections: mappedSections,
  };
}

async function findDocumentId(canonicalUrl: string): Promise<string> {
  const [document] = await db
    .select({ id: knowledgeDocuments.id })
    .from(knowledgeDocuments)
    .where(and(
      eq(knowledgeDocuments.workspaceId, DEFAULT_WORKSPACE_ID),
      eq(knowledgeDocuments.canonicalUrl, canonicalUrl),
    ))
    .limit(1);
  if (!document) throw new Error("The document could not be created or reused");
  return document.id;
}

async function findDocumentVersion(documentId: string, contentHash: string) {
  const [version] = await db
    .select()
    .from(knowledgeDocumentVersions)
    .where(and(
      eq(knowledgeDocumentVersions.documentId, documentId),
      eq(knowledgeDocumentVersions.contentHash, contentHash),
    ))
    .limit(1);
  return version;
}

function normalizeInput(input: CreateOrAttachInput) {
  const documentType = input.documentType ?? "guideline";
  if (!["guideline", "report", "study", "manual", "other"].includes(documentType)) {
    throw new KnowledgeDocumentValidationError("Unsupported document type");
  }
  const priority = input.priority ?? 0;
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    throw new KnowledgeDocumentValidationError("Priority must be between 0 and 100");
  }
  const language = input.language?.trim() || "unknown";
  if (language.length > 32) throw new KnowledgeDocumentValidationError("Language is too long");
  const publisher = input.publisher?.trim() || undefined;
  if (publisher && publisher.length > 200) {
    throw new KnowledgeDocumentValidationError("Publisher is too long");
  }
  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 20 || tags.some((tag) => tag.length > 80)) {
    throw new KnowledgeDocumentValidationError("Document tags are invalid");
  }
  return {
    canonicalUrl: input.canonicalUrl,
    documentType,
    language,
    publisher,
    tags,
    priority,
  };
}
