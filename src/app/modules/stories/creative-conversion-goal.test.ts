import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATIVE_CONVERSION_GOALS,
  DEFAULT_CREATIVE_CONVERSION_GOAL,
  isCreativeConversionGoal,
} from "./creative-content.types";

test("creative conversion goals keep follower growth as the explicit default", () => {
  assert.equal(DEFAULT_CREATIVE_CONVERSION_GOAL, "followers");
  assert.deepEqual(CREATIVE_CONVERSION_GOALS, [
    "followers",
    "discussion",
    "saves",
    "shares",
  ]);
});

test("creative conversion goal validation rejects unknown and empty values", () => {
  assert.equal(isCreativeConversionGoal("followers"), true);
  assert.equal(isCreativeConversionGoal("discussion"), true);
  assert.equal(isCreativeConversionGoal("clicks"), false);
  assert.equal(isCreativeConversionGoal(""), false);
  assert.equal(isCreativeConversionGoal(undefined), false);
});
