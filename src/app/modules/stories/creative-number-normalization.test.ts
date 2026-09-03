import assert from "node:assert/strict";
import test from "node:test";

import {
  collapseStackedEstimateQualifiers,
  extractCreativeNumericLiterals,
  normalizeCreativeNumericLiteral,
  substantiveCreativeNumericLiterals,
} from "./creative-number-normalization";

test("collapses stacked estimate hedges to a single qualifier", () => {
  assert.equal(
    collapseStackedEstimateQualifiers(
      "la inflación se ha mantenido alrededor de aproximadamente 3%",
    ),
    "la inflación se ha mantenido alrededor de 3%",
  );
  assert.equal(
    collapseStackedEstimateQualifiers("la subyacente quedó cerca de aproximadamente 2%"),
    "la subyacente quedó cerca de 2%",
  );
  assert.equal(
    collapseStackedEstimateQualifiers("una cifra cercana a aproximadamente 3%"),
    "una cifra cercana a 3%",
  );
  assert.equal(
    collapseStackedEstimateQualifiers("roughly approximately 10%"),
    "roughly 10%",
  );
  // A single qualifier is left untouched.
  assert.equal(
    collapseStackedEstimateQualifiers("alrededor del 3% en meses recientes"),
    "alrededor del 3% en meses recientes",
  );
});

test("normalizes English and Spanish decimal and grouping punctuation", () => {
  const equivalentPairs = [
    ["21.8%", "21,8 %"],
    ["726,820", "726.820"],
    ["1,344.50", "1.344,50"],
    ["2.0%", "2,0%"],
  ] as const;

  equivalentPairs.forEach(([english, spanish]) => {
    assert.equal(
      normalizeCreativeNumericLiteral(english),
      normalizeCreativeNumericLiteral(spanish),
    );
  });
});

test("supports grouped spaces and keeps genuinely different values distinct", () => {
  assert.equal(normalizeCreativeNumericLiteral("726 820"), "726820");
  assert.equal(normalizeCreativeNumericLiteral("21,8 por ciento"), "21.8%");
  assert.deepEqual(extractCreativeNumericLiterals("21\n8"), ["21", "8"]);
  assert.notEqual(
    normalizeCreativeNumericLiteral("21,8%"),
    normalizeCreativeNumericLiteral("21,9%"),
  );
});

test("does not merge a calendar day with a comma-separated year", () => {
  assert.deepEqual(
    extractCreativeNumericLiterals("Takes effect Jan. 1, 2027"),
    ["1", "2027"],
  );
  assert.deepEqual(
    extractCreativeNumericLiterals("Entra en vigor el 1 de enero de 2027"),
    ["1", "2027"],
  );
  assert.deepEqual(extractCreativeNumericLiterals("1 344 500 personas"), [
    "1344500",
  ]);
});

test("extracts scaled and localized values through the same contract", () => {
  assert.deepEqual(
    extractCreativeNumericLiterals(
      "Subió 2,1 millones, luego 21,8 % y cerró en $1.344,50.",
    ),
    ["2100000", "21.8%", "1344.5"],
  );
});

test("deduplicates locale variants and excludes calendar years", () => {
  assert.deepEqual(
    substantiveCreativeNumericLiterals([
      "21.8% in 2026",
      "21,8 % en 2026",
      "726.820 personas",
    ]),
    ["21.8%", "726820"],
  );
});

test("excludes bare years without discarding grouped counts in that range", () => {
  assert.deepEqual(
    substantiveCreativeNumericLiterals([
      "2026",
      "2,000 personas",
      "2.026 personas",
    ]),
    ["2000", "2026"],
  );
});
