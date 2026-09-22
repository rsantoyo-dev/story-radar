import assert from "node:assert/strict";
import test from "node:test";
import { assessCarouselCraft, type CarouselCraftAssessment } from "./carousel-craft";
import { buildCreativeQualityReview } from "./creative-quality";
import { classifyCreativeRepairSeverity } from "./creative-editorial-router";
import type { GeneratedCreativeDraft, CreativeQualityScores } from "./creative-content.types";

const draft:GeneratedCreativeDraft = {
  concept:"A reported public upload and permission", caption:"A reported agent uploaded a file publicly without asking.",
  hashtags:[], altText:"A file crossing a permission boundary.",
  units:[
    {order:1,type:"carousel-slide",role:"cover",editorialGoal:"hook",viewerQuestion:"Why did the file go online?",headline:"An agent needed a source. It uploaded a file.",body:"In one reported case, it did not ask permission.",factIds:["fact-1"],aspectRatio:"4:5",assetRequest:"generated-image",visualDirection:"A file crossing a boundary."},
    {order:2,type:"carousel-slide",role:"content",editorialGoal:"explain",viewerQuestion:"What was its reason?",headline:"The agent wanted an online source to cite",body:"It uploaded the file publicly to provide that source.",factIds:["fact-1"],aspectRatio:"4:5",assetRequest:"generated-image",visualDirection:"A file connected to a source marker."},
    {order:3,type:"carousel-slide",role:"conclusion",editorialGoal:"conclude",viewerQuestion:"What distinction matters?",headline:"Completing a task does not establish permission",body:"The reported upload supplied a source without asking the user.",factIds:["fact-1"],aspectRatio:"4:5",assetRequest:"generated-image",visualDirection:"A permission boundary."},
  ],
};
const assessment=():CarouselCraftAssessment => ({strongestDetailVisible:true,specificReasonToContinue:true,openingReason:"The reported method conflicts with the permission boundary.",
  slides:draft.units.map(unit=>({order:unit.order,answersQuestion:true,addsNewValue:true,visibleQuote:unit.headline,contribution:"This slide explains its assigned part of the supported incident."})),
  resolvesPromise:true,closingAddsSynthesis:true,closingReason:"Separates completing a task from permission for an external action."});
const high:CreativeQualityScores = {factuality:99,hook:99,curiosity:99,swipeReward:99,continuity:99,relevance:99,clarity:99,resolution:99,cta:99,overall:99};

test("craft review requires exact visible evidence for every slide, not invented justifications",()=>{
  assert.deepEqual(assessCarouselCraft(assessment(),draft).issues,[]);
  for (const corrupt of [
    (a:CarouselCraftAssessment)=>{a.slides.pop();},
    (a:CarouselCraftAssessment)=>{a.slides[1].order=1;},
    (a:CarouselCraftAssessment)=>{a.closingReason="";},
  ]) {
    const a=assessment();corrupt(a);
    assert.equal(assessCarouselCraft(a,draft).issues[0].code,"CAROUSEL_CRAFT_REVIEW_MISSING");
  }
  assert.equal(assessCarouselCraft(undefined,draft).issues[0].code,"CAROUSEL_CRAFT_REVIEW_MISSING");
  // An ungrounded quote invalidates only that slide's verdict, never the whole paid review.
  const ungrounded=assessment();ungrounded.slides[1].visibleQuote="Invented impressive copy";ungrounded.slides[1].answersQuestion=false;
  const partial=assessCarouselCraft(ungrounded,draft);
  assert.ok(partial.assessment);
  assert.deepEqual(partial.issues.map(i=>`${i.code}@${i.unitOrder}`),["CAROUSEL_CRAFT_EVIDENCE_UNMATCHED@2"]);
  // Curly quotes, ellipses and casing are how models quote copy, not fabricated evidence.
  const styled=assessment();styled.slides[0].visibleQuote="“an agent needed a source… It uploaded a file”";
  assert.deepEqual(assessCarouselCraft(styled,draft).issues,[]);
});

test("perfect self-scores cannot hide a buried hook, repeated middle or unanswered ending",()=>{
  const a=assessment();a.strongestDetailVisible=false;a.slides[1].addsNewValue=false;a.slides[1].answersQuestion=false;a.closingAddsSynthesis=false;
  const craft=assessCarouselCraft(a,draft);
  assert.deepEqual(craft.issues.map(i=>i.code),["BURIED_HOOK","VIEWER_QUESTION_MISMATCH","SEMANTIC_REPETITION","WEAK_RESOLUTION"]);
  const review=buildCreativeQualityReview({draft,format:"carousel",scores:high,criticIssues:craft.issues,repairPasses:1});
  assert.ok(review.scores.hook<90);
  assert.ok(review.scores.swipeReward<80);
  assert.ok(review.scores.resolution<88);
  assert.ok(review.scores.overall<90);
  assert.notEqual(review.status,"accepted");
  assert.equal(classifyCreativeRepairSeverity(craft.issues,high),"structural");
});

test("missing craft evidence triggers repair without inventing factual failure or approval",()=>{
  const craft=assessCarouselCraft(undefined,draft);
  assert.equal(classifyCreativeRepairSeverity(craft.issues,high),"structural");
  const review=buildCreativeQualityReview({draft,format:"carousel",scores:high,criticIssues:craft.issues,repairPasses:1});
  assert.ok(review.scores.overall<90);
  assert.notEqual(review.status,"accepted");
  assert.ok(!craft.issues.some(i=>i.severity==="blocker"));
});

test("a strong draft inside the publishable band is accepted; a factual shortfall is not",()=>{
  const publishable:CreativeQualityScores={factuality:97,hook:86,curiosity:82,swipeReward:81,continuity:83,relevance:84,clarity:85,resolution:82,cta:81,overall:86};
  const accepted=buildCreativeQualityReview({draft,format:"carousel",scores:publishable,criticIssues:[],repairPasses:0});
  assert.equal(accepted.status,"accepted");
  assert.ok(!accepted.issues.some(i=>i.code.startsWith("QUALITY_")));
  const weakFacts=buildCreativeQualityReview({draft,format:"carousel",scores:{...publishable,factuality:95},criticIssues:[],repairPasses:0});
  assert.notEqual(weakFacts.status,"accepted");
  assert.ok(weakFacts.issues.some(i=>i.code==="QUALITY_FACTUALITY_BELOW_THRESHOLD"));
  // An ungrounded craft quote no longer caps scores; a genuinely buried hook still does.
  const unmatched=buildCreativeQualityReview({draft,format:"carousel",scores:publishable,criticIssues:[{code:"CAROUSEL_CRAFT_EVIDENCE_UNMATCHED",severity:"warning",unitOrder:2,message:"quote not visible"}],repairPasses:0});
  assert.equal(unmatched.scores.hook,publishable.hook);
  assert.equal(unmatched.status,"accepted");
});
