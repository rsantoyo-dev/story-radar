import assert from "node:assert/strict";
import test from "node:test";

import { CreativeWritingValidationError, narrativeFormsField, writingGuidanceValue } from "./creative-writing-validation";

test("the writing rules are trimmed text under 3,000 characters; none is an empty string", () => {
  assert.equal(writingGuidanceValue("  Café, no marrón.\r\nNevera.  "), "Café, no marrón.\nNevera.");
  assert.equal(writingGuidanceValue(undefined), "");
  assert.throws(() => writingGuidanceValue(4), CreativeWritingValidationError);
  assert.throws(() => writingGuidanceValue("x".repeat(3_001)), /under 3,000 characters/);
});

test("the narrative forms keep their order and classic; every form, or none listed, is no restriction", () => {
  assert.deepEqual(narrativeFormsField(["panorama", "traveling-object"]), { narrativeForms: ["classic", "traveling-object", "panorama"] });
  assert.deepEqual(narrativeFormsField([]), { narrativeForms: ["classic"] });
  assert.deepEqual(narrativeFormsField(["classic", "character-guide", "traveling-object", "panorama", "follow-the-line"]), {});
  assert.deepEqual(narrativeFormsField(null), {});
  assert.throws(() => narrativeFormsField(["time-machine"]), CreativeWritingValidationError);
  assert.throws(() => narrativeFormsField("classic"), CreativeWritingValidationError);
});
