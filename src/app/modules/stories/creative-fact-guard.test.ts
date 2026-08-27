import assert from "node:assert/strict";
import test from "node:test";

import type {
  CreativeKeyFact,
  CreativeUnit,
  GeneratedCreativeDraft,
} from "./creative-content.types";
import {
  deterministicFactQualityIssues,
  repairDeterministicFactCopy,
} from "./creative-fact-guard";

const keyFacts: CreativeKeyFact[] = [
  {
    id: "fact-1",
    statement:
      "Over one-third of web pages published after ChatGPT's release show signs of AI authorship, according to Pew Research.",
    requiredQualifiers: ["over one-third", "show signs", "according to"],
    attribution: "Pew Research",
  },
  {
    id: "fact-2",
    statement:
      "Researchers analyzed nearly 500,000 English-language pages from the past five years.",
    requiredQualifiers: ["nearly"],
    attribution: "Pew Research",
  },
  {
    id: "fact-3",
    statement:
      "Open Pangram was used to detect pages likely written or heavily edited with AI.",
    requiredQualifiers: ["likely"],
    attribution: "Open Pangram",
  },
  {
    id: "fact-4",
    statement:
      "A July 2026 random sample of 10,000 pages found about 10% with significant AI-authorship signs.",
    requiredQualifiers: ["about", "significant signs"],
    attribution: "Pew Research",
  },
  {
    id: "fact-5",
    statement:
      "The one-third figure applies only to pages published after ChatGPT's release, while the random sample includes older pages.",
    requiredQualifiers: ["only", "includes older pages"],
    attribution: "Pew Research",
  },
  {
    id: "fact-6",
    statement:
      "Cloudflare reported that bot web traffic had overtaken human web traffic.",
    requiredQualifiers: ["reported"],
    attribution: "Cloudflare",
  },
];

const draft: GeneratedCreativeDraft = {
  concept: "AI authorship on the web",
  caption: "More than 33% of new web pages are AI-generated.",
  hashtags: [],
  altText: "Five slides about detected AI authorship signals.",
  units: [
    unit(1, "cover", "hook", "Over One-Third of New Web Pages Are AI-Generated", "Pew Research finds that after ChatGPT's launch, more than 33% of recently published pages show AI authorship signs.", ["fact-1"]),
    unit(2, "content", "explain", "How the Study Was Done", "Researchers scanned ~500,000 English pages from the past five years using Common Crawl and Open Pangram to detect AI signatures.", ["fact-2", "fact-3"]),
    unit(3, "content", "prove", "Evidence From Random Samples", "A July 2026 sample of 10,000 pages revealed about 10% with significant AI authorship signs, confirming the trend.", ["fact-4", "fact-5"]),
    unit(4, "content", "impact", "Why It Matters", "This aligns with Cloudflare's report that bot traffic now exceeds human traffic—changing how we find and trust information.", ["fact-6"]),
    unit(5, "conclusion", "conclude", "The takeaway?", undefined, ["fact-1"]),
  ],
};

test("detects certainty, scope, inference, and empty-conclusion blockers", () => {
  const codes = new Set(
    deterministicFactQualityIssues(draft, keyFacts).map((issue) => issue.code),
  );

  assert.ok(codes.has("CERTAINTY_UPGRADE"));
  assert.ok(codes.has("MISSING_SCOPE"));
  assert.ok(codes.has("UNSUPPORTED_INFERENCE"));
  assert.ok(codes.has("EMPTY_CONCLUSION"));
});

test("repairs safe factual defects without inventing new claims", () => {
  const repaired = repairDeterministicFactCopy(draft, keyFacts);

  assert.match(repaired.caption, /show signs of AI authorship/iu);
  assert.match(repaired.caption, /pages published after ChatGPT's release/iu);
  assert.doesNotMatch(repaired.caption, /\bscope\s*:/iu);
  assert.match(repaired.units[0].headline, /show signs of AI authorship/iu);
  assert.doesNotMatch(repaired.units[0].body ?? "", /\bscope\s*:/iu);
  assert.doesNotMatch(repaired.units[2].body ?? "", /confirming the trend/iu);
  assert.match(repaired.units[2].body ?? "", /includes older pages/iu);
  assert.doesNotMatch(repaired.units[3].body ?? "", /changing how/iu);
  assert.match(repaired.units[4].body ?? "", /signals—not certainty/iu);
  assert.deepEqual(
    deterministicFactQualityIssues(repaired, keyFacts).filter(
      (issue) => issue.severity === "blocker",
    ),
    [],
  );
});

test("blocks unsupported interpretive framing", () => {
  const interpretiveDraft: GeneratedCreativeDraft = {
    ...draft,
    units: draft.units.map((current) =>
      current.order === 4
        ? {
            ...current,
            headline: "Widespread Impact",
            body: "Cloudflare reported that bot traffic exceeded human traffic, suggesting the reach extends beyond commercial interests.",
          }
        : current,
    ),
  };

  assert.ok(
    deterministicFactQualityIssues(interpretiveDraft, keyFacts).some(
      (issue) =>
        issue.code === "UNSUPPORTED_INFERENCE" && issue.unitOrder === 4,
    ),
  );
});

test("accepts roughly one-third and since-launch as a cautious rendering of 35%", () => {
  const exactFact: CreativeKeyFact = {
    id: "fact-1",
    statement:
      "Pew Research found that 35% of web pages published after ChatGPT’s November 2022 launch show significant signs of AI authorship.",
    attribution: "Pew Research",
  };
  const cautiousDraft: GeneratedCreativeDraft = {
    concept: "AI authorship signals",
    caption:
      "Since ChatGPT launched, roughly one-third of web pages have shown AI-authorship signals.",
    hashtags: [],
    altText: "A graphic about detected AI-authorship signals.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "AI-authorship signals on the web",
        "Since ChatGPT launched, roughly one-third of web pages have shown signs of AI authorship.",
        ["fact-1"],
      ),
    ],
  };

  const codes = deterministicFactQualityIssues(cautiousDraft, [exactFact]).map(
    (issue) => issue.code,
  );
  assert.ok(!codes.includes("UNSUPPORTED_NUMBER"));
  assert.ok(!codes.includes("MISSING_SCOPE"));
});

test("repairs AI-written certainty upgrades that use a non-breaking hyphen", () => {
  const unicodeDraft: GeneratedCreativeDraft = {
    ...draft,
    units: draft.units.map((current) =>
      current.order === 5
        ? {
            ...current,
            body: "AI-written content is becoming common.",
            ctaQuestion: "Is the rise of AI‑written pages a problem?",
          }
        : current,
    ),
  };

  const repaired = repairDeterministicFactCopy(unicodeDraft, keyFacts);
  assert.doesNotMatch(
    `${repaired.units[4].body} ${repaired.units[4].ctaQuestion}`,
    /ai[-‐‑‒–— ]written/iu,
  );
});

function unit(
  order: number,
  role: CreativeUnit["role"],
  editorialGoal: NonNullable<CreativeUnit["editorialGoal"]>,
  headline: string,
  body: string | undefined,
  factIds: string[],
): CreativeUnit {
  return {
    order,
    type: "carousel-slide",
    role,
    editorialGoal,
    viewerQuestion: "What does this slide establish?",
    headline,
    ...(body ? { body } : {}),
    visualDirection: "Editorial infographic with concise supporting visuals.",
    factIds,
    assetRequest: "generated-image",
    aspectRatio: "4:5",
    characterIds: [],
  };
}
