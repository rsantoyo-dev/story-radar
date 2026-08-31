import assert from "node:assert/strict";
import test from "node:test";

import { buildDataVisualizationConstraint } from "./creative-image-constraints";
import type { CreativeKeyFact } from "./creative-content.types";

test("forces a qualitative visual when the evidence gives direction but no values", () => {
  const facts: CreativeKeyFact[] = [{
    id: "fact-1",
    statement:
      "First-time buyers had lower median family income than repeat buyers in most reported jurisdictions in 2023.",
    attribution: "Statistics Canada",
  }];

  const constraint = buildDataVisualizationConstraint(
    {
      visualDirection: "A comparative bar chart across the jurisdictions.",
      factIds: ["fact-1"],
    },
    facts,
  );

  assert.match(constraint, /qualitative, non-proportional/iu);
  assert.match(constraint, /Do not render axes/iu);
});

test("allows a supported chart while prohibiting invented values", () => {
  const facts: CreativeKeyFact[] = [{
    id: "fact-1",
    statement: "The median ages were 32 and 44.",
    attribution: "Statistics Canada",
  }];

  const constraint = buildDataVisualizationConstraint(
    {
      visualDirection: "A two-column bar chart.",
      factIds: ["fact-1"],
    },
    facts,
  );

  assert.match(constraint, /never invent chart categories/iu);
  assert.doesNotMatch(constraint, /does not provide enough exact category values/iu);
});

test("does not count English and Spanish renderings as two chart values", () => {
  const facts: CreativeKeyFact[] = [{
    id: "fact-1",
    statement: "The reported share was 21.8%.",
    attribution: "Statistics Canada",
    claimGuard: {
      certainty: "reported",
      allowedNumbers: ["21.8%", "21,8 %"],
      requiredPhrases: [],
      forbiddenPhrases: [],
      scopePhrases: [],
    },
  }];

  const constraint = buildDataVisualizationConstraint(
    {
      visualDirection: "A comparative bar chart.",
      factIds: ["fact-1"],
    },
    facts,
  );

  assert.match(constraint, /does not provide enough exact category values/iu);
});
