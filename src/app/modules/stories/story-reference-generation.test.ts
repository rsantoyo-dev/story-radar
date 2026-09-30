import assert from "node:assert/strict";
import test from "node:test";

import { photoLedVisualDirection, storyReferencePrompt, type StoryGenerationReference } from "./story-reference-generation";

const reference = (purpose: StoryGenerationReference["purpose"]): StoryGenerationReference => ({
  id: "photo", topicId: "t", storyId: "s", name: "sansonnets", description: "Forest trail in the park", provenance: "Own photo",
  purpose, objectKey: "private/photo", sha256: "hash", contentType: "image/webp", fileName: "photo.webp", active: true, providerTransmissionAllowed: true,
});

test("an attached place photo takes precedence over symbolic motifs and 'do not depict the real place'", () => {
  const prompt = storyReferencePrompt([reference("place")], 0);
  assert.match(prompt, /PRECEDENCE: The attached photograph is this slide's main visual/);
  assert.match(prompt, /not to depict the real place/);
  assert.match(prompt, /adapting season and light/);
});

test("a style-only reference never claims precedence over the slide's subject", () => {
  assert.doesNotMatch(storyReferencePrompt([reference("style")], 0), /PRECEDENCE/);
});

test("a documentary portrait is never sent to the model", () => {
  assert.throws(() => storyReferencePrompt([reference("documentary-portrait")], 0), /never sent to the image model/);
});

test("an attached place photo rewrites a contradicting symbolic direction around the photo", () => {
  const direction = "Illustration éditoriale : une balançoire simplifiée, un ballon uni et un groupe de feuilles, sans représenter les installations ou le boisé réels. Fond crème #FFF5EA; motifs bleu marine #0B2A5B.";
  const rewritten = photoLedVisualDirection(direction, [{ purpose: "place" }]);
  assert.match(rewritten, /^Build this slide around the attached photograph/);
  assert.match(rewritten, /ignore its motifs and any instruction not to depict the real place/);
  assert.ok(rewritten.includes("#FFF5EA") && rewritten.includes("#0B2A5B"), "palette cues are kept");
});

test("without a photo-led reference the writer's direction is untouched", () => {
  const direction = "Abstract paper collage.";
  assert.equal(photoLedVisualDirection(direction, []), direction);
  assert.equal(photoLedVisualDirection(direction, [{ purpose: "style" }]), direction);
});
