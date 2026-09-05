import assert from "node:assert/strict";
import test from "node:test";

import type { CreativeKeyFact, GeneratedCreativeBrief } from "./creative-content.types";
import {
  deterministicBriefFactQualityIssues,
  repairBriefFactEvidence,
  repairDeterministicBriefScope,
  withCreativeFactClaimGuard,
} from "./creative-fact-guard";

function briefWithFacts(keyFacts: CreativeKeyFact[]): GeneratedCreativeBrief {
  return {
    recommendedFormat: "carousel",
    fallbackFormat: "meme",
    formatScores: [
      { format: "carousel", score: 90, reason: "Explain the selection criteria." },
      { format: "meme", score: 70, reason: "Summarize the invitation round." },
    ],
    confidence: 90,
    targetAudience: "Healthcare workers",
    keyMessage: "Canada issued invitations to healthcare workers.",
    angle: "Explain the invitation round and its selection criteria.",
    hook: "Who qualified for Canada's healthcare invitation round?",
    tone: { primary: "informative", energy: 50, humor: 0, reason: "Explain the criteria." },
    contentSufficiency: "sufficient",
    keyFacts,
    riskFlags: [],
    suggestedConcepts: [],
    carouselPlan: {
      slideCount: 3,
      rationale: "Introduce, explain, and resolve the selection criteria.",
      slides: [
        { editorialGoal: "hook", viewerQuestion: "Who received invitations?", allowedFactIds: ["fact-1"] },
        { editorialGoal: "explain", viewerQuestion: "What were the criteria?", allowedFactIds: ["fact-2"] },
        { editorialGoal: "conclude", viewerQuestion: "What does this round establish?", allowedFactIds: ["fact-1", "fact-2"] },
      ],
    },
  };
}

const reportedFacts: CreativeKeyFact[] = [
  {
    id: "fact-1",
    statement: "El gobierno canadiense emitió 3 500 invitaciones para aplicar (ITA) en el sorteo del 4 de septiembre de 2026 para trabajadores de salud y servicios sociales.",
    sourceExcerpt: "the immigration department issued 3,500 ITAs in a draw for candidates in healthcare and social services occupations.",
  },
  {
    id: "fact-2",
    statement: "Para ser considerado en el sorteo, los candidatos necesitaban una puntuación mínima del CRS de 475.",
    sourceExcerpt: "A minimum Comprehensive Ranking System (CRS) score of 475;",
  },
  {
    id: "fact-3",
    statement: "El sorteo ocurrió el 4 de septiembre de 2026.",
    sourceExcerpt: "September 4 Healthcare and social services4753,500",
  },
];
const source = reportedFacts.map((fact) => fact.sourceExcerpt).join("\n");

test("repairs the reported invitation brief without inventing an event year", () => {
  const brief = briefWithFacts(reportedFacts.map(withCreativeFactClaimGuard));
  brief.hook = "Who qualified in the September 4, 2026 round?";
  assert.ok(deterministicBriefFactQualityIssues(brief, source).some((issue) => issue.code === "FACT_NUMBER_NOT_IN_EVIDENCE"));

  const repaired = repairDeterministicBriefScope(repairBriefFactEvidence(brief, source));
  assert.deepEqual(deterministicBriefFactQualityIssues(repaired, source), []);
  assert.equal(repaired.keyFacts[0]!.statement, reportedFacts[0]!.sourceExcerpt);
  assert.equal(repaired.keyFacts[2]!.statement, reportedFacts[2]!.sourceExcerpt);
  assert.equal(repaired.keyFacts[1]!.statement, reportedFacts[1]!.statement);
  assert.ok(repaired.keyFacts.every((fact) => !fact.claimGuard?.allowedNumbers.includes("2026")));
  assert.doesNotMatch(repaired.hook, /2026/u);
  assert.deepEqual(repaired.carouselPlan, brief.carouselPlan);
  assert.equal(repaired.contentSufficiency, "limited");
  assert.ok(repaired.riskFlags.some((flag) => flag.includes("Source-evidence repair")));
  assert.deepEqual(repairBriefFactEvidence(repaired, source), repaired);
  assert.match(brief.keyFacts[0]!.statement, /2026/u);
});

test("never borrows a year from another paragraph to justify a citation", () => {
  const repaired = repairBriefFactEvidence(briefWithFacts(reportedFacts), `Published in 2026.\n${source}`);
  assert.ok(repaired.keyFacts.every((fact) => !fact.statement.includes("2026")));
});

test("fabricated and missing excerpts stay blocked", () => {
  for (const sourceExcerpt of [undefined, "Canada issued 9,000 invitations in 2026."]) {
    const brief = briefWithFacts([{ id: "fact-1", statement: "Canada issued 9,000 invitations in 2026.", sourceExcerpt }]);
    const repaired = repairBriefFactEvidence(brief, source);
    assert.equal(repaired, brief);
    assert.ok(deterministicBriefFactQualityIssues(repaired, source).some((issue) => ["MISSING_SOURCE_EVIDENCE", "SOURCE_EVIDENCE_NOT_FOUND"].includes(issue.code)));
  }
});

test("verified dates and qualifiers survive without unnecessary repair", () => {
  const excerpt = "On September 4, 2026, the department reported approximately 3,500 invitations.";
  const brief = briefWithFacts([{ id: "fact-1", statement: excerpt, sourceExcerpt: excerpt, requiredQualifiers: ["approximately", "reported"] }]);
  assert.equal(repairBriefFactEvidence(brief, excerpt), brief);
});

test("rebuilds numeric permissions and preserves only excerpt-supported metadata", () => {
  const excerpt = "The department reported approximately 3,500 invitations.";
  const brief = briefWithFacts([withCreativeFactClaimGuard({
    id: "fact-1", statement: "In 2026, the department reported approximately 3,500 invitations.",
    sourceExcerpt: excerpt, requiredQualifiers: ["approximately", "in 2026"], attribution: "Invented source",
  })]);
  const fact = repairBriefFactEvidence(brief, excerpt).keyFacts[0]!;
  assert.equal(fact.statement, excerpt);
  assert.deepEqual(fact.requiredQualifiers, ["approximately"]);
  assert.equal(fact.attribution, undefined);
  assert.ok(!fact.claimGuard?.allowedNumbers.includes("2026"));
  assert.equal(fact.claimGuard?.certainty, "estimated");
});
