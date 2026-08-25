import "server-only";

import { createHash } from "node:crypto";

import { requireTopic } from "@/app/modules/topics/topic-context";

import {
  getCreativeContentPublicConfig,
  getCreativeContentRuntimeConfig,
} from "./creative-content.config";
import {
  approveCreativeDraft,
  completeCreativeAiRun,
  createCreativeAiRun,
  failCreativeAiRun,
  findCachedCreativeBrief,
  findCachedCreativeDraft,
  findCreativeBriefById,
  findCreativeDraftById,
  findCreativeDrafts,
  findLatestCreativeBrief,
  getCreativeDailyUsage,
  insertCreativeBrief,
  insertCreativeDraft,
  replaceCreativeDraft,
  unapproveCreativeDraft,
} from "./creative-content.repository";
import type {
  CreativeAspectRatio,
  CreativeDraft,
  CreativeFormat,
  CreativeGenerationResult,
  CreativeProfile,
  CreativeUnit,
  CreativeWorkspaceState,
  EditableCreativeDraft,
} from "./creative-content.types";
import {
  defaultCreativeOutputAspectRatio,
  isCreativeOutputAspectRatio,
  resolveCreativeOutputAspectRatio,
} from "./creative-aspect-ratio";
import {
  generateCreativeBriefWithGemini,
  generateCreativeDraftWithGemini,
  type CreativeTopicContext,
} from "./gemini-creative-content-generator";
import { getCreativeProfile } from "./creative-profile.repository";
import { resolveCreativeVisualGuidance } from "./creative-visual-guidance";
import {
  getSelectedStoryContent,
  type SelectedStoryContentRecord,
} from "./story-content.repository";

export async function getCreativeWorkspaceState(
  topicId: string,
  storyId: string,
): Promise<CreativeWorkspaceState> {
  const configuration = getCreativeContentPublicConfig();
  const [topic, story, profile, brief, daily] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getSelectedStoryContent(topicId, storyId),
    getCreativeProfile(topicId),
    findLatestCreativeBrief(topicId, storyId),
    getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
  ]);
  const inputHash = story.text?.trim()
    ? createBriefInputHash(
        story,
        profile,
        topic,
        configuration,
        shortenContent(story.text.trim(), configuration.maxContentCharacters),
      )
    : undefined;
  const drafts = brief ? await findCreativeDrafts(topicId, brief.id) : [];

  return {
    story: {
      storyId: story.storyId,
      title: story.title,
      url: story.url,
      contentStatus: story.contentStatus,
      contentSource: story.source,
      hasContent: Boolean(story.text?.trim()),
    },
    profile,
    ...(brief ? { brief } : {}),
    briefIsCurrent: Boolean(brief && inputHash === brief.inputHash),
    drafts,
    daily,
    configuration: {
      provider: configuration.provider,
      model: configuration.model,
      briefPromptVersion: configuration.briefPromptVersion,
      draftPromptVersions: configuration.draftPromptVersions,
    },
  };
}

export async function createCreativeBrief(
  topicId: string,
  storyId: string,
): Promise<CreativeGenerationResult> {
  const configuration = getCreativeContentRuntimeConfig();
  const [topic, story, profile, daily] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getSelectedStoryContent(topicId, storyId),
    getCreativeProfile(topicId),
    getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
  ]);
  const content = requireStoryContent(story, configuration.maxContentCharacters);
  const inputHash = createBriefInputHash(
    story,
    profile,
    topic,
    configuration,
    content,
  );
  const cached = await findCachedCreativeBrief(
    topicId,
    storyId,
    configuration.provider,
    configuration.model,
    configuration.briefPromptVersion,
    inputHash,
  );

  if (cached) {
    return {
      outcome: "cached",
      state: await getCreativeWorkspaceState(topicId, storyId),
    };
  }

  assertCreativeDailyBudget(daily.runs, configuration.maxRunsPerDay);
  const runId = await createCreativeAiRun({
    topicId,
    storyId,
    task: "brief",
    provider: configuration.provider,
    model: configuration.model,
    promptVersion: configuration.briefPromptVersion,
    inputHash,
  });

  try {
    const result = await generateCreativeBriefWithGemini({
      apiKey: configuration.apiKey,
      model: configuration.model,
      story: storyForGenerator(story, content),
      topic,
      profile,
    });
    const brief = await insertCreativeBrief({
      topicId,
      storyId,
      profile,
      provider: configuration.provider,
      model: configuration.model,
      modelVersion: result.modelVersion,
      promptVersion: configuration.briefPromptVersion,
      inputHash,
      generated: result.brief,
      usage: result.usage,
    });
    await completeCreativeAiRun(topicId, runId, result.usage, {
      briefId: brief.id,
    });

    return {
      outcome: "generated",
      state: await getCreativeWorkspaceState(topicId, storyId),
    };
  } catch (error) {
    await failRunSafely(topicId, runId, error);
    throw error;
  }
}

export async function createCreativeDraft(
  topicId: string,
  briefId: string,
  format: CreativeFormat,
  aspectRatio?: CreativeAspectRatio,
): Promise<CreativeGenerationResult> {
  const configuration = getCreativeContentRuntimeConfig();
  const brief = await findCreativeBriefById(topicId, briefId);
  const outputAspectRatio = resolveCreativeOutputAspectRatio(
    format,
    aspectRatio,
  );

  if (!brief) {
    throw new CreativeContentNotFoundError("The creative brief was not found");
  }

  const [topic, story, currentProfile, daily] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getSelectedStoryContent(topicId, brief.storyId),
    getCreativeProfile(topicId),
    getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
  ]);
  const content = requireStoryContent(story, configuration.maxContentCharacters);
  const currentBriefHash = createBriefInputHash(
    story,
    currentProfile,
    topic,
    configuration,
    content,
  );

  if (currentBriefHash !== brief.inputHash) {
    throw new CreativeContentConflictError(
      "The story content or creative profile changed. Refresh the creative brief before generating a draft.",
    );
  }

  const promptVersion = configuration.draftPromptVersions[format];
  const inputHash = createDraftInputHash(
    brief.id,
    brief.inputHash,
    format,
    outputAspectRatio,
    {
      provider: configuration.provider,
      model: configuration.model,
      promptVersion,
    },
  );
  const cached = await findCachedCreativeDraft(
    topicId,
    brief.id,
    format,
    inputHash,
  );

  if (cached) {
    return {
      outcome: "cached",
      state: await getCreativeWorkspaceState(topicId, brief.storyId),
    };
  }

  assertCreativeDailyBudget(daily.runs, configuration.maxRunsPerDay);
  const runId = await createCreativeAiRun({
    topicId,
    storyId: brief.storyId,
    briefId: brief.id,
    task: "draft",
    provider: configuration.provider,
    model: configuration.model,
    promptVersion,
    inputHash,
  });

  try {
    const result = await generateCreativeDraftWithGemini({
      apiKey: configuration.apiKey,
      model: configuration.model,
      story: storyForGenerator(story, content),
      topic,
      profile: brief.profileSnapshot,
      brief,
      format,
      outputAspectRatio,
    });
    const draft = await insertCreativeDraft({
      topicId,
      storyId: brief.storyId,
      briefId: brief.id,
      format,
      outputAspectRatio,
      provider: configuration.provider,
      model: configuration.model,
      modelVersion: result.modelVersion,
      promptVersion,
      inputHash,
      generated: result.draft,
      usage: result.usage,
    });
    await completeCreativeAiRun(topicId, runId, result.usage, {
      draftId: draft.id,
    });

    return {
      outcome: "generated",
      state: await getCreativeWorkspaceState(topicId, brief.storyId),
    };
  } catch (error) {
    await failRunSafely(topicId, runId, error);
    throw error;
  }
}

export async function saveCreativeDraft(
  topicId: string,
  draftId: string,
  input: unknown,
): Promise<CreativeDraft> {
  const current = await findCreativeDraftById(topicId, draftId);

  if (!current) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }

  const brief = await findCreativeBriefById(topicId, current.briefId);
  if (!brief) {
    throw new CreativeContentNotFoundError("The creative brief was not found");
  }

  const validated = validateEditableDraft(
    input,
    current.format,
    brief.keyFacts.map((fact) => fact.id),
    outputAspectRatioForDraft(current),
  );
  return replaceCreativeDraft(topicId, current, validated);
}

export async function approveSavedCreativeDraft(
  topicId: string,
  draftId: string,
): Promise<CreativeDraft> {
  const current = await findCreativeDraftById(topicId, draftId);

  if (!current) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }

  const brief = await findCreativeBriefById(topicId, current.briefId);
  if (!brief) {
    throw new CreativeContentNotFoundError("The creative brief was not found");
  }

  validateEditableDraft(
    current,
    current.format,
    brief.keyFacts.map((fact) => fact.id),
    outputAspectRatioForDraft(current),
  );
  return approveCreativeDraft(topicId, draftId);
}

export async function unapproveSavedCreativeDraft(
  topicId: string,
  draftId: string,
): Promise<CreativeDraft> {
  const current = await findCreativeDraftById(topicId, draftId);

  if (!current) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }

  if (current.status !== "approved") {
    throw new CreativeContentConflictError(
      "Only an approved creative draft can be unapproved.",
    );
  }

  return unapproveCreativeDraft(topicId, draftId);
}

function requireStoryContent(
  story: SelectedStoryContentRecord,
  maximumCharacters: number,
): string {
  const content = story.text?.trim();

  if (!content || story.contentStatus === "missing") {
    throw new CreativeContentInsufficientError(
      "Prepare the story content before creating a creative brief.",
    );
  }

  return shortenContent(content, maximumCharacters);
}

function shortenContent(content: string, maximumCharacters: number): string {
  if (content.length <= maximumCharacters) {
    return content;
  }

  const leadingCharacters = Math.floor(maximumCharacters * 0.8);
  const trailingCharacters = maximumCharacters - leadingCharacters;
  return `${content.slice(0, leadingCharacters)}\n\n[content shortened]\n\n${content.slice(-trailingCharacters)}`;
}

function storyForGenerator(story: SelectedStoryContentRecord, text: string) {
  if (story.contentStatus === "missing") {
    throw new CreativeContentInsufficientError("The story has no usable content");
  }

  return {
    title: story.title,
    url: story.url,
    text,
    contentStatus: story.contentStatus,
    contentSource: story.source,
  };
}

function createBriefInputHash(
  story: SelectedStoryContentRecord,
  profile: CreativeProfile,
  topic: CreativeTopicContext,
  configuration: {
    provider: string;
    model: string;
    briefPromptVersion: string;
    maxContentCharacters: number;
  },
  normalizedContent: string,
): string {
  return hash({
    story: {
      storyId: story.storyId,
      title: story.title,
      url: story.url,
      text: normalizedContent,
      contentStatus: story.contentStatus,
      source: story.source,
    },
    profile: {
      name: profile.name,
      language: profile.language,
      region: profile.region,
      platform: profile.platform,
      audience: profile.audience,
      brandPersonality: profile.brandPersonality,
      formality: profile.formality,
      humor: profile.humor,
      energy: profile.energy,
      optimism: profile.optimism,
      provocation: profile.provocation,
      allowEmojis: profile.allowEmojis,
      maxEmojis: profile.maxEmojis,
      callToActionStyle: profile.callToActionStyle,
      visualGuidance: resolveCreativeVisualGuidance(profile),
    },
    topic: {
      name: topic.name,
      description: topic.description ?? null,
    },
    provider: configuration.provider,
    model: configuration.model,
    promptVersion: configuration.briefPromptVersion,
  });
}

function createDraftInputHash(
  briefId: string,
  briefInputHash: string,
  format: CreativeFormat,
  outputAspectRatio: CreativeAspectRatio,
  configuration: { provider: string; model: string; promptVersion: string },
): string {
  return hash({
    briefId,
    briefInputHash,
    format,
    outputAspectRatio,
    ...configuration,
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateEditableDraft(
  input: unknown,
  format: CreativeFormat,
  knownFactIds: string[],
  outputAspectRatio: CreativeAspectRatio,
): EditableCreativeDraft {
  const record = recordValue(input, "A draft object is required");
  const selectedOutputAspectRatio = editableDraftOutputAspectRatio(
    record.outputAspectRatio,
    outputAspectRatio,
  );
  const rawUnits = record.units;
  const minimum = format === "meme" ? 1 : 3;
  const maximum = format === "meme" ? 1 : 8;

  if (!Array.isArray(rawUnits) || rawUnits.length < minimum || rawUnits.length > maximum) {
    throw new CreativeDraftValidationError(
      format === "meme"
        ? "A meme draft must contain exactly one frame"
        : "A carousel draft must contain 3 to 8 slides",
    );
  }

  const facts = new Set(knownFactIds);
  const units: CreativeUnit[] = rawUnits.map((value, index) => {
    const unit = recordValue(value, `Slide ${index + 1} is invalid`);
    const factIds = textArray(unit.factIds, `unit ${index + 1} factIds`, 6, 30);
    const role = unit.role;
    const assetRequest = unit.assetRequest;

    if (
      role !== "cover" &&
      role !== "content" &&
      role !== "conclusion" &&
      role !== "call-to-action"
    ) {
      throw new CreativeDraftValidationError(`Unit ${index + 1} has an invalid role`);
    }

    if (assetRequest !== "generated-image" && assetRequest !== "typography-only") {
      throw new CreativeDraftValidationError(
        `Unit ${index + 1} has an invalid asset request`,
      );
    }

    if (factIds.some((id) => !facts.has(id))) {
      throw new CreativeDraftValidationError(
        `Unit ${index + 1} cites an unknown fact`,
      );
    }

    return {
      order: index + 1,
      type: format === "meme" ? "meme-frame" : "carousel-slide",
      role,
      headline: requiredText(unit.headline, `unit ${index + 1} headline`, 240),
      ...optionalText(unit.body, "body", 600),
      visualDirection: requiredText(
        unit.visualDirection,
        `unit ${index + 1} visualDirection`,
        1_000,
      ),
      factIds,
      assetRequest,
      aspectRatio: selectedOutputAspectRatio,
    };
  });

  return {
    concept: requiredText(record.concept, "concept", 1_000),
    caption: requiredText(record.caption, "caption", 3_000),
    ...optionalText(record.callToAction, "callToAction", 500),
    hashtags: normalizeHashtags(textArray(record.hashtags, "hashtags", 8, 80)),
    altText: requiredText(record.altText, "altText", 1_000),
    outputAspectRatio: selectedOutputAspectRatio,
    units,
  };
}

function editableDraftOutputAspectRatio(
  value: unknown,
  fallback: CreativeAspectRatio,
): CreativeAspectRatio {
  if (value === undefined) return fallback;
  if (!isCreativeOutputAspectRatio(value)) {
    throw new CreativeDraftValidationError(
      "outputAspectRatio must be 1:1, 4:5, or 16:9",
    );
  }
  if (value !== fallback) {
    throw new CreativeDraftValidationError(
      "The output aspect ratio is fixed after draft creation. Select or generate another ratio variant instead.",
    );
  }
  return fallback;
}

function outputAspectRatioForDraft(
  draft: Pick<CreativeDraft, "format"> & {
    outputAspectRatio?: CreativeAspectRatio;
  },
): CreativeAspectRatio {
  return resolveCreativeOutputAspectRatio(
    draft.format,
    draft.outputAspectRatio ?? defaultCreativeOutputAspectRatio(draft.format),
  );
}

function recordValue(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CreativeDraftValidationError(message);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeDraftValidationError(`${field} is required`);
  }
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function optionalText(
  value: unknown,
  field: "body" | "callToAction",
  max: number,
): Partial<Record<"body" | "callToAction", string>> {
  if (value === undefined || value === null || value === "") {
    return {};
  }
  if (typeof value !== "string") {
    throw new CreativeDraftValidationError(`${field} must be text`);
  }
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, max);
  return normalized ? { [field]: normalized } : {};
}

function textArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new CreativeDraftValidationError(`${field} must be a text array`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
}

function normalizeHashtags(hashtags: string[]): string[] {
  return hashtags
    .map((hashtag) => hashtag.replace(/\s+/g, "").replace(/^#+/, ""))
    .filter(Boolean)
    .map((hashtag) => `#${hashtag}`);
}

function assertCreativeDailyBudget(runs: number, maxRuns: number): void {
  if (runs >= maxRuns) {
    throw new CreativeContentDailyLimitError(
      `Daily creative AI run limit reached (${maxRuns})`,
    );
  }
}

async function failRunSafely(
  topicId: string,
  runId: string,
  error: unknown,
): Promise<void> {
  await failCreativeAiRun(
    topicId,
    runId,
    error instanceof Error ? error.message : "Unknown creative AI error",
  ).catch((persistenceError) => {
    console.error("Failed to mark creative AI run as failed", persistenceError);
  });
}

export class CreativeContentNotFoundError extends Error {}
export class CreativeContentInsufficientError extends Error {}
export class CreativeContentConflictError extends Error {}
export class CreativeContentDailyLimitError extends Error {}
export class CreativeDraftValidationError extends Error {}
