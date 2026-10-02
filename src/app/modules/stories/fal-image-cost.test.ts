import assert from "node:assert/strict";
import test from "node:test";

import { estimateFalImageCost, falImageRates } from "./fal-image-cost";

const slide = { width: 1080, height: 1350, promptCharacters: 8_000, referenceImages: 0 };

test("GPT Image uses the nearest published size and quality, plus prompt and reference tokens", () => {
  const low = estimateFalImageCost({ ...slide, endpoint: "openai/gpt-image-2.5/sunburst/text-to-image", quality: "low" })!;
  // 1080x1350 is nearest to 1024x1536: $0.00474 + 2,000 prompt tokens at $5/1M.
  assert.equal(low.costMicros, 4_740 + 10_000);
  assert.equal(low.rate.size, "1024x1536");
  const edit = estimateFalImageCost({ ...slide, endpoint: "openai/gpt-image-2.5/sunburst/edit", quality: "high", referenceImages: 2 })!;
  assert.equal(edit.costMicros, 41_160 + 10_000 + 25_600);
});

test("auto quality is priced as high so the estimate never understates", () => {
  const auto = estimateFalImageCost({ ...slide, endpoint: "openai/gpt-image-2.5/sunburst/text-to-image", quality: "auto" })!;
  assert.equal(auto.rate.tier, "high");
});

test("per-image and per-megapixel families follow their published rates", () => {
  assert.equal(estimateFalImageCost({ ...slide, endpoint: "fal-ai/nano-banana-2/edit", quality: "low" })!.costMicros, 120_000);
  // 1.458 MP rounds up to 2 billed megapixels.
  assert.equal(estimateFalImageCost({ ...slide, endpoint: "fal-ai/flux-pro/v1.1", quality: "high" })!.costMicros, 80_000);
  assert.equal(estimateFalImageCost({ ...slide, endpoint: "ideogram/v4", quality: "medium" })!.costMicros, Math.ceil(0.015 * 1.458 * 1_000_000));
});

test("an unknown endpoint is left unpriced rather than guessed", () => {
  assert.equal(estimateFalImageCost({ ...slide, endpoint: "fal-ai/some-new-model", quality: "high" }), undefined);
});

test("rates can be overridden from the environment, falling back on bad JSON", () => {
  const rates = falImageRates('{"nanoBanana":{"perImageUsd":0.1}}');
  assert.equal(rates.nanoBanana.perImageUsd, 0.1);
  assert.equal(rates.nanoBanana.resolutionFactor, 1.5);
  assert.equal(falImageRates("{not json").fluxPro.perMegapixelUsd, 0.04);
});
