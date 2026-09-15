import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATIVE_IMAGE_MODELS,
  CreativeImageModelError,
  assertCreativeImageModelSupports,
  creativeImageEndpoint,
  creativeImageModel,
  findCreativeImageModelByEndpoint,
  isCreativeImageModel,
} from "./creative-image-models";

test("every catalog model builds a complete input for both generation modes", () => {
  for (const key of CREATIVE_IMAGE_MODELS) {
    const model = creativeImageModel(key);
    const base = {
      prompt: "A quiet street at dusk",
      width: 1080,
      height: 1350,
      aspectRatio: "4:5" as const,
      imageQuality: "high" as const,
      imageUrls: [],
    };

    const textToImage = model.buildInput(base);
    assert.equal(textToImage.prompt, base.prompt, `${key} must forward the prompt`);
    assert.equal(textToImage.output_format, "png", `${key} must request PNG`);
    // Either exact pixels or a ratio: both are normalized to the target size
    // afterwards, but one of the two must reach the provider.
    assert.ok(
      textToImage.image_size !== undefined || textToImage.aspect_ratio !== undefined,
      `${key} must express the requested geometry`,
    );
    // Text-to-image must never smuggle reference inputs.
    assert.equal(textToImage.image_urls, undefined);
    assert.equal(textToImage.image_url, undefined);

    if (!model.referenceEndpoint) continue;
    const guided = model.buildInput({ ...base, imageUrls: ["https://fal.media/a.png"] });
    assert.ok(
      guided.image_urls !== undefined || guided.image_url !== undefined,
      `${key} must pass references to its edit endpoint`,
    );
  }
});

test("a model that cannot render text is refused for a unit that needs text", () => {
  const flux = creativeImageModel("flux-pro");
  assert.equal(flux.rendersText, false);
  assert.throws(
    () => assertCreativeImageModelSupports(flux, { referenceCount: 0, expectsText: true }),
    CreativeImageModelError,
  );
  // The same model is fine for imagery-led units with no lettering.
  assert.doesNotThrow(() =>
    assertCreativeImageModelSupports(flux, { referenceCount: 0, expectsText: false }),
  );
});

test("reference limits are enforced per model instead of one shared ceiling", () => {
  // Flux conditions on a single image; GPT Image accepts a set.
  assert.throws(
    () => assertCreativeImageModelSupports(creativeImageModel("flux-pro"), { referenceCount: 2, expectsText: false }),
    CreativeImageModelError,
  );
  assert.doesNotThrow(() =>
    assertCreativeImageModelSupports(creativeImageModel("gpt-image"), { referenceCount: 2, expectsText: false }),
  );
});

test("stored endpoints resolve back to their model and mode, including legacy GPT assets", () => {
  // Assets written before the catalog existed carry these exact endpoints.
  const legacy = findCreativeImageModelByEndpoint("openai/gpt-image-2");
  assert.equal(legacy?.descriptor.key, "gpt-image");
  assert.equal(legacy?.mode, "text-to-image");
  assert.equal(findCreativeImageModelByEndpoint("openai/gpt-image-2/edit")?.mode, "reference-guided");
  assert.equal(findCreativeImageModelByEndpoint("some/unknown-endpoint"), undefined);

  for (const key of CREATIVE_IMAGE_MODELS) {
    const model = creativeImageModel(key);
    assert.equal(findCreativeImageModelByEndpoint(creativeImageEndpoint(model, "text-to-image"))?.descriptor.key, key);
  }
});

test("only catalog keys are accepted as logical model names", () => {
  assert.ok(isCreativeImageModel("flux-pro"));
  // A provider id is not a logical name; the catalog owns that mapping.
  assert.equal(isCreativeImageModel("fal-ai/flux-pro/v1.1"), false);
  assert.equal(isCreativeImageModel("nano_banana"), false);
});
