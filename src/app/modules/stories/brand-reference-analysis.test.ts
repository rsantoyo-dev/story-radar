import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BRAND_ANALYSIS_DISCLAIMER,
  CreativeBrandAnalysisError,
  parseBrandReferenceAnalysis,
} from "./brand-reference-analysis";

const WELL_FORMED = JSON.stringify({
  aspects: {
    color: {
      present: true,
      observed: "Deep green with a warm cream",
      evidence: "the top band and the CTA button are the same green",
      confidence: "high",
    },
    composition: {
      present: true,
      observed: "Centred headline, single focal photo",
      evidence: "one large photo fills the lower two thirds",
      confidence: "medium",
    },
    texture: { present: false, observed: "", evidence: "", confidence: "low" },
    shape: {
      present: true,
      observed: "Rounded rectangles",
      evidence: "every card and button has ~12px corner radius",
      confidence: "low",
    },
    motif: { present: false, observed: "", evidence: "", confidence: "low" },
    mood: {
      present: true,
      observed: "Civic, upbeat",
      evidence: "bright daylight photo, friendly sans headline",
      confidence: "medium",
    },
  },
  detectedText: ["J'AIME ST-JEAN", "Samedi 12 janvier"],
  avoid: ["the January 12 date", "the headline about the festival"],
  unknowns: ["the exact typeface"],
});

test("parseBrandReferenceAnalysis shapes a well-formed response", () => {
  const parsed = parseBrandReferenceAnalysis(WELL_FORMED);
  assert.equal(parsed.aspects.color.present, true);
  assert.equal(parsed.aspects.color.confidence, "high");
  assert.equal(parsed.aspects.texture.present, false);
  assert.equal(parsed.aspects.texture.observed, "");
  assert.deepEqual(parsed.detectedText, ["J'AIME ST-JEAN", "Samedi 12 janvier"]);
  assert.equal(parsed.avoid.length, 2);
  assert.equal(parsed.note, BRAND_ANALYSIS_DISCLAIMER);
});

test("a missing aspect defaults to not-determined", () => {
  const parsed = parseBrandReferenceAnalysis(
    JSON.stringify({ aspects: { color: { present: true, observed: "x", evidence: "y", confidence: "high" } } }),
  );
  assert.equal(parsed.aspects.mood.present, false);
  assert.equal(parsed.aspects.mood.confidence, "low");
  assert.deepEqual(parsed.detectedText, []);
});

test("an invalid confidence falls back to low; text and lists are clipped", () => {
  const parsed = parseBrandReferenceAnalysis(
    JSON.stringify({
      aspects: {
        color: {
          present: true,
          observed: "z".repeat(999),
          evidence: "e",
          confidence: "certain",
        },
      },
      detectedText: Array.from({ length: 40 }, (_, i) => `t${i}`),
    }),
  );
  assert.equal(parsed.aspects.color.confidence, "low");
  assert.equal(parsed.aspects.color.observed.length, 400);
  assert.equal(parsed.detectedText.length, 10);
});

test("tolerates a ```json fence and rejects a non-object body", () => {
  const fenced = "```json\n" + WELL_FORMED + "\n```";
  assert.equal(parseBrandReferenceAnalysis(fenced).aspects.color.present, true);
  assert.throws(
    () => parseBrandReferenceAnalysis("not json at all"),
    CreativeBrandAnalysisError,
  );
  assert.throws(
    () => parseBrandReferenceAnalysis("[1,2,3]"),
    CreativeBrandAnalysisError,
  );
});
