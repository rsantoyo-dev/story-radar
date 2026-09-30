import assert from "node:assert/strict";
import test from "node:test";

import type { CarouselPlan } from "./carousel-narrative";
import type { CreativeKeyFact, GeneratedCreativeBrief, GeneratedCreativeDraft } from "./creative-content.types";
import { withCreativeFactClaimGuard } from "./creative-fact-guard";
import { allowEditorFactsInPlan, narrativeEvidenceKey } from "./creative-narrative-plan";
import { deterministicCreativeQualityIssues, repairDeterministicCreativeCopy } from "./creative-quality";

const forecast = "Pic régional estimé : 3e semaine d’octobre";
const sourceFact: CreativeKeyFact = withCreativeFactClaimGuard({
  id: "fact-1",
  statement: "Cinq endroits sont à considérer pour profiter de l'automne à Saint-Jean-sur-Richelieu.",
  sourceExcerpt: "Cinq endroits sont à considérer pour profiter de l'automne à Saint-Jean-sur-Richelieu.",
});
// Mirrors editorFactToKeyFact: the editor's words are the evidence.
const editorFact: CreativeKeyFact = withCreativeFactClaimGuard({
  id: "editor-1a2b3c4d",
  statement: "Le pic régional des couleurs est estimé à la 3e semaine d’octobre.",
  sourceExcerpt: "Le pic régional des couleurs est estimé à la 3e semaine d’octobre.",
  provenance: "editor",
});
const plan = {
  slideCount: 3,
  rationale: "Where, why, when.",
  slides: [
    { editorialGoal: "hook", viewerQuestion: "Où aller?", allowedFactIds: ["fact-1"] },
    { editorialGoal: "explain", viewerQuestion: "Pourquoi?", allowedFactIds: ["fact-1"] },
    { editorialGoal: "conclude", viewerQuestion: "Quand?", allowedFactIds: ["fact-1"] },
  ],
} as CarouselPlan;

function draftCiting(coverFactIds: string[]): GeneratedCreativeDraft {
  return {
    concept: "Automne à Saint-Jean",
    caption: "Cinq endroits pour l'automne.",
    altText: "Trois cartes.",
    hashtags: [],
    units: [
      { order: 1, type: "carousel-slide", role: "cover", editorialGoal: "hook", viewerQuestion: "Où aller?",
        headline: "Cinq endroits à considérer pour profiter de l’automne", body: forecast,
        visualDirection: "Feuillage.", factIds: coverFactIds, assetRequest: "generated-image", aspectRatio: "4:5", characterIds: [] },
      { order: 2, type: "carousel-slide", role: "content", editorialGoal: "explain", viewerQuestion: "Pourquoi?",
        headline: "Cinq endroits autour de Saint-Jean", body: "Cinq endroits sont à considérer pour profiter de l'automne.",
        visualDirection: "Carte.", factIds: ["fact-1"], assetRequest: "generated-image", aspectRatio: "4:5", characterIds: [] },
      { order: 3, type: "carousel-slide", role: "conclusion", editorialGoal: "conclude", viewerQuestion: "Quand?",
        headline: "Planifiez votre sortie", body: "Cinq endroits à voir cet automne.",
        visualDirection: "Sentier.", factIds: ["fact-1"], assetRequest: "generated-image", aspectRatio: "4:5", characterIds: [] },
    ],
  } as GeneratedCreativeDraft;
}

test("an editor fact ticked on the slide supports the editor's added claim", () => {
  const facts = [sourceFact, editorFact];
  const issues = (draft: GeneratedCreativeDraft) =>
    deterministicCreativeQualityIssues(draft, "carousel", facts, "french").filter((issue) => issue.code === "UNSUPPORTED_NUMBER");

  assert.ok(issues(draftCiting(["fact-1"])).length > 0, "without the editor fact, the 3 is unsupported");
  assert.deepEqual(issues(draftCiting(["fact-1", editorFact.id])), [], "ticking the editor fact supports it");

  // The plan never scoped the editor fact, yet it is allowed on every slide,
  // so the repair keeps both the citation and the editor's sentence.
  const scopedPlan = allowEditorFactsInPlan({ keyFacts: facts, carouselPlan: plan }).carouselPlan!;
  const repaired = repairDeterministicCreativeCopy(draftCiting(["fact-1", editorFact.id]), "carousel", facts, "french", "followers", scopedPlan);
  assert.ok(repaired.units[0].factIds.includes(editorFact.id));
  assert.ok(repaired.units[0].body?.startsWith(forecast), "the editor's sentence is kept (only end punctuation may be normalized)");
});

test("editor facts are allowed on every planned slide and never change the evidence key", () => {
  const brief = { keyFacts: [sourceFact], carouselPlan: plan } as unknown as GeneratedCreativeBrief;
  const withEditor = { ...brief, keyFacts: [sourceFact, editorFact] };
  assert.equal(narrativeEvidenceKey(withEditor), narrativeEvidenceKey(brief), "adding a human fact must not invalidate a saved narrative revision");
  const allowed = allowEditorFactsInPlan(withEditor).carouselPlan!.slides.map((slide) => slide.allowedFactIds);
  assert.ok(allowed.every((ids) => ids.includes(editorFact.id) && ids.includes("fact-1")));
  assert.equal(allowEditorFactsInPlan(brief), brief, "no editor facts: the brief is returned untouched");
});
