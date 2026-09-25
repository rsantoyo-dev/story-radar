import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  collectionSourceRuns,
  knowledgeDocumentIngestionRuns,
  knowledgeDocuments,
  knowledgeDocumentVersions,
  ownedContentEntries,
  rssSources,
  topicKnowledgeDocuments,
  topicSources,
  topics,
} from "@/db/schema";
import { getAiResearchSourceConfig } from "@/app/modules/sources/ai-research/ai-research.repository";
import { DEFAULT_WORKSPACE_ID } from "@/app/modules/topics/topic-catalog.repository";

export type WorkspaceSourceCatalog = Awaited<ReturnType<typeof listWorkspaceSourceCatalog>>;

export async function listWorkspaceSourceCatalog(workspaceId = DEFAULT_WORKSPACE_ID) {
  const [topicRows, feedRows, feedLinks, documentRows, documentLinks, manualRows] = await Promise.all([
    db.select().from(topics).where(eq(topics.workspaceId, workspaceId)),
    db.select().from(rssSources).where(eq(rssSources.workspaceId, workspaceId)).orderBy(rssSources.name),
    db.select().from(topicSources).where(eq(topicSources.workspaceId, workspaceId)),
    db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.workspaceId, workspaceId)).orderBy(desc(knowledgeDocuments.updatedAt)),
    db.select().from(topicKnowledgeDocuments).where(eq(topicKnowledgeDocuments.workspaceId, workspaceId)),
    db.select({
      id: ownedContentEntries.id,
      storyId: ownedContentEntries.storyId,
      title: ownedContentEntries.title,
      contentType: ownedContentEntries.contentType,
      publishedAt: ownedContentEntries.publishedAt,
      createdAt: ownedContentEntries.createdAt,
      topicId: topics.id,
      topicName: topics.name,
    })
      .from(ownedContentEntries)
      .innerJoin(topics, eq(topics.id, ownedContentEntries.topicId))
      .where(eq(topics.workspaceId, workspaceId))
      .orderBy(desc(ownedContentEntries.publishedAt)),
  ]);

  const feedIds = feedRows.map((feed) => feed.id);
  const documentIds = documentRows.map((document) => document.id);
  const [feedRuns, documentRuns, documentVersions, aiResearch] = await Promise.all([
    feedIds.length
      ? db.select().from(collectionSourceRuns).where(inArray(collectionSourceRuns.sourceId, feedIds)).orderBy(desc(collectionSourceRuns.createdAt))
      : Promise.resolve([]),
    documentIds.length
      ? db.select().from(knowledgeDocumentIngestionRuns).where(inArray(knowledgeDocumentIngestionRuns.documentId, documentIds)).orderBy(desc(knowledgeDocumentIngestionRuns.startedAt))
      : Promise.resolve([]),
    documentIds.length
      ? db.select().from(knowledgeDocumentVersions).where(inArray(knowledgeDocumentVersions.documentId, documentIds)).orderBy(desc(knowledgeDocumentVersions.extractedAt))
      : Promise.resolve([]),
    Promise.all(topicRows.map(async (topic) => {
      const [config, latestRun] = await Promise.all([
        getAiResearchSourceConfig(topic.id),
        db.select().from(collectionSourceRuns)
          .where(eq(collectionSourceRuns.sourceId, `ai-research:${topic.id}`))
          .orderBy(desc(collectionSourceRuns.createdAt)).limit(1),
      ]);
      return {
        ...config,
        model: process.env.AI_RESEARCH_OPENAI_MODEL?.trim() || "gpt-6-sol",
        latestRun: latestRun[0] ? {
          status: latestRun[0].status,
          at: latestRun[0].createdAt,
          error: latestRun[0].error,
        } : undefined,
      };
    })),
  ]);

  const topicNames = new Map(topicRows.map((topic) => [topic.id, topic.name]));
  const latestFeedRun = new Map<string, (typeof feedRuns)[number]>();
  for (const run of feedRuns) if (!latestFeedRun.has(run.sourceId)) latestFeedRun.set(run.sourceId, run);
  const latestDocumentRun = new Map<string, (typeof documentRuns)[number]>();
  for (const run of documentRuns) if (!latestDocumentRun.has(run.documentId)) latestDocumentRun.set(run.documentId, run);
  const latestDocumentVersion = new Map<string, (typeof documentVersions)[number]>();
  for (const version of documentVersions) if (!latestDocumentVersion.has(version.documentId)) latestDocumentVersion.set(version.documentId, version);

  return {
    rss: feedRows.map((feed) => ({
      id: feed.id,
      name: feed.name,
      url: feed.url,
      language: feed.language,
      region: feed.region,
      contentMode: feed.contentMode,
      pollEveryMinutes: feed.pollEveryMinutes,
      isActive: feed.isActive,
      lastPoll: latestFeedRun.get(feed.id) ? {
        at: latestFeedRun.get(feed.id)!.createdAt,
        status: latestFeedRun.get(feed.id)!.status,
      } : undefined,
      topics: feedLinks.filter((link) => link.rssSourceId === feed.id).map((link) => ({
        topicId: link.topicId,
        topicName: topicNames.get(link.topicId) ?? "Unknown topic",
        topicSourceId: link.id,
        enabled: link.enabled,
        priority: link.priority,
        tags: link.tags,
      })),
    })),
    documents: documentRows.map((document) => ({
      id: document.id,
      canonicalUrl: document.canonicalUrl,
      uploaded: Boolean(document.objectKey),
      originalFilename: document.originalFilename,
      documentType: document.documentType,
      language: document.language,
      publisher: document.publisher,
      latestRun: latestDocumentRun.get(document.id) ? {
        status: latestDocumentRun.get(document.id)!.status,
        stage: latestDocumentRun.get(document.id)!.stage,
        error: latestDocumentRun.get(document.id)!.error,
        at: latestDocumentRun.get(document.id)!.updatedAt,
      } : undefined,
      latestVersion: latestDocumentVersion.get(document.id) ? {
        title: latestDocumentVersion.get(document.id)!.title,
        pageCount: latestDocumentVersion.get(document.id)!.pageCount,
        extractedAt: latestDocumentVersion.get(document.id)!.extractedAt,
      } : undefined,
      topics: documentLinks.filter((link) => link.documentId === document.id).map((link) => ({
        topicId: link.topicId,
        topicName: topicNames.get(link.topicId) ?? "Unknown topic",
        topicDocumentId: link.id,
        enabled: link.enabled,
        priority: link.priority,
        tags: link.tags,
      })),
    })),
    aiResearch,
    manual: manualRows.map((entry) => ({
      id: entry.id,
      storyId: entry.storyId,
      topicId: entry.topicId,
      topicName: entry.topicName,
      title: entry.title,
      contentType: entry.contentType,
      publishedAt: entry.publishedAt,
      createdAt: entry.createdAt,
    })),
  };
}
