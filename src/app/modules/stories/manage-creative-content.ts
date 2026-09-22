import { resolveNarrativeBrief } from "./creative-narrative-plan";
import { claimRecovery, getRecovery, latestRecovery, checkpointRecovery, finishRecovery } from "./creative-recovery.repository";
import { withCreativeTextBudget } from "./creative-text-meter";
import { getCreativeTextSpend, recordTextOutcome } from "./creative-text-accounting.repository";
import { getDailyDraftStory } from "./daily-draft-access";
import { CreativeContentConflictError, CreativeContentDailyLimitError } from "./creative-run-errors";
export { CreativeContentConflictError, CreativeContentDailyLimitError } from "./creative-run-errors";
import { getEditorialProfile } from "./editorial-profile.repository";
import { plannerDay } from "./daily-editorial-planner.types";
import { EDITORIAL_FOCUS_PROMPT_VERSION } from "./editorial-focus";
import { parseStoryReferences } from "./story-materials.types";
import { resolveStoryReferences } from "./manage-story-photos";
import { enforceCoverTitle } from "./creative-cover-title";
import { preserveEditorCtas } from "./preserve-editor-cta";
import { storyCollectionContexts, selectedStoryContext } from "../editorial-lines/editorial-lines.repository";
import { editorialContextInstruction, collectionContextForHash } from "../editorial-lines/editorial-lines";
import { build511Brief } from "./road-notice-evidence";
import { locationOnlyRoadFacts, onlyTruncatedCreativeFacts } from "./creative-evidence-guardrails";
import { imageTextNeedsUpdate } from "./creative-image-text-sync";
import { findLatestCreativeAssetBatch } from "./creative-assets.repository";
import "server-only";

import { createHash } from "node:crypto";

import { requireTopic } from "@/app/modules/topics/topic-context";

import {
  creativeSingleShotConfig,
  getCreativeContentPublicConfig,
  getCreativeCompanionRuntimeConfig,
  getCreativeContentRuntimeConfig,
} from "./creative-content.config";
import { runSingleShotCreativePipeline } from "./creative-single-shot-editorial";
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
  setCreativeDraftVisualFidelityOverride,
  unapproveCreativeDraft,
} from "./creative-content.repository";
import {
  listCreativeCharacterRoster,
  snapshotsForCreativeCharacterIds,
  snapshotsForCreativeUnits,
} from "./creative-characters.repository";
import type {
  CreativeAspectRatio,
  CreativeBrief,
  GeneratedCreativeDraft,
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
  assertExplicitFidelityChange,
  resolveEffectiveVisualFidelity,
  VisualFidelityError,
} from "./creative-visual-fidelity";
import {
  defaultCreativeOutputAspectRatio,
  isCreativeOutputAspectRatio,
  resolveCreativeOutputAspectRatio,
} from "./creative-aspect-ratio";
import {
  recoverCreativeDraft,
  generateCreativeBrief,
  generateEditorialFocus,
  generateCreativeDraft,
  CREATIVE_DRAFT_TIME_BUDGET_MS,
  type CreativeTopicContext,
} from "./gemini-creative-content-generator";
import { isCarouselEditorialGoal } from "./carousel-narrative";
import {
  deterministicCreativeQualityIssues,
  getCreativeDraftApprovalState,
  repairDeterministicCreativeCopy,
} from "./creative-quality";
import { CreativeVisualPolicyConflictError } from "./creative-draft-visual-policy.repository";
import {
  getCreativeProfile,
  getTopicVisualFidelityMode,
} from "./creative-profile.repository";
import { resolveCreativeVisualGuidance } from "./creative-visual-guidance";
import { generateCompanionStoryScript } from "./companion-story-generator";
import { fallbackEditorialAngle } from "./acquisition-lenses";
import { getCurrentTopicAcquisitionTaxonomy } from "./topic-acquisition-lenses.repository";
import { defaultCreativeInteractiveOverlay } from "./creative-interactive-overlay";
import { isCreativeInteractiveOverlay } from "./creative-interactive-overlay";
import {
  type SelectedStoryContentRecord,
} from "./story-content.repository";

export async function getCreativeWorkspaceState(
  topicId: string,
  storyId: string,
  preparationRunId?: string,
): Promise<CreativeWorkspaceState> {
  const configuration = getCreativeContentPublicConfig();
  const [topic, story, profile, characterRoster, latestBrief, daily, acquisitionTaxonomy] =
    await Promise.all([
      requireTopic(topicId, { active: true }),
      getDailyDraftStory(topicId, storyId, preparationRunId, true),
      getCreativeProfile(topicId),
      listCreativeCharacterRoster(topicId),
      findLatestCreativeBrief(topicId, storyId),
      getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
      // Read-only here: the workspace renders stored angle keys as labels and
      // flags retired lenses. A topic without a taxonomy simply shows the key.
      getCurrentTopicAcquisitionTaxonomy(topicId).catch(() => undefined),
    ]);
  const inputHash = story.text?.trim()
    ? createBriefInputHash(
        story,
        profile,
        topic,
        configuration,
        shortenContent(story.text.trim(), configuration.maxContentCharacters),
        latestBrief?.editorialDirection,
        latestBrief?.collectionContext,
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
  const isCurrentPrimaryDraft = (draft: CreativeDraft) => {
    if (!briefIsCurrent || brief?.id !== draft.briefId) return false;
    const generation = {
      provider: configuration.provider,
      model: configuration.model,
      promptVersion: configuration.draftPromptVersions[draft.format],
    };
    return (
      draft.inputHash === createDraftInputHash(brief.id, brief.inputHash, draft.format, draft.outputAspectRatio, generation) ||
      draft.inputHash === createLegacyDraftInputHash(brief.id, brief.inputHash, draft.format, draft.outputAspectRatio, characterRoster, generation)
    );
  };
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
    ...(acquisitionTaxonomy ? { acquisitionTaxonomy } : {}),
    ...(brief ? { brief } : {}),
    briefIsCurrent,
    collectionContexts: await storyCollectionContexts(topicId,storyId),
    drafts,
    daily,
    textSpend: await getCreativeTextSpend(topicId, storyId),
    recovery: await latestRecovery(topicId, storyId),
    configuration: {
      provider: configuration.provider,
      model: configuration.model,
      briefPromptVersion: configuration.briefPromptVersion,
      draftPromptVersions: configuration.draftPromptVersions,
    },
  };
}

export async function suggestEditorialFocus(
  topicId: string,
  storyId: string,
  editorialDirection?: string,
  editorialRunId?: string,
  preparationRunId?: string,
  timezone = "UTC",
) {
  const configuration = getCreativeContentRuntimeConfig();
  const [topic, story, profile, editorialProfile, daily, acquisitionTaxonomy, collectionContext] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getDailyDraftStory(topicId, storyId, preparationRunId, Boolean(preparationRunId)),
    getCreativeProfile(topicId),
    getEditorialProfile(topicId),
    getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
    getCurrentTopicAcquisitionTaxonomy(topicId),
    selectedStoryContext(topicId, storyId, editorialRunId),
  ]);
  let temporalContext: ReturnType<typeof plannerDay>;
  try {
    temporalContext = plannerDay(collectionContext?.timezone || timezone);
  } catch {
    throw new CreativeDraftValidationError("Choose a valid IANA timezone");
  }
  const content = requireStoryContent(story, configuration.maxContentCharacters);
  const normalizedDirection = normalizeEditorialDirection(editorialDirection);
  const focusContext = { temporalContext, editorialProfile, acquisitionTaxonomy, collectionContext };
  assertCreativeDailyBudget(daily.runs, configuration.maxRunsPerDay);
  // Compatibility: focus suggestions are brief-planning runs, distinguished by
  // prompt version. They do not create or replace a persisted creative brief.
  const runId = await createCreativeAiRun({
    topicId, storyId, task: "brief", provider: configuration.provider,
    model: configuration.model, promptVersion: EDITORIAL_FOCUS_PROMPT_VERSION,
    inputHash: createHash("sha256").update(JSON.stringify({ story: storyForGenerator(story, content), topic, profile, focusContext, normalizedDirection })).digest("hex"),
  });
  try {
    const result = await withCreativeTextBudget({topicId, storyId: storyId, runId}, () => generateEditorialFocus({
      ...configuration, topic, profile, story: storyForGenerator(story, content),
      editorialDirection: normalizedDirection, focusContext,
    }));
    await completeCreativeAiRun(topicId, runId, result.usage, {}, {
      provider: result.provider,
      model: result.model,
      fallbackReason: result.fallbackReason,
    });
    return {
      editorialDirection: result.editorialDirection,
      daily: await getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
    };
  } catch (error) {
    await failRunSafely(topicId, runId, error);
    throw error;
  }
}

export async function createCreativeBrief(
  topicId: string,
  storyId: string,
  editorialDirection?: string,
  editorialRunId?: string,
  preparationRunId?: string,
  workspace = false,
): Promise<CreativeGenerationResult> {
  const configuration = getCreativeContentRuntimeConfig();
  const [topic, story, profile, daily, acquisitionTaxonomy] = await Promise.all([
    requireTopic(topicId, { active: true }),
    getDailyDraftStory(topicId, storyId, preparationRunId, workspace && Boolean(preparationRunId)),
    getCreativeProfile(topicId),
    getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
    getCurrentTopicAcquisitionTaxonomy(topicId),
  ]);
  const content = requireStoryContent(story, configuration.maxContentCharacters);
  const collectionContext=await selectedStoryContext(topicId,storyId,editorialRunId);
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
    collectionContext,
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
      state: { ...(await getCreativeWorkspaceState(topicId, storyId, preparationRunId)), brief: cached, briefIsCurrent: true },
    };
  }

  // Official tabular notices have extractable evidence already. Do not consume
  // a provider attempt to paraphrase a route number, direction or date.
  const structuredBrief = build511Brief(story.url, story.title, content, profile.audience);
  if (structuredBrief) {
    structuredBrief.editorialAngle = fallbackEditorialAngle(
      acquisitionTaxonomy,
      "The official structured notice is best presented as a careful explainer.",
      "Readers can use the verified notice details to understand the current situation.",
      "The draft explains the supported notice details and their stated scope.",
    );
    await insertCreativeBrief({ topicId, storyId, profile, provider: "quebec511", model: "structured-notice-v1",
      promptVersion: configuration.briefPromptVersion, inputHash, editorialDirection: normalizedEditorialDirection, collectionContext,
      generated: structuredBrief, usage: { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 } });
    return { outcome: "generated", state: await getCreativeWorkspaceState(topicId, storyId, preparationRunId) };
  }

  if (creativeSingleShotConfig().enabled) {
    return createCreativeBriefAndDraftSingleShot({
      topicId, storyId, story, content, topic, profile, daily, acquisitionTaxonomy,
      configuration, inputHash, normalizedEditorialDirection, collectionContext, preparationRunId,
    });
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
    const result = await withCreativeTextBudget({topicId, storyId: storyId, runId}, () => generateCreativeBrief({
      apiKey: configuration.apiKey,
      paidGeminiApiKey: configuration.paidGeminiApiKey,
      openAiApiKey: configuration.openAiApiKey,
      openAiEditorialModels: configuration.openAiEditorialModels,
      openAiAuditContext: { runId, topicId, storyId },
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
      acquisitionTaxonomy,
      editorialDirection: collectionContext ? [normalizedEditorialDirection,editorialContextInstruction(collectionContext)].filter(Boolean).join("\n") : normalizedEditorialDirection,
    }));
    const brief = await insertCreativeBrief({
      topicId,
      storyId,
      profile,
      provider: result.provider,
      model: result.model,
      modelVersion: result.modelVersion,
      promptVersion: configuration.briefPromptVersion,
      inputHash,
      editorialDirection: normalizedEditorialDirection, collectionContext,
      generated: result.brief,
      usage: result.usage,
    });
    await completeCreativeAiRun(
      topicId,
      runId,
      result.usage,
      { briefId: brief.id },
      { provider: result.provider, model: result.model, fallbackReason: result.fallbackReason },
    );

    return {
      outcome: "generated",
      state: await getCreativeWorkspaceState(topicId, storyId, preparationRunId),
    };
  } catch (error) {
    await failRunSafely(topicId, runId, error);
    throw error;
  }
}

/**
 * The single-shot pipeline (generate -> audit -> optional repair -> verify)
 * produces one response covering both the brief and the draft; it is split
 * here into the same two persisted rows createCreativeBrief/createCreativeDraft
 * already use, via the same insertCreativeBrief/insertCreativeDraft/
 * replaceCreativeDraft repository functions, so every downstream reader keeps
 * working unchanged. Always targets carousel: the format the rest of this
 * system defaults to. A user who then asks for a different format from the
 * UI falls through to createCreativeDraft's existing (legacy) path for that
 * format, since a single-shot response for it does not exist yet.
 */
async function createCreativeBriefAndDraftSingleShot({
  topicId,
  storyId,
  story,
  content,
  topic,
  profile,
  daily,
  acquisitionTaxonomy,
  configuration,
  inputHash,
  normalizedEditorialDirection,
  collectionContext,
  preparationRunId,
}: {
  topicId: string;
  storyId: string;
  story: Awaited<ReturnType<typeof getDailyDraftStory>>;
  content: string;
  topic: Awaited<ReturnType<typeof requireTopic>>;
  profile: CreativeProfile;
  daily: Awaited<ReturnType<typeof getCreativeDailyUsage>>;
  acquisitionTaxonomy: Awaited<ReturnType<typeof getCurrentTopicAcquisitionTaxonomy>>;
  configuration: ReturnType<typeof getCreativeContentRuntimeConfig>;
  inputHash: string;
  normalizedEditorialDirection: string | undefined;
  collectionContext: Awaited<ReturnType<typeof selectedStoryContext>>;
  preparationRunId?: string;
}): Promise<CreativeGenerationResult> {
  const format: CreativeFormat = "carousel";
  const outputAspectRatio = resolveCreativeOutputAspectRatio(format, undefined);
  const draftPromptVersion = configuration.draftPromptVersions[format];

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

  let briefRow: CreativeBrief | undefined;
  let draftRow: CreativeDraft | undefined;
  try {
    const characterRoster = await listCreativeCharacterRoster(topicId);
    const result = await withCreativeTextBudget({ topicId, storyId, runId }, () =>
      runSingleShotCreativePipeline({
        apiKey: configuration.apiKey,
        paidGeminiApiKey: configuration.paidGeminiApiKey,
        model: configuration.model,
        primaryProvider: configuration.primaryProvider,
        story: storyForGenerator(story, content),
        topic,
        profile,
        editorialDirection: collectionContext
          ? [normalizedEditorialDirection, editorialContextInstruction(collectionContext)].filter(Boolean).join("\n")
          : normalizedEditorialDirection,
        format,
        outputAspectRatio,
        characterRoster,
        acquisitionTaxonomy,
        openAiApiKey: configuration.openAiApiKey,
        openAiEditorialModels: configuration.openAiEditorialModels,
        openAiAuditContext: { runId, topicId, storyId },
        deadline: Date.now() + CREATIVE_DRAFT_TIME_BUDGET_MS,
        checkpoint: async ({ brief, draft, usage }) => {
          if (!briefRow) {
            briefRow = await insertCreativeBrief({
              topicId,
              storyId,
              profile,
              provider: "google",
              model: configuration.model,
              promptVersion: configuration.briefPromptVersion,
              inputHash,
              editorialDirection: normalizedEditorialDirection,
              collectionContext,
              generated: brief,
              usage,
            });
          }
          const draftInputHash = createDraftInputHash(briefRow.id, briefRow.inputHash, format, outputAspectRatio, {
            provider: configuration.provider,
            model: configuration.model,
            promptVersion: draftPromptVersion,
          });
          const characterSnapshots = await snapshotsForCreativeCharacterIds(
            topicId,
            draft.units.flatMap((unit) => unit.characterIds ?? []),
          );
          draftRow = draftRow
            ? await replaceCreativeDraft(
                topicId,
                draftRow,
                { ...draft, outputAspectRatio },
                characterSnapshots,
                { inputHash: draftInputHash, aiSnapshot: draft },
              )
            : await insertCreativeDraft({
                topicId,
                storyId,
                briefId: briefRow.id,
                format,
                outputAspectRatio,
                provider: "google",
                model: configuration.model,
                promptVersion: draftPromptVersion,
                inputHash: draftInputHash,
                generated: draft,
                usage,
                characterSnapshots,
              });
        },
      }),
    );
    if (draftRow) await recordTextOutcome(topicId, draftRow);
    await completeCreativeAiRun(
      topicId,
      runId,
      result.usage,
      { briefId: briefRow?.id, draftId: draftRow?.id },
      { provider: "google", model: configuration.model },
    );
    return {
      outcome: "generated",
      state: await getCreativeWorkspaceState(topicId, storyId, preparationRunId),
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
  preparationRunId?: string,
  workspace = false,
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

  if (onlyTruncatedCreativeFacts(brief.keyFacts)) {
    throw new CreativeContentInsufficientError("The brief contains only unfinished source excerpts. Retrieve complete evidence and refresh the brief before spending credits on draft generation.");
  }

  if (brief.contentSufficiency === "insufficient" || locationOnlyRoadFacts(brief.keyFacts)) {
    throw new CreativeContentConflictError("The brief does not establish an event beyond geographic markers. Retrieve the complete source and refresh the brief before generating a publication.");
  }

  const [topic, story, currentProfile, characterRoster, daily, acquisitionTaxonomy] =
    await Promise.all([
      requireTopic(topicId, { active: true }),
      getDailyDraftStory(topicId, brief.storyId, preparationRunId, workspace && Boolean(preparationRunId)),
      getCreativeProfile(topicId),
      listCreativeCharacterRoster(topicId),
      getCreativeDailyUsage(topicId, configuration.maxRunsPerDay),
      // Steers hook exploration toward the lens the brief already chose. A
      // topic without a taxonomy just generates without that steering.
      getCurrentTopicAcquisitionTaxonomy(topicId).catch(() => undefined),
    ]);
  const content = requireStoryContent(story, configuration.maxContentCharacters);
  const currentBriefHash = createBriefInputHash(
    story,
    currentProfile,
    topic,
    configuration,
    content,
    brief.editorialDirection,
    brief.collectionContext,
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

  if (cached && !createNewVersion) {
    return {
      outcome: "cached",
      state: await getCreativeWorkspaceState(topicId, brief.storyId, preparationRunId),
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

  let checkpointDraft: CreativeDraft | undefined;

  // Regenerating a draft must not silently drop back onto the legacy
  // multi-tier pipeline while the flag is on: the editor clicks the same
  // button either way and would get a different engine, different cost and a
  // different verdict shape with no indication why. The brief the editor
  // already reviewed is kept — only the script is written again.
  if (creativeSingleShotConfig().enabled) {
    try {
      const characterSnapshotsFor = (draft: GeneratedCreativeDraft) =>
        snapshotsForCreativeCharacterIds(topicId, draft.units.flatMap((unit) => unit.characterIds ?? []));
      const result = await withCreativeTextBudget({ topicId, storyId: brief.storyId, runId }, () =>
        runSingleShotCreativePipeline({
          apiKey: configuration.apiKey,
          paidGeminiApiKey: configuration.paidGeminiApiKey,
          model: configuration.model,
          primaryProvider: configuration.primaryProvider,
          story: storyForGenerator(story, content),
          topic,
          profile: brief.profileSnapshot,
          existingBrief: brief,
          format,
          outputAspectRatio,
          characterRoster,
          ...(acquisitionTaxonomy ? { acquisitionTaxonomy } : {}),
          openAiApiKey: configuration.openAiApiKey,
          openAiEditorialModels: configuration.openAiEditorialModels,
          openAiAuditContext: { runId, topicId, storyId: brief.storyId },
          deadline: Date.now() + CREATIVE_DRAFT_TIME_BUDGET_MS,
          checkpoint: async ({ draft: partial, usage }) => {
            const characterSnapshots = await characterSnapshotsFor(partial);
            checkpointDraft = checkpointDraft
              ? await replaceCreativeDraft(topicId, checkpointDraft, { ...partial, outputAspectRatio }, characterSnapshots, {
                  inputHash,
                  aiSnapshot: partial,
                })
              : await insertCreativeDraft({
                  topicId, storyId: brief.storyId, briefId: brief.id, format, outputAspectRatio,
                  provider: "google", model: configuration.model, promptVersion, inputHash,
                  generated: partial, usage, characterSnapshots,
                });
          },
        }),
      );
      const draft = checkpointDraft
        ? await replaceCreativeDraft(
            topicId, checkpointDraft, { ...result.draft, outputAspectRatio },
            await characterSnapshotsFor(result.draft), { inputHash, aiSnapshot: result.draft },
          )
        : await insertCreativeDraft({
            topicId, storyId: brief.storyId, briefId: brief.id, format, outputAspectRatio,
            provider: "google", model: configuration.model, promptVersion, inputHash,
            generated: result.draft, usage: result.usage,
            characterSnapshots: await characterSnapshotsFor(result.draft),
          });
      await recordTextOutcome(topicId, draft);
      await completeCreativeAiRun(topicId, runId, result.usage, { draftId: draft.id }, {
        provider: "google", model: configuration.model,
      });
      return {
        outcome: "generated",
        state: await getCreativeWorkspaceState(topicId, brief.storyId, preparationRunId),
      };
    } catch (error) {
      await failRunSafely(topicId, runId, error);
      throw error;
    }
  }

  try {
    const result = await withCreativeTextBudget({topicId, storyId: brief.storyId, runId}, () => generateCreativeDraft({
      carouselWriterModel: configuration.carouselWriterModel,
      onDraftCheckpoint: !cached ? async partial => {
        const characterSnapshots=await snapshotsForCreativeCharacterIds(topicId,partial.draft.units.flatMap(unit=>unit.characterIds??[]));
        checkpointDraft=checkpointDraft
          ? await replaceCreativeDraft(topicId,checkpointDraft,{...partial.draft,outputAspectRatio},characterSnapshots,{inputHash,aiSnapshot:partial.draft})
          : await insertCreativeDraft({topicId,storyId:brief.storyId,briefId:brief.id,format,outputAspectRatio,
            provider:partial.provider,model:partial.model,promptVersion,inputHash,generated:partial.draft,usage:partial.usage,characterSnapshots});
      } : undefined,
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
      openAiAuditContext: { runId, topicId, storyId: brief.storyId },
      story: storyForGenerator(story, content),
      topic,
      profile: brief.profileSnapshot,
      brief,
      format,
      outputAspectRatio,
      characterRoster,
      ...(acquisitionTaxonomy ? { acquisitionTaxonomy } : {}),
    }));
    const characterSnapshots = await snapshotsForCreativeCharacterIds(
      topicId,
      result.draft.units.flatMap((unit) => unit.characterIds ?? []),
    );
    const draftToReplace = checkpointDraft ?? cached;
    const draft = draftToReplace
      ? await replaceCreativeDraft(
          topicId,
          draftToReplace,
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
    await recordTextOutcome(topicId, draft);
    await completeCreativeAiRun(
      topicId,
      runId,
      result.usage,
      { draftId: draft.id },
      { provider: result.provider, model: result.model, fallbackReason: result.fallbackReason },
    );

    return {
      outcome: "generated",
      state: await getCreativeWorkspaceState(topicId, brief.storyId, preparationRunId),
    };
  } catch (error) {
    await failRunSafely(topicId, runId, error);
    throw error;
  }
}

export async function recoverSavedCreativeDraft(topicId:string,draftId:string,expectedVersion:number,requestId:string):Promise<CreativeDraft> {
  await requireTopic(topicId,{active:true});
  const current=await findCreativeDraftById(topicId,draftId);
  if(!current)throw new CreativeContentNotFoundError("Draft not found");
  const existing=await getRecovery(topicId,requestId);
  if(existing?.draft_id===draftId && (existing.status==='completed' || current.recoveryId===requestId)) {
    await recordTextOutcome(topicId,current);
    await finishRecovery(topicId,requestId,existing.lease_token); return current;
  }
  if(current.version!==expectedVersion)throw new CreativeContentConflictError("The draft changed. Reload before recovering it.");
  if(current.status==='approved'||current.companion)throw new CreativeContentConflictError("Recovery is available for unapproved primary drafts only.");
  const brief=await findCreativeBriefById(topicId,current.briefId);
  if(!brief)throw new CreativeContentNotFoundError("Brief not found");
  const configuration=getCreativeContentRuntimeConfig();
  const topic=await requireTopic(topicId,{active:true});
  const characterRoster=await listCreativeCharacterRoster(topicId);
  const job=await claimRecovery(topicId,requestId,current,brief);
  try {
    const result=job.result?.stage==='reviewed' ? job.result : await withCreativeTextBudget({topicId,storyId:current.storyId,runId:requestId},()=>recoverCreativeDraft({
      ...configuration,currentReviewIsCurrent:job.input.draft.qualityReviewIsCurrent===true,currentDraft:{...job.input.draft,
        ...(job.input.draft.qualityReviewIsCurrent===false && job.input.draft.editorialRepair ? {editorialRepair:{...job.input.draft.editorialRepair,pendingVerification:false,verifiedFallback:undefined}} : {})},brief:job.input.brief,profile:job.input.brief.profileSnapshot,topic,
      story:{title:job.input.draft.concept,url:"",text:"",contentStatus:"full",contentSource:"article"},
      format:current.format,outputAspectRatio:current.outputAspectRatio,characterRoster,
      openAiAuditContext:{topicId,storyId:current.storyId,runId:requestId},checkpoint:job.result??undefined,
      onCheckpoint:value=>checkpointRecovery(topicId,requestId,value,job.lease_token),
    }));
    const generated={...result.draft,recoveryId:requestId,units:result.draft.units.map((unit,index)=>({...unit,
      id:current.units[index]?.id,storyReferences:result.draft.narrativeRevision && JSON.stringify(unit.factIds)!==JSON.stringify(current.units[index]?.factIds) ? undefined : current.units[index]?.storyReferences,
      brandReferenceSelection:current.units[index]?.brandReferenceSelection}))};
    const snapshots=await snapshotsForCreativeCharacterIds(topicId,generated.units.flatMap(unit=>unit.characterIds??[]));
    const saved=await replaceCreativeDraft(topicId,current,{...generated,outputAspectRatio:current.outputAspectRatio},snapshots,{aiSnapshot:generated});
    await recordTextOutcome(topicId,saved);
    await finishRecovery(topicId,requestId,job.lease_token);
    return saved;
  }catch(error){
    // A ready result remains resumable without another provider call.
    const checkpoint=await getRecovery(topicId,requestId).catch(()=>undefined);
    if(checkpoint?.result?.stage!=='reviewed')await finishRecovery(topicId,requestId,job.lease_token,error instanceof Error?error.message.slice(0,500):"Recovery failed").catch(()=>{});
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
    const result = await withCreativeTextBudget({topicId,storyId:parent.storyId,runId},async()=>generateCompanionStoryScript({
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
    }));
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

  const expectedVersion = (input as { expectedVersion?: unknown })?.expectedVersion;
  if (expectedVersion !== undefined && expectedVersion !== current.version) throw new CreativeContentConflictError("The draft changed. Reload before saving.");

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
  const knownUnitIds = new Set(current.units.map(unit => unit.id));
  const submittedIds = validated.units.flatMap(unit => unit.id ? [unit.id] : []);
  if (submittedIds.some(id => !knownUnitIds.has(id)) || new Set(submittedIds).size !== submittedIds.length) {
    throw new CreativeContentConflictError("The slide identities changed. Reload the draft before saving.");
  }
  await Promise.all(validated.units.map(unit => resolveStoryReferences(topicId, current.storyId, unit.storyReferences)));
  const repaired = {
    ...repairDeterministicCreativeCopy(
      validated,
      current.format,
      brief.keyFacts,
      brief.profileSnapshot.language,
      brief.profileSnapshot.conversionGoal,
      resolveNarrativeBrief(brief,current).carouselPlan,
    ),
    outputAspectRatio: validated.outputAspectRatio,
  };
  // Manual CTA copy belongs to the editor. Report quality issues at review/
  // approval instead of silently deleting it during an otherwise valid save.
  repaired.units = preserveEditorCtas(repaired.units, validated.units).map((unit, index) => ({ ...unit, storyReferences: validated.units[index].storyReferences }));
  repaired.units = enforceCoverTitle(repaired, brief.profileSnapshot.requireCoverTitle, validated.units[0]?.subheadline || brief.contentTitle || current.units[0]?.subheadline).units;
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
  expectedVersion?: number,
): Promise<CreativeDraft> {
  const current = await findCreativeDraftById(topicId, draftId);

  if (!current) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }

  if (expectedVersion !== undefined && expectedVersion !== current.version) throw new CreativeContentConflictError("The reviewed draft changed. Reload before approving.");

  await assertStoryEditionCurrent(topicId, current);
  if (current.provider === "documentary") {
    throw new CreativeContentConflictError("Review the complete documentary publication in its final review panel.");
  }

  const brief = await findCreativeBriefById(topicId, current.briefId);
  if (!brief) {
    throw new CreativeContentNotFoundError("The creative brief was not found");
  }

  const imageBatch = await findLatestCreativeAssetBatch(current.id, current.version);
  if (imageBatch && imageBatch.status !== "stale" && imageBatch.assets.some(asset => {
    const unit = current.units.find(candidate => candidate.order === asset.unitOrder);
    return !unit || imageTextNeedsUpdate(asset.unitSnapshot, unit) || !["generated", "approved"].includes(asset.status);
  })) throw new CreativeContentConflictError("Update the pending images to match the saved text before approving this draft.");

  const characterRoster = await listCreativeCharacterRoster(topicId);
  const validated = validateEditableDraft(
    current,
    current.format,
    brief.keyFacts.map((fact) => fact.id),
    outputAspectRatioForDraft(current),
    characterRoster.map((character) => character.id),
  );
  await Promise.all(validated.units.map(unit => resolveStoryReferences(topicId, current.storyId, unit.storyReferences)));
  const repaired = {
    ...repairDeterministicCreativeCopy(
      validated,
      current.format,
      brief.keyFacts,
      brief.profileSnapshot.language,
      brief.profileSnapshot.conversionGoal,
      resolveNarrativeBrief(brief,current).carouselPlan,
    ),
    outputAspectRatio: validated.outputAspectRatio,
  };
  // Approval must validate the same editor-authored CTA that saving retained.
  repaired.units = preserveEditorCtas(repaired.units, validated.units).map((unit, index) => ({ ...unit, storyReferences: validated.units[index].storyReferences }));
  repaired.units = enforceCoverTitle(repaired, brief.profileSnapshot.requireCoverTitle, validated.units[0]?.subheadline || brief.contentTitle || current.units[0]?.subheadline).units;
  if (imageBatch && imageBatch.status !== "stale" && imageBatch.assets.some(asset => {
    const unit = repaired.units.find(candidate => candidate.order === asset.unitOrder);
    return !unit || imageTextNeedsUpdate(asset.unitSnapshot, unit);
  })) throw new CreativeContentConflictError("Save the corrected text and update its images before approval.");
  const qualityIssues = deterministicCreativeQualityIssues(
    repaired,
    current.format,
    brief.keyFacts,
    brief.profileSnapshot.language,
    brief.profileSnapshot.conversionGoal,
    brief.profileSnapshot.framingStrategy,
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
    const approved = await replaceCreativeDraft(
      topicId,
      current,
      repaired,
      characterSnapshots,
      { approve: true },
    );
    await recordTextOutcome(topicId,approved);
    return approved;
  }
  const approved = await approveCreativeDraft(topicId, current.id, current.version);
  await recordTextOutcome(topicId,approved);
  return approved;
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
 * Sets or clears the per-publication visual fidelity override for one draft
 * (FEAT-GEO-001 / GEO-01, criterion 3). `mode: null` reverts to the topic
 * policy currently configured on the topic. Changing the mode needs an explicit
 * editor reason — leaving "photo-required" is never a silent fallback. An
 * approved draft must be unapproved first so the change is a conscious act.
 */
export async function setSavedCreativeDraftVisualFidelity(
  topicId: string,
  draftId: string,
  input: { mode: null } | { mode: string; reason: string },
  actor?: string | null,
): Promise<CreativeDraft> {
  const current = await findCreativeDraftById(topicId, draftId);
  if (!current) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }
  if (current.status === "approved") {
    throw new CreativeContentConflictError(
      "Unapprove this draft before changing its visual fidelity mode.",
    );
  }

  const inherited = await getTopicVisualFidelityMode(topicId);
  const currentEffective = resolveEffectiveVisualFidelity({
    inheritedMode: inherited,
    override: current.visualFidelityOverride?.mode ?? null,
    overrideReason: current.visualFidelityOverride?.reason,
  }).mode;

  try {
    if (input.mode === null) {
      // A plain clear is only allowed when it does not loosen the effective
      // mode off "photo-required". Loosening must be an explicit, recorded
      // override (below), so the reason and actor are persisted rather than
      // discarded — GEO-01 criterion 3, anti-silent-fallback.
      if (currentEffective === "photo-required" && inherited !== "photo-required") {
        throw new CreativeDraftValidationError(
          "To move this draft off required-photo, set an explicit mode with a reason instead of clearing the override.",
        );
      }
      return await setCreativeDraftVisualFidelityOverride(
        topicId,
        draftId,
        { mode: null },
        { expectedVersion: current.version },
      );
    }

    const resolved = resolveEffectiveVisualFidelity({
      inheritedMode: inherited,
      override: input.mode,
      overrideReason: input.reason,
    });
    assertExplicitFidelityChange({
      inheritedMode: currentEffective,
      nextMode: resolved.mode,
      reason: resolved.reason,
    });
    return await setCreativeDraftVisualFidelityOverride(
      topicId,
      draftId,
      {
        mode: resolved.mode,
        reason: resolved.reason ?? input.reason,
        by: actor ?? null,
      },
      { expectedVersion: current.version },
    );
  } catch (error) {
    if (error instanceof CreativeVisualPolicyConflictError) {
      throw new CreativeContentConflictError(error.message);
    }
    if (error instanceof VisualFidelityError) {
      throw new CreativeDraftValidationError(error.message);
    }
    throw error;
  }
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
    getDailyDraftStory(topicId, current.storyId, undefined, true),
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
    brief.collectionContext,
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
    ...(story.editorial ? { editorialContext: "Editor-authored working copy; changes are not statements attributed to the original publisher.", editorialRevision: story.editorial.revision } : {}),
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
  collectionContext?: import("./creative-content.types").CreativeBrief["collectionContext"],
): string {
  return hash({
    ...(collectionContext ? {collectionContext:collectionContextForHash(collectionContext)}:{}),
    story: {
      storyId: story.storyId,
      title: story.title,
      url: story.url,
      text: normalizedContent,
      contentStatus: story.contentStatus,
      source: story.source,
      ...(story.editorial ? { editorialRevision: story.editorial.revision } : {}),
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
      framingStrategy: profile.framingStrategy ?? "auto",
      // GEO-01: a place-fidelity policy change must bust the brief cache so a
      // refresh cannot resurrect a snapshot from the previous policy. Added
      // only once the policy has actually moved (version > 1) so pre-GEO
      // briefs on the default policy keep their existing hash on deploy.
      ...((profile.visualPolicyVersion ?? 1) > 1
        ? {
            visualFidelityMode: profile.visualFidelityMode,
            geoScope: profile.geoScope,
            visualPolicyVersion: profile.visualPolicyVersion,
          }
        : {}),
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

/**
 * The supporting-character roster is deliberately not part of this hash:
 * a character is a per-slide production option (which reference images feed
 * the image model), not a generation input. Adding a character or one of its
 * photos must not turn every saved draft into a stale one; the per-unit
 * character snapshots and "Refresh character references" keep images current.
 */
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

/** Drafts saved before the roster left the hash still carry it; accept them as current. */
function createLegacyDraftInputHash(
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
  // "sequence" is structurally a carousel — same editing rules apply.
  const carouselLike = format === "carousel" || format === "sequence";
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

    if (carouselLike && !isCarouselEditorialGoal(editorialGoal)) {
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
      carouselLike &&
      index === rawUnits.length - 1 &&
      typeof unit.continuationCue === "string" &&
      unit.continuationCue.trim()
    ) {
      throw new CreativeDraftValidationError(
        "The final carousel slide cannot contain a continuation cue",
      );
    }

    return {
      ...(typeof unit.id === "string" ? { id: unit.id } : {}),
      order: index + 1,
      type: format === "meme" ? "meme-frame" : "carousel-slide",
      role,
      ...(carouselLike && isCarouselEditorialGoal(editorialGoal)
        ? {
            editorialGoal,
            viewerQuestion: requiredText(
              unit.viewerQuestion,
              `unit ${index + 1} viewerQuestion`,
              500,
            ),
            ...optionalText(unit.ctaQuestion, "ctaQuestion", 500),
          }
        : {}),
      headline: requiredText(unit.headline, `unit ${index + 1} headline`, 240),
      ...optionalText(unit.subheadline, "subheadline", 240),
      ...optionalText(unit.body, "body", 600),
      ...(carouselLike
        ? optionalText(unit.continuationCue, "continuationCue", 240)
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
      storyReferences: parseStoryReferences(unit.storyReferences),
      ...(interactiveOverlay ? { interactiveOverlay } : {}),
    };
  });

  return {
    // Unlike caption/altText, concept is internal briefing text, not
    // reader-facing copy: repairDeterministicCreativeCopy below always backs
    // a blank one with a safe fallback before persisting, so this boundary
    // must not hard-reject an edit that carries it through empty (for
    // example, a draft whose concept the automated repair already cleared).
    concept: optionalText(record.concept, "concept", 1_000).concept ?? "",
    ...(carouselLike
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
export class CreativeDraftValidationError extends Error {}

/** An editorial content edit invalidates old approvals without deleting history. */
export async function assertStoryEditionCurrent(topicId: string, draft: CreativeDraft): Promise<void> {
  // Read under the same authorization as the workspace. Approving a saved
  // automatic draft must not require a separate manual story selection.
  const story = await getDailyDraftStory(topicId, draft.storyId, undefined, true);
  if (!story.editorial) return;
  const brief = await findCreativeBriefById(topicId, draft.briefId);
  if (!brief) throw new CreativeContentNotFoundError("The creative brief was not found");
  const configuration = getCreativeContentPublicConfig();
  const [profile, topic] = await Promise.all([getCreativeProfile(topicId), requireTopic(topicId, { active: true })]);
  const expected = createBriefInputHash(story, profile, topic, configuration,
    requireStoryContent(story, configuration.maxContentCharacters), brief.editorialDirection, brief.collectionContext);
  if (expected !== brief.inputHash) throw new CreativeContentConflictError("The story was edited. Refresh the brief and draft before approving or generating images.");
}
