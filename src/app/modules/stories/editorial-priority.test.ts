import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_RESEARCH_CONFIDENCE_WEIGHT,
  calculateEditorialPriority,
  calculateGrowthScore,
  GROWTH_POTENTIAL_WEIGHTS,
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

test("calculates Growth Score independently from Editorial Priority", () => {
  const editorialPriority = calculateEditorialPriority(
    signals,
    DEFAULT_EDITORIAL_PROFILE_WEIGHTS,
  );
  const growthScore = calculateGrowthScore({
    newAudienceReach: 90,
    viralPotential: 80,
    constructiveTension: 70,
    explainability: 100,
  });

  assert.deepEqual(GROWTH_POTENTIAL_WEIGHTS, {
    newAudienceReach: 0.35,
    viralPotential: 0.3,
    constructiveTension: 0.2,
    explainability: 0.15,
  });
  assert.equal(growthScore, 85);
  assert.equal(
    calculateEditorialPriority(signals, DEFAULT_EDITORIAL_PROFILE_WEIGHTS),
    editorialPriority,
  );
});

test("rejects invalid Growth Score inputs", () => {
  assert.throws(
    () =>
      calculateGrowthScore({
        newAudienceReach: 101,
        viralPotential: 80,
        constructiveTension: 70,
        explainability: 100,
      }),
    /newAudienceReach/,
  );
});
