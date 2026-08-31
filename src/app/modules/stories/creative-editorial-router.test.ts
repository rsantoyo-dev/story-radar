import assert from "node:assert/strict";
import test from "node:test";

import type { CreativeQualityScores } from "./creative-content.types";
import {
  classifyCreativeRepairSeverity,
  criticCandidates,
  repairCandidatesForSeverity,
  repairModelForSeverity,
  verificationCriticCandidates,
} from "./creative-editorial-router";

const passingScores: CreativeQualityScores = {
  factuality: 98,
  hook: 94,
  curiosity: 92,
  swipeReward: 92,
  continuity: 92,
  relevance: 94,
  clarity: 94,
  resolution: 92,
  cta: 92,
  overall: 94,
};

const models = {
  criticModel: "gpt-5.6-terra",
  minorRepairModel: "gpt-5.6-luna",
  structuralRepairModel: "gpt-5.6-terra",
  severeRepairModel: "gpt-5.6-sol",
};

test("routes factual failures to severe repair", () => {
  assert.equal(
    classifyCreativeRepairSeverity(
      [{ code: "UNSUPPORTED", severity: "blocker", message: "Invented fact" }],
      passingScores,
    ),
    "severe",
  );
});

test("routes hook and resolution failures to structural repair", () => {
  const severity = classifyCreativeRepairSeverity(
    [],
    { ...passingScores, hook: 89 },
  );
  assert.equal(severity, "structural");
  assert.equal(repairModelForSeverity(severity, models), "gpt-5.6-terra");
  assert.equal(
    classifyCreativeRepairSeverity(
      [{ code: "HOOK_RESOLUTION_GAP", severity: "blocker", message: "Gap" }],
      passingScores,
    ),
    "structural",
  );
});

test("uses the lightweight repair model for minor issues", () => {
  const severity = classifyCreativeRepairSeverity(
    [{ code: "WEAK_CTA", severity: "blocker", message: "Generic CTA" }],
    passingScores,
  );
  assert.equal(severity, "minor");
  assert.equal(
    repairModelForSeverity(severity, models),
    "gpt-5.6-luna",
  );
});

test("classifies a low-factuality review as severe", () => {
  const severity = classifyCreativeRepairSeverity(
    [
      {
        code: "UNSUPPORTED_NUMBER",
        severity: "blocker",
        unitOrder: 5,
        message: "Slide 5 uses 2 without support from its selected facts.",
      },
    ],
    {
      ...passingScores,
      factuality: 70,
      hook: 60,
      curiosity: 67,
      swipeReward: 76,
      continuity: 74,
      clarity: 77,
      resolution: 58,
      cta: 52,
      overall: 68,
    },
  );

  assert.equal(severity, "severe");
  assert.equal(
    repairModelForSeverity(severity, models),
    "gpt-5.6-sol",
  );
});

test("falls back after a severe repair provider failure", () => {
  assert.deepEqual(repairCandidatesForSeverity("severe", models), [
    { model: "gpt-5.6-terra", tier: "structural" },
    { model: "gpt-5.6-sol", tier: "severe" },
  ]);
});

test("escalates minor and structural repairs before using a lower fallback", () => {
  assert.deepEqual(repairCandidatesForSeverity("minor", models), [
    { model: "gpt-5.6-luna", tier: "minor" },
    { model: "gpt-5.6-terra", tier: "structural" },
    { model: "gpt-5.6-sol", tier: "severe" },
  ]);
  assert.deepEqual(repairCandidatesForSeverity("structural", models), [
    { model: "gpt-5.6-terra", tier: "structural" },
    { model: "gpt-5.6-sol", tier: "severe" },
  ]);
});

test("does not retry the same configured repair model", () => {
  const oneModel = {
    criticModel: "gpt-5.6-terra",
    minorRepairModel: "gpt-5.6-terra",
    structuralRepairModel: "gpt-5.6-terra",
    severeRepairModel: "gpt-5.6-terra",
  };

  assert.deepEqual(repairCandidatesForSeverity("severe", oneModel), [
    { model: "gpt-5.6-terra", tier: "structural" },
  ]);
});

test("falls back when the configured critic is unavailable", () => {
  const candidates = criticCandidates(models);
  assert.deepEqual(candidates, [
    "gpt-5.6-terra",
    "gpt-5.6-sol",
  ]);
  assert.equal(candidates.length, 2);
  assert.ok(!candidates.includes("gpt-5.6-luna"));
  assert.deepEqual(
    criticCandidates({
      ...models,
      minorRepairModel: models.criticModel,
    }),
    ["gpt-5.6-terra", "gpt-5.6-sol"],
  );
});

test("deduplicates the bounded editorial path", () => {
  assert.deepEqual(
    criticCandidates({
      ...models,
      severeRepairModel: models.criticModel,
    }),
    ["gpt-5.6-terra"],
  );
});

test("keeps legacy verifier routing independent when explicitly requested", () => {
  assert.deepEqual(
    verificationCriticCandidates("gpt-5.6-terra", models),
    ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  );
  assert.deepEqual(
    verificationCriticCandidates("gpt-5.6-sol", models),
    ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"],
  );
});
