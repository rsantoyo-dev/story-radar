import "server-only";

import { createHash } from "node:crypto";

import {
  completeCreativeAsset,
  createCreativeAssetBatch,
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
  getCreativeAssetReferenceSnapshot,
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
import {
  DEFAULT_CREATIVE_IMAGE_QUALITY,
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
import { getCreativeProfile } from "./creative-profile.repository";
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
  R2StorageConfigurationError,
  R2StorageObjectError,
  R2StorageValidationError,
} from "./r2-storage";
import {
  CreativeContentConflictError,
  CreativeContentNotFoundError,
} from "./manage-creative-content";
import { deterministicCreativeQualityIssues } from "./creative-quality";

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

  const brand = await resolveCreativeBrandGeneration(topicId);

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
  requireNarrativeQuality(
    draft,
    brief.keyFacts,
    brief.profileSnapshot.language,
    brief.profileSnapshot.conversionGoal,
  );
  const outputAspectRatio = outputAspectRatioForDraft(draft);
  const configuration = getFalImageRuntimeConfig(outputAspectRatio, imageQuality);
  const brand = await resolveCreativeBrandGeneration(topicId);

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
      return {
        ...assetInputForUnit(characterSnapshots),
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
        ...buildCreativeImagePrompt({
          draft,
          unit,
          brief,
          characters: charactersForImageGeneration(characterSnapshots),
          campaignCharacters,
          brandOverlay: brand.overlay,
          carouselChromeSettings: brand.carouselChrome,
        }),
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
  requireNarrativeQuality(
    draft,
    brief.keyFacts,
    brief.profileSnapshot.language,
    brief.profileSnapshot.conversionGoal,
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
  const brand = await resolveCreativeBrandGeneration(topicId);
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
  requireNarrativeQuality(
    draft,
    brief.keyFacts,
    brief.profileSnapshot.language,
    brief.profileSnapshot.conversionGoal,
  );
  assertCurrentAsset(found.asset, found.batch, draft.version);
  const brand = await resolveCreativeBrandGeneration(topicId);
  assertCurrentBrandConfiguration(found.batch, brand.inputHash);
  const configuration = runtimeConfigurationForBatch(
    found.batch,
    outputAspectRatioForDraft(draft),
  );
  assertRegenerationCompatibility(found.batch, configuration);

  const validatedPrompt = validateRegenerationPrompt(input, found.asset.prompt);
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
        prompt: validatedPrompt,
        snapshot: brandSnapshot,
        unitOrder: found.asset.unitOrder,
        aspectRatio: outputAspectRatioForBatch(
          found.batch,
          outputAspectRatioForDraft(draft),
        ),
      })
    : validatedPrompt;
  const prompt = enforceCarouselChromePromptContract(
    brandPrompt,
    chrome?.promptReservation,
  );
  const asset = await insertRegeneratedCreativeAsset({
    previous: found.asset,
    prompt,
  });
  await submitStoredAsset(asset, configuration);
  const batch = await refreshCreativeAssetBatchStatus(found.batch.id);
  return { batch, configuration: publicConfigurationForBatch(batch) };
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

  if (action === "approve" && found.asset.status !== "generated") {
    throw new CreativeContentConflictError(
      "Only a generated image can be approved.",
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
    const characters = await getCreativeAssetReferenceSnapshot(asset.id);
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
    inputHash,
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
  if (integrated.length > 20_000) {
    throw new CreativeAssetValidationError(
      "prompt plus the required brand safe-zone contract must be 20,000 characters or fewer",
    );
  }
  return integrated;
}

function enforceCarouselChromePromptContract(
  prompt: string,
  contract: string | undefined,
): string {
  const integrated = appendCreativeCarouselChromeContract(prompt, contract);
  if (integrated.length > 20_000) {
    throw new CreativeAssetValidationError(
      "prompt plus the required carousel navigation contract must be 20,000 characters or fewer",
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

function assetInputForUnit(characters: CreativeCharacterSnapshot[]): {
  generationMode: CreativeGeneratedAsset["generationMode"];
  providerEndpoint: FalImageEndpoint;
  referenceSnapshot: CreativeCharacterSnapshot[];
  referenceInputHash: string;
} {
  const generationMode =
    characters.length > 0 ? "reference-guided" : "text-to-image";

  return {
    generationMode,
    providerEndpoint:
      generationMode === "reference-guided"
        ? FAL_REFERENCE_GUIDED_ENDPOINT
        : FAL_TEXT_TO_IMAGE_ENDPOINT,
    referenceSnapshot: characters,
    referenceInputHash: referenceInputHash(characters),
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
    const shouldUseReferences = (unit.characterIds?.length ?? 0) > 0;
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
): void {
  const blockers = deterministicCreativeQualityIssues(
    draft,
    draft.format,
    keyFacts,
    language,
    conversionGoal,
  ).filter((issue) => issue.severity === "blocker");
  if (blockers.length > 0) {
    throw new CreativeContentConflictError(
      `Resolve the narrative quality blockers before generating images: ${blockers
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }
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
  if (value.trim().length > 20_000) {
    throw new CreativeAssetValidationError(
      "prompt must be 20,000 characters or fewer",
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
