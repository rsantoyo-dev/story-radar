import assert from "node:assert/strict";
import test from "node:test";

import type {
  CreativeKeyFact,
  GeneratedCreativeDraft,
} from "./creative-content.types";
import {
  deterministicCreativeQualityIssues,
  repairDeterministicCreativeCopy,
} from "./creative-quality";

const facts: CreativeKeyFact[] = [
  {
    id: "fact-1",
    statement: "Automated audits detect design-token violations in CI.",
    sourceExcerpt:
      "The audit script returns exit code 1 when a hardcoded CSS value appears.",
    attribution: "the author",
  },
];

const draft: GeneratedCreativeDraft = {
  concept: "LLM-readable design systems",
  caption: "Make design constraints readable by coding agents.",
  hashtags: [],
  altText: "A carousel about design-system automation.",
  units: [
    {
      order: 1,
      type: "carousel-slide",
      role: "cover",
      editorialGoal: "hook",
      viewerQuestion: "Why does design drift happen?",
      headline: "Zero-drift enforcement in CI pipelines",
      body: "An automated audit catches raw CSS values.",
      visualDirection: "A CI terminal with a failed audit.",
      factIds: ["fact-1"],
      assetRequest: "generated-image",
      aspectRatio: "4:5",
      characterIds: [],
    },
    {
      order: 2,
      type: "carousel-slide",
      role: "call-to-action",
      editorialGoal: "debate",
      viewerQuestion: "How would this fit the viewer's workflow?",
      headline: "Move consistency into the build",
      body: "Use automated checks before review.",
      ctaQuestion: "What stands out most to you?",
      visualDirection: "A passing CI check.",
      factIds: ["fact-1"],
      assetRequest: "generated-image",
      aspectRatio: "4:5",
      characterIds: [],
    },
  ],
};

test("repairs unsupported absolutes and grounds a generic CTA", () => {
  const repaired = repairDeterministicCreativeCopy(
    draft,
    "carousel",
    facts,
    "English",
  );

  assert.equal(
    repaired.units[0]?.headline,
    "Automated drift enforcement in CI pipelines",
  );
  assert.equal(
    repaired.units[1]?.ctaQuestion,
    "How would this fit the viewer's workflow?",
  );
  const codes = deterministicCreativeQualityIssues(
    repaired,
    "carousel",
    facts,
    "English",
  ).map((issue) => issue.code);
  assert.ok(!codes.includes("UNSUPPORTED_ABSOLUTE"));
  assert.ok(!codes.includes("GENERIC_CTA"));
});

test("keeps an absolute claim when the cited excerpt explicitly supports it", () => {
  const supportedFacts: CreativeKeyFact[] = [
    {
      ...facts[0]!,
      sourceExcerpt: "The audit guarantees zero-drift enforcement in CI.",
    },
  ];
  const repaired = repairDeterministicCreativeCopy(
    draft,
    "carousel",
    supportedFacts,
    "English",
  );
  assert.equal(repaired.units[0]?.headline, draft.units[0]?.headline);
});
