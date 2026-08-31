import assert from "node:assert/strict";
import test from "node:test";

import type { CreativeQualityIssue } from "./creative-content.types";
import { reconcileCriticIssuesWithDeterministicValidation } from "./creative-issue-reconciliation";

const criticUnsupportedNumber: CreativeQualityIssue = {
  code: "UNSUPPORTED_NUMBER",
  severity: "blocker",
  message: "Slide 2 uses 21.8% without support.",
  unitOrder: 2,
};

test("demotes an unsupported-number critic blocker that deterministic validation does not confirm", () => {
  assert.deepEqual(
    reconcileCriticIssuesWithDeterministicValidation(
      [criticUnsupportedNumber],
      [],
    ),
    [
      {
        code: "CRITIC_VALIDATOR_DISAGREEMENT",
        severity: "warning",
        message:
          "The critic reported an unsupported number on slide 2, but deterministic validation did not confirm it in the same location. Critic detail: Slide 2 uses 21.8% without support.",
        unitOrder: 2,
      },
    ],
  );
});

test("does not let the same deterministic code on a different slide confirm the critic blocker", () => {
  const [issue] = reconcileCriticIssuesWithDeterministicValidation(
    [criticUnsupportedNumber],
    [
      {
        code: "UNSUPPORTED_NUMBER",
        severity: "blocker",
        message: "Slide 3 contains a genuinely unsupported number.",
        unitOrder: 3,
      },
    ],
  );

  assert.equal(issue?.code, "CRITIC_VALIDATOR_DISAGREEMENT");
  assert.equal(issue?.severity, "warning");
  assert.equal(issue?.unitOrder, 2);
});

test("retains a genuine unsupported-number blocker confirmed on the same slide", () => {
  const deterministicIssue: CreativeQualityIssue = {
    code: "UNSUPPORTED_NUMBER",
    severity: "blocker",
    message: "Slide 2 contains a genuinely unsupported number.",
    unitOrder: 2,
  };

  assert.deepEqual(
    reconcileCriticIssuesWithDeterministicValidation(
      [criticUnsupportedNumber],
      [deterministicIssue],
    ),
    [criticUnsupportedNumber],
  );
});

test("leaves critic issues that are not mechanically decidable unchanged", () => {
  const issue: CreativeQualityIssue = {
    code: "LOST_QUALIFIER",
    severity: "blocker",
    message: "The draft removed an important qualifier.",
    unitOrder: 2,
  };

  assert.deepEqual(
    reconcileCriticIssuesWithDeterministicValidation([issue], []),
    [issue],
  );
});
