import type { CreativeAspectRatio } from "./creative-content.types";
import type { CreativeImageQuality } from "./creative-content.types";

/**
 * Logical image-model names. The profile, the env default and every persisted
 * asset refer to these, never to a fal.ai endpoint id, so a provider can move
 * or version an endpoint without rewriting stored history.
 */
export const CREATIVE_IMAGE_MODELS = ["gpt-image", "flux-pro", "nano-banana", "ideogram"] as const;
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
  /** Whether the workspace quality selector changes this model's request. */
  supportsImageQuality: boolean;
  /** Optional provider-specific prompt normalization. */
  preparePrompt?: (prompt: string) => string;
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
    label: "GPT Image 2.5 Sunburst",
    providerModel: "openai/gpt-image-2.5/sunburst/text-to-image",
    textToImageEndpoint: "openai/gpt-image-2.5/sunburst/text-to-image",
    referenceEndpoint: "openai/gpt-image-2.5/sunburst/edit",
    maxReferenceImages: 16,
    supportsImageQuality: true,
    rendersText: true,
    // Flare and Sunburst are two tunings of the identical API/schema (same
    // price at every quality tier); Sunburst spends longer per image for
    // fidelity that survives being printed, enlarged or cropped into —
    // verified against fal's own comparison, not just marketing copy.
    // 2.5's edit schema has no input_fidelity field (verified against fal's
    // published request schema); the prior gpt-image-2 build included it.
    buildInput: ({ prompt, width, height, imageQuality, imageUrls }) => ({
      prompt,
      image_size: { width, height },
      ...(imageUrls.length > 0 ? { image_urls: [...imageUrls] } : {}),
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
    supportsImageQuality: false,
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
    supportsImageQuality: false,
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
  ideogram: {
    key: "ideogram",
    label: "Ideogram 4",
    providerModel: "ideogram/v4",
    textToImageEndpoint: "ideogram/v4",
    referenceEndpoint: "ideogram/v4/image-to-image",
    maxReferenceImages: 1,
    supportsImageQuality: true,
    rendersText: true,
    preparePrompt: prepareIdeogramPrompt,
    buildInput: ({ prompt, width, height, imageQuality, imageUrls }) => ({
      prompt: prepareIdeogramPrompt(prompt),
      // Ideogram accepts custom dimensions directly. The shared post-step
      // still normalizes the result to the requested publication canvas.
      image_size: { width, height },
      // Keep the saved prompt authoritative; expansion can alter editorial
      // wording that must remain grounded in the Intelligent Draft.
      expansion_model: "None",
      rendering_speed:
        imageQuality === "low"
          ? "TURBO"
          : imageQuality === "high"
            ? "QUALITY"
            : "BALANCED",
      num_images: 1,
      output_format: "png",
      ...(imageUrls.length > 0
        ? {
            image_url: imageUrls[0],
            // Keep the supplied identity/composition instead of letting the
            // edit endpoint replace most of the reference at its 0.8 default.
            strength: 0.45,
          }
        : {}),
    }),
  },
};

/**
 * Ideogram is strong at following a compact art brief, but the shared prompt
 * also contains internal validation contracts for other providers. Passing
 * those contracts verbatim makes them compete with the actual scene and can
 * cause the model to depict the instructions themselves. Keep the high-signal
 * scene, style, character, safety and visible-copy sections only.
 */
export function prepareIdeogramPrompt(prompt: string): string {
  const paragraphs = prompt
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const block = (start: string, end: string): string | undefined => {
    const begin = prompt.indexOf(start);
    if (begin < 0) return undefined;
    const contentStart = begin + start.length;
    const finish = prompt.indexOf(end, contentStart);
    return prompt.slice(contentStart, finish < 0 ? undefined : finish).trim() || undefined;
  };
  const first = paragraphs[0];
  const keep = (prefix: string): string | undefined =>
    paragraphs.find((paragraph) => paragraph.startsWith(prefix));
  const visibleText = block("<VISIBLE_TEXT>", "</VISIBLE_TEXT>");
  const campaignGuide = block(
    "<VISUAL_CAMPAIGN_GUIDE>",
    "</VISUAL_CAMPAIGN_GUIDE>",
  );
  const characterLines = paragraphs.filter((paragraph) =>
    /^Character .+?:/u.test(paragraph),
  );
  const dataLock = paragraphs.find((paragraph) =>
    paragraph.startsWith("HARD DATA-INTEGRITY LOCK:"),
  );
  const parts = [
    "Create one polished editorial image for social media. Focus on the scene and visual idea; do not depict these instructions as objects or text.",
    first,
    keep("Deliverable:"),
    keep("Overall concept:"),
    keep("Visual direction:"),
    keep("Use an intentional typography-led graphic composition") ||
      keep("Create a strong editorial illustration"),
    characterLines.length > 0
      ? `Selected character guidance:\n${characterLines.join("\n")}`
      : undefined,
    dataLock,
    campaignGuide ? `Visual style guide:\n${campaignGuide}` : undefined,
    "Use a clear focal subject, coherent composition, strong contrast and generous safe margins. Do not add logos, watermarks, UI elements or extra words.",
    visibleText
      ? `Render these visible words exactly once, preserving spelling and punctuation:\n${visibleText}`
      : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join("\n\n");
}

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
 * Endpoints a catalog entry used before its provider build moved on. A
 * regeneration reuses the literal endpoint stored on the asset, never this
 * map's current `textToImageEndpoint`/`referenceEndpoint` — that is what lets
 * "gpt-image" repoint to a newer build while a historical asset keeps
 * resolving, and keeps producing, against the exact model it was created
 * with (`falModelForAsset` in manage-creative-assets.ts).
 */
const LEGACY_ENDPOINTS: Record<string, { key: CreativeImageModel; mode: CreativeImageGenerationMode }> = {
  "openai/gpt-image-2": { key: "gpt-image", mode: "text-to-image" },
  "openai/gpt-image-2/edit": { key: "gpt-image", mode: "reference-guided" },
  "openai/gpt-image-2.5/flare/text-to-image": { key: "gpt-image", mode: "text-to-image" },
  "openai/gpt-image-2.5/flare/edit": { key: "gpt-image", mode: "reference-guided" },
};
/** Provider model ids a catalog entry's `providerModel` used to carry, for the same reason as {@link LEGACY_ENDPOINTS}. */
const LEGACY_PROVIDER_MODELS: Record<string, CreativeImageModel> = {
  "openai/gpt-image-2": "gpt-image",
  "openai/gpt-image-2.5/flare/text-to-image": "gpt-image",
};

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
  const legacy = LEGACY_ENDPOINTS[endpoint];
  return legacy ? { descriptor: DESCRIPTORS[legacy.key], mode: legacy.mode } : undefined;
}

export function listCreativeImageModels(): CreativeImageModelDescriptor[] {
  return CREATIVE_IMAGE_MODELS.map((key) => DESCRIPTORS[key]);
}

export function findCreativeImageModelByProviderModel(
  providerModel: string,
): CreativeImageModelDescriptor | undefined {
  return (
    Object.values(DESCRIPTORS).find((descriptor) => descriptor.providerModel === providerModel) ??
    (LEGACY_PROVIDER_MODELS[providerModel] ? DESCRIPTORS[LEGACY_PROVIDER_MODELS[providerModel]] : undefined)
  );
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
