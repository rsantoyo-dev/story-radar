import assert from "node:assert/strict";
import test from "node:test";

import type { CreativeQualityScores } from "./creative-content.types";
import {
  classifyCreativeRepairSeverity,
  evidenceSupportsSevereRepair,
  repairModelForSeverity,
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
  assert.equal(
    classifyCreativeRepairSeverity([], { ...passingScores, hook: 89 }),
    "structural",
  );
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
    repairModelForSeverity(severity, {
      criticModel: "terra",
      minorRepairModel: "luna",
      structuralRepairModel: "terra",
      severeRepairModel: "sol",
    }),
    "luna",
  );
});

test("severe repair requires sufficient brief evidence", () => {
  assert.equal(evidenceSupportsSevereRepair("sufficient"), true);
  assert.equal(evidenceSupportsSevereRepair("limited"), false);
  assert.equal(evidenceSupportsSevereRepair("insufficient"), false);
});
