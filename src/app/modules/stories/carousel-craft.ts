import type { CreativeQualityIssue, GeneratedCreativeDraft } from "./creative-content.types";

export const CAROUSEL_CRAFT_POLICY = `Carousel craft standard (apply only to carousel/sequence):
Before writing slides, compare three evidence-supported openings in openingExploration. Choose the strongest specific reason to continue, then write its exact headline/context on the cover and deliver its promised answer on the identified later slide. Preserve the approved slide count and evidence assignments. If the strongest detail is outside the cover's assigned facts, flag the planning limitation instead of importing that fact. A sequence must still preserve procedural order.
Prefer the distinctive supported action, mechanism, contrast or useful distinction over an organization announcing something. Do not bury the reason the story is unusual under generic framing. Not every story needs danger or conflict. Never strengthen facts to improve a hook.
Each middle slide must answer its viewerQuestion and add a distinct explanation, evidence, comparison or practical step. A headline, subheadline and body that merely restate the same count do not add depth. A quote praising an initiative does not answer why it is difficult to govern. A closing must synthesize the established evidence to answer the opening question, not paraphrase the cover or introduce a new claim. Use concrete compositions that explain the evidence, not decorative imagery as a substitute for narrative.
Score calibration: 60-69 = understandable recap; 70-79 = clear but predictable; 80-89 = a strong element with remaining narrative defects; 90-94 = distinctive evidence-supported opening, a concrete reward on every swipe, questions actually answered, and an earned closing; 95-98 = exceptionally economical, specific and coherent execution of all those requirements. These are editorial judgments, not forecasts of engagement. Do not award 90+ just because facts are correct or copy is fluent.
For editorial review, return carouselCraft grounded in the exact returned copy (the unchanged supplied copy for a read-only audit). For each slide cite one short exact visible quote as evidence and explain its new contribution. Flag false checks honestly and repair the affected copy in the existing bounded editorial pass. A routine announcement, buried distinctive detail, repeated middle slide, unanswered viewerQuestion or recap-only ending cannot receive 90+ in the affected dimension. Do not rewrite good slides merely to make them different.`;

const check = (properties: Record<string, unknown>) => ({type:"object", additionalProperties:false,
  required:Object.keys(properties), properties});
const text = {type:"string", minLength:1, maxLength:500};
export function carouselCraftSchema(unitCount: number) {
  return check({
    strongestDetailVisible:{type:"boolean"}, specificReasonToContinue:{type:"boolean"}, openingReason:text,
    slides:{type:"array", minItems:unitCount, maxItems:unitCount, items:check({
      order:{type:"integer", minimum:1, maximum:unitCount}, answersQuestion:{type:"boolean"},
      addsNewValue:{type:"boolean"}, visibleQuote:text, contribution:text,
    })},
    resolvesPromise:{type:"boolean"}, closingAddsSynthesis:{type:"boolean"}, closingReason:text,
  });
}
export type CarouselCraftAssessment = {
  strongestDetailVisible:boolean; specificReasonToContinue:boolean; openingReason:string;
  slides:{order:number; answersQuestion:boolean; addsNewValue:boolean; visibleQuote:string; contribution:string}[];
  resolvesPromise:boolean; closingAddsSynthesis:boolean; closingReason:string;
};
const record = (x:unknown):x is Record<string,unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const shortText = (x:unknown):x is string => typeof x === "string" && x.trim().length > 0 && x.length <= 500;
const normalized = (x:string) => x.trim().replace(/\s+/gu," ");

/** Missing/ungrounded assessment preserves copy and requests a bounded editorial repair. */
export function assessCarouselCraft(value:unknown, draft:GeneratedCreativeDraft): {assessment?:CarouselCraftAssessment; issues:CreativeQualityIssue[]} {
  const invalid = (): {issues:CreativeQualityIssue[]} => ({issues:[{code:"CAROUSEL_CRAFT_REVIEW_MISSING", severity:"warning",
    message:"The carousel needs a complete craft review with exact visible evidence for every slide before it can earn publication-ready scores."}]});
  if (!record(value) || !["strongestDetailVisible","specificReasonToContinue","resolvesPromise","closingAddsSynthesis"].every(k=>typeof value[k] === "boolean") ||
      !["openingReason","closingReason"].every(k=>shortText(value[k])) || !Array.isArray(value.slides) || value.slides.length !== draft.units.length) return invalid();
  for (const [index, entry] of value.slides.entries()) {
    const unit = draft.units[index];
    if (!record(entry) || entry.order !== unit.order || typeof entry.answersQuestion !== "boolean" || typeof entry.addsNewValue !== "boolean" ||
        !shortText(entry.visibleQuote) || !shortText(entry.contribution)) return invalid();
    const visible = [unit.headline,unit.subheadline,unit.body,unit.continuationCue,unit.ctaQuestion].filter((s):s is string=>!!s);
    if (!visible.some(s=>normalized(s).includes(normalized(entry.visibleQuote as string)))) return invalid();
  }
  const assessment = value as unknown as CarouselCraftAssessment;
  const issues:CreativeQualityIssue[]=[];
  const add = (code:string,message:string,unitOrder?:number) => issues.push({code,message,severity:"warning",...(unitOrder ? {unitOrder} : {})});
  if (!assessment.strongestDetailVisible) add("BURIED_HOOK",assessment.openingReason,1);
  if (!assessment.specificReasonToContinue) add("LOW_HUMAN_CURIOSITY",assessment.openingReason,1);
  for (const slide of assessment.slides) {
    if (!slide.answersQuestion) add("VIEWER_QUESTION_MISMATCH",slide.contribution,slide.order);
    if (!slide.addsNewValue && slide.order > 1 && slide.order < draft.units.length) add("SEMANTIC_REPETITION",slide.contribution,slide.order);
  }
  if (!assessment.resolvesPromise) add("HOOK_RESOLUTION_GAP",assessment.closingReason,draft.units.length);
  if (!assessment.closingAddsSynthesis) add("WEAK_RESOLUTION",assessment.closingReason,draft.units.length);
  return {assessment,issues};
}
