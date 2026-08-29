import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  knowledgeDocumentSections,
  knowledgeDocuments,
  knowledgeDocumentVersions,
  stories,
  storyKnowledgeOrigins,
  storySources,
  topicKnowledgeDocuments,
  topicStories,
} from "@/db/schema";

import {
  KnowledgeDocumentNotFoundError,
  KnowledgeDocumentValidationError,
} from "./knowledge-document.types";
import { groupKnowledgeSectionsIntoChapters } from "./knowledge-chapters";

export type PromoteKnowledgeSectionResult = {
  storyId: string;
  created: boolean;
  title: string;
  sourceUrl: string;
};

/** Compatibility alias for callers created before chapters were exposed. */
export async function promoteKnowledgeSectionToStory(
  topicId: string,
  topicDocumentId: string,
  sectionId: string,
  now = new Date(),
): Promise<PromoteKnowledgeSectionResult> {
  return promoteKnowledgeChapterToStory(
    topicId,
    topicDocumentId,
    sectionId,
    now,
  );
}

export async function promoteKnowledgeChapterToStory(
  topicId: string,
  topicDocumentId: string,
  chapterId: string,
  now = new Date(),
): Promise<PromoteKnowledgeSectionResult> {
  return promoteKnowledgeChaptersToStory(
    topicId,
    topicDocumentId,
    [chapterId],
    undefined,
    now,
  );
}

export async function promoteKnowledgeChaptersToStory(
  topicId: string,
  topicDocumentId: string,
  chapterIds: readonly string[],
  requestedTitle?: string,
  now = new Date(),
): Promise<PromoteKnowledgeSectionResult> {
  const uniqueChapterIds = [...new Set(chapterIds)];
  if (uniqueChapterIds.length < 1 || uniqueChapterIds.length > 12) {
    throw new KnowledgeDocumentValidationError(
      "Select between 1 and 12 chapters for a story dossier",
    );
  }
  const [document] = await db
    .select({
      documentId: knowledgeDocuments.id,
      canonicalUrl: knowledgeDocuments.canonicalUrl,
      documentType: knowledgeDocuments.documentType,
      language: knowledgeDocuments.language,
      publisher: knowledgeDocuments.publisher,
      topicEnabled: topicKnowledgeDocuments.enabled,
      tags: topicKnowledgeDocuments.tags,
      priority: topicKnowledgeDocuments.priority,
      versionTitle: knowledgeDocumentVersions.title,
      versionId: knowledgeDocumentVersions.id,
      extractedAt: knowledgeDocumentVersions.extractedAt,
    })
    .from(topicKnowledgeDocuments)
    .innerJoin(
      knowledgeDocuments,
      eq(knowledgeDocuments.id, topicKnowledgeDocuments.documentId),
    )
    .innerJoin(
      knowledgeDocumentVersions,
      eq(knowledgeDocumentVersions.documentId, knowledgeDocuments.id),
    )
    .where(and(
      eq(topicKnowledgeDocuments.id, topicDocumentId),
      eq(topicKnowledgeDocuments.topicId, topicId),
    ))
    .orderBy(desc(knowledgeDocumentVersions.extractedAt))
    .limit(1);

  if (!document) {
    throw new KnowledgeDocumentNotFoundError(
      "The PDF chapter was not found in this topic",
    );
  }
  if (!document.topicEnabled) {
    throw new KnowledgeDocumentNotFoundError(
      "Enable the knowledge document before creating candidates",
    );
  }

  const sectionRows = await db
    .select({
      id: knowledgeDocumentSections.id,
      ordinal: knowledgeDocumentSections.ordinal,
      heading: knowledgeDocumentSections.heading,
      pageStart: knowledgeDocumentSections.pageStart,
      pageEnd: knowledgeDocumentSections.pageEnd,
      printedPageStart: knowledgeDocumentSections.printedPageStart,
      printedPageEnd: knowledgeDocumentSections.printedPageEnd,
      text: knowledgeDocumentSections.text,
      characterCount: knowledgeDocumentSections.characterCount,
    })
    .from(knowledgeDocumentSections)
    .where(eq(knowledgeDocumentSections.documentVersionId, document.versionId))
    .orderBy(knowledgeDocumentSections.ordinal);
  const availableChapters = groupKnowledgeSectionsIntoChapters(
    sectionRows.map(({ printedPageStart, printedPageEnd, ...section }) => ({
      ...section,
      ...(printedPageStart !== null ? { printedPageStart } : {}),
      ...(printedPageEnd !== null ? { printedPageEnd } : {}),
    })),
  );
  const chapters = uniqueChapterIds.map((chapterId) =>
    availableChapters.find(
      (candidate) =>
        candidate.id === chapterId || candidate.sectionIds.includes(chapterId),
    ),
  );
  if (chapters.some((chapter) => !chapter)) {
    throw new KnowledgeDocumentNotFoundError(
      "The PDF chapter was not found in this topic",
    );
  }
  const selectedChapters = chapters.filter(
    (chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter),
  ).sort(
    (left, right) => left.sections[0]!.ordinal - right.sections[0]!.ordinal,
  );
  const sectionIds = selectedChapters.flatMap(
    (chapter) => chapter.sectionIds,
  );

  const existing = await findExistingChapterOrigin(
    topicId,
    sectionIds,
  );
  if (existing) {
    return {
      storyId: existing.storyId,
      created: false,
      title: existing.title,
      sourceUrl: existing.sourceUrl,
    };
  }

  const pageStart = Math.min(
    ...selectedChapters.map((chapter) => chapter.pageStart),
  );
  const pageEnd = Math.max(
    ...selectedChapters.map((chapter) => chapter.pageEnd),
  );
  const printedStarts = selectedChapters.flatMap((chapter) =>
    chapter.printedPageStart === undefined ? [] : [chapter.printedPageStart],
  );
  const printedEnds = selectedChapters.flatMap((chapter) =>
    chapter.printedPageEnd === undefined ? [] : [chapter.printedPageEnd],
  );
  const printedPageStart = printedStarts.length > 0
    ? Math.min(...printedStarts)
    : undefined;
  const printedPageEnd = printedEnds.length > 0
    ? Math.max(...printedEnds)
    : undefined;
  const identity = knowledgeStoryIdentity(
    selectedChapters.map((chapter) => chapter.id),
  );
  const sourceUrl = withPdfPage(document.canonicalUrl, pageStart);
  const canonicalUrl = withInternalKnowledgeIdentity(
    document.canonicalUrl,
    identity,
  );
  const title = dossierTitle(
    requestedTitle,
    selectedChapters.map((chapter) => chapter.heading),
    document.versionTitle,
    pageStart,
    pageEnd,
    printedPageStart,
    printedPageEnd,
  );
  const relevanceScore = Math.max(70, document.priority);
  const tags = [...new Set([
    ...document.tags,
    "research",
    "knowledge-document",
    "knowledge-chapter",
    ...(selectedChapters.length > 1 ? ["knowledge-dossier"] : []),
    document.documentType,
  ])];
  const contentText = selectedChapters.map((chapter) => {
    const text = chapter.sections
      .map((section) => section.text.trim())
      .filter(Boolean)
      .join("\n\n");
    return selectedChapters.length > 1
      ? `${chapter.heading}\n\n${text}`
      : text;
  }).join("\n\n---\n\n");
  const relevanceReasons = [
    selectedChapters.length > 1
      ? "knowledge-document: human-curated dossier"
      : "knowledge-document: human-selected chapter",
    `document-priority: ${document.priority}`,
    `source-pdf-pages: ${pageStart}-${pageEnd}`,
    ...(printedPageStart !== undefined && printedPageEnd !== undefined
      ? [`source-printed-pages: ${printedPageStart}-${printedPageEnd}`]
      : []),
    `source-chapters: ${selectedChapters.length}`,
    `source-chunks: ${sectionIds.length}`,
  ];

  const [createdStory] = await db
    .insert(stories)
    .values({
      canonicalUrl,
      originalUrl: sourceUrl,
      title,
      contentText,
      contentStatus: "full",
      language: document.language,
      region: "global",
      tags,
      publishedAt: null,
      firstSeenAt: now,
      lastSeenAt: now,
      relevanceScore,
      relevanceReasons,
      processingStatus: "ready",
    })
    .onConflictDoNothing({ target: stories.canonicalUrl })
    .returning({ id: stories.id });
  const storyId = createdStory?.id ?? await findStoryId(canonicalUrl);

  await db
    .insert(topicStories)
    .values({
      topicId,
      storyId,
      relevanceScore,
      relevanceReasons,
      processingStatus: "ready",
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [topicStories.topicId, topicStories.storyId],
      set: {
        relevanceScore,
        relevanceReasons,
        lastSeenAt: now,
        processingStatus: sql`CASE
          WHEN ${topicStories.processingStatus} IN ('selected', 'published')
            THEN ${topicStories.processingStatus}
          WHEN ${topicStories.reviewDecision} = 'rejected'
            THEN 'rejected'::story_processing_status
          ELSE 'ready'::story_processing_status
        END`,
      },
    });

  const sourceId = `knowledge:${document.documentId}`;
  const sourceName = document.publisher?.trim() || document.versionTitle;
  await db
    .insert(storySources)
    .values({
      storyId,
      sourceId,
      sourceName,
      externalId: identity,
      sourceUrl,
      fetchedAt: document.extractedAt,
    })
    .onConflictDoUpdate({
      target: [storySources.sourceId, storySources.externalId],
      set: { storyId, sourceName, sourceUrl, fetchedAt: document.extractedAt },
    });

  await db
    .insert(storyKnowledgeOrigins)
    .values(sectionIds.map((sectionId) => ({
      topicId,
      storyId,
      sectionId,
    })))
    .onConflictDoNothing({
      target: [
        storyKnowledgeOrigins.topicId,
        storyKnowledgeOrigins.storyId,
        storyKnowledgeOrigins.sectionId,
      ],
    });

  return { storyId, created: true, title, sourceUrl };
}

async function findExistingChapterOrigin(
  topicId: string,
  sectionIds: string[],
) {
  const rows = await db
    .select({
      storyId: storyKnowledgeOrigins.storyId,
      title: stories.title,
      sourceUrl: stories.originalUrl,
    })
    .from(storyKnowledgeOrigins)
    .innerJoin(stories, eq(stories.id, storyKnowledgeOrigins.storyId))
    .where(and(
      eq(storyKnowledgeOrigins.topicId, topicId),
      inArray(storyKnowledgeOrigins.sectionId, sectionIds),
    ));
  if (rows.length === 0) return undefined;

  const matchesByStory = new Map<string, typeof rows>();
  for (const row of rows) {
    const matches = matchesByStory.get(row.storyId) ?? [];
    matches.push(row);
    matchesByStory.set(row.storyId, matches);
  }
  return [...matchesByStory.values()].find(
    (matches) => matches.length === sectionIds.length,
  )?.[0];
}

async function findStoryId(canonicalUrl: string): Promise<string> {
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(eq(stories.canonicalUrl, canonicalUrl))
    .limit(1);
  if (!story) throw new Error("The knowledge candidate could not be created");
  return story.id;
}

function withPdfPage(value: string, page: number): string {
  const url = new URL(value);
  url.hash = `page=${page}`;
  return url.href;
}

function withInternalKnowledgeIdentity(value: string, identity: string): string {
  const url = new URL(value);
  url.hash = `press-craftor-knowledge=${identity}`;
  return url.href;
}

function knowledgeStoryIdentity(chapterIds: string[]): string {
  if (chapterIds.length === 1) return `chapter-${chapterIds[0]}`;
  return `dossier-${createHash("sha256")
    .update(chapterIds.join("|"))
    .digest("hex")
    .slice(0, 24)}`;
}

function dossierTitle(
  requestedTitle: string | undefined,
  headings: string[],
  documentTitle: string,
  pageStart: number,
  pageEnd: number,
  printedPageStart?: number,
  printedPageEnd?: number,
): string {
  const normalized = requestedTitle?.replace(/\s+/gu, " ").trim();
  if (normalized) return normalized.slice(0, 500);
  if (headings.length === 1) {
    return candidateTitle(
      headings[0]!,
      documentTitle,
      pageStart,
      pageEnd,
      printedPageStart,
      printedPageEnd,
    );
  }
  return `${headings[0]} + ${headings.length - 1} related chapters · ${sourcePageLabel(pageStart, pageEnd, printedPageStart, printedPageEnd)}`
    .slice(0, 500);
}

function candidateTitle(
  heading: string,
  documentTitle: string,
  pageStart: number,
  pageEnd: number,
  printedPageStart?: number,
  printedPageEnd?: number,
): string {
  const normalizedHeading = heading.trim();
  const base = normalizedHeading.toLowerCase().startsWith("document overview")
    ? documentTitle
    : normalizedHeading;
  const pages = sourcePageLabel(
    pageStart,
    pageEnd,
    printedPageStart,
    printedPageEnd,
  );
  return `${base} · ${pages}`.slice(0, 500);
}

function sourcePageLabel(
  pdfPageStart: number,
  pdfPageEnd: number,
  printedPageStart?: number,
  printedPageEnd?: number,
): string {
  const pdfPages = pdfPageStart === pdfPageEnd
    ? `PDF page ${pdfPageStart}`
    : `PDF pages ${pdfPageStart}–${pdfPageEnd}`;
  if (printedPageStart === undefined || printedPageEnd === undefined) {
    return pdfPages;
  }
  const printedPages = printedPageStart === printedPageEnd
    ? `printed page ${printedPageStart}`
    : `printed pages ${printedPageStart}–${printedPageEnd}`;
  return `${printedPages} · ${pdfPages}`;
}
