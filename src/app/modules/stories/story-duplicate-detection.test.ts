import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cosineSimilarity,
  findDuplicateEvent,
  type DuplicatePrior,
} from "./story-duplicate-detection";

const DAY = 24 * 60 * 60 * 1_000;
const WINDOW = 14 * DAY;
const NOW = new Date("2026-09-08T12:00:00Z");

function unit(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / n);
}

const A = unit([1, 0.9, 0.1, 0]); // "same event" cluster
const A2 = unit([0.98, 0.92, 0.12, 0.02]);
const B = unit([0, 0.1, 1, 0.9]); // unrelated

test("cosineSimilarity: identical = 1, orthogonal ~ 0", () => {
  assert.ok(Math.abs(cosineSimilarity(A, A) - 1) < 1e-9);
  assert.ok(cosineSimilarity(unit([1, 0, 0]), unit([0, 1, 0])) < 1e-9);
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
});

test("embedding match above threshold is a duplicate", () => {
  const priors: DuplicatePrior[] = [
    { storyId: "p1", title: "Bank of Canada holds rate", embedding: A, effectiveDate: NOW, tier: "published" },
  ];
  const match = findDuplicateEvent({
    candidate: { storyId: "c1", title: "El Banco de Canadá mantiene la tasa", embedding: A2, effectiveDate: NOW },
    priors,
    cosineThreshold: 0.86,
    lexicalThreshold: 0.6,
    windowMs: WINDOW,
  });
  assert.ok(match);
  assert.equal(match.storyId, "p1");
  assert.equal(match.method, "embedding");
  assert.ok(match.similarity >= 0.86);
});

test("no match when embeddings are dissimilar", () => {
  const match = findDuplicateEvent({
    candidate: { storyId: "c1", title: "Totally different story", embedding: A, effectiveDate: NOW },
    priors: [{ storyId: "p1", title: "Unrelated", embedding: B, effectiveDate: NOW, tier: "published" }],
    cosineThreshold: 0.86,
    lexicalThreshold: 0.6,
    windowMs: WINDOW,
  });
  assert.equal(match, null);
});

test("window cutoff drops an old prior", () => {
  const match = findDuplicateEvent({
    candidate: { storyId: "c1", title: "x", embedding: A2, effectiveDate: NOW },
    priors: [
      { storyId: "p1", title: "x", embedding: A, effectiveDate: new Date(NOW.getTime() - 30 * DAY), tier: "published" },
    ],
    cosineThreshold: 0.86,
    lexicalThreshold: 0.6,
    windowMs: WINDOW,
  });
  assert.equal(match, null);
});

test("lexical fallback fires when an embedding is missing", () => {
  const match = findDuplicateEvent({
    candidate: {
      storyId: "c1",
      title: "Canada raises financial responsibility requirements for new study permit applicants",
      embedding: null,
      effectiveDate: NOW,
    },
    priors: [
      {
        storyId: "p1",
        title: "Canada raises financial responsibility requirements for study permit applicants soon",
        embedding: null,
        effectiveDate: NOW,
        tier: "selected",
      },
    ],
    cosineThreshold: 0.86,
    lexicalThreshold: 0.6,
    windowMs: WINDOW,
  });
  assert.ok(match);
  assert.equal(match.method, "lexical");
});

test("a published prior beats a pending prior at similar similarity", () => {
  const match = findDuplicateEvent({
    candidate: { storyId: "c1", title: "x", embedding: A2, effectiveDate: NOW },
    priors: [
      { storyId: "pending", title: "x", embedding: A, effectiveDate: NOW, tier: "pending" },
      { storyId: "published", title: "x", embedding: A, effectiveDate: NOW, tier: "published" },
    ],
    cosineThreshold: 0.86,
    lexicalThreshold: 0.6,
    windowMs: WINDOW,
  });
  assert.ok(match);
  assert.equal(match.storyId, "published");
});

test("a prior with the same storyId as the candidate is ignored", () => {
  const match = findDuplicateEvent({
    candidate: { storyId: "same", title: "x", embedding: A, effectiveDate: NOW },
    priors: [{ storyId: "same", title: "x", embedding: A, effectiveDate: NOW, tier: "published" }],
    cosineThreshold: 0.86,
    lexicalThreshold: 0.6,
    windowMs: WINDOW,
  });
  assert.equal(match, null);
});
