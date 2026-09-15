import type { CreativeAspectRatio } from "./creative-content.types";
import type { CreativeImageQuality } from "./creative-content.types";

/**
 * Logical image-model names. The profile, the env default and every persisted
 * asset refer to these, never to a fal.ai endpoint id, so a provider can move
 * or version an endpoint without rewriting stored history.
 */
export const CREATIVE_IMAGE_MODELS = ["gpt-image", "flux-pro", "nano-banana"] as const;
export type CreativeImageModel = (typeof CREATIVE_IMAGE_MODELS)[number];

export function isCreativeImageModel(value: unknown): value is CreativeImageModel {
  return typeof value === "string" && (CREATIVE_IMAGE_MODELS as readonly string[]).includes(value);
}

export class CreativeImageModelError extends Error {}

type BuildInputOptions = {
  prompt: string;
  width: number;
  height: number;
  aspectRatio: CreativeAspectRatio;
  imageQuality: CreativeImageQuality;
  /** Already-uploaded fal storage URLs; empty for text-to-image. */
  imageUrls: readonly string[];
};

export type CreativeImageModelDescriptor = {
  key: CreativeImageModel;
  label: string;
  /** Persisted on every asset as `model`; identifies the exact provider build. */
  providerModel: string;
  textToImageEndpoint: string;
  /**
   * Reference-guided generation is a separate queued endpoint on fal: adding
   * image urls to the text-to-image endpoint is not enough, and status/result
   * must be polled against the same endpoint that submitted the request.
   */
  referenceEndpoint?: string;
  /** 0 when the model cannot take references at all. */
  maxReferenceImages: number;
  /**
   * Whether the model renders legible in-image text reliably enough for units
   * that carry `expectedText`. Flux is strong on organic imagery and weak on
   * lettering, so this is a capability gate, not a stylistic preference.
   */
  rendersText: boolean;
  buildInput: (options: BuildInputOptions) => Record<string, unknown>;
};

/** Nano Banana sizes by ratio + resolution; exact pixels come from normalization. */
const NANO_BANANA_RATIO: Record<CreativeAspectRatio, string> = {
  "1:1": "1:1",
  "4:5": "4:5",
  "9:16": "9:16",
  "16:9": "16:9",
};

const DESCRIPTORS: Record<CreativeImageModel, CreativeImageModelDescriptor> = {
  "gpt-image": {
    key: "gpt-image",
    label: "GPT Image 2",
    providerModel: "openai/gpt-image-2",
    textToImageEndpoint: "openai/gpt-image-2",
    referenceEndpoint: "openai/gpt-image-2/edit",
    maxReferenceImages: 16,
    rendersText: true,
    buildInput: ({ prompt, width, height, imageQuality, imageUrls }) => ({
      prompt,
      image_size: { width, height },
      ...(imageUrls.length > 0
        ? { image_urls: [...imageUrls], input_fidelity: "high" as const }
        : {}),
      quality: imageQuality,
      output_format: "png",
    }),
  },
  "flux-pro": {
    key: "flux-pro",
    label: "FLUX1.1 [pro]",
    providerModel: "fal-ai/flux-pro/v1.1",
    textToImageEndpoint: "fal-ai/flux-pro/v1.1",
    // Redux conditions generation on a single image; it has no multi-reference
    // form, so character-heavy units keep needing a multi-reference model.
    referenceEndpoint: "fal-ai/flux-pro/v1.1/redux",
    maxReferenceImages: 1,
    rendersText: false,
    buildInput: ({ prompt, width, height, imageUrls }) => ({
      prompt,
      image_size: { width, height },
      num_images: 1,
      output_format: "png",
      ...(imageUrls.length > 0 ? { image_url: imageUrls[0] } : {}),
    }),
  },
  "nano-banana": {
    key: "nano-banana",
    label: "Nano Banana 2",
    providerModel: "fal-ai/nano-banana-2",
    textToImageEndpoint: "fal-ai/nano-banana-2",
    referenceEndpoint: "fal-ai/nano-banana-2/edit",
    maxReferenceImages: 16,
    rendersText: true,
    buildInput: ({ prompt, aspectRatio, imageUrls }) => ({
      prompt,
      // This family takes a ratio plus a resolution tier rather than exact
      // pixels; the shared post-step normalizes to the configured dimensions.
      aspect_ratio: NANO_BANANA_RATIO[aspectRatio],
      resolution: "2K",
      num_images: 1,
      output_format: "png",
      ...(imageUrls.length > 0 ? { image_urls: [...imageUrls] } : {}),
    }),
  },
};

export function creativeImageModel(key: CreativeImageModel): CreativeImageModelDescriptor {
  return DESCRIPTORS[key];
}

export type CreativeImageGenerationMode = "text-to-image" | "reference-guided";

export function creativeImageEndpoint(
  descriptor: CreativeImageModelDescriptor,
  mode: CreativeImageGenerationMode,
): string {
  if (mode === "text-to-image") return descriptor.textToImageEndpoint;
  if (!descriptor.referenceEndpoint) {
    throw new CreativeImageModelError(
      `${descriptor.label} does not support reference-guided generation.`,
    );
  }
  return descriptor.referenceEndpoint;
}

/**
 * Resolves a persisted `provider_endpoint` back to its model and mode. Assets
 * generated before more than one model existed carry the GPT Image endpoints,
 * so they keep resolving here instead of being rejected as incompatible.
 */
export function findCreativeImageModelByEndpoint(
  endpoint: string,
): { descriptor: CreativeImageModelDescriptor; mode: CreativeImageGenerationMode } | undefined {
  for (const descriptor of Object.values(DESCRIPTORS)) {
    if (descriptor.textToImageEndpoint === endpoint) return { descriptor, mode: "text-to-image" };
    if (descriptor.referenceEndpoint === endpoint) return { descriptor, mode: "reference-guided" };
  }
  return undefined;
}

export function listCreativeImageModels(): CreativeImageModelDescriptor[] {
  return CREATIVE_IMAGE_MODELS.map((key) => DESCRIPTORS[key]);
}

/**
 * Fails before a request is queued when the chosen model cannot deliver what
 * the unit needs. Never downgrades silently: a model that cannot render the
 * slide's own text, or cannot take its references, is an explicit error so an
 * editor picks another model instead of receiving a wrong-looking image.
 */
export function assertCreativeImageModelSupports(
  descriptor: CreativeImageModelDescriptor,
  { referenceCount, expectsText }: { referenceCount: number; expectsText: boolean },
): void {
  if (expectsText && !descriptor.rendersText) {
    throw new CreativeImageModelError(
      `${descriptor.label} does not render in-image text reliably; this unit needs legible text. Choose a text-capable model.`,
    );
  }
  if (referenceCount > 0 && !descriptor.referenceEndpoint) {
    throw new CreativeImageModelError(
      `${descriptor.label} does not support reference-guided generation.`,
    );
  }
  if (referenceCount > descriptor.maxReferenceImages) {
    throw new CreativeImageModelError(
      `${descriptor.label} accepts at most ${descriptor.maxReferenceImages} reference image(s); this unit supplies ${referenceCount}.`,
    );
  }
}
