import "server-only";

import { createHash } from "node:crypto";

import { requireTopic } from "@/app/modules/topics/topic-context";

import {
  getCreativeContentPublicConfig,
  getCreativeCompanionRuntimeConfig,
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
  findCreativeDraftsForStory,
  findLatestCreativeBrief,
  getCreativeDailyUsage,
  insertCreativeBrief,
  insertCreativeDraft,
  replaceCreativeDraft,
  unapproveCreativeDraft,
} from "./creative-content.repository";
import {
  listCreativeCharacterRoster,
  snapshotsForCreativeCharacterIds,
  snapshotsForCreativeUnits,
} from "./creative-characters.repository";
import type {
  CreativeAspectRatio,
  CreativeCharacterRosterEntry,
  CreativeCharacterSnapshot,
  CreativeCompanionApproach,
  CreativeDraft,
  CreativeFormat,
  CreativeGenerationResult,
  CreativeProfile,
  CreativeUnit,
  CreativeWorkspaceState,
  EditableCreativeDraft,
} from "./creative-content.types";
import { isCreativeCompanionApproach } from "./creative-content.types";
import {
  defaultCreativeOutputAspectRatio,
  isCreativeOutputAspectRatio,
  resolveCreativeOutputAspectRatio,
} from "./creative-aspect-ratio";
import {
  generateCreativeBrief,
  generateCreativeDraft,
  type CreativeTopicContext,
} from "./gemini-creative-content-generator";
import { isCarouselEditorialGoal } from "./carousel-narrative";
import {
  deterministicCreativeQualityIssues,
  getCreativeDraftApprovalState,
  repairDeterministicCreativeCopy,
} from "./creative-quality";
import { getCreativeProfile } from "./creative-profile.repository";
import { resolveCreativeVisualGuidance } from "./creative-visual-guidance";
import { generateCompanionStoryScript } from "./companion-story-generator";
import { defaultCreativeInteractiveOverlay } from "./creative-interactive-overlay";
import { isCreativeInteractiveOverlay } from "./creative-interactive-overlay";
import {
  getSelectedStoryContent,
  type SelectedStoryContentRecord,
} from "./story-content.repository";

export async function getCreativeWorkspaceState(
  topicId: string,
  storyId: string,
): Promise<CreativeWorkspaceState> {
  const configuration = getCreativeContentPublicConfig();
  const [topic, story, profile, characterRoster, latestBrief, daily] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getSelectedStoryContent(topicId, storyId),
    getCreativeProfile(topicId),
    listCreativeCharacterRoster(topicId),
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
        latestBrief?.editorialDirection,
      )
    : undefined;
  // A user can switch a profile back to a previous configuration. In that
  // case, prefer its already-valid cached brief over a newer but stale one.
  const cachedCurrentBrief =
    inputHash && latestBrief?.inputHash !== inputHash
      ? await findCachedCreativeBrief(
          topicId,
          storyId,
          configuration.briefPromptVersion,
          inputHash,
        )
      : undefined;
  const brief = cachedCurrentBrief ?? latestBrief;
  const briefIsCurrent = Boolean(brief && inputHash === brief.inputHash);
  const draftsForStory = await findCreativeDraftsForStory(topicId, storyId);
  const isCurrentPrimaryDraft = (draft: CreativeDraft) =>
    Boolean(
      briefIsCurrent &&
        brief?.id === draft.briefId &&
        draft.inputHash ===
          createDraftInputHash(
            brief.id,
            brief.inputHash,
            draft.format,
            draft.outputAspectRatio,
            characterRoster,
            {
              provider: configuration.provider,
              model: configuration.model,
              promptVersion: configuration.draftPromptVersions[draft.format],
            },
          ),
    );
  const currentApprovedParentIds = new Set(
    draftsForStory
      .filter(
        (draft) =>
          !draft.companion &&
          draft.status === "approved" &&
          isCurrentPrimaryDraft(draft),
      )
      .map((draft) => draft.id),
  );
  const drafts = draftsForStory
    .map((draft) => ({
      ...draft,
      // Historical drafts remain in the workspace response for a future
      // read-only history view. A companion has its own provenance hash, so it
      // inherits freshness from its still-approved current parent draft.
      inputIsCurrent: draft.companion
        ? Boolean(
            briefIsCurrent &&
              brief?.id === draft.briefId &&
              currentApprovedParentIds.has(draft.companion.parentDraftId),
          )
        : isCurrentPrimaryDraft(draft),
    }))
    // Keep the latest saved version first. The Studio still distinguishes a
    // current draft from a read-only historical one after the user opens it.
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

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
    characterRoster,
    ...(brief ? { brief } : {}),
    briefIsCurrent,
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
  editorialDirection?: string,
): Promise<CreativeGenerationResult> {
  const configuration = getCreativeContentRuntimeConfig();
  const [topic, story, profile, daily] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getSelectedStoryContent(topicId, storyId),
    getCreativeProfile(topicId),
    getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
  ]);
  const content = requireStoryContent(story, configuration.maxContentCharacters);
  const normalizedEditorialDirection = normalizeEditorialDirection(
    editorialDirection,
  );
  const inputHash = createBriefInputHash(
    story,
    profile,
    topic,
    configuration,
    content,
    normalizedEditorialDirection,
  );
  const cached = await findCachedCreativeBrief(
    topicId,
    storyId,
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
    const result = await generateCreativeBrief({
      apiKey: configuration.apiKey,
      paidGeminiApiKey: configuration.paidGeminiApiKey,
      model: configuration.model,
      primaryProvider: configuration.primaryProvider,
      groqApiKey: configuration.groqApiKey,
      groqModel: configuration.groqModel,
      cloudflareAiAccountId: configuration.cloudflareAiAccountId,
      cloudflareAiApiToken: configuration.cloudflareAiApiToken,
      cloudflareAiModel: configuration.cloudflareAiModel,
      story: storyForGenerator(story, content),
      topic,
      profile,
      editorialDirection: normalizedEditorialDirection,
    });
    const brief = await insertCreativeBrief({
      topicId,
      storyId,
      profile,
      provider: result.provider,
      model: result.model,
      modelVersion: result.modelVersion,
      promptVersion: configuration.briefPromptVersion,
      inputHash,
      editorialDirection: normalizedEditorialDirection,
      generated: result.brief,
      usage: result.usage,
    });
    await completeCreativeAiRun(
      topicId,
      runId,
      result.usage,
      { briefId: brief.id },
      { provider: result.provider, model: result.model },
    );

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
  createNewVersion = false,
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

  const [topic, story, currentProfile, characterRoster, daily] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getSelectedStoryContent(topicId, brief.storyId),
    getCreativeProfile(topicId),
    listCreativeCharacterRoster(topicId),
    getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
  ]);
  const content = requireStoryContent(story, configuration.maxContentCharacters);
  const currentBriefHash = createBriefInputHash(
    story,
    currentProfile,
    topic,
    configuration,
    content,
    brief.editorialDirection,
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
    characterRoster,
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

  if (cached && !createNewVersion) {
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
    const result = await generateCreativeDraft({
      apiKey: configuration.apiKey,
      paidGeminiApiKey: configuration.paidGeminiApiKey,
      model: configuration.model,
      primaryProvider: configuration.primaryProvider,
      groqApiKey: configuration.groqApiKey,
      groqModel: configuration.groqModel,
      cloudflareAiAccountId: configuration.cloudflareAiAccountId,
      cloudflareAiApiToken: configuration.cloudflareAiApiToken,
      cloudflareAiModel: configuration.cloudflareAiModel,
      openAiApiKey: configuration.openAiApiKey,
      openAiEditorialModels: configuration.openAiEditorialModels,
      story: storyForGenerator(story, content),
      topic,
      profile: brief.profileSnapshot,
      brief,
      format,
      outputAspectRatio,
      characterRoster,
    });
    const characterSnapshots = await snapshotsForCreativeCharacterIds(
      topicId,
      result.draft.units.flatMap((unit) => unit.characterIds ?? []),
    );
    const draft = cached
      ? await replaceCreativeDraft(
          topicId,
          cached,
          { ...result.draft, outputAspectRatio },
          characterSnapshots,
          { inputHash, aiSnapshot: result.draft },
        )
      : await insertCreativeDraft({
          topicId,
          storyId: brief.storyId,
          briefId: brief.id,
          format,
          outputAspectRatio,
          provider: result.provider,
          model: result.model,
          modelVersion: result.modelVersion,
          promptVersion,
          inputHash,
          generated: result.draft,
          usage: result.usage,
          characterSnapshots,
        });
    await completeCreativeAiRun(
      topicId,
      runId,
      result.usage,
      { draftId: draft.id },
      { provider: result.provider, model: result.model },
    );

    return {
      outcome: "generated",
      state: await getCreativeWorkspaceState(topicId, brief.storyId),
    };
  } catch (error) {
    await failRunSafely(topicId, runId, error);
    throw error;
  }
}

export async function createCompanionStory(
  topicId: string,
  parentDraftId: string,
  input: unknown,
): Promise<CreativeGenerationResult> {
  const request = parseCompanionStoryRequest(input);
  const configuration = getCreativeCompanionRuntimeConfig();
  const publicConfiguration = getCreativeContentPublicConfig();
  const parent = await findCreativeDraftById(topicId, parentDraftId);

  if (!parent) {
    throw new CreativeContentNotFoundError("The approved parent draft was not found");
  }
  if (parent.companion) {
    throw new CreativeContentConflictError(
      "A companion Story cannot create another companion Story.",
    );
  }
  if (parent.status !== "approved") {
    throw new CreativeContentConflictError(
      "Approve the parent draft before creating a companion Story.",
    );
  }

  const brief = await findCreativeBriefById(topicId, parent.briefId);
  if (!brief) {
    throw new CreativeContentNotFoundError("The creative brief was not found");
  }

  const verifiedFactIds = new Set(
    parent.units.flatMap((unit) => unit.factIds),
  );
  const verifiedFacts = brief.keyFacts.filter((fact) => verifiedFactIds.has(fact.id));
  if (verifiedFacts.length === 0) {
    throw new CreativeContentConflictError(
      "The approved parent draft does not cite any verified facts for a companion Story.",
    );
  }

  const inheritedSnapshots = await inheritedCharacterSnapshots(parent);
  const characterRoster = [...inheritedSnapshots.values()].map((character) => ({
    id: character.id,
    name: character.name,
    description: character.description,
  }));
  const characterIds = [...inheritedSnapshots.keys()];
  const companion = {
    parentDraftId: parent.id,
    ...request,
  };
  const inputHash = hash({
    parent: { id: parent.id, version: parent.version },
    verifiedFacts,
    companion,
    characterSnapshots: [...inheritedSnapshots.values()],
    profile: brief.profileSnapshot,
    provider: "openai",
    model: configuration.lunaModel,
    promptVersion: configuration.promptVersion,
  });
  const cached = await findCachedCreativeDraft(
    topicId,
    brief.id,
    "meme",
    inputHash,
  );
  if (cached) {
    return {
      outcome: "cached",
      state: await getCreativeWorkspaceState(topicId, parent.storyId),
    };
  }

  const daily = await getCreativeDailyUsage(
    topicId,
    publicConfiguration.maxRunsPerDay,
  );
  assertCreativeDailyBudget(daily.runs, publicConfiguration.maxRunsPerDay);
  const runId = await createCreativeAiRun({
    topicId,
    storyId: parent.storyId,
    briefId: brief.id,
    task: "draft",
    provider: "openai",
    model: configuration.lunaModel,
    promptVersion: configuration.promptVersion,
    inputHash,
  });

  try {
    const result = await generateCompanionStoryScript({
      apiKey: configuration.apiKey,
      lunaModel: configuration.lunaModel,
      terraModel: configuration.terraModel,
      topic: await requireTopic(topicId, { active: true }),
      profile: brief.profileSnapshot,
      verifiedFacts,
      approvedParentDraft: parent,
      companion,
      characterRoster,
      characterIds,
      ...(request.reserveInteractiveSpace
        ? {
            interactiveOverlay: defaultCreativeInteractiveOverlay(
              brief.profileSnapshot.brandOverlay,
            ),
          }
        : {}),
    });
    const draft = await insertCreativeDraft({
      topicId,
      storyId: parent.storyId,
      briefId: brief.id,
      format: "meme",
      outputAspectRatio: "9:16",
      provider: result.provider,
      model: result.model,
      promptVersion: configuration.promptVersion,
      inputHash,
      generated: result.draft,
      usage: result.usage,
      characterSnapshots: inheritedSnapshots,
    });
    await completeCreativeAiRun(
      topicId,
      runId,
      result.usage,
      { draftId: draft.id },
      { provider: result.provider, model: result.model },
    );

    return {
      outcome: "generated",
      state: await getCreativeWorkspaceState(topicId, parent.storyId),
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

  const characterRoster = await listCreativeCharacterRoster(topicId);
  const validated = validateEditableDraft(
    input,
    current.format,
    brief.keyFacts.map((fact) => fact.id),
    outputAspectRatioForDraft(current),
    characterRoster.map((character) => character.id),
  );
  const repaired = {
    ...repairDeterministicCreativeCopy(
      validated,
      current.format,
      brief.keyFacts,
      brief.profileSnapshot.language,
      brief.profileSnapshot.conversionGoal,
    ),
    outputAspectRatio: validated.outputAspectRatio,
  };
  // Saving preserves the user's work as a new draft version even when it
  // still needs editorial correction. Approval and image generation remain
  // strict quality gates below; a draft must never be unsaveable merely
  // because it is unfinished.
  const characterSnapshots = await snapshotsForCreativeCharacterIds(
    topicId,
    repaired.units.flatMap((unit) => unit.characterIds ?? []),
  );
  return replaceCreativeDraft(topicId, current, repaired, characterSnapshots);
}

export async function approveSavedCreativeDraft(
  topicId: string,
  draftId: string,
  humanReviewed = false,
): Promise<CreativeDraft> {
  const current = await findCreativeDraftById(topicId, draftId);

  if (!current) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }

  const brief = await findCreativeBriefById(topicId, current.briefId);
  if (!brief) {
    throw new CreativeContentNotFoundError("The creative brief was not found");
  }

  const characterRoster = await listCreativeCharacterRoster(topicId);
  const validated = validateEditableDraft(
    current,
    current.format,
    brief.keyFacts.map((fact) => fact.id),
    outputAspectRatioForDraft(current),
    characterRoster.map((character) => character.id),
  );
  const repaired = {
    ...repairDeterministicCreativeCopy(
      validated,
      current.format,
      brief.keyFacts,
      brief.profileSnapshot.language,
      brief.profileSnapshot.conversionGoal,
    ),
    outputAspectRatio: validated.outputAspectRatio,
  };
  const qualityIssues = deterministicCreativeQualityIssues(
    repaired,
    current.format,
    brief.keyFacts,
    brief.profileSnapshot.language,
    brief.profileSnapshot.conversionGoal,
  );
  const approvalState = getCreativeDraftApprovalState({
    deterministicIssues: qualityIssues,
    qualityReview: current.qualityReview,
    qualityReviewIsCurrent: current.qualityReviewIsCurrent,
  });
  const { blockers } = approvalState;
  if (blockers.length > 0) {
    throw new CreativeDraftValidationError(
      `Resolve the narrative quality blockers before approval: ${blockers
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }
  if (
    approvalState.requiresHumanReviewAcknowledgement &&
    !humanReviewed
  ) {
    throw new CreativeDraftValidationError(
      "Review the automated quality findings and explicitly confirm human approval before approving this draft.",
    );
  }
  if (JSON.stringify(repaired) !== JSON.stringify(validated)) {
    const characterSnapshots = await snapshotsForCreativeCharacterIds(
      topicId,
      repaired.units.flatMap((unit) => unit.characterIds ?? []),
    );
    // Persist the deterministic repair and approval in the same Neon batch.
    // A transient transport failure must not leave the repaired version in
    // draft state between two otherwise dependent database mutations.
    return replaceCreativeDraft(
      topicId,
      current,
      repaired,
      characterSnapshots,
      { approve: true },
    );
  }
  return approveCreativeDraft(topicId, current.id);
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

/**
 * Replaces immutable draft snapshots with the character profile's current
 * description and references. This deliberately creates a new draft version,
 * so assets generated with the earlier identity can never be regenerated by
 * accident after the user changes a character.
 */
export async function refreshCreativeDraftCharacterReferences(
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

  const configuration = getCreativeContentPublicConfig();
  const [topic, story, profile, characterRoster] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getSelectedStoryContent(topicId, current.storyId),
    getCreativeProfile(topicId),
    listCreativeCharacterRoster(topicId),
  ]);
  const content = requireStoryContent(story, configuration.maxContentCharacters);
  const currentBriefHash = createBriefInputHash(
    story,
    profile,
    topic,
    configuration,
    content,
    brief.editorialDirection,
  );

  if (currentBriefHash !== brief.inputHash) {
    throw new CreativeContentConflictError(
      "The story content or creative profile changed. Refresh the creative brief and create a current draft before refreshing character references.",
    );
  }

  const refreshed = validateEditableDraft(
    current,
    current.format,
    brief.keyFacts.map((fact) => fact.id),
    outputAspectRatioForDraft(current),
    characterRoster.map((character) => character.id),
  );
  const characterIds = refreshed.units.flatMap(
    (unit) => unit.characterIds ?? [],
  );

  if (characterIds.length === 0) {
    throw new CreativeContentConflictError(
      "This draft does not assign a supporting character to any slide.",
    );
  }

  const characterSnapshots = await snapshotsForCreativeCharacterIds(
    topicId,
    characterIds,
  );
  const inputHash = createDraftInputHash(
    brief.id,
    brief.inputHash,
    current.format,
    outputAspectRatioForDraft(current),
    characterRoster,
    {
      provider: configuration.provider,
      model: configuration.model,
      promptVersion: configuration.draftPromptVersions[current.format],
    },
  );
  return replaceCreativeDraft(topicId, current, refreshed, characterSnapshots, {
    inputHash,
  });
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
  editorialDirection?: string,
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
      conversionGoal: profile.conversionGoal,
      callToActionStyle: profile.callToActionStyle,
      visualGuidance: resolveCreativeVisualGuidance(profile),
    },
    topic: {
      name: topic.name,
      description: topic.description ?? null,
    },
    editorialDirection: editorialDirection ?? null,
    provider: configuration.provider,
    model: configuration.model,
    promptVersion: configuration.briefPromptVersion,
  });
}

function normalizeEditorialDirection(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new CreativeDraftValidationError(
      "editorialDirection must be text",
    );
  }
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length > 1_500) {
    throw new CreativeDraftValidationError(
      "Editorial direction must be 1,500 characters or fewer",
    );
  }
  return normalized || undefined;
}

function createDraftInputHash(
  briefId: string,
  briefInputHash: string,
  format: CreativeFormat,
  outputAspectRatio: CreativeAspectRatio,
  characterRoster: CreativeCharacterRosterEntry[],
  configuration: { provider: string; model: string; promptVersion: string },
): string {
  return hash({
    briefId,
    briefInputHash,
    format,
    outputAspectRatio,
    characterRoster: characterRoster.map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      referenceFingerprint: character.referenceFingerprint ?? null,
    })),
    ...configuration,
  });
}

function parseCompanionStoryRequest(input: unknown): {
  angle: string;
  approach: CreativeCompanionApproach;
  reserveInteractiveSpace: boolean;
} {
  const value = recordValue(input, "A companion Story request is required");
  if (!isCreativeCompanionApproach(value.approach)) {
    throw new CreativeDraftValidationError("The companion Story format is invalid");
  }
  if (typeof value.reserveInteractiveSpace !== "boolean") {
    throw new CreativeDraftValidationError(
      "reserveInteractiveSpace must be true or false",
    );
  }
  return {
    angle: requiredText(value.angle, "Companion Story angle", 600),
    approach: value.approach,
    reserveInteractiveSpace: value.reserveInteractiveSpace,
  };
}

async function inheritedCharacterSnapshots(
  parent: CreativeDraft,
): Promise<Map<string, CreativeCharacterSnapshot>> {
  const snapshotsByUnit = await snapshotsForCreativeUnits(
    parent.units.flatMap((unit) => (unit.id ? [unit.id] : [])),
  );
  const snapshots = new Map<string, CreativeCharacterSnapshot>();
  snapshotsByUnit.forEach((unitSnapshots) => {
    unitSnapshots.forEach((snapshot) => {
      if (!snapshots.has(snapshot.id)) snapshots.set(snapshot.id, snapshot);
    });
  });
  return snapshots;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateEditableDraft(
  input: unknown,
  format: CreativeFormat,
  knownFactIds: string[],
  outputAspectRatio: CreativeAspectRatio,
  availableCharacterIds: string[],
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
  const characters = new Set(availableCharacterIds);
  const units: CreativeUnit[] = rawUnits.map((value, index) => {
    const unit = recordValue(value, `Slide ${index + 1} is invalid`);
    const factIds = textArray(unit.factIds, `unit ${index + 1} factIds`, 6, 30);
    const characterIds = optionalCharacterIds(
      unit.characterIds,
      `unit ${index + 1} characterIds`,
    );
    const role = unit.role;
    const editorialGoal = unit.editorialGoal;
    const assetRequest = unit.assetRequest;
    const interactiveOverlay = unit.interactiveOverlay;

    if (
      role !== "cover" &&
      role !== "content" &&
      role !== "conclusion" &&
      role !== "call-to-action"
    ) {
      throw new CreativeDraftValidationError(`Unit ${index + 1} has an invalid role`);
    }

    if (format === "carousel" && !isCarouselEditorialGoal(editorialGoal)) {
      throw new CreativeDraftValidationError(
        `Unit ${index + 1} has an invalid editorial goal`,
      );
    }

    if (assetRequest !== "generated-image" && assetRequest !== "typography-only") {
      throw new CreativeDraftValidationError(
        `Unit ${index + 1} has an invalid asset request`,
      );
    }

    if (
      interactiveOverlay !== undefined &&
      !isCreativeInteractiveOverlay(interactiveOverlay)
    ) {
      throw new CreativeDraftValidationError(
        `Unit ${index + 1} has an invalid interactive overlay`,
      );
    }

    if (factIds.some((id) => !facts.has(id))) {
      throw new CreativeDraftValidationError(
        `Unit ${index + 1} cites an unknown fact`,
      );
    }

    if (characterIds.some((id) => !characters.has(id))) {
      throw new CreativeDraftValidationError(
        `Unit ${index + 1} selects an unavailable supporting character`,
      );
    }

    if (
      format === "carousel" &&
      index === rawUnits.length - 1 &&
      typeof unit.continuationCue === "string" &&
      unit.continuationCue.trim()
    ) {
      throw new CreativeDraftValidationError(
        "The final carousel slide cannot contain a continuation cue",
      );
    }

    return {
      order: index + 1,
      type: format === "meme" ? "meme-frame" : "carousel-slide",
      role,
      ...(format === "carousel" && isCarouselEditorialGoal(editorialGoal)
        ? {
            editorialGoal,
            viewerQuestion: requiredText(
              unit.viewerQuestion,
              `unit ${index + 1} viewerQuestion`,
              500,
            ),
            ...optionalText(
              unit.ctaQuestion,
              `unit ${index + 1} ctaQuestion`,
              500,
            ),
          }
        : {}),
      headline: requiredText(unit.headline, `unit ${index + 1} headline`, 240),
      ...optionalText(
        unit.subheadline,
        `unit ${index + 1} subheadline`,
        240,
      ),
      ...optionalText(unit.body, "body", 600),
      ...(format === "carousel"
        ? optionalText(
            unit.continuationCue,
            `unit ${index + 1} continuationCue`,
            240,
          )
        : {}),
      visualDirection: requiredText(
        unit.visualDirection,
        `unit ${index + 1} visualDirection`,
        1_000,
      ),
      factIds,
      assetRequest,
      aspectRatio: selectedOutputAspectRatio,
      characterIds,
      ...(interactiveOverlay ? { interactiveOverlay } : {}),
    };
  });

  return {
    concept: requiredText(record.concept, "concept", 1_000),
    ...(format === "carousel"
      ? optionalText(
          record.narrativeRationale,
          "narrativeRationale",
          1_000,
        )
      : {}),
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
      "outputAspectRatio must be 4:5",
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

function optionalText<Field extends string>(
  value: unknown,
  field: Field,
  max: number,
): Partial<Record<Field, string>> {
  if (value === undefined || value === null || value === "") {
    return {};
  }
  if (typeof value !== "string") {
    throw new CreativeDraftValidationError(`${field} must be text`);
  }
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, max);
  return normalized
    ? ({ [field]: normalized } as Partial<Record<Field, string>>)
    : {};
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

function optionalCharacterIds(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  return textArray(value, field, 2, 100);
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
