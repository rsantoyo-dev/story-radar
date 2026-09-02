import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_RESEARCH_CONFIDENCE_WEIGHT,
  calculateEditorialPriority,
} from "./editorial-priority";
import { DEFAULT_EDITORIAL_PROFILE_WEIGHTS } from "./editorial-profile.types";

const signals = {
  topicFit: 80,
  evidenceDepth: 70,
  noveltyTimeliness: 60,
  audienceValue: 90,
  socialPotential: 50,
};

test("keeps profile signals as the main Editorial Priority input", () => {
  const profilePriority = calculateEditorialPriority(
    signals,
    DEFAULT_EDITORIAL_PROFILE_WEIGHTS,
  );
  const researchPriority = calculateEditorialPriority(
    signals,
    DEFAULT_EDITORIAL_PROFILE_WEIGHTS,
    95,
  );

  assert.equal(AI_RESEARCH_CONFIDENCE_WEIGHT, 0.2);
  assert.equal(profilePriority, 74);
  assert.equal(researchPriority, 78);
});

test("rejects an invalid AI research confidence", () => {
  assert.throws(
    () =>
      calculateEditorialPriority(
        signals,
        DEFAULT_EDITORIAL_PROFILE_WEIGHTS,
        101,
      ),
    /researchConfidence/,
  );
});
