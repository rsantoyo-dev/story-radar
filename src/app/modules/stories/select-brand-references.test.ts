import assert from "node:assert/strict";
import { test } from "node:test";

import type { CreativeBrandReference } from "./creative-content.types";
import {
  normalizeBrandReferenceSelection,
  selectBrandReferencesForUnit,
} from "./select-brand-references";

function ref(over: Partial<CreativeBrandReference>): CreativeBrandReference {
  return {
    id: "r",
    name: "Ref",
    kind: "finished-post",
    provenance: null,
    usageNote: null,
    providerTransmissionAllowed: true,
    originalContentType: "image/png",
    contentType: "image/webp",
    fileName: "r.webp",
    fileSize: 1000,
    width: 1080,
    height: 1350,
    version: 1,
    isActive: true,
    contribution: { aspects: [], guidance: null, avoid: null },
    configVersion: 1,
    activatedForJourney: true,
    analysis: null,
    analysisRunAt: null,
    analysisPromptVersion: null,
    analysisIsStale: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

const budget = { maxPerUnit: 2, maxUnitReferenceImages: 4 };

test("finished-post scores high on cover, low on content; signage is neutral", () => {
  const finished = ref({ id: "a", kind: "finished-post" });
  const sign = ref({ id: "b", kind: "signage" });

  const cover = selectBrandReferencesForUnit({
    unit: { order: 1, role: "cover", visualDirection: "clean modern layout" },
    eligible: [sign, finished],
    characterReferenceImageCount: 0,
    budget,
    generativeImageryAllowed: true,
  });
  assert.equal(cover.selected[0].id, "a");
  assert.equal(cover.selected[1].id, "b");

  const content = selectBrandReferencesForUnit({
    unit: { order: 2, role: "content", visualDirection: "a plain photo" },
    eligible: [finished, sign],
    characterReferenceImageCount: 0,
    budget,
    generativeImageryAllowed: true,
  });
  // content: finished-post=1, signage=1 → tie broken by createdAt then id
  assert.equal(content.selected.length, 2);
});

test("contribution aspects in visualDirection add score; cover credits color+mood", () => {
  const palette = ref({
    id: "p",
    kind: "other",
    contribution: { aspects: ["color", "mood"], guidance: null, avoid: null },
  });
  const cover = selectBrandReferencesForUnit({
    unit: { order: 1, role: "cover", visualDirection: "a quiet street scene" },
    eligible: [palette],
    characterReferenceImageCount: 0,
    budget,
    generativeImageryAllowed: true,
  });
  // other→cover 0, +1 color (cover bonus) +1 mood (cover bonus) = 2
  assert.equal(cover.selected.length, 1);
  assert.equal(cover.selected[0].function, "palette");
  assert.match(cover.selected[0].reason, /contributes color, mood/);
});

test("tiebreak: configVersion desc, then createdAt asc, then id", () => {
  const a = ref({ id: "a", kind: "signage", configVersion: 1, createdAt: new Date("2026-01-02T00:00:00Z") });
  const b = ref({ id: "b", kind: "signage", configVersion: 3, createdAt: new Date("2026-01-05T00:00:00Z") });
  const c = ref({ id: "c", kind: "signage", configVersion: 3, createdAt: new Date("2026-01-01T00:00:00Z") });
  const out = selectBrandReferencesForUnit({
    unit: { order: 1, role: "content", visualDirection: "x" },
    eligible: [a, b, c],
    characterReferenceImageCount: 0,
    budget: { maxPerUnit: 3, maxUnitReferenceImages: 4 },
    generativeImageryAllowed: true,
  });
  assert.deepEqual(out.selected.map((s) => s.id), ["c", "b", "a"]);
});

test("per-unit cap moves the rest to excluded with a reason", () => {
  const eligible = ["a", "b", "c"].map((id) =>
    ref({ id, kind: "signage" }),
  );
  const out = selectBrandReferencesForUnit({
    unit: { order: 1, role: "content", visualDirection: "x" },
    eligible,
    characterReferenceImageCount: 0,
    budget: { maxPerUnit: 2, maxUnitReferenceImages: 4 },
    generativeImageryAllowed: true,
  });
  assert.equal(out.selected.length, 2);
  assert.equal(out.excluded.length, 1);
  assert.match(out.excluded[0].reason, /over the per-unit brand budget/);
});

test("character images consume the joint budget", () => {
  const eligible = [ref({ id: "a", kind: "signage" }), ref({ id: "b", kind: "signage" })];
  const two = selectBrandReferencesForUnit({
    unit: { order: 1, role: "content", visualDirection: "x" },
    eligible,
    characterReferenceImageCount: 2,
    budget: { maxPerUnit: 2, maxUnitReferenceImages: 4 },
    generativeImageryAllowed: true,
  });
  assert.equal(two.selected.length, 2); // 4 - 2 = 2 available

  const four = selectBrandReferencesForUnit({
    unit: { order: 1, role: "content", visualDirection: "x" },
    eligible,
    characterReferenceImageCount: 4,
    budget: { maxPerUnit: 2, maxUnitReferenceImages: 4 },
    generativeImageryAllowed: true,
  });
  assert.equal(four.selected.length, 0);
  assert.match(four.excluded[0].reason, /taken by character references/);
  assert.match(four.note ?? "", /reference budget/);
});

test("no generative imagery and empty eligible both yield an explained empty selection", () => {
  const eligible = [ref({ id: "a" })];
  const blocked = selectBrandReferencesForUnit({
    unit: { order: 1, role: "cover", visualDirection: "x" },
    eligible,
    characterReferenceImageCount: 0,
    budget,
    generativeImageryAllowed: false,
  });
  assert.deepEqual(blocked.selected, []);
  assert.match(blocked.note ?? "", /Place fidelity/);

  const empty = selectBrandReferencesForUnit({
    unit: { order: 1, role: "cover", visualDirection: "x" },
    eligible: [],
    characterReferenceImageCount: 0,
    budget,
    generativeImageryAllowed: true,
  });
  assert.deepEqual(empty.selected, []);
  assert.match(empty.note ?? "", /No brand references are activated/);
});

test("references with no match go to excluded", () => {
  const out = selectBrandReferencesForUnit({
    unit: { order: 1, role: "call-to-action", visualDirection: "typography only" },
    eligible: [ref({ id: "a", kind: "finished-post" })],
    characterReferenceImageCount: 0,
    budget,
    generativeImageryAllowed: true,
  });
  assert.deepEqual(out.selected, []);
  assert.equal(out.excluded[0].id, "a");
  assert.match(out.excluded[0].reason, /no clear match/);
  assert.match(out.note ?? "", /No activated brand reference matched/);
});

test("normalizeBrandReferenceSelection shapes a stored blob", () => {
  assert.deepEqual(
    normalizeBrandReferenceSelection({
      selected: [{ id: "a", version: 2, configVersion: 5, function: "motif", reason: "r" }],
      excluded: [{ id: "b", reason: "x" }],
      note: null,
    }),
    {
      selected: [{ id: "a", version: 2, configVersion: 5, function: "motif", reason: "r" }],
      excluded: [{ id: "b", reason: "x" }],
      note: null,
    },
  );
  assert.equal(normalizeBrandReferenceSelection(null), undefined);
  assert.equal(normalizeBrandReferenceSelection("x"), undefined);
});
