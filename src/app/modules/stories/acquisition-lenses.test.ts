import assert from "node:assert/strict";
import test from "node:test";

import {
  AcquisitionLensError,
  cloneDefaultTopicAcquisitionLenses,
  parseEditorialAngle,
  parseTopicAcquisitionTaxonomyPublication,
  parseTopicAcquisitionLenses,
  describeEditorialAngle,
  hookBiasForAngle,
} from "./acquisition-lenses";

test("a generic default taxonomy is valid without portfolio quotas", () => {
  const lenses = parseTopicAcquisitionLenses(
    cloneDefaultTopicAcquisitionLenses(),
  );

  assert.equal(lenses.length, 4);
  assert.equal(lenses.every((lens) => lens.targetShare === undefined), true);
  assert.equal(lenses.filter((lens) => lens.isFallback).length, 1);
});

test("enabled lens quotas are all-or-nothing and total 100", () => {
  const lenses = cloneDefaultTopicAcquisitionLenses();
  lenses[0].targetShare = 40;
  assert.throws(() => parseTopicAcquisitionLenses(lenses), AcquisitionLensError);

  for (const [index, targetShare] of [40, 25, 20, 14].entries()) {
    lenses[index].targetShare = targetShare;
  }
  assert.throws(() => parseTopicAcquisitionLenses(lenses), AcquisitionLensError);

  lenses[3].targetShare = 15;
  assert.equal(parseTopicAcquisitionLenses(lenses).length, 4);
});

test("an editorial angle must use an enabled lens from its exact taxonomy", () => {
  const taxonomy = {
    topicId: "topic-1",
    taxonomyVersion: 3,
    lenses: parseTopicAcquisitionLenses(cloneDefaultTopicAcquisitionLenses()),
  };
  const angle = parseEditorialAngle(
    {
      angle: "notable-development",
      taxonomyVersion: 3,
      reason: "The evidence describes a specific new capability.",
      audienceStake: "It changes what readers can evaluate.",
      hookPromise: "The draft explains the demonstrated capability.",
      alternative: {
        angle: "context-and-explainer",
        reason: "The same evidence can support an explanatory reading.",
      },
    },
    taxonomy,
  );

  assert.equal(angle.angle, "notable-development");
  assert.throws(
    () => parseEditorialAngle({ ...angle, taxonomyVersion: 2 }, taxonomy),
    AcquisitionLensError,
  );
});

test("a taxonomy needs exactly one enabled fallback lens", () => {
  const lenses = cloneDefaultTopicAcquisitionLenses();
  lenses[0].isFallback = true;

  assert.throws(() => parseTopicAcquisitionLenses(lenses), AcquisitionLensError);

  lenses[3].enabled = false;
  lenses[0].isFallback = false;
  assert.throws(() => parseTopicAcquisitionLenses(lenses), AcquisitionLensError);
});

test("a published taxonomy requires its expected version and a complete snapshot", () => {
  const lenses = cloneDefaultTopicAcquisitionLenses();
  const publication = parseTopicAcquisitionTaxonomyPublication({
    expectedTaxonomyVersion: 2,
    lenses,
  });

  assert.equal(publication.expectedTaxonomyVersion, 2);
  assert.throws(
    () => parseTopicAcquisitionTaxonomyPublication({ lenses }),
    AcquisitionLensError,
  );
});
const displayTaxonomy = {
  taxonomyVersion: 4,
  lenses: [
    { key: "practical-impact", label: "Practical impact", definition: "Helps a decision.", examples: [], hookBias: "stake" as const, enabled: true, isFallback: false },
    { key: "retired-lens", label: "Retired lens", definition: "Kept for history.", examples: [], enabled: false, isFallback: false },
    { key: "context", label: "Context", definition: "Explains.", examples: [], enabled: true, isFallback: true },
  ],
};

test("a stored angle renders as a label, and a retired or unknown lens still renders", () => {
  const current = describeEditorialAngle({ angle: "practical-impact", taxonomyVersion: 4 }, displayTaxonomy);
  assert.equal(current.label, "Practical impact");
  assert.equal(current.status, "current");
  assert.equal(current.hookBias, "stake");

  // Disabled lens: the historical decision keeps rendering, flagged as retired.
  const retired = describeEditorialAngle({ angle: "retired-lens", taxonomyVersion: 4 }, displayTaxonomy);
  assert.equal(retired.label, "Retired lens");
  assert.equal(retired.status, "retired");

  // Same key, older taxonomy version: also historical, never repaired.
  assert.equal(describeEditorialAngle({ angle: "practical-impact", taxonomyVersion: 2 }, displayTaxonomy).status, "retired");

  // Key dropped from the vocabulary, or no vocabulary at all: show the raw key.
  const unknown = describeEditorialAngle({ angle: "dropped-lens", taxonomyVersion: 4 }, displayTaxonomy);
  assert.equal(unknown.label, "dropped-lens");
  assert.equal(unknown.status, "unknown");
  assert.equal(describeEditorialAngle({ angle: "practical-impact", taxonomyVersion: 4 }).status, "unknown");
});

test("hook bias is read from the live vocabulary and is optional", () => {
  assert.equal(hookBiasForAngle({ angle: "practical-impact" }, displayTaxonomy), "stake");
  // A lens may declare no bias, and a missing vocabulary must not throw.
  assert.equal(hookBiasForAngle({ angle: "context" }, displayTaxonomy), undefined);
  assert.equal(hookBiasForAngle({ angle: "practical-impact" }), undefined);
});
