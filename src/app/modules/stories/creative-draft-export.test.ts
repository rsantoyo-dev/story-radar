import assert from "node:assert/strict";
import test from "node:test";

import { buildCompleteDraftScript } from "./creative-draft-export";

test("exports the complete carousel as one paste-ready script", () => {
  const output = buildCompleteDraftScript(
    {
      concept: "A housing comparison",
      caption: "What the Canadian data shows.",
      callToAction: "Review the comparison.",
      hashtags: ["Canada", "#Housing"],
      altText: "A two-slide housing carousel.",
      narrativeRationale: "Contrast, then conclusion.",
      units: [
        {
          order: 1,
          type: "carousel-slide",
          role: "cover",
          editorialGoal: "hook",
          viewerQuestion: "What is different?",
          headline: "First-time vs. repeat buyers",
          subheadline: "A 2023 income snapshot",
          body: "Median family incomes differed in 2023.",
          continuationCue: "the gap behind the comparison",
          visualDirection: "One person beside a symbolic balance.",
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
          viewerQuestion: "What stands out?",
          headline: "What the comparison shows",
          ctaQuestion: "Which difference surprised you most?",
          visualDirection: "Two non-proportional comparison cards.",
          factIds: ["fact-1"],
          assetRequest: "generated-image",
          aspectRatio: "4:5",
          characterIds: [],
        },
      ],
    },
    "carousel",
  );

  assert.match(output, /FULL CREATIVE SCRIPT/);
  assert.match(output, /IMAGE 1[\s\S]*First-time vs\. repeat buyers/);
  assert.match(output, /SUBHEADLINE:\nA 2023 income snapshot/);
  assert.match(
    output,
    /CONTINUATION CUE:\nthe gap behind the comparison/,
  );
  assert.match(output, /IMAGE 2[\s\S]*Which difference surprised you most\?/);
  assert.match(output, /IMAGE OUTPUT \/ VISUAL DIRECTION/);
  assert.match(output, /#Canada #Housing/);
});

test("exports the editor-facing native interaction without putting it in image copy", () => {
  const output = buildCompleteDraftScript(
    {
      concept: "A fact-safe Story",
      caption: "Context for the Story.",
      hashtags: [],
      altText: "A calm Story frame.",
      units: [
        {
          order: 1,
          type: "meme-frame",
          role: "cover",
          headline: "A supported fact",
          visualDirection: "Keep the lower third empty.",
          factIds: ["fact-1"],
          assetRequest: "generated-image",
          aspectRatio: "9:16",
          interactiveOverlay: {
            kind: "instagram-sticker",
            placement: "bottom-third",
            recommendation: {
              kind: "poll",
              prompt: "Should this concern you?",
              options: ["Yes", "Not yet"],
              rationale: "It invites a low-friction reaction to the verified context.",
            },
          },
        },
      ],
    },
    "meme",
  );

  assert.match(output, /MANUAL INSTAGRAM INTERACTION/);
  assert.match(output, /Type: poll/);
  assert.match(output, /Options: Yes \| Not yet/);
  assert.match(output, /Why this works:/);
});
