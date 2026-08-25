import "server-only";

import {
  completeCreativeAsset,
  createCreativeAssetBatch,
  failCreativeAsset,
  findCreativeAssetById,
  findCurrentCreativeAssetBatch,
  findLatestCompatibleCreativeAssetBatch,
  findLatestCreativeAssetBatch,
  insertRegeneratedCreativeAsset,
  refreshCreativeAssetBatchStatus,
  setCreativeAssetApproval,
  setCreativeAssetProgress,
  setCreativeAssetRequest,
} from "./creative-assets.repository";
import { resolveCreativeOutputAspectRatio } from "./creative-aspect-ratio";
import { buildCreativeImagePrompt } from "./build-creative-image-prompt";
import { findCreativeBriefById, findCreativeDraftById } from "./creative-content.repository";
import {
  DEFAULT_CREATIVE_IMAGE_QUALITY,
  type CreativeAspectRatio,
  type CreativeAssetBatch,
  type CreativeAssetBatchResponse,
  type CreativeAssetConfiguration,
  type CreativeDraft,
  type CreativeGeneratedAsset,
  type CreativeImageQuality,
} from "./creative-content.types";
import {
  getFalImagePublicConfig,
  getFalImageRuntimeConfig,
} from "./fal-image-generation.config";
import { pollFalImage, submitFalImage } from "./fal-image-client";
import {
  CreativeContentConflictError,
  CreativeContentNotFoundError,
} from "./manage-creative-content";

export async function getCreativeDraftAssets(
  topicId: string,
  draftId: string,
  requestedImageQuality?: CreativeImageQuality,
): Promise<CreativeAssetBatchResponse> {
  const draft = await requireCreativeDraft(topicId, draftId);
  const outputAspectRatio = outputAspectRatioForDraft(draft);
  const preferredConfiguration = getFalImagePublicConfig(
    outputAspectRatio,
    requestedImageQuality,
  );
  let batch = await findCurrentCreativeAssetBatch(draft.id, draft.version, {
    provider: preferredConfiguration.provider,
    model: preferredConfiguration.model,
    promptVersion: preferredConfiguration.promptVersion,
    imageQuality: preferredConfiguration.imageQuality,
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
        },
      ));
  }

  // An explicit quality selection must never surface a different-quality
  // batch as the current result. With no selector, retain the historical
  // fallback so existing asset batches remain visible after this rollout.
  if (!batch && requestedImageQuality === undefined) {
    batch = await findLatestCreativeAssetBatch(draft.id, draft.version);
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
  const outputAspectRatio = outputAspectRatioForDraft(draft);
  const configuration = getFalImageRuntimeConfig(outputAspectRatio, imageQuality);

  let existing = await findCurrentCreativeAssetBatch(draft.id, draft.version, {
    provider: configuration.provider,
    model: configuration.model,
    promptVersion: configuration.promptVersion,
    imageQuality: configuration.imageQuality,
  });
  if (!existing) {
    existing = await findLatestCompatibleCreativeAssetBatch(
      draft.id,
      draft.version,
      {
        provider: configuration.provider,
        model: configuration.model,
        outputAspectRatio,
        imageQuality: configuration.imageQuality,
      },
    );
  }
  if (existing) {
    const existingConfiguration = runtimeConfigurationForBatch(
      existing,
      outputAspectRatio,
    );
    return {
      outcome: "existing",
      batch: hasPendingAssets(existing)
        ? await syncCreativeAssetBatch(existing, existingConfiguration)
        : existing,
      configuration: publicConfigurationForBatch(existing),
    };
  }

  const brief = await findCreativeBriefById(topicId, draft.briefId);
  if (!brief) {
    throw new CreativeContentNotFoundError("The creative brief was not found");
  }
  if (draft.units.length === 0) {
    throw new CreativeContentConflictError(
      "The approved draft does not contain any visual units.",
    );
  }

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
    },
    assets: draft.units.map((unit) => ({
      unitOrder: unit.order,
      unitRole: unit.role,
      unitSnapshot: unit,
      ...buildCreativeImagePrompt({ draft, unit, brief }),
    })),
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

export async function regenerateCreativeAsset(
  topicId: string,
  assetId: string,
  input: unknown,
): Promise<CreativeAssetBatchResponse> {
  const found = await requireCreativeAsset(assetId);
  const draft = await requireCreativeDraft(topicId, found.batch.draftId);
  requireApprovedDraft(draft.status);
  assertCurrentAsset(found.asset, found.batch, draft.version);
  const configuration = runtimeConfigurationForBatch(
    found.batch,
    outputAspectRatioForDraft(draft),
  );
  assertRegenerationCompatibility(found.batch, configuration);

  const prompt = validateRegenerationPrompt(input, found.asset.prompt);
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

    const result = await pollFalImage({
      apiKey: configuration.apiKey,
      requestId: asset.requestId,
      targetWidth: configuration.width,
      targetHeight: configuration.height,
      retention: configuration.retention,
    });
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
    const requestId = await submitFalImage({
      apiKey: configuration.apiKey,
      prompt: asset.prompt,
      width: configuration.generationWidth,
      height: configuration.generationHeight,
      imageQuality: configuration.imageQuality,
    });
    await setCreativeAssetRequest(asset.id, requestId);
  } catch (error) {
    await failCreativeAsset(asset.id, errorMessage(error));
  }
}

async function requireCreativeDraft(topicId: string, draftId: string) {
  const draft = await findCreativeDraftById(topicId, draftId);
  if (!draft) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }
  return draft;
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
  if (value.trim().length > 8_000) {
    throw new CreativeAssetValidationError(
      "prompt must be 8,000 characters or fewer",
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
  if (batch.width * 9 === batch.height * 16) return "16:9";
  return batch.outputAspectRatio ?? fallback;
}

function canSyncCreativeAssetBatch(
  batch: CreativeAssetBatch,
  configuration: Pick<CreativeAssetConfiguration, "provider" | "model">,
): boolean {
  return (
    batch.provider === configuration.provider && batch.model === configuration.model
  );
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
  outcome: "submitted" | "existing";
};

export class CreativeAssetValidationError extends Error {}
