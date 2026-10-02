import assert from "node:assert/strict";
import test from "node:test";

import { resolveCreativeVisualGuidance, withCurrentVisualGuide } from "./creative-visual-guidance";

const saved = "Slide 2 text: Faute de place\n<VISUAL_CAMPAIGN_GUIDE>\nOld guide: flat pastel shapes\n</VISUAL_CAMPAIGN_GUIDE>\nIMAGE EDIT v1 keep the car";

test("a new version swaps in the profile's current campaign guide and keeps the rest of the prompt", () => {
  const visual = { name: "Salut Saint-Jean", visualGuidance: "New guide: warm autumn photography, deep red accents" };
  const swapped = withCurrentVisualGuide(saved, visual);
  assert.match(swapped, /<VISUAL_CAMPAIGN_GUIDE>\n[\s\S]*New guide: warm autumn photography[\s\S]*\n<\/VISUAL_CAMPAIGN_GUIDE>/);
  assert.doesNotMatch(swapped, /Old guide/);
  assert.ok(swapped.startsWith("Slide 2 text: Faute de place\n"));
  assert.ok(swapped.endsWith("IMAGE EDIT v1 keep the car"));
  assert.ok(swapped.includes(resolveCreativeVisualGuidance(visual)));
});

test("a prompt without a guide block, or no profile, is left exactly as it was", () => {
  assert.equal(withCurrentVisualGuide("No guide here", { name: "X", visualGuidance: "New" }), "No guide here");
  assert.equal(withCurrentVisualGuide(saved, undefined), saved);
});

test("a guide containing dollar signs is inserted literally", () => {
  const swapped = withCurrentVisualGuide(saved, { name: "X", visualGuidance: "Price tags like $1 and $& stay literal" });
  assert.ok(swapped.includes("$1 and $&"));
});
