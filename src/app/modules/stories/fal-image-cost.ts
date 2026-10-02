/**
 * Estimated provider cost of one fal.ai image. fal reports no cost or token
 * usage on results, so this applies the published rates (checked on fal's
 * model pages, October 1, 2026). Every default can be overridden with
 * FAL_IMAGE_PRICES_JSON; an endpoint with no known rate returns undefined so
 * the spend is still recorded, as unpriced, instead of guessed.
 */

export type FalImageCostInput = {
  endpoint: string;
  quality: string;
  width: number;
  height: number;
  promptCharacters: number;
  referenceImages: number;
};

export type FalImageRates = {
  gptImage: {
    /** USD per image by canonical size ("WxH") and quality, before prompt and reference tokens. */
    table: Record<string, Record<string, number>>;
    textInputPer1M: number;
    imageInputPer1M: number;
    /** Approximate input tokens per reference image. */
    referenceImageTokens: number;
  };
  nanoBanana: { perImageUsd: number; resolutionFactor: number };
  fluxPro: { perMegapixelUsd: number };
  ideogram: { perMegapixelUsd: Record<string, number> };
};

export const DEFAULT_FAL_IMAGE_RATES: FalImageRates = {
  gptImage: {
    table: {
      "1024x768": { low: 0.00402, medium: 0.00903, high: 0.03612 },
      "1024x1024": { low: 0.00588, medium: 0.01317, high: 0.05268 },
      "1024x1536": { low: 0.00474, medium: 0.01029, high: 0.04116 },
      "1920x1080": { low: 0.00441, medium: 0.01029, high: 0.0396 },
      "2560x1440": { low: 0.00615, medium: 0.01434, high: 0.05529 },
      "3840x2160": { low: 0.01113, medium: 0.02595, high: 0.10008 },
    },
    textInputPer1M: 5,
    imageInputPer1M: 8,
    referenceImageTokens: 1_600,
  },
  // 2K outputs bill at 1.5x the 1K rate; the app always requests 2K.
  nanoBanana: { perImageUsd: 0.08, resolutionFactor: 1.5 },
  fluxPro: { perMegapixelUsd: 0.04 },
  // TURBO / BALANCED / QUALITY, mapped from the workspace quality.
  ideogram: { perMegapixelUsd: { low: 0.0075, medium: 0.015, high: 0.025 } },
};

export function falImageRates(raw = process.env.FAL_IMAGE_PRICES_JSON): FalImageRates {
  if (!raw?.trim()) return DEFAULT_FAL_IMAGE_RATES;
  try {
    const parsed = JSON.parse(raw) as Partial<FalImageRates>;
    return {
      gptImage: { ...DEFAULT_FAL_IMAGE_RATES.gptImage, ...parsed.gptImage },
      nanoBanana: { ...DEFAULT_FAL_IMAGE_RATES.nanoBanana, ...parsed.nanoBanana },
      fluxPro: { ...DEFAULT_FAL_IMAGE_RATES.fluxPro, ...parsed.fluxPro },
      ideogram: { ...DEFAULT_FAL_IMAGE_RATES.ideogram, ...parsed.ideogram },
    };
  } catch {
    return DEFAULT_FAL_IMAGE_RATES;
  }
}

/** "auto" lets the provider choose; it is priced as high so the estimate never understates. */
const qualityTier = (quality: string) => (quality === "low" || quality === "medium" ? quality : "high");

export function estimateFalImageCost(
  input: FalImageCostInput,
  rates: FalImageRates = falImageRates(),
): { costMicros: number; rate: Record<string, unknown> } | undefined {
  const megapixels = (input.width * input.height) / 1_000_000;
  const tier = qualityTier(input.quality);
  let usd: number;
  let rate: Record<string, unknown>;
  if (input.endpoint.startsWith("openai/gpt-image")) {
    const pixels = input.width * input.height;
    const [size, prices] = Object.entries(rates.gptImage.table)
      .sort(([a], [b]) => Math.abs(area(a) - pixels) - Math.abs(area(b) - pixels))[0];
    const base = prices[tier] ?? prices.high;
    const promptTokens = Math.ceil(input.promptCharacters / 4);
    const referenceTokens = input.referenceImages * rates.gptImage.referenceImageTokens;
    usd = base + (promptTokens * rates.gptImage.textInputPer1M + referenceTokens * rates.gptImage.imageInputPer1M) / 1_000_000;
    rate = { family: "gpt-image", size, tier, baseUsd: base, promptTokens, referenceTokens,
      textInputPer1M: rates.gptImage.textInputPer1M, imageInputPer1M: rates.gptImage.imageInputPer1M };
  } else if (input.endpoint.startsWith("fal-ai/nano-banana")) {
    usd = rates.nanoBanana.perImageUsd * rates.nanoBanana.resolutionFactor;
    rate = { family: "nano-banana", ...rates.nanoBanana };
  } else if (input.endpoint.startsWith("fal-ai/flux-pro")) {
    usd = rates.fluxPro.perMegapixelUsd * Math.ceil(megapixels);
    rate = { family: "flux-pro", ...rates.fluxPro, billedMegapixels: Math.ceil(megapixels) };
  } else if (input.endpoint.startsWith("ideogram/")) {
    const perMegapixel = rates.ideogram.perMegapixelUsd[tier] ?? rates.ideogram.perMegapixelUsd.high;
    usd = perMegapixel * megapixels;
    rate = { family: "ideogram", tier, perMegapixelUsd: perMegapixel, megapixels: Math.round(megapixels * 1000) / 1000 };
  } else {
    return undefined;
  }
  return { costMicros: Math.ceil(usd * 1_000_000), rate: { ...rate, checked: "2026-10-01" } };
}

function area(size: string): number {
  const [width, height] = size.split("x").map(Number);
  return width * height;
}
