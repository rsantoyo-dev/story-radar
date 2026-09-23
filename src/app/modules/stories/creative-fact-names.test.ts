import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicBriefFactQualityIssues,
  repairBriefFactEvidence,
  unsupportedFactNames,
} from "./creative-fact-guard";
import type { GeneratedCreativeBrief } from "./creative-content.types";

// The live case: the excerpt confirms three exhibitions at the gallery and
// names no artist; the statement added three names. Numbers had a guard,
// names did not, and the script presented them as verified evidence.
const EXCERPT =
  "The three exhibitions presented at the Galerie Renée-Blain will be the highlights of the program and will help reinforce its position as a professional venue for the visual arts at the regional level.";
const LEAKING =
  "Galerie Renée-Blain will feature three professional exhibitions by Paulette-Marie Sauvé, François Bertrand, and Jean-François Roy.";
const SOURCE = `Brossard announces its season. ${EXCERPT} Details follow.`;

function brief(statement: string, sourceExcerpt: string): GeneratedCreativeBrief {
  return {
    keyFacts: [{ id: "fact-1", statement, sourceExcerpt, requiredQualifiers: [], attribution: "the city" }],
    keyMessage: "", angle: "", hook: "", suggestedConcepts: [], riskFlags: [], contentSufficiency: "sufficient",
  } as unknown as GeneratedCreativeBrief;
}

test("each name a statement adds beyond its excerpt is reported", () => {
  assert.deepEqual(unsupportedFactNames(LEAKING, EXCERPT), [
    "Paulette-Marie Sauvé",
    "François Bertrand",
    "Jean-François Roy",
  ]);
});

test("a name the excerpt carries is supported", () => {
  assert.deepEqual(unsupportedFactNames("Galerie Renée-Blain presents three exhibitions this season.", EXCERPT), []);
  assert.deepEqual(unsupportedFactNames("Three exhibitions will open at the Galerie Renée-Blain.", EXCERPT), []);
});

test("single capitalized words and translated institutions are not treated as leaks", () => {
  // Statements are often written in another language than the excerpt:
  // "From", "September" and "Library" are capitalized without being names,
  // and the translated institution passes on its proper-name part.
  assert.deepEqual(
    unsupportedFactNames(
      "From September 18, 2026, to September 12, 2027, a total of 13 free exhibitions will be presented at the Georgette-Lepage Library.",
      "Du 18 septembre 2026 au 12 septembre 2027, 13 expositions gratuites seront présentées à la bibliothèque Georgette-Lepage.",
    ),
    [],
  );
});

test("a sentence-initial name still counts when it reads as one", () => {
  assert.deepEqual(unsupportedFactNames("Paulette-Marie Sauvé shows thirty works.", EXCERPT), ["Paulette-Marie Sauvé"]);
});

test("the evidence repair narrows a statement that names people its excerpt does not", () => {
  const repaired = repairBriefFactEvidence(brief(LEAKING, EXCERPT), SOURCE);
  assert.equal(repaired.keyFacts[0]?.statement, EXCERPT, "the excerpt is what the source proves");
  assert.ok(repaired.riskFlags.some((flag) => /narrowed fact-1/.test(flag)));
  const untouched = repairBriefFactEvidence(brief("Three exhibitions will open at the Galerie Renée-Blain.", EXCERPT), SOURCE);
  assert.equal(untouched.keyFacts[0]?.statement, "Three exhibitions will open at the Galerie Renée-Blain.");
});

test("the brief quality gate reports the leak as a blocker naming the names", () => {
  const issues = deterministicBriefFactQualityIssues(brief(LEAKING, EXCERPT), SOURCE);
  const leak = issues.find((issue) => issue.code === "FACT_NAME_NOT_IN_EVIDENCE");
  assert.ok(leak, `expected FACT_NAME_NOT_IN_EVIDENCE, got ${issues.map((issue) => issue.code).join(", ")}`);
  assert.equal(leak.severity, "blocker");
  assert.match(leak.message, /Paulette-Marie Sauvé/);
});
