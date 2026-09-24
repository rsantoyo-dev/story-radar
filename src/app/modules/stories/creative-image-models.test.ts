import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATIVE_IMAGE_MODELS,
  CreativeImageModelError,
  assertCreativeImageModelSupports,
  creativeImageEndpoint,
  creativeImageModel,
  findCreativeImageModelByEndpoint,
  findCreativeImageModelByProviderModel,
  isCreativeImageModel,
  prepareIdeogramPrompt,
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
    assert.equal(
      textToImage.prompt,
      model.preparePrompt?.(base.prompt) ?? base.prompt,
      `${key} must forward its prepared prompt`,
    );
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

test("Ideogram 4 uses its text-to-image and image-to-image contracts", () => {
  const ideogram = creativeImageModel("ideogram");
  assert.equal(ideogram.providerModel, "ideogram/v4");
  assert.equal(ideogram.textToImageEndpoint, "ideogram/v4");
  assert.equal(ideogram.referenceEndpoint, "ideogram/v4/image-to-image");
  assert.equal(ideogram.maxReferenceImages, 1);
  assert.equal(ideogram.rendersText, true);
  assert.equal(ideogram.supportsImageQuality, true);
  assert.equal(ideogram.preparePrompt, prepareIdeogramPrompt);

  const base = {
    prompt: "A poster with the exact words: New update",
    width: 1088,
    height: 1360,
    aspectRatio: "4:5" as const,
    imageQuality: "low" as const,
    imageUrls: [],
  };
  const textToImage = ideogram.buildInput(base);
  assert.deepEqual(textToImage.image_size, { width: 1088, height: 1360 });
  assert.equal(textToImage.expansion_model, "None");
  assert.equal(textToImage.rendering_speed, "TURBO");
  assert.equal(textToImage.image_url, undefined);

  const prepared = prepareIdeogramPrompt([
    "Create a finished social-media graphic.",
    "Overall concept: one clear subject.",
    "HARD SUBJECT COUNT: do not repeat it.",
    "Visual direction: a quiet editorial scene.",
    "<VISIBLE_TEXT>\nExact headline\n</VISIBLE_TEXT>",
  ].join("\n\n"));
  assert.match(prepared, /Overall concept: one clear subject/);
  assert.match(prepared, /Exact headline/);
  assert.doesNotMatch(prepared, /HARD SUBJECT COUNT/);

  const guided = ideogram.buildInput({
    ...base,
    imageQuality: "high",
    imageUrls: ["https://fal.media/reference.png", "https://fal.media/ignored.png"],
  });
  assert.equal(guided.rendering_speed, "QUALITY");
  assert.equal(guided.image_url, "https://fal.media/reference.png");
  assert.equal(guided.strength, 0.45);
  assert.equal(guided.image_urls, undefined);

  assert.equal(
    ideogram.buildInput({ ...base, imageQuality: "medium" }).rendering_speed,
    "BALANCED",
  );
  assert.equal(
    ideogram.buildInput({ ...base, imageQuality: "auto" }).rendering_speed,
    "BALANCED",
  );
  assert.throws(
    () => assertCreativeImageModelSupports(ideogram, { referenceCount: 2, expectsText: false }),
    CreativeImageModelError,
  );
});

test("GPT Image defaults to 2.5 Sunburst, with no input_fidelity field on its edit schema", () => {
  const model = creativeImageModel("gpt-image");
  assert.equal(model.providerModel, "openai/gpt-image-2.5/sunburst/text-to-image");
  assert.equal(model.textToImageEndpoint, "openai/gpt-image-2.5/sunburst/text-to-image");
  assert.equal(model.referenceEndpoint, "openai/gpt-image-2.5/sunburst/edit");
  const guided = model.buildInput({ prompt: "x", width: 1088, height: 1360, aspectRatio: "4:5", imageQuality: "high", imageUrls: ["https://fal.media/a.png"] });
  assert.deepEqual(guided.image_urls, ["https://fal.media/a.png"]);
  assert.equal(guided.input_fidelity, undefined);
});

test("stored endpoints resolve back to their model and mode; two retired GPT Image tiers (2, then 2.5 Flare) keep resolving to gpt-image for regeneration", () => {
  // The catalog's live default is 2.5 Sunburst, resolved from its own endpoints...
  const sunburst = findCreativeImageModelByEndpoint("openai/gpt-image-2.5/sunburst/text-to-image");
  assert.equal(sunburst?.descriptor.key, "gpt-image");
  assert.equal(sunburst?.mode, "text-to-image");
  assert.equal(findCreativeImageModelByEndpoint("openai/gpt-image-2.5/sunburst/edit")?.mode, "reference-guided");
  // ...but an asset generated while "gpt-image" meant an earlier build still
  // resolves, by its exact retired endpoint, to the same key and correct mode
  // — never to Sunburst's endpoint — so a regeneration keeps hitting the
  // model it was created with, for every tier this key has ever named.
  for (const [textToImage, edit] of [["openai/gpt-image-2", "openai/gpt-image-2/edit"], ["openai/gpt-image-2.5/flare/text-to-image", "openai/gpt-image-2.5/flare/edit"]]) {
    const legacy = findCreativeImageModelByEndpoint(textToImage);
    assert.equal(legacy?.descriptor.key, "gpt-image", textToImage);
    assert.equal(legacy?.mode, "text-to-image", textToImage);
    assert.equal(findCreativeImageModelByEndpoint(edit)?.mode, "reference-guided", edit);
    assert.equal(findCreativeImageModelByProviderModel(textToImage)?.key, "gpt-image", textToImage);
  }
  assert.equal(findCreativeImageModelByEndpoint("some/unknown-endpoint"), undefined);
  assert.equal(findCreativeImageModelByProviderModel("some/unknown-model"), undefined);

  for (const key of CREATIVE_IMAGE_MODELS) {
    const model = creativeImageModel(key);
    assert.equal(findCreativeImageModelByEndpoint(creativeImageEndpoint(model, "text-to-image"))?.descriptor.key, key);
  }
});

test("only catalog keys are accepted as logical model names", () => {
  assert.ok(isCreativeImageModel("flux-pro"));
  assert.ok(isCreativeImageModel("ideogram"));
  // A provider id is not a logical name; the catalog owns that mapping.
  assert.equal(isCreativeImageModel("fal-ai/flux-pro/v1.1"), false);
  assert.equal(isCreativeImageModel("nano_banana"), false);
});
