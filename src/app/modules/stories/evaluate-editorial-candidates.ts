import "server-only";

import { createHash } from "node:crypto";

import { requireTopic } from "@/app/modules/topics/topic-context";

import {
  getEditorialEvaluationRuntimeConfig,
  type EditorialEvaluationPublicConfig,
} from "./editorial-evaluation.config";
import {
  createEditorialProfileFingerprint,
  type EditorialProfile,
} from "./editorial-profile.types";
import { getEditorialProfile } from "./editorial-profile.repository";
import type {
  EditorialDailyUsage,
  EditorialEvaluationCandidate,
  EditorialEvaluationRunResult,
} from "./editorial-evaluation.types";
import { evaluateStoriesWithGemini } from "./gemini-story-editorial-evaluator";
import { getStoryKeywordPreferences } from "./story-preferences.repository";
import {
  completeEditorialEvaluationRun,
  createEditorialEvaluationRun,
  editorialCacheKey,
  failEditorialEvaluationRun,
  findEditorialEvaluationCandidates,
  getCachedEditorialEvaluationKeys,
  getEditorialDailyUsage,
} from "./story-editorial.repository";

export async function evaluateEditorialCandidates(
  topicId: string,
  now = new Date(),
): Promise<EditorialEvaluationRunResult> {
  const configuration = getEditorialEvaluationRuntimeConfig();
  const [topic, preferences, editorialProfile, usageBefore] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getStoryKeywordPreferences(topicId),
    getEditorialProfile(topicId),
    getEditorialDailyUsage(topicId, now),
  ]);
  const storedCandidates = await findEditorialEvaluationCandidates(topicId, {
    freshness: editorialProfile.freshness,
    minLocalScore: editorialProfile.localCandidateMinScore,
    maxContentCharacters: configuration.maxContentCharacters,
    useLegacySourceFallback: editorialProfile.isDefault,
    now,
  });
  const candidates = storedCandidates.map((candidate) => ({
    ...candidate,
    inputHash: createEditorialInputHash(
      topicId,
      candidate,
      preferences,
      editorialProfile,
      {
        name: topic.name,
        description: topic.description,
      },
    ),
  }));
  const cachedKeys = await getCachedEditorialEvaluationKeys(
    topicId,
    candidates,
    configuration.provider,
    configuration.model,
    configuration.promptVersion,
  );
  const uncachedCandidates = candidates.filter(
    (candidate) =>
      !cachedKeys.has(editorialCacheKey(candidate.storyId, candidate.inputHash)),
  );
  const cachedStories = candidates.length - uncachedCandidates.length;

  if (uncachedCandidates.length === 0) {
    return {
      status: "no-candidates",
      provider: configuration.provider,
      model: configuration.model,
      promptVersion: configuration.promptVersion,
      candidatesScanned: candidates.length,
      cachedStories,
      evaluatedStories: 0,
      usage: emptyUsage(),
      daily: withDailyLimits(usageBefore, configuration),
      evaluations: [],
    };
  }

  assertDailyBudget(usageBefore, configuration);

  const remainingDailyStories =
    configuration.maxStoriesPerDay - usageBefore.stories;
  const selectedCandidates = uncachedCandidates.slice(
    0,
    Math.min(configuration.maxStoriesPerRun, remainingDailyStories),
  );
  const runId = await createEditorialEvaluationRun(topicId, {
    provider: configuration.provider,
    model: configuration.model,
    promptVersion: configuration.promptVersion,
    requestedStories: selectedCandidates.length,
    cachedStories,
    startedAt: now,
  });

  try {
    const result = await evaluateStoriesWithGemini({
      apiKey: configuration.apiKey,
      model: configuration.model,
      topic: {
        name: topic.name,
        description: topic.description,
      },
      candidates: selectedCandidates,
      preferences,
      editorialProfile,
    });

    await completeEditorialEvaluationRun({
      topicId,
      runId,
      provider: configuration.provider,
      model: configuration.model,
      promptVersion: configuration.promptVersion,
      candidates: selectedCandidates,
      result,
    });

    const usageAfter = await getEditorialDailyUsage(topicId);

    return {
      status: "completed",
      runId,
      provider: configuration.provider,
      model: configuration.model,
      promptVersion: configuration.promptVersion,
      candidatesScanned: candidates.length,
      cachedStories,
      evaluatedStories: result.evaluations.length,
      usage: result.usage,
      daily: withDailyLimits(usageAfter, configuration),
      evaluations: result.evaluations,
    };
  } catch (error) {
    await failEditorialEvaluationRun(
      topicId,
      runId,
      getSafeErrorMessage(error),
    ).catch((persistenceError) => {
      console.error(
        "Failed to mark editorial evaluation run as failed",
        persistenceError,
      );
    });

    throw error;
  }
}

function createEditorialInputHash(
  topicId: string,
  candidate: Omit<EditorialEvaluationCandidate, "inputHash">,
  preferences: {
    favoredTerms: string[];
    unfavoredTerms: string[];
  },
  editorialProfile: EditorialProfile,
  topic: {
    name: string;
    description?: string | null;
  },
): string {
  const serialized = JSON.stringify({
    topicId,
    topic: {
      name: topic.name,
      description: topic.description ?? null,
    },
    storyId: candidate.storyId,
    sourceId: candidate.sourceId,
    sourceName: candidate.sourceName,
    title: candidate.title,
    url: candidate.url,
    contentPreview: candidate.contentPreview ?? null,
    contentStatus: candidate.contentStatus,
    language: candidate.language,
    region: candidate.region,
    tags: [...candidate.tags].sort(),
    publishedAt: candidate.publishedAt?.toISOString() ?? null,
    favoredTerms: [...preferences.favoredTerms].sort(),
    unfavoredTerms: [...preferences.unfavoredTerms].sort(),
    editorialProfile: createEditorialProfileFingerprint(editorialProfile),
  });

  return createHash("sha256").update(serialized).digest("hex");
}

function assertDailyBudget(
  usage: EditorialDailyUsage,
  configuration: EditorialEvaluationPublicConfig,
): void {
  if (usage.runs >= configuration.maxRunsPerDay) {
    throw new EditorialEvaluationDailyLimitError(
      `Daily AI run limit reached (${configuration.maxRunsPerDay})`,
      usage,
      configuration,
    );
  }

  if (usage.stories >= configuration.maxStoriesPerDay) {
    throw new EditorialEvaluationDailyLimitError(
      `Daily AI story limit reached (${configuration.maxStoriesPerDay})`,
      usage,
      configuration,
    );
  }
}

function withDailyLimits(
  usage: EditorialDailyUsage,
  configuration: EditorialEvaluationPublicConfig,
): EditorialEvaluationRunResult["daily"] {
  return {
    ...usage,
    maxRuns: configuration.maxRunsPerDay,
    maxStories: configuration.maxStoriesPerDay,
    remainingRuns: Math.max(0, configuration.maxRunsPerDay - usage.runs),
    remainingStories: Math.max(
      0,
      configuration.maxStoriesPerDay - usage.stories,
    ),
  };
}

function emptyUsage() {
  return {
    promptTokens: 0,
    outputTokens: 0,
    thoughtsTokens: 0,
    totalTokens: 0,
  };
}

function getSafeErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown editorial evaluation error";
}

export class EditorialEvaluationDailyLimitError extends Error {
  constructor(
    message: string,
    readonly usage: EditorialDailyUsage,
    readonly configuration: EditorialEvaluationPublicConfig,
  ) {
    super(message);
  }
}
