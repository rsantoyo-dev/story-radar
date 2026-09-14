import "server-only";
import { prepareStoryContent } from "./prepare-selected-story-content";
import { getStoryContent } from "./story-content.repository";
import { createCreativeBrief, createCreativeDraft, getCreativeWorkspaceState } from "./manage-creative-content";
import { storyCollectionContexts } from "../editorial-lines/editorial-lines.repository";
class PreparationReviewNeeded extends Error {}
import { randomUUID } from "node:crypto";
import { requireTopic } from "../topics/topic-context";
import { collectionContext, resolveLineResearch } from "../editorial-lines/editorial-lines";
import { getEditorialLine, reserveCollection, finishCollection } from "../editorial-lines/editorial-lines.repository";
import { listTopicRssSourceConfigs } from "../topics/topic-catalog.repository";
import { getAiResearchSourceConfig } from "../sources/ai-research/ai-research.repository";
import { getEditorialProfile } from "./editorial-profile.repository";
import { getStoryKeywordPreferences } from "./story-preferences.repository";
import { collectAndPersistStoryCandidates } from "./collect-and-persist-story-candidates";
import { evaluateEditorialCandidates, EditorialEvaluationDailyLimitError } from "./evaluate-editorial-candidates";
import { getDailyPlanner, recommendForToday } from "./daily-editorial-planner";
import { claimPreparation, savePreparation, checkpointPreparation } from "./daily-preparation.repository";

/** Each checkpoint is durable; a worker can resume after the browser closes. */
export async function advancePreparation(topicId:string,id:string):Promise<boolean> {
  const run=await claimPreparation(topicId,id);
  if(!run)return false;
  const progress={...run.progress};
  try {
    await requireTopic(topicId,{active:true});
    if(run.step==="collect") {
      const [line,sources,research,profile,preferences]=await Promise.all([getEditorialLine(topicId,run.lineId),listTopicRssSourceConfigs(topicId),getAiResearchSourceConfig(topicId),getEditorialProfile(topicId),getStoryKeywordPreferences(topicId)]);
      const now=new Date();
      const context=collectionContext(line,sources,"",undefined,now);
      const aiResearch=resolveLineResearch(research,line,context);
      const selected=sources.filter(s=>context.sourceIds.includes(s.id));
      if(!selected.some(s=>s.enabled) && !aiResearch.enabled)throw new Error("No active sources in this editorial line");
      const collectionId=progress.collectionRunId ?? randomUUID();
      progress.collectionRunId=collectionId;
      await checkpointPreparation(run,progress);
      const reservation=await reserveCollection(topicId,collectionId,aiResearch.collectionContext);
      if(reservation.cached) {
        const cached=reservation.cached as {counts?:{included?:number};sources?:{successful?:number;failed?:number}};
        if(cached.sources?.failed && !cached.sources.successful)throw new Error("All collection sources failed");
        progress.collected=cached.counts?.included ?? 0;
        if(cached.sources?.failed)progress.collectionWarning="Some sources could not be collected. Available stories were retained.";
        await savePreparation(run,{step:"evaluate",progress});
        return true;
      }
      try {
        const {radar,persistence}=await collectAndPersistStoryCandidates({topicId,now,editorialContext:aiResearch.collectionContext,editorialRunId:collectionId,sources:selected,preferences,aiResearch:{config:aiResearch,profile}});
        await finishCollection(topicId,collectionId,{sources:radar.sources,counts:radar.counts,persistence});
        progress.collectionRunId=collectionId;
        progress.collected=radar.counts.included;
        if(radar.sources.failed) progress.collectionWarning="Some sources could not be collected. Available stories were retained.";
        if(!radar.sources.successful && radar.sources.failed)throw new Error("All collection sources failed");
        await savePreparation(run,{step:"evaluate",progress});
      } catch(error) {
        await finishCollection(topicId,collectionId,undefined,"Collection failed; saved partial results remain available");
        throw error;
      }
    } else if(run.step==="evaluate") {
      try {
        const result=await evaluateEditorialCandidates(topicId);
        progress.evaluated+=result.evaluatedStories;
        progress.evaluationBatches++;
        const remaining=result.candidatesScanned-result.cachedStories-result.evaluatedStories;
        const done=result.status==="no-candidates" || remaining<=0;
        await savePreparation(run,{step:done?"recommend":"evaluate",progress});
      } catch(error) {
        if(!(error instanceof EditorialEvaluationDailyLimitError))throw error;
        progress.evaluationWarning="Evaluation incomplete — daily limit reached. Recommendations use the available evaluated stories.";
        await savePreparation(run,{step:"recommend",progress});
      }
    } else if(run.step==="recommend") {
      const existing=await getDailyPlanner(topicId,run.timezone);
      const result=existing.running ? existing : await recommendForToday(topicId,run.timezone,false);
      if(result.running) {await savePreparation(run,{progress});return false;}
      if(result.stale || result.saved?.status!=="completed")throw new Error("Recommendation is not current yet");
      progress.recommendationRunId=result.saved.id;
      if(progress.mode!=="draft") {
        await savePreparation(run,{status:"completed",progress});
        return false;
      }
      const choice=result.saved.result?.recommendation;
      if(!choice)throw new PreparationReviewNeeded("No strong recommendation is available. Review the candidates before preparing a draft.");
      progress.storyId=choice.storyId;
      progress.storyTitle=result.context.candidates.find(c=>c.storyId===choice.storyId)?.title;
      await savePreparation(run,{step:"content",progress});
    } else if(run.step==="content") {
      if(!progress.storyId)throw new PreparationReviewNeeded("Choose a story to prepare.");
      let content=await getStoryContent(topicId,progress.storyId);
      if(content.contentStatus!=="full" || !content.text?.trim())content=await prepareStoryContent(topicId,progress.storyId);
      if(content.contentStatus!=="full" || !content.text?.trim())throw new PreparationReviewNeeded("The article content is incomplete. Review or edit the content before continuing.");
      await savePreparation(run,{step:"brief",progress});
    } else if(run.step==="brief") {
      if(!progress.storyId)throw new PreparationReviewNeeded("The recommended story is unavailable.");
      const contexts=await storyCollectionContexts(topicId,progress.storyId);
      const context=contexts.find(c=>c.runId===progress.collectionRunId) ?? (contexts.length===1?contexts[0]:undefined);
      if(contexts.length>1 && !context)throw new PreparationReviewNeeded("This story has multiple editorial contexts. Choose the intended context in the creative workspace.");
      const result=await createCreativeBrief(topicId,progress.storyId,undefined,context?.runId,run.id);
      const brief=result.state.brief;
      if(!brief)throw new Error("Brief unavailable");
      progress.briefId=brief.id;
      if(brief.contentSufficiency!=="sufficient")throw new PreparationReviewNeeded("The creative brief needs more evidence. Review the content and brief before continuing.");
      await savePreparation(run,{step:"draft",progress});
    } else if(run.step==="draft") {
      if(!progress.storyId || !progress.briefId)throw new PreparationReviewNeeded("Review the creative brief before continuing.");
      const workspace=await getCreativeWorkspaceState(topicId,progress.storyId);
      if(!workspace.briefIsCurrent || workspace.brief?.id!==progress.briefId)throw new PreparationReviewNeeded("The creative inputs changed. Review or regenerate the brief in the workspace.");
      const result=await createCreativeDraft(topicId,progress.briefId,workspace.brief.recommendedFormat,undefined,false,run.id);
      const draft=result.state.drafts.find(d=>d.briefId===progress.briefId && d.inputIsCurrent && d.format===workspace.brief!.recommendedFormat);
      if(!draft)throw new Error("Draft unavailable");
      progress.draftId=draft.id;
      if(!draft.qualityReview || draft.qualityReview.status!=="accepted" || draft.qualityReview.issues.some(i=>i.severity==="blocker"))throw new PreparationReviewNeeded("The draft is saved and needs editorial review. Open it to review the remaining issues.");
      await savePreparation(run,{status:"completed",progress});
      return false;
    } else {throw new Error("Unknown preparation stage");}
    return true;
  } catch(error) {
    if(error instanceof PreparationReviewNeeded){await savePreparation(run,{status:"needs-review",progress,error:error.message});return false;}
    const errors:Record<string,string>={collect:"Collection could not finish. Check the editorial line, sources and collection budget, then retry this step.",evaluate:"AI evaluation could not finish. Check provider availability, then retry this step.",content:"Article preparation failed. Review the content or retry this step.",brief:"Creative brief generation failed. Check the content and creative AI budget, then retry.",draft:"Draft generation failed. Check the brief and creative AI budget, then retry.",recommend:"Today's recommendation could not finish. Check the planner status and daily budget, then retry this step."};
    await savePreparation(run,{status:"failed",progress,error:errors[run.step] ?? "Preparation failed."});
    return false;
  }
}
/** after() is a fast kick; the optional worker provides recovery after process loss. */
export async function drivePreparation(topicId:string,id:string) {
  const started=Date.now();
  for(let steps=0;steps<12 && Date.now()-started<450000;steps++) {
    if(!await advancePreparation(topicId,id))break;
  }
}
