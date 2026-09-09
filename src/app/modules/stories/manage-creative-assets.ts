import { preparePlaceVisuals } from "./prepare-place-visuals";
import { visualEvidenceCurrent } from "./creative-place-visual";
import { roadMapStillCurrent } from "./prepare-road-map";
import { getSelectedStoryContent } from "./story-content.repository";
import { renderDraftTypography, DRAFT_TYPOGRAPHY_ENDPOINT } from "./creative-draft-typography";
import { uploadComposedImage } from "./fal-image-client";
import { requestsGeographicReconstruction, evidenceQualityIssues } from "./creative-evidence-guardrails";
import type { CreativeUnit } from "./creative-content.types";
import { imageText, imageTextNeedsUpdate, imageTextEditInstruction } from "./creative-image-text-sync";
import "server-only";

import { storeEditBase, readEditBase, readGeneratedImage } from "./creative-image-source";
import { listActivatedBrandReferences } from "./creative-brand-references.repository";
import {
  beginCreativeAssetEditRequestRun,
  blockCreativeAssetEditRequest,
  completeCreativeAssetEditRequestRun,
  failCreativeAssetEditRequest,
  findCreativeAssetEditRequest,
} from "./creative-asset-edit-requests.repository";
import { createHash } from "node:crypto";
import { resolveBrandGenerationReferences, loadBrandGenerationImages, assertBrandReferenceEligibility, assertBrandGenerationBudget } from "./resolve-brand-generation";
import { brandReferencePrompt, enforceBrandReferencePrompt, type GenerationReferences } from "./creative-brand-generation";

import {
  completeCreativeAsset,
  createCreativeAssetBatch,
  discardFailedCreativeAssetVersion,
  failCreativeAsset,
  findCreativeAssetById,
  findCreativeAssetBatchById,
  findCurrentCreativeAssetBatch,
  findLatestCompatibleCreativeAssetBatch,
  findLatestCreativeAssetBatch,
  findLatestCreativeAssetBatchForDraft,
  findPendingCreativeAssetBatchesForDraft,
  getCreativeAssetBrandOverlaySnapshot,
  getCreativeAssetCarouselChromeSnapshot,
  getCreativeAssetGenerationReferences,
  insertRegeneratedCreativeAsset,
  refreshCreativeAssetBatchStatus,
  setCreativeAssetApproval,
  setCreativeAssetProgress,
  setCreativeAssetRequest,
} from "./creative-assets.repository";
import { resolveCreativeOutputAspectRatio } from "./creative-aspect-ratio";
import { buildCreativeImagePrompt } from "./build-creative-image-prompt";
import {
  appendCreativeCarouselChromeContract,
  buildCreativeCarouselChrome,
  compositeCreativeCarouselChrome,
  CreativeCarouselChromeError,
  hasCreativeCarouselChromeContract,
} from "./creative-carousel-chrome";
import { charactersForImageGeneration } from "./creative-character-generation";
import { snapshotsForCreativeUnits } from "./creative-characters.repository";
import { findCreativeBriefById, findCreativeDraftById } from "./creative-content.repository";
import { resolveEffectiveVisualFidelity } from "./creative-visual-fidelity";
import {
  DEFAULT_CREATIVE_IMAGE_QUALITY,
  MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS,
  type CreativeAspectRatio,
  type CreativeAssetBatch,
  type CreativeAssetBatchResponse,
  type CreativeAssetConfiguration,
  type CreativeBrandOverlay,
  type CreativeBrandOverlaySettings,
  type CreativeBrandOverlaySnapshot,
  type CreativeCarouselChromeSettings,
  type CreativeCarouselChromeSnapshot,
  type CreativeCharacterSnapshot,
  type CreativeConversionGoal,
  type CreativeDraft,
  type CreativeFramingStrategy,
  type CreativeGeneratedAsset,
  type CreativeImageQuality,
  type CreativeKeyFact,
} from "./creative-content.types";
import {
  creativeBrandOverlaySnapshot,
  findCreativeBrandAsset,
} from "./creative-brand-assets.repository";
import {
  appendCreativeBrandContract,
  buildCreativeBrandExclusionZonePrompt,
  compositeCreativeBrandOverlaySnapshot,
  computeCreativeBrandPromptExclusionRect,
  creativeCanvasDimensions,
  creativeBrandInputHash,
  CreativeBrandOverlayError,
  shouldApplyCreativeBrandOverlay,
} from "./creative-brand-overlay";
import {
  getCreativeProfile,
  getTopicVisualFidelityMode,
} from "./creative-profile.repository";
import {
  getFalImagePublicConfig,
  getFalImageRuntimeConfig,
} from "./fal-image-generation.config";
import {
  FAL_REFERENCE_GUIDED_ENDPOINT,
  FAL_TEXT_TO_IMAGE_ENDPOINT,
  pollFalImage,
  submitFalImage,
  type FalImageEndpoint,
  type FalImagePostProcessor,
} from "./fal-image-client";
import {
  readPrivateR2ImageFile,
  deletePrivateR2Object,
  R2StorageConfigurationError,
  R2StorageObjectError,
  R2StorageValidationError,
} from "./r2-storage";
import {
  CreativeContentConflictError,
  CreativeContentNotFoundError,
} from "./manage-creative-content";
import {
  deterministicCreativeQualityIssues,
  repairDeterministicCreativeCopy,
} from "./creative-quality";

export async function getCreativeDraftAssets(
  topicId: string,
  draftId: string,
  requestedImageQuality?: CreativeImageQuality,
  includeHistorical = false,
): Promise<CreativeAssetBatchResponse> {
  const draft = await requireCreativeDraft(topicId, draftId);
  const outputAspectRatio = outputAspectRatioForDraft(draft);
  const preferredConfiguration = getFalImagePublicConfig(
    outputAspectRatio,
    requestedImageQuality,
  );

  await syncPendingCreativeAssetBatches(
    draft.id,
    outputAspectRatio,
    preferredConfiguration,
  );

  if (includeHistorical) {
    const historicalBatch = await findLatestCreativeAssetBatchForDraft(draft.id);
    return {
      ...(historicalBatch ? { batch: historicalBatch } : {}),
      configuration: historicalBatch
        ? publicConfigurationForBatch(historicalBatch)
        : preferredConfiguration,
    };
  }

  const brand = await resolveCreativeBrandGeneration(topicId, draft);

  const composed = await findLatestCreativeAssetBatch(draft.id, draft.version);
  if (composed?.brandInputHash === brand.inputHash && composed.status !== "stale" && composed.assets.every(asset => asset.providerEndpoint === DRAFT_TYPOGRAPHY_ENDPOINT) && (requestedImageQuality === undefined || composed.imageQuality === requestedImageQuality)) {
    return { batch: composed, configuration: publicConfigurationForBatch(composed) };
  }

  let batch = await findCurrentCreativeAssetBatch(draft.id, draft.version, {
    provider: preferredConfiguration.provider,
    model: preferredConfiguration.model,
    promptVersion: preferredConfiguration.promptVersion,
    imageQuality: preferredConfiguration.imageQuality,
    brandInputHash: brand.inputHash,
  });

  if (!batch) {
    batch =
      (await findLatestCompatibleCreativeAssetBatch(
        draft.id,
        draft.version,
        {
          provider: preferredConfiguration.provider,
          model: preferredConfiguration.model,
          outputAspectRatio,
          imageQuality: preferredConfiguration.imageQuality,
          brandInputHash: brand.inputHash,
        },
      ));
  }

  // An explicit quality selection must never surface a different-quality
  // batch as the current result. With no selector, retain the historical
  // fallback so existing asset batches remain visible after this rollout.
  if (!batch && requestedImageQuality === undefined) {
    batch = await findLatestCreativeAssetBatch(draft.id, draft.version);
  }

  if (batch?.brandInputHash !== brand.inputHash) {
    batch = undefined;
  }

  // Any prompt-policy change must expose a fresh Generate action. Historical
  // assets remain available through includeHistorical, but they must not mask
  // a new batch with current language, data-integrity, or character rules.
  if (
    batch &&
    (batch.promptVersion !== preferredConfiguration.promptVersion ||
      !batchMatchesDraftGenerationModes(batch, draft))
  ) {
    batch = undefined;
  }

  if (batch?.status === "stale") {
    batch = undefined;
  }

  if (
    batch &&
    hasPendingAssets(batch) &&
    canSyncCreativeAssetBatch(batch, preferredConfiguration)
  ) {
    batch = await syncCreativeAssetBatch(
      batch,
      runtimeConfigurationForBatch(batch, outputAspectRatio),
    );
  }

  return {
    ...(batch ? { batch } : {}),
    configuration: batch
      ? publicConfigurationForBatch(batch)
      : preferredConfiguration,
  };
}

export async function generateCreativeDraftAssets(
  topicId: string,
  draftId: string,
  imageQuality: CreativeImageQuality = DEFAULT_CREATIVE_IMAGE_QUALITY,
): Promise<CreativeAssetGenerationResponse> {
  const draft = await requireCreativeDraft(topicId, draftId);
  requireApprovedDraft(draft.status);
  const brief = await requireCreativeBrief(topicId, draft.briefId);
  if (draft.units.some(unit => requestsGeographicReconstruction(unit.visualDirection)) || resolveEffectiveVisualFidelity({ inheritedMode: await getTopicVisualFidelityMode(topicId), override: draft.visualFidelityOverride?.mode ?? null, overrideReason: draft.visualFidelityOverride?.reason }).mode === "photo-required") {
    return composeDraftPlaceVisuals(topicId, draft, brief, imageQuality);
  }
  assertGenerativeImageryAllowed(
    draft,
    await getTopicVisualFidelityMode(topicId),
  );
  requireNarrativeQuality(
    draft,
    brief.keyFacts,
    brief.profileSnapshot.language,
    brief.profileSnapshot.conversionGoal,
    brief.profileSnapshot.framingStrategy,
  );
  const outputAspectRatio = outputAspectRatioForDraft(draft);
  const configuration = getFalImageRuntimeConfig(outputAspectRatio, imageQuality);
  const brand = await resolveCreativeBrandGeneration(topicId, draft);

  let existing = await findCurrentCreativeAssetBatch(draft.id, draft.version, {
    provider: configuration.provider,
    model: configuration.model,
    promptVersion: configuration.promptVersion,
    imageQuality: configuration.imageQuality,
    brandInputHash: brand.inputHash,
  });
  if (!existing) {
    const compatible = await findLatestCompatibleCreativeAssetBatch(
      draft.id,
      draft.version,
      {
        provider: configuration.provider,
        model: configuration.model,
        outputAspectRatio,
        imageQuality: configuration.imageQuality,
        brandInputHash: brand.inputHash,
      },
    );
    if (
      compatible &&
      compatible.promptVersion === configuration.promptVersion &&
      batchMatchesDraftGenerationModes(compatible, draft)
    ) {
      existing = compatible;
    }
  }
  if (existing && !batchMatchesDraftGenerationModes(existing, draft)) {
    existing = undefined;
  }
  if (existing?.status === "stale") {
    existing = undefined;
  }
  if (existing) {
    const existingConfiguration = runtimeConfigurationForBatch(
      existing,
      outputAspectRatio,
    );
    return {
      outcome: "existing",
      batch: hasPendingAssets(existing)
        ? await syncCreativeAssetBatch(
            existing,
            existingConfiguration,
          )
        : existing,
      configuration: publicConfigurationForBatch(existing),
    };
  }

  if (draft.units.length === 0) {
    throw new CreativeContentConflictError(
      "The approved draft does not contain any visual units.",
    );
  }

  const characterSnapshotsByUnit = await snapshotsForCreativeUnits(
    draft.units.flatMap((unit) => (unit.id ? [unit.id] : [])),
  );
  assertCharacterSnapshotsForDraft(draft, characterSnapshotsByUnit);
  const campaignCharacters = charactersForImageGeneration(
    uniqueCharacterSnapshots(characterSnapshotsByUnit),
  );

  const brandReferencesByOrder = new Map(await Promise.all(draft.units.map(async (unit) => [
    unit.order, await resolveBrandGenerationReferences(topicId, unit.brandReferenceSelection),
  ] as const)));
  let batch = await createCreativeAssetBatch({
    draftId: draft.id,
    draftVersion: draft.version,
    outputAspectRatio,
    imageQuality: configuration.imageQuality,
    width: configuration.width,
    height: configuration.height,
    identity: {
      provider: configuration.provider,
      model: configuration.model,
      promptVersion: configuration.promptVersion,
      imageQuality: configuration.imageQuality,
      brandInputHash: brand.inputHash,
    },
    assets: draft.units.map((unit) => {
      const characterSnapshots = snapshotsForUnit(
        characterSnapshotsByUnit,
        unit.id,
      );
      const imagePrompt = buildCreativeImagePrompt({ draft, unit, brief,
        characters: charactersForImageGeneration(characterSnapshots), campaignCharacters,
        brandOverlay: brand.overlay, carouselChromeSettings: brand.carouselChrome });
      const prompt = imagePrompt.prompt + brandReferencePrompt(brandReferencesByOrder.get(unit.order) ?? [],
        charactersForImageGeneration(characterSnapshots).flatMap(character => character.referenceImages).length);
      if (prompt.length > MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS) throw new CreativeAssetValidationError("The complete image prompt exceeds 30,000 characters.");
      return {
        ...assetInputForUnit(characterSnapshots, brandReferencesByOrder.get(unit.order)),
        ...(brand.snapshot &&
        shouldApplyCreativeBrandOverlay(brand.snapshot, unit.order)
          ? { brandOverlaySnapshot: brand.snapshot }
          : {}),
        ...(brand.carouselChromeSnapshot && unit.type === "carousel-slide"
          ? { carouselChromeSnapshot: brand.carouselChromeSnapshot }
          : {}),
        unitOrder: unit.order,
        unitRole: unit.role,
        unitSnapshot: unit,
        ...imagePrompt,
        prompt,
      };
    }),
  });

  await mapWithConcurrency(batch.assets, 3, (asset) =>
    submitStoredAsset(asset, configuration),
  );
  batch = await refreshCreativeAssetBatchStatus(batch.id);

  return {
    outcome: "submitted",
    batch,
    configuration: publicConfiguration(configuration),
  };
}

/**
 * Creates a fresh image variation for every slide in an existing batch. The
 * draft, prompt, and immutable character snapshots remain unchanged; each
 * slide receives its next asset version within the same image batch.
 */
export async function generateNextCreativeDraftAssetVersion(
  topicId: string,
  draftId: string,
  batchId: string,
): Promise<CreativeAssetGenerationResponse> {
  const draft = await requireCreativeDraft(topicId, draftId);
  requireApprovedDraft(draft.status);
  const brief = await requireCreativeBrief(topicId, draft.briefId);
  const localBatch = await findCreativeAssetBatchById(batchId);
  if (localBatch?.draftId === draft.id && localBatch.assets.length && localBatch.assets.every(asset => asset.providerEndpoint === DRAFT_TYPOGRAPHY_ENDPOINT)) {
    for (const asset of localBatch.assets) await recomposePlaceAsset(topicId, { asset, batch: localBatch }, draft, brief);
    const batch = await refreshCreativeAssetBatchStatus(batchId);
    return { outcome: "versioned", batch, configuration: publicConfigurationForBatch(batch) };
  }
  assertGenerativeImageryAllowed(
    draft,
    await getTopicVisualFidelityMode(topicId),
  );
  requireNarrativeQuality(
    draft,
    brief.keyFacts,
    brief.profileSnapshot.language,
    brief.profileSnapshot.conversionGoal,
    brief.profileSnapshot.framingStrategy,
  );

  const batch = await findCreativeAssetBatchById(batchId);
  if (!batch || batch.draftId !== draft.id) {
    throw new CreativeContentNotFoundError("The creative image batch was not found");
  }
  if (batch.status === "stale" || batch.draftVersion !== draft.version) {
    throw new CreativeContentConflictError(
      "This image batch belongs to an earlier draft version. Generate images for the current approved draft instead.",
    );
  }
  const brand = await resolveCreativeBrandGeneration(topicId, draft);
  assertCurrentBrandConfiguration(batch, brand.inputHash);
  if (hasPendingAssets(batch)) {
    throw new CreativeContentConflictError(
      "Wait for the current image generation to finish before creating another version.",
    );
  }
  if (!batchMatchesDraftGenerationModes(batch, draft)) {
    throw new CreativeContentConflictError(
      "This image batch does not match the current character-reference setup. Generate a new image batch first.",
    );
  }

  const configuration = runtimeConfigurationForBatch(
    batch,
    outputAspectRatioForDraft(draft),
  );
  assertRegenerationCompatibility(batch, configuration);

  await mapWithConcurrency(batch.assets, 3, async (asset) => {
    assertCurrentAsset(asset, batch, draft.version);
    const nextAsset = await insertRegeneratedCreativeAsset({
      previous: asset,
      prompt: asset.prompt,
    });
    await submitStoredAsset(nextAsset, configuration);
  });

  const refreshedBatch = await refreshCreativeAssetBatchStatus(batch.id);
  return {
    outcome: "versioned",
    batch: refreshedBatch,
    configuration: publicConfigurationForBatch(refreshedBatch),
  };
}

export async function regenerateCreativeAsset(
  topicId: string,
  assetId: string,
  input: unknown,
): Promise<CreativeAssetBatchResponse> {
  const found = await requireCreativeAsset(assetId);
  const draft = await requireCreativeDraft(topicId, found.batch.draftId);
  requireApprovedDraft(draft.status);
  const brief = await requireCreativeBrief(topicId, draft.briefId);
  if (found.asset.providerEndpoint === DRAFT_TYPOGRAPHY_ENDPOINT) {
    const prompt = validateRegenerationPrompt(input, found.asset.prompt);
    if (prompt !== found.asset.prompt) throw new CreativeContentConflictError("Edit the saved script to change composed text. A verified map cannot be edited with a generative prompt.");
    return recomposePlaceAsset(topicId, found, draft, brief);
  }
  assertGenerativeImageryAllowed(
    draft,
    await getTopicVisualFidelityMode(topicId),
  );
  requireNarrativeQuality(
    draft,
    brief.keyFacts,
    brief.profileSnapshot.language,
    brief.profileSnapshot.conversionGoal,
    brief.profileSnapshot.framingStrategy,
  );
  assertCurrentAsset(found.asset, found.batch, draft.version);
  const brand = await resolveCreativeBrandGeneration(topicId, draft);
  assertCurrentBrandConfiguration(found.batch, brand.inputHash);
  const configuration = runtimeConfigurationForBatch(
    found.batch,
    outputAspectRatioForDraft(draft),
  );
  assertRegenerationCompatibility(found.batch, configuration);

  const validatedPrompt = validateRegenerationPrompt(input, found.asset.prompt);
  const { batch } = await executeCreativeAssetImageEdit({
    topicId,
    found,
    draft,
    configuration,
    basePrompt: validatedPrompt,
    edit: validateImageEditInput(input),
  });
  return { batch, configuration: publicConfigurationForBatch(batch) };
}

/** Update one saved unit's copy without approving the new draft in advance. */
export async function updateCreativeAssetText(topicId: string, draftId: string, assetId: string, expectedVersion: number): Promise<CreativeAssetBatchResponse> {
  const draft = await requireCreativeDraft(topicId, draftId);
  if (draft.version !== expectedVersion) throw new CreativeContentConflictError("The draft changed. Reload before updating this image.");
  const found = await requireCreativeAsset(assetId);
  if (found.batch.draftId !== draftId) throw new CreativeContentNotFoundError("The image was not found on this draft.");
  assertCurrentAsset(found.asset, found.batch, draft.version);
  const unit = draft.units.find(candidate => candidate.id === found.asset.unitSnapshot.id);
  if (!unit || unit.order !== found.asset.unitOrder) throw new CreativeContentConflictError("The slide moved or was removed. Reload its images.");
  const references = await getCreativeAssetGenerationReferences(assetId);
  const sourceAsset = found.asset.status === "failed" && references.textSync && references.base
    ? (await requireCreativeAsset(references.base.assetId)).asset : found.asset;
  if (sourceAsset.batchId !== found.asset.batchId) throw new CreativeContentConflictError("The edit base is no longer available in this revision.");
  if (!imageTextNeedsUpdate(sourceAsset.unitSnapshot, unit)) throw new CreativeContentConflictError("This image already represents the saved text.");
  if (found.asset.providerEndpoint === DRAFT_TYPOGRAPHY_ENDPOINT) {
    return recomposePlaceAsset(topicId, found, draft, await requireCreativeBrief(topicId, draft.briefId));
  }
  assertGenerativeImageryAllowed(draft, await getTopicVisualFidelityMode(topicId));
  const brief = await requireCreativeBrief(topicId, draft.briefId);
  requireNarrativeQuality(draft, brief.keyFacts, brief.profileSnapshot.language, brief.profileSnapshot.conversionGoal, brief.profileSnapshot.framingStrategy);
  const brand = await resolveCreativeBrandGeneration(topicId, draft);
  assertCurrentBrandConfiguration(found.batch, brand.inputHash);
  const configuration = runtimeConfigurationForBatch(found.batch, outputAspectRatioForDraft(draft));
  assertRegenerationCompatibility(found.batch, configuration);
  const prompt = buildCreativeImagePrompt({ draft, unit, brief,
    characters: charactersForImageGeneration(references.characters),
    brandOverlay: brand.overlay, carouselChromeSettings: brand.carouselChrome }).prompt;
  const { asset, batch } = await executeCreativeAssetImageEdit({ topicId, found, draft, configuration,
    basePrompt: prompt, targetUnit: unit, sourceAsset,
    edit: { useImageAsBase: true, editInstruction: imageTextEditInstruction(sourceAsset.unitSnapshot, unit) } });
  if (asset.status === "failed") throw new CreativeContentConflictError(asset.error ?? "The image update failed. You can retry this image.");
  return { batch, configuration: publicConfigurationForBatch(batch) };
}

/**
 * IMG-02. Execute a saved per-slide edit request (draft + unit + exact base
 * version + revision) instead of the on-screen values. Reuses the shared
 * image-edit executor; the request row moves saved → running → applied/failed.
 * IMG-06: the current effective place-fidelity policy is re-checked here, an
 * incompatible request is kept pending with a visible reason, and deterministic
 * composition (`editType === "composition"`) is refused until IMG-03.
 */
export async function applyCreativeAssetEditRequest(
  topicId: string,
  draftId: string,
  unitOrder: number,
): Promise<CreativeAssetBatchResponse> {
  const existing = await findCreativeAssetEditRequest(topicId, draftId, unitOrder);
  if (!existing) {
    throw new CreativeContentNotFoundError("No saved change to apply for this image");
  }

  // Lock the row (saved → running) BEFORE reading anything else. A concurrent
  // apply loses this compare-and-swap and is rejected; a concurrent save after
  // this point bumps the revision, and every write-back below is guarded on the
  // locked revision so a superseded run never clobbers the newer request.
  const row = await beginCreativeAssetEditRequestRun(topicId, draftId, unitOrder);

  // Everything that can declare the request incompatible with the CURRENT
  // policy / permissions / base runs here; a conflict is recorded on the row as
  // a visible reason and the request is released back to pending, never executed.
  let found: Awaited<ReturnType<typeof requireCreativeAsset>>;
  let draft: CreativeDraft;
  let configuration: ReturnType<typeof runtimeConfigurationForBatch>;
  try {
    if (!row.baseAssetId) {
      throw new CreativeContentConflictError(
        "The base image is no longer available. Save the change again.",
      );
    }
    found = await requireCreativeAsset(row.baseAssetId);
    draft = await requireCreativeDraft(topicId, found.batch.draftId);
    requireApprovedDraft(draft.status);
    const brief = await requireCreativeBrief(topicId, draft.briefId);
    configuration = runtimeConfigurationForBatch(
      found.batch,
      outputAspectRatioForDraft(draft),
    );
    assertGenerativeImageryAllowed(draft, await getTopicVisualFidelityMode(topicId));
    if (row.editType === "composition") {
      throw new CreativeContentConflictError(
        "Deterministic composition editing arrives with IMG-03.",
      );
    }
    assertCurrentAsset(found.asset, found.batch, draft.version);
    if (row.baseVersion !== found.asset.version) {
      throw new CreativeContentConflictError(
        "The base image changed. Save the change again before applying it.",
      );
    }
    const brand = await resolveCreativeBrandGeneration(topicId, draft);
    assertCurrentBrandConfiguration(found.batch, brand.inputHash);
    assertRegenerationCompatibility(found.batch, configuration);
    requireNarrativeQuality(
      draft,
      brief.keyFacts,
      brief.profileSnapshot.language,
      brief.profileSnapshot.conversionGoal,
      brief.profileSnapshot.framingStrategy,
    );
    if (row.useImageAsBase && !row.instruction) {
      throw new CreativeAssetValidationError(
        "Write the requested change before applying it.",
      );
    }
  } catch (error) {
    await blockCreativeAssetEditRequest(
      row.id,
      error instanceof CreativeContentConflictError ||
        error instanceof CreativeAssetValidationError
        ? error.message
        : "The draft or base image is no longer available.",
      row.revision,
    );
    throw error;
  }

  const edit: CreativeImageEditInput = {
    useImageAsBase: row.useImageAsBase,
    editInstruction: row.instruction ?? undefined,
    // `null` = inherit; an explicit array (including `[]`) = override.
    ...(row.brandReferenceIds !== null ? { brandReferenceIds: row.brandReferenceIds } : {}),
  };
  let asset: CreativeGeneratedAsset;
  let batch: CreativeAssetBatch;
  try {
    ({ asset, batch } = await executeCreativeAssetImageEdit({
      topicId,
      found,
      draft,
      configuration,
      basePrompt: found.asset.prompt,
      edit,
      editRequestRevision: row.revision,
    }));
  } catch (error) {
    await failCreativeAssetEditRequest(row.id, errorMessage(error), row.revision);
    throw error;
  }

  if (asset.status === "failed") {
    // `submitStoredAsset` swallowed a provider/storage error and marked the
    // asset failed. Roll the dead version back so the base stays current and a
    // retry works, then mark the request failed — never "applied".
    const message = asset.error ?? "The image edit could not be generated.";
    const refs = await getCreativeAssetGenerationReferences(asset.id);
    await discardFailedCreativeAssetVersion(asset.id);
    if (refs.base) {
      await deletePrivateR2Object(refs.base.objectKey).catch(() => undefined);
    }
    await failCreativeAssetEditRequest(row.id, message, row.revision);
    throw new CreativeContentConflictError(message);
  }

  // A concurrent save may have superseded this run; only stamp the outcome
  // when the row is still our locked revision.
  await completeCreativeAssetEditRequestRun(row.id, {
    appliedAssetId: asset.id,
    revision: row.revision,
  });
  return { batch, configuration: publicConfigurationForBatch(batch) };
}

/**
 * Shared tail of the image-edit path: build the edit prompt + reference
 * envelope from `edit`, insert the next pending asset version, and submit it to
 * the provider. `editRequestRevision` stamps the originating IMG-01 request
 * revision onto the immutable per-asset snapshot.
 */
async function executeCreativeAssetImageEdit({
  topicId,
  found,
  draft,
  configuration,
  basePrompt,
  edit,
  editRequestRevision,
  targetUnit,
  sourceAsset,
}: {
  topicId: string;
  found: { asset: CreativeGeneratedAsset; batch: CreativeAssetBatch };
  draft: CreativeDraft;
  configuration: ReturnType<typeof runtimeConfigurationForBatch>;
  basePrompt: string;
  edit: CreativeImageEditInput;
  editRequestRevision?: number;
  targetUnit?: CreativeUnit;
  sourceAsset?: CreativeGeneratedAsset;
}): Promise<{ asset: CreativeGeneratedAsset; batch: CreativeAssetBatch }> {
  if (requestsGeographicReconstruction(edit.editInstruction ?? "") || requestsGeographicReconstruction(basePrompt)) {
    throw new CreativeContentConflictError("Maps and recognizable real-place edits require documentary preparation, not generative reconstruction.");
  }
  const brandSnapshot = await getCreativeAssetBrandOverlaySnapshot(
    found.asset.id,
  );
  const chrome = buildAssetCarouselChrome({
    asset: found.asset,
    batch: found.batch,
    brandSnapshot,
  });
  const brandPrompt = brandSnapshot
    ? enforceBrandPromptContract({
        prompt: basePrompt,
        snapshot: brandSnapshot,
        unitOrder: found.asset.unitOrder,
        aspectRatio: outputAspectRatioForBatch(
          found.batch,
          outputAspectRatioForDraft(draft),
        ),
      })
    : basePrompt;
  const prompt = enforceCarouselChromePromptContract(
    brandPrompt,
    chrome?.promptReservation,
  );
  const previousReferences = await getCreativeAssetGenerationReferences(found.asset.id);
  const references: GenerationReferences = structuredClone(previousReferences);
  if (typeof editRequestRevision === "number") {
    references.editRequestRevision = editRequestRevision;
  }
  // An explicit list — including an empty one — is an override; `undefined`
  // means inherit the base asset's references.
  if (edit.brandReferenceIds !== undefined) {
    const eligible = await listActivatedBrandReferences(topicId);
    const selected = edit.brandReferenceIds.map(id => {
      const row = eligible.find(candidate => candidate.id === id);
      if (!row) throw new CreativeAssetValidationError("A selected brand reference is unavailable. Refresh the library.");
      return { id, version: row.version, configVersion: row.configVersion, function: "layout" as const, reason: "Selected for this image" };
    });
    references.brand = await resolveBrandGenerationReferences(topicId, { selected, excluded: [], note: null });
    references.selectionOverride = true;
  }
  if (edit.useImageAsBase === false) {
    delete references.base; delete references.provenanceBrand; delete references.editInstruction;
  }
  if (edit.useImageAsBase) {
    if (!(sourceAsset ?? found.asset).imageUrl || !["generated", "approved"].includes((sourceAsset ?? found.asset).status)) throw new CreativeAssetValidationError("Wait for a completed image before editing it.");
    references.provenanceBrand = [...new Map([...previousReferences.brand, ...(previousReferences.provenanceBrand ?? [])].map(ref => [`${ref.id}:${ref.version}`, ref])).values()];
    await assertBrandReferenceEligibility(references.provenanceBrand);
    assertBrandGenerationBudget(references.brand.length, charactersForImageGeneration(references.characters).length + 1);
    const baseAsset = sourceAsset ?? found.asset;
    references.base = await storeEditBase(topicId, baseAsset.id, baseAsset.version, baseAsset.imageUrl!);
    references.editInstruction = edit.editInstruction;
  }
  // Freeze a per-image override in its unit snapshot; siblings and the draft's defaults stay intact.
  delete references.carriedFromAssetId;
  if (targetUnit?.id) references.textSync = { draftVersion: draft.version, unitId: targetUnit.id,
    previousText: imageText((sourceAsset ?? found.asset).unitSnapshot), newText: imageText(targetUnit) };
  else delete references.textSync;
  const unitSnapshot = { ...(targetUnit ?? found.asset.unitSnapshot), brandReferenceSelection: {
    selected: references.brand.map(({ id, version, configVersion, function: fn, reason, name, sha256, contribution, usageNote, provenance }) =>
      ({ id, version, configVersion, function: fn, reason, name, sha256, contribution, usageNote, provenance })), excluded: [], note: null,
  } };
  const imagePrompt = enforceBrandReferencePrompt(prompt, references.brand,
    charactersForImageGeneration(references.characters).flatMap(character => character.referenceImages).length);
  const finalPrompt = imagePrompt.replace(/\n\nIMAGE EDIT v1[\s\S]*?\nEND IMAGE EDIT/g, "") + (references.base
    ? `\n\nIMAGE EDIT v1\nThe LAST input image is the base image to edit. Preserve its layout, copy and protagonist except for this requested change (data): ${JSON.stringify(references.editInstruction)}\nEND IMAGE EDIT` : edit.editInstruction ? `\nRequested change: ${JSON.stringify(edit.editInstruction)}` : "");
  if (finalPrompt.length > MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS) throw new CreativeAssetValidationError("The complete image prompt is too long.");
  // Validate limits and permissions before creating the pending version.
  await assertBrandReferenceEligibility(references.brand);
  assertBrandGenerationBudget(references.brand.length, charactersForImageGeneration(references.characters).length + (references.base ? 1 : 0));
  let asset: CreativeGeneratedAsset;
  try {
    asset = await insertRegeneratedCreativeAsset({ previous: found.asset, prompt: finalPrompt, references, unitSnapshot });
  } catch (error) {
    if (edit.useImageAsBase && references.base) await deletePrivateR2Object(references.base.objectKey).catch(() => undefined);
    throw error;
  }
  await submitStoredAsset(asset, configuration);
  const batch = await refreshCreativeAssetBatchStatus(found.batch.id);
  // `submitStoredAsset` swallows provider/storage errors and marks the asset
  // failed instead of throwing, so report the post-submit status to the caller.
  const submitted = batch.assets.find((candidate) => candidate.id === asset.id) ?? asset;
  return { asset: submitted, batch };
}

export async function changeCreativeAssetApproval(
  topicId: string,
  assetId: string,
  action: "approve" | "unapprove",
): Promise<CreativeAssetBatchResponse> {
  const found = await requireCreativeAsset(assetId);
  const draft = await requireCreativeDraft(topicId, found.batch.draftId);
  requireApprovedDraft(draft.status);
  assertCurrentAsset(found.asset, found.batch, draft.version);
  assertImageTextCurrent(found.asset, draft);
  if (action === "approve" && !visualEvidenceCurrent(found.asset.unitSnapshot.placeVisual)) throw new CreativeContentConflictError("Visual evidence expired. Recompose and review this image.");
  await assertEditorialEvidence(topicId, draft);
  if (action === "approve" && !await roadMapStillCurrent(found.asset.unitSnapshot.placeVisual?.adapterEvidence ?? found.asset.unitSnapshot.roadMapEvidence, (await requireCreativeBrief(topicId, draft.briefId)).keyFacts)) throw new CreativeContentConflictError("The official road notice changed or cannot be checked. Recompose this image before approval.");

  if (action === "approve") {
    if (found.asset.status !== "generated") {
      throw new CreativeContentConflictError(
        "Only a generated image can be approved.",
      );
    }
    if (found.asset.providerEndpoint !== DRAFT_TYPOGRAPHY_ENDPOINT) assertGenerativeImageryAllowed(
      draft,
      await getTopicVisualFidelityMode(topicId),
    );
  }
  if (action === "unapprove" && found.asset.status !== "approved") {
    throw new CreativeContentConflictError(
      "Only an approved image can be unapproved.",
    );
  }

  await setCreativeAssetApproval(assetId, action === "approve");
  const batch = await refreshCreativeAssetBatchStatus(found.batch.id);
  return { batch, configuration: publicConfigurationForBatch(batch) };
}

async function syncCreativeAssetBatch(
  batch: CreativeAssetBatch,
  configuration: ReturnType<typeof getFalImageRuntimeConfig>,
): Promise<CreativeAssetBatch> {
  const pending = batch.assets.filter(
    (asset) => asset.status === "queued" || asset.status === "generating",
  );

  await mapWithConcurrency(pending, 3, async (asset) => {
    if (asset.providerEndpoint === DRAFT_TYPOGRAPHY_ENDPOINT) return;
    if (!asset.requestId) {
      await failCreativeAsset(asset.id, "The fal.ai request ID is missing");
      return;
    }

    let result: Awaited<ReturnType<typeof pollFalImage>>;
    try {
      result = await pollFalImage({
        apiKey: configuration.apiKey,
        requestId: asset.requestId,
        endpoint: falEndpointForAsset(asset),
        targetWidth: configuration.width,
        targetHeight: configuration.height,
        retention: configuration.retention,
        postProcess: await creativePostProcessorForAsset({
          asset,
          batch,
        }),
      });
    } catch (error) {
      if (
        error instanceof CreativeBrandPostProcessError ||
        error instanceof CreativeCarouselPostProcessError
      ) {
        await failCreativeAsset(asset.id, error.message);
        return;
      }
      throw error;
    }
    if (result.status === "generated") {
      await completeCreativeAsset(asset.id, result.image);
      return;
    }
    await setCreativeAssetProgress(asset.id, result.status);
  });

  return refreshCreativeAssetBatchStatus(batch.id);
}

async function submitStoredAsset(
  asset: CreativeGeneratedAsset,
  configuration: ReturnType<typeof getFalImageRuntimeConfig>,
): Promise<void> {
  try {
    const references = await getCreativeAssetGenerationReferences(asset.id);
    const characters = references.characters;
    const referenceImages = await Promise.all(
      charactersForImageGeneration(characters).flatMap(
        (character) => character.referenceImages,
      ).map(
        (reference) =>
          readPrivateR2ImageFile({
            objectKey: reference.objectKey,
            contentType: reference.contentType,
            fileName: reference.fileName,
          }),
      ),
    );
    await assertBrandReferenceEligibility(references.provenanceBrand ?? []);
    const brandImages = await loadBrandGenerationImages(references.brand, referenceImages.length + (references.base ? 1 : 0));
    referenceImages.push(...brandImages);
    if (references.base) referenceImages.push(await readEditBase(references.base));
    if (referenceImages.reduce((bytes, image) => bytes + image.size, 0) > 20 * 1024 * 1024) throw new CreativeAssetValidationError("The combined character, brand and base images exceed 20 MB.");
    await assertBrandReferenceEligibility([...references.brand, ...(references.provenanceBrand ?? [])]);
    const requestId = await submitFalImage({
      apiKey: configuration.apiKey,
      prompt: asset.prompt,
      width: configuration.generationWidth,
      height: configuration.generationHeight,
      imageQuality: configuration.imageQuality,
      endpoint: falEndpointForAsset(asset),
      referenceImages,
      retention: configuration.retention,
    });
    await setCreativeAssetRequest(asset.id, requestId);
  } catch (error) {
    await failCreativeAsset(asset.id, errorMessage(error));
  }
}

async function syncPendingCreativeAssetBatches(
  draftId: string,
  fallbackAspectRatio: CreativeAspectRatio,
  preferredConfiguration: Pick<
    CreativeAssetConfiguration,
    "provider"
  >,
): Promise<void> {
  const pendingBatches = await findPendingCreativeAssetBatchesForDraft(draftId);
  await mapWithConcurrency(pendingBatches, 2, async (pendingBatch) => {
    if (!canSyncCreativeAssetBatch(pendingBatch, preferredConfiguration)) return;
    try {
      await syncCreativeAssetBatch(
        pendingBatch,
        runtimeConfigurationForBatch(pendingBatch, fallbackAspectRatio),
      );
    } catch (error) {
      // A retired/previous brand batch must not hide the current completed
      // batch. Its provider job remains pending and can be retried next poll.
      console.error(
        `Failed to refresh pending creative asset batch ${pendingBatch.id}`,
        error,
      );
    }
  });
}

type ResolvedCreativeBrandGeneration = {
  inputHash: string;
  overlay?: CreativeBrandOverlay;
  snapshot?: CreativeBrandOverlaySnapshot;
  carouselChrome: CreativeCarouselChromeSettings;
  carouselChromeSnapshot?: CreativeCarouselChromeSnapshot;
};

/**
 * Branding is independent from the text brief: changing a logo must create a
 * new image identity without spending another script-generation request.
 */
async function resolveCreativeBrandGeneration(
  topicId: string,
  draft: CreativeDraft,
): Promise<ResolvedCreativeBrandGeneration> {
  const profile = await getCreativeProfile(topicId);
  const overlay = profile.brandOverlay;
  const carouselChrome = profile.carouselChrome;
  const carouselChromeSnapshot = carouselChrome.enabled
    ? { ...carouselChrome, compositorVersion: 1 as const }
    : undefined;
  let overlayInputHash = "none";
  let resolvedOverlay: CreativeBrandOverlay | undefined;
  let snapshot: CreativeBrandOverlaySnapshot | undefined;

  if (overlay.enabled) {
    if (!overlay.assetId || !overlay.asset) {
      throw new CreativeContentConflictError(
        "The enabled brand overlay does not have a current PNG asset. Upload and save a logo in the creative profile.",
      );
    }

    const storedAsset = await findCreativeBrandAsset(topicId, overlay.assetId);
    if (!storedAsset || storedAsset.id !== overlay.asset.id) {
      throw new CreativeContentConflictError(
        "The selected brand logo is no longer available for this topic. Choose and save a current logo.",
      );
    }

    const settings = creativeBrandSettings(overlay);
    overlayInputHash = creativeBrandInputHash({
      settings,
      assetId: storedAsset.id,
      assetSha256: storedAsset.sha256,
    });
    resolvedOverlay = {
      ...settings,
      assetId: storedAsset.id,
      asset: overlay.asset,
    };
    snapshot = creativeBrandOverlaySnapshot(settings, storedAsset);
  }

  const inputHash =
    overlayInputHash === "none" && !carouselChromeSnapshot
      ? "none"
      : createHash("sha256")
          .update(
            JSON.stringify({
              policy: "brand-and-carousel-chrome-v1",
              overlayInputHash,
              carouselChrome: carouselChromeSnapshot ?? { enabled: false },
            }),
          )
          .digest("hex");
  return {
    inputHash: draft.units.some(unit => unit.brandReferenceSelection?.selected.length)
      ? createHash("sha256").update(JSON.stringify({ inputHash, contract: "brand-references-v2",
          selections: draft.units.map(unit => ({ order: unit.order, selected: unit.brandReferenceSelection?.selected ?? [] })) })).digest("hex")
      : inputHash,
    ...(resolvedOverlay ? { overlay: resolvedOverlay } : {}),
    ...(snapshot ? { snapshot } : {}),
    carouselChrome,
    ...(carouselChromeSnapshot ? { carouselChromeSnapshot } : {}),
  };
}

function creativeBrandSettings(
  overlay: CreativeBrandOverlay,
): CreativeBrandOverlaySettings {
  return {
    enabled: overlay.enabled,
    scope: overlay.scope,
    placement: overlay.placement,
    sizePercent: overlay.sizePercent,
    insetPercent: overlay.insetPercent,
    backdropMode: overlay.backdropMode,
    backdropColor: overlay.backdropColor,
    backdropOpacity: overlay.backdropOpacity,
  };
}

function enforceBrandPromptContract({
  prompt,
  snapshot,
  unitOrder,
  aspectRatio,
}: {
  prompt: string;
  snapshot: CreativeBrandOverlaySnapshot;
  unitOrder: number;
  aspectRatio: CreativeAspectRatio;
}): string {
  const contract = buildCreativeBrandExclusionZonePrompt({
    brandOverlay: snapshot,
    unitOrder,
    aspectRatio,
  });
  if (!contract) return prompt;

  const integrated = appendCreativeBrandContract(prompt, contract);
  if (integrated.length > MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS) {
    throw new CreativeAssetValidationError(
      "prompt plus the required brand safe-zone contract must be 30,000 characters or fewer",
    );
  }
  return integrated;
}

function enforceCarouselChromePromptContract(
  prompt: string,
  contract: string | undefined,
): string {
  const integrated = appendCreativeCarouselChromeContract(prompt, contract);
  if (integrated.length > MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS) {
    throw new CreativeAssetValidationError(
      "prompt plus the required carousel navigation contract must be 30,000 characters or fewer",
    );
  }
  return integrated;
}

function buildAssetCarouselChrome({
  asset,
  batch,
  brandSnapshot,
  carouselChromeSnapshot,
}: {
  asset: CreativeGeneratedAsset;
  batch: CreativeAssetBatch;
  brandSnapshot?: CreativeBrandOverlaySnapshot;
  carouselChromeSnapshot?: CreativeCarouselChromeSnapshot;
}) {
  if (
    asset.unitSnapshot.type !== "carousel-slide" ||
    !hasCreativeCarouselChromeContract(asset.prompt)
  ) {
    return undefined;
  }

  return buildCreativeCarouselChrome({
    aspectRatio: batch.outputAspectRatio,
    unitOrder: asset.unitOrder,
    totalSlides: batch.totalAssets,
    continuationCue: asset.unitSnapshot.continuationCue,
    settings: carouselChromeSnapshot,
    logoExclusionZone: brandSnapshot
      ? brandSnapshotOccupiedRect(brandSnapshot, batch.outputAspectRatio)
      : undefined,
  });
}

function brandSnapshotOccupiedRect(
  snapshot: CreativeBrandOverlaySnapshot,
  aspectRatio: CreativeAspectRatio,
) {
  const canvas = creativeCanvasDimensions(aspectRatio);
  return computeCreativeBrandPromptExclusionRect({
    settings: snapshot,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    logoWidth: snapshot.asset.width,
    logoHeight: snapshot.asset.height,
  });
}

async function creativePostProcessorForAsset({
  asset,
  batch,
}: {
  asset: CreativeGeneratedAsset;
  batch: CreativeAssetBatch;
}): Promise<FalImagePostProcessor | undefined> {
  const brandSnapshot = await getCreativeAssetBrandOverlaySnapshot(asset.id);
  const carouselChromeSnapshot =
    await getCreativeAssetCarouselChromeSnapshot(asset.id);
  const chrome = buildAssetCarouselChrome({
    asset,
    batch,
    brandSnapshot,
    carouselChromeSnapshot,
  });
  if (!brandSnapshot && !chrome?.overlay) return undefined;

  return async ({ normalizedPng }) => {
    let processed: Uint8Array = normalizedPng;
    if (chrome?.overlay) {
      try {
        processed = await compositeCreativeCarouselChrome({
          image: processed,
          chrome,
        });
      } catch (error) {
        if (!(error instanceof CreativeCarouselChromeError)) throw error;
        throw new CreativeCarouselPostProcessError(
          `The carousel navigation could not be composited: ${errorMessage(error)}`,
        );
      }
    }
    if (!brandSnapshot) return processed;
    return compositeStoredCreativeBrand({
      image: processed,
      snapshot: brandSnapshot,
    });
  };
}

async function compositeStoredCreativeBrand({
  image,
  snapshot,
}: {
  image: Uint8Array;
  snapshot: CreativeBrandOverlaySnapshot;
}): Promise<Buffer> {
  let logo: File;
  try {
    logo = await readPrivateR2ImageFile({
      objectKey: snapshot.asset.objectKey,
      contentType: snapshot.asset.contentType,
      fileName: snapshot.asset.fileName,
    });
  } catch (error) {
    if (
      error instanceof R2StorageConfigurationError ||
      error instanceof R2StorageValidationError ||
      (error instanceof R2StorageObjectError && !error.retryable)
    ) {
      throw new CreativeBrandPostProcessError(
        `The stored brand logo cannot be loaded: ${errorMessage(error)}`,
      );
    }
    throw error;
  }
  const logoBytes = new Uint8Array(await logo.arrayBuffer());
  const actualSha256 = createHash("sha256").update(logoBytes).digest("hex");
  if (actualSha256 !== snapshot.asset.sha256) {
    throw new CreativeBrandPostProcessError(
      "The stored brand logo no longer matches its immutable snapshot.",
    );
  }

  try {
    const composited = await compositeCreativeBrandOverlaySnapshot({
      image,
      logo: logoBytes,
      snapshot,
    });
    return composited.body;
  } catch (error) {
    // Deterministic geometry/input failures cannot improve on the next poll.
    // R2/network failures happen before this block and remain retryable.
    if (!(error instanceof CreativeBrandOverlayError)) throw error;
    throw new CreativeBrandPostProcessError(
      `The brand logo could not be composited: ${errorMessage(error)}`,
    );
  }
}

function assetInputForUnit(characters: CreativeCharacterSnapshot[], brand: GenerationReferences["brand"] = []) {
  const generationMode = characters.length > 0 || brand.length > 0
    ? "reference-guided" as const : "text-to-image" as const;
  return {
    generationMode,
    providerEndpoint: generationMode === "reference-guided"
      ? FAL_REFERENCE_GUIDED_ENDPOINT : FAL_TEXT_TO_IMAGE_ENDPOINT,
    referenceSnapshot: brand.length ? { schema: 1 as const, characters, brand } : characters,
    referenceInputHash: brand.length
      ? createHash("sha256").update(JSON.stringify({ characters, brand })).digest("hex")
      : referenceInputHash(characters),
  };
}

function referenceInputHash(characters: CreativeCharacterSnapshot[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        characters.map((character) => ({
          id: character.id,
          name: character.name,
          description: character.description,
          referenceImages: character.referenceImages.map((image) => ({
            id: image.id,
            objectKey: image.objectKey,
            contentType: image.contentType,
            fileSize: image.fileSize,
            order: image.order,
          })),
        })),
      ),
    )
    .digest("hex");
}

function falEndpointForAsset(asset: CreativeGeneratedAsset): FalImageEndpoint {
  if (asset.generationMode === "reference-guided") {
    if (asset.providerEndpoint !== FAL_REFERENCE_GUIDED_ENDPOINT) {
      throw new CreativeContentConflictError(
        "This reference-guided image does not have a compatible Fal endpoint. Generate a fresh image batch.",
      );
    }
    return FAL_REFERENCE_GUIDED_ENDPOINT;
  }

  if (asset.providerEndpoint !== FAL_TEXT_TO_IMAGE_ENDPOINT) {
    throw new CreativeContentConflictError(
      "This text-to-image asset does not have a compatible Fal endpoint. Generate a fresh image batch.",
    );
  }
  return FAL_TEXT_TO_IMAGE_ENDPOINT;
}

function batchMatchesDraftGenerationModes(
  batch: CreativeAssetBatch,
  draft: CreativeDraft,
): boolean {
  const assetsByOrder = new Map(
    batch.assets.map((asset) => [asset.unitOrder, asset]),
  );

  return draft.units.every((unit) => {
    const asset = assetsByOrder.get(unit.order);
    if (!asset) return false;
    if (!asset.hasBrandReferenceOverride && unit.brandReferenceSelection?.selected.length && asset.referenceContextVersion !== 1) return false;
    const selection = asset.hasBrandReferenceOverride ? asset.unitSnapshot.brandReferenceSelection : unit.brandReferenceSelection;
    const shouldUseReferences = Boolean(asset.editSource) || (unit.characterIds?.length ?? 0) > 0 || (selection?.selected.length ?? 0) > 0;
    return shouldUseReferences
      ? asset.generationMode === "reference-guided" &&
          asset.providerEndpoint === FAL_REFERENCE_GUIDED_ENDPOINT
      : asset.generationMode === "text-to-image" &&
          asset.providerEndpoint === FAL_TEXT_TO_IMAGE_ENDPOINT;
  });
}

function snapshotsForUnit(
  snapshotsByUnit: Map<string, CreativeCharacterSnapshot[]>,
  unitId: string | undefined,
): CreativeCharacterSnapshot[] {
  return unitId ? snapshotsByUnit.get(unitId) ?? [] : [];
}

function uniqueCharacterSnapshots(
  snapshotsByUnit: Map<string, CreativeCharacterSnapshot[]>,
): CreativeCharacterSnapshot[] {
  const unique = new Map<string, CreativeCharacterSnapshot>();
  snapshotsByUnit.forEach((characters) => {
    characters.forEach((character) => {
      if (!unique.has(character.id)) unique.set(character.id, character);
    });
  });
  return [...unique.values()];
}

function assertCharacterSnapshotsForDraft(
  draft: CreativeDraft,
  snapshotsByUnit: Map<string, CreativeCharacterSnapshot[]>,
): void {
  const incompleteUnit = draft.units.find((unit) => {
    const selected = new Set(unit.characterIds ?? []);
    if (selected.size === 0) return false;
    const snapshotted = new Set(
      snapshotsForUnit(snapshotsByUnit, unit.id).map((character) => character.id),
    );
    return (
      selected.size !== snapshotted.size ||
      [...selected].some((characterId) => !snapshotted.has(characterId))
    );
  });

  if (incompleteUnit) {
    throw new CreativeContentConflictError(
      `Slide ${incompleteUnit.order} has supporting-character selections without a current reference snapshot. Refresh character references, approve the draft, and try again.`,
    );
  }
}

async function requireCreativeDraft(topicId: string, draftId: string) {
  const draft = await findCreativeDraftById(topicId, draftId);
  if (!draft) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }
  if (draft.provider === "documentary") {
    throw new CreativeContentConflictError("Use documentary preparation and its complete final review for this publication.");
  }
  return draft;
}

async function requireCreativeBrief(topicId: string, briefId: string) {
  const brief = await findCreativeBriefById(topicId, briefId);
  if (!brief) {
    throw new CreativeContentNotFoundError("The creative brief was not found");
  }
  return brief;
}

async function requireCreativeAsset(assetId: string) {
  const found = await findCreativeAssetById(assetId);
  if (!found) {
    throw new CreativeContentNotFoundError("The creative image was not found");
  }
  return found;
}

/**
 * GEO-01 (criterion 1). Generative imagery is only allowed when the effective
 * place-fidelity mode is "illustration-editorial". `photo-required` needs an
 * approved real photo (deterministic composition arrives with GEO-06) and
 * `verified-references` needs the approved-reference flow (GEO-09/GEO-10);
 * until those exist, both hard-stop text-to-image / image-to-image /
 * regeneration and the approval of a generated image. Never a fallback.
 *
 * `liveInheritedMode` is the CURRENT topic policy, not the brief snapshot:
 * re-approving an old draft must not let it generate under a superseded mode.
 */
function assertGenerativeImageryAllowed(
  draft: Pick<CreativeDraft, "visualFidelityOverride"> & Partial<Pick<CreativeDraft, "units">>,
  liveInheritedMode: unknown,
): void {
  if (draft.units?.some(unit => requestsGeographicReconstruction(unit.visualDirection))) {
    throw new CreativeContentConflictError("This script requests a map or recognizable real-place reconstruction. Use documentary preparation with verified photography or provider cartography; generative imagery cannot verify this location.");
  }
  const effective = resolveEffectiveVisualFidelity({
    inheritedMode: liveInheritedMode,
    override: draft.visualFidelityOverride?.mode ?? null,
    overrideReason: draft.visualFidelityOverride?.reason,
  });
  if (effective.mode === "photo-required") {
    throw new CreativeContentConflictError(
      "This topic requires real photography. Use documentary preparation to find eligible material, prepare verified cartography when appropriate, or deliver typography for final review. Generative image creation is disabled.",
    );
  }
  if (effective.mode === "verified-references") {
    throw new CreativeContentConflictError(
      "This draft's place fidelity is set to verified references, which generates only from approved place references. That flow is not available yet (GEO-09 / GEO-10).",
    );
  }
}

function requireApprovedDraft(status: "draft" | "approved"): void {
  if (status !== "approved") {
    throw new CreativeContentConflictError(
      "Approve the current script before generating or reviewing images.",
    );
  }
}

function requireNarrativeQuality(
  draft: CreativeDraft,
  keyFacts: readonly CreativeKeyFact[],
  language?: string,
  conversionGoal?: CreativeConversionGoal,
  framingStrategy?: CreativeFramingStrategy,
): void {
  // Validate what approval validates. approveSavedCreativeDraft repairs before
  // it checks, so a stored draft that only fails a deterministically repairable
  // rule (a missing follow CTA, a summary-label headline) must not block image
  // generation here — otherwise an already-approved draft becomes unusable.
  const repaired = repairDeterministicCreativeCopy(
    draft,
    draft.format,
    keyFacts,
    language,
    conversionGoal,
  );
  const blockers = deterministicCreativeQualityIssues(
    repaired,
    draft.format,
    keyFacts,
    language,
    conversionGoal,
    framingStrategy,
  ).filter((issue) => issue.severity === "blocker");
  if (blockers.length > 0) {
    throw new CreativeContentConflictError(
      `Resolve the narrative quality blockers before generating images: ${blockers
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }
}

async function assertEditorialEvidence(topicId: string, draft: CreativeDraft): Promise<void> {
  const brief = await requireCreativeBrief(topicId, draft.briefId);
  const issues = evidenceQualityIssues(draft, brief.keyFacts);
  if (issues.length) throw new CreativeContentConflictError(issues[0].message);
}

function assertImageTextCurrent(asset: CreativeGeneratedAsset, draft: CreativeDraft): void {
  const unit = draft.units.find(candidate => candidate.order === asset.unitOrder);
  if (!unit || imageTextNeedsUpdate(asset.unitSnapshot, unit)) throw new CreativeContentConflictError("Update this image to match the saved draft text before approving or exporting it.");
}

function assertCurrentAsset(
  asset: CreativeGeneratedAsset,
  batch: CreativeAssetBatch,
  currentDraftVersion: number,
): void {
  const latest = batch.assets.find((candidate) => candidate.unitOrder === asset.unitOrder);
  if (
    batch.status === "stale" ||
    batch.draftVersion !== currentDraftVersion ||
    latest?.id !== asset.id
  ) {
    throw new CreativeContentConflictError(
      "This image belongs to an older script, image version, or generation configuration. Refresh Creative Studio.",
    );
  }
}

function assertRegenerationCompatibility(
  batch: CreativeAssetBatch,
  configuration: ReturnType<typeof getFalImageRuntimeConfig>,
): void {
  if (
    batch.provider !== configuration.provider ||
    batch.model !== configuration.model
  ) {
    throw new CreativeContentConflictError(
      "This historical image can still be viewed and approved, but it was generated with a retired model. Create a new current image batch to regenerate it.",
    );
  }
}

function assertCurrentBrandConfiguration(
  batch: CreativeAssetBatch,
  brandInputHash: string,
): void {
  if (batch.brandInputHash !== brandInputHash) {
    throw new CreativeContentConflictError(
      "The creative profile logo or its placement changed. Generate a new image batch to use the current brand settings.",
    );
  }
}

function outputAspectRatioForDraft(
  draft: Pick<CreativeDraft, "format"> & {
    outputAspectRatio?: CreativeAspectRatio;
  },
): CreativeAspectRatio {
  return resolveCreativeOutputAspectRatio(draft.format, draft.outputAspectRatio);
}

function validateRegenerationPrompt(input: unknown, fallback: string): string {
  if (input === undefined || input === null) return fallback;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new CreativeAssetValidationError("A JSON object is required");
  }
  const value = (input as { prompt?: unknown }).prompt;
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeAssetValidationError("prompt must contain text");
  }
  // Integrated prompts include the visual system, exact-text contract, and
  // character-reference constraints. Current generated prompts can exceed
  // 8k characters and are accepted by the configured Fal endpoint, so the
  // editor must not reject its own persisted prompt during regeneration.
  if (value.trim().length > MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS) {
    throw new CreativeAssetValidationError(
      "prompt must be 30,000 characters or fewer",
    );
  }
  return value.trim();
}

function hasPendingAssets(batch: CreativeAssetBatch): boolean {
  return batch.assets.some(
    (asset) => asset.status === "queued" || asset.status === "generating",
  );
}

function publicConfiguration(
  configuration: ReturnType<typeof getFalImageRuntimeConfig>,
) {
  return {
    provider: configuration.provider,
    model: configuration.model,
    width: configuration.width,
    height: configuration.height,
    promptVersion: configuration.promptVersion,
    imageQuality: configuration.imageQuality,
    outputFormat: configuration.outputFormat,
  };
}

function publicConfigurationForBatch(
  batch: CreativeAssetBatch,
): CreativeAssetConfiguration {
  return {
    provider: batch.provider,
    model: batch.model,
    width: batch.width,
    height: batch.height,
    promptVersion: batch.promptVersion,
    imageQuality: batch.imageQuality,
    outputFormat: "png",
  };
}

function runtimeConfigurationForBatch(
  batch: CreativeAssetBatch,
  fallbackAspectRatio: CreativeAspectRatio,
) {
  const configuration = getFalImageRuntimeConfig(
    outputAspectRatioForBatch(batch, fallbackAspectRatio),
    batch.imageQuality,
  );

  return {
    ...configuration,
    width: batch.width,
    height: batch.height,
    promptVersion: batch.promptVersion,
  };
}

function outputAspectRatioForBatch(
  batch: Pick<CreativeAssetBatch, "width" | "height" | "outputAspectRatio">,
  fallback: CreativeAspectRatio,
): CreativeAspectRatio {
  if (batch.width === batch.height) return "1:1";
  if (batch.width * 5 === batch.height * 4) return "4:5";
  if (batch.width * 16 === batch.height * 9) return "9:16";
  if (batch.width * 9 === batch.height * 16) return "16:9";
  return batch.outputAspectRatio ?? fallback;
}

function canSyncCreativeAssetBatch(
  batch: CreativeAssetBatch,
  configuration: Pick<CreativeAssetConfiguration, "provider">,
): boolean {
  // Polling uses the immutable request ID and per-asset Fal endpoint. A model
  // configuration change must not strand a job that was already submitted.
  return batch.provider === configuration.provider;
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const value = values[next++];
        if (value) await task(value);
      }
    }),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown fal.ai image error";
}

export type CreativeAssetGenerationResponse = CreativeAssetBatchResponse & {
  outcome: "submitted" | "existing" | "versioned";
};

export class CreativeAssetValidationError extends Error {}

class CreativeBrandPostProcessError extends Error {}

class CreativeCarouselPostProcessError extends Error {}

export type CreativeImageEditInput = { useImageAsBase?: boolean; brandReferenceIds?: string[]; editInstruction?: string };
function validateImageEditInput(input: unknown): CreativeImageEditInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (raw.useImageAsBase !== undefined && typeof raw.useImageAsBase !== "boolean") throw new CreativeAssetValidationError("useImageAsBase must be boolean");
  if (raw.brandReferenceIds !== undefined && (!Array.isArray(raw.brandReferenceIds) || raw.brandReferenceIds.length > 16 || raw.brandReferenceIds.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) || new Set(raw.brandReferenceIds).size !== raw.brandReferenceIds.length)) throw new CreativeAssetValidationError("Choose a bounded list of distinct brand references");
  if (raw.useImageAsBase && (typeof raw.editInstruction !== "string" || !raw.editInstruction.trim() || raw.editInstruction.length > 2000)) throw new CreativeAssetValidationError("Describe the edit in 1–2000 characters");
  return { useImageAsBase: raw.useImageAsBase as boolean | undefined, brandReferenceIds: raw.brandReferenceIds as string[] | undefined, editInstruction: typeof raw.editInstruction === "string" ? raw.editInstruction.trim() : undefined };
}

export async function downloadApprovedCreativeImage(topicId: string, assetId: string): Promise<File> {
  const found = await requireCreativeAsset(assetId);
  const draft = await requireCreativeDraft(topicId, found.batch.draftId);
  assertCurrentAsset(found.asset, found.batch, draft.version);
  assertImageTextCurrent(found.asset, draft);
  if (!visualEvidenceCurrent(found.asset.unitSnapshot.placeVisual)) throw new CreativeContentConflictError("Visual evidence expired. Recompose and review this image.");
  await assertEditorialEvidence(topicId, draft);
  if (!await roadMapStillCurrent(found.asset.unitSnapshot.placeVisual?.adapterEvidence ?? found.asset.unitSnapshot.roadMapEvidence, (await requireCreativeBrief(topicId, draft.briefId)).keyFacts)) throw new CreativeContentConflictError("The official road notice changed or cannot be checked. Recompose and review this image before export.");
  if (draft.status !== "approved" || found.asset.status !== "approved" || !found.asset.imageUrl) throw new CreativeContentConflictError("Approve the current image before downloading it as ready.");
  if (found.asset.providerEndpoint !== DRAFT_TYPOGRAPHY_ENDPOINT) assertGenerativeImageryAllowed(draft, await getTopicVisualFidelityMode(topicId));
  const references = await getCreativeAssetGenerationReferences(assetId);
  await assertBrandReferenceEligibility([...references.brand, ...(references.provenanceBrand ?? [])]);
  const file = await readGeneratedImage(found.asset.imageUrl);
  const latest = await requireCreativeAsset(assetId);
  const latestDraft = await requireCreativeDraft(topicId, latest.batch.draftId);
  assertCurrentAsset(latest.asset, latest.batch, latestDraft.version);
  assertImageTextCurrent(latest.asset, latestDraft);
  if (latest.asset.status !== "approved" || latestDraft.status !== "approved") throw new CreativeContentConflictError("The approval changed during download.");
  await assertBrandReferenceEligibility([...references.brand, ...(references.provenanceBrand ?? [])]);
  return file;
}

export async function previewCreativeImageBase(topicId: string, assetId: string): Promise<File> {
  const found = await requireCreativeAsset(assetId);
  await requireCreativeDraft(topicId, found.batch.draftId);
  const references = await getCreativeAssetGenerationReferences(assetId);
  if (!references.base) throw new CreativeContentNotFoundError("This image has no stored edit base.");
  return readEditBase(references.base);
}

async function composeDraftPlaceVisuals(topicId: string, draft: CreativeDraft, brief: Awaited<ReturnType<typeof requireCreativeBrief>>, quality: CreativeImageQuality): Promise<CreativeAssetGenerationResponse> {
  if (outputAspectRatioForDraft(draft) !== "4:5") throw new CreativeContentConflictError("Typography composition currently requires 4:5.");
  requireNarrativeQuality(draft, brief.keyFacts, brief.profileSnapshot.language, brief.profileSnapshot.conversionGoal, brief.profileSnapshot.framingStrategy);
  await assertEditorialEvidence(topicId, draft);
  const configuration = { ...getFalImageRuntimeConfig("4:5", quality), promptVersion: `${getFalImageRuntimeConfig("4:5", quality).promptVersion}:place-visual-v2` };
  const brand = await resolveCreativeBrandGeneration(topicId, draft);
  const existing = await findCurrentCreativeAssetBatch(draft.id, draft.version, { provider: configuration.provider, model: configuration.model, promptVersion: configuration.promptVersion, imageQuality: quality, brandInputHash: brand.inputHash });
  if (existing && existing.status !== "stale") return { outcome: "existing", batch: existing, configuration: publicConfiguration(configuration) };
  const profile = await getCreativeProfile(topicId);
  const story = await getSelectedStoryContent(topicId, draft.storyId);
  const visuals = await preparePlaceVisuals(topicId, draft, profile, brief.keyFacts, story?.url || "");
  let batch = await createCreativeAssetBatch({ draftId: draft.id, draftVersion: draft.version, outputAspectRatio: "4:5", imageQuality: quality, width: 1080, height: 1350,
    identity: { provider: configuration.provider, model: configuration.model, promptVersion: configuration.promptVersion, imageQuality: quality, brandInputHash: brand.inputHash },
    assets: draft.units.map(unit => ({ unitOrder: unit.order, unitRole: unit.role, unitSnapshot: { ...unit, roadMapEvidence: undefined, placeVisual: visuals.get(unit.order)?.evidence }, prompt: "Deterministic editorial composition preserving saved copy; verified location material or conceptual symbols; no place generated", expectedText: [unit.headline, unit.subheadline, unit.body, unit.ctaQuestion].filter(Boolean).join("\n"), generationMode: "text-to-image", providerEndpoint: DRAFT_TYPOGRAPHY_ENDPOINT, referenceSnapshot: [], referenceInputHash: brand.inputHash })) });
  for (const asset of batch.assets) {
    try {
      const output = await renderDraftTypography(asset.unitSnapshot, profile, visuals.get(asset.unitOrder)?.bytes);
      await completeCreativeAsset(asset.id, await uploadComposedImage(configuration.apiKey, output, asset.id));
    } catch (error) { await failCreativeAsset(asset.id, errorMessage(error)); }
  }
  batch = await refreshCreativeAssetBatchStatus(batch.id);
  return { outcome: "submitted", batch, configuration: publicConfiguration(configuration) };
}

async function recomposePlaceAsset(topicId: string, found: {asset: CreativeGeneratedAsset; batch: CreativeAssetBatch}, draft: CreativeDraft, brief: Awaited<ReturnType<typeof requireCreativeBrief>>): Promise<CreativeAssetBatchResponse> {
  assertCurrentAsset(found.asset, found.batch, draft.version);
  await assertEditorialEvidence(topicId, draft);
  requireNarrativeQuality(draft, brief.keyFacts, brief.profileSnapshot.language, brief.profileSnapshot.conversionGoal, brief.profileSnapshot.framingStrategy);
  const brand = await resolveCreativeBrandGeneration(topicId, draft);
  assertCurrentBrandConfiguration(found.batch, brand.inputHash);
  const unit = draft.units.find(unit => unit.order === found.asset.unitOrder);
  if (!unit) throw new CreativeContentConflictError("The slide no longer exists");
  const story = await getSelectedStoryContent(topicId, draft.storyId);
  const profile = await getCreativeProfile(topicId);
  const map = (await preparePlaceVisuals(topicId, { ...draft, units: [unit] }, profile, brief.keyFacts, story?.url || "")).get(unit.order);
  const asset = await insertRegeneratedCreativeAsset({ previous: found.asset, expectedDraftVersion: draft.version, prompt: found.asset.prompt, unitSnapshot: { ...unit, roadMapEvidence: undefined, placeVisual: map?.evidence } });
  try {
    const config = getFalImageRuntimeConfig("4:5", found.batch.imageQuality);
    const output = await renderDraftTypography(asset.unitSnapshot, await getCreativeProfile(topicId), map?.bytes);
    await completeCreativeAsset(asset.id, await uploadComposedImage(config.apiKey, output, asset.id));
  } catch (error) { await failCreativeAsset(asset.id, errorMessage(error)); }
  const batch = await refreshCreativeAssetBatchStatus(found.batch.id);
  return { batch, configuration: publicConfigurationForBatch(batch) };
}
