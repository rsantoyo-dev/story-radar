import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCreativeBriefOverrides,
  isCreativeStoryStructure,
  normalizeCreativeBriefOverrides,
  type CreativeProfile,
} from "./creative-content.types";

const profile = {
  name: "Topic",
  storyStructure: "auto",
  framingStrategy: "reader-consequence",
  conversionGoal: "followers",
} as CreativeProfile;

test("overrides replace only the settings they name and never mutate the topic profile", () => {
  const applied = applyCreativeBriefOverrides(profile, { storyStructure: "hook-list", conversionGoal: "saves" });
  assert.equal(applied.storyStructure, "hook-list");
  assert.equal(applied.conversionGoal, "saves");
  assert.equal(applied.framingStrategy, "reader-consequence", "an unnamed setting keeps the profile value");
  assert.equal(profile.storyStructure, "auto");
  assert.equal(profile.conversionGoal, "followers");
  assert.equal(applyCreativeBriefOverrides(profile, undefined), profile);
  assert.equal(applyCreativeBriefOverrides(profile, {}), profile, "an empty override object is a no-op");
  assert.equal(applyCreativeBriefOverrides(profile, { framingStrategy: undefined }), profile);
});

test("normalizing drops empty keys and reports nothing for a no-op override", () => {
  assert.equal(normalizeCreativeBriefOverrides(undefined), undefined);
  assert.equal(normalizeCreativeBriefOverrides({}), undefined);
  assert.equal(normalizeCreativeBriefOverrides({ storyStructure: undefined }), undefined);
  assert.deepEqual(
    normalizeCreativeBriefOverrides({ framingStrategy: "explainer", storyStructure: undefined }),
    { framingStrategy: "explainer" },
  );
});

test("hook-list is a story structure; unknown values are not", () => {
  assert.ok(isCreativeStoryStructure("hook-list"));
  assert.ok(isCreativeStoryStructure("hook-steps"));
  assert.ok(isCreativeStoryStructure("auto"));
  assert.ok(!isCreativeStoryStructure("listicle"));
  assert.ok(!isCreativeStoryStructure(undefined));
});
