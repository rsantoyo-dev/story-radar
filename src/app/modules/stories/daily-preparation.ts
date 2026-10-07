import "server-only";
import { isCreativeDraftReadyForAutomation } from "./creative-quality";
import { approveDailyStory, DailyStoryNotEligibleError } from "./approve-daily-story";
import { sameEventStories, storyAlreadyPublished } from "./story-duplicates.repository";
import { BRIEF_EVIDENCE_REVIEW_MESSAGE, DAILY_PREPARATION_STEPS, preparationTarget, type DailyPreparationStep } from "./daily-preparation.types";
import { prepareStoryContent } from "./prepare-selected-story-content";
import { getStoryContent } from "./story-content.repository";
import { approveSavedCreativeDraft, createCreativeBrief, createCreativeDraft, getCreativeWorkspaceState, suggestEditorialFocus } from "./manage-creative-content";
import { changeCreativeAssetApproval, generateCreativeDraftAssets, getCreativeDraftAssets } from "./manage-creative-assets";
import { storyCollectionContexts } from "../editorial-lines/editorial-lines.repository";
class PreparationReviewNeeded extends Error {}
const MULTIPLE_CONTEXTS_MESSAGE="This story was found by different editorial lines or research questions. Choose the intended context in the creative workspace.";
const messageOf=(error:unknown,fallback:string)=>typeof (error as {message?:unknown})?.message==="string" ? (error as {message:string}).message : fallback;
/** Stories whose article turned out incomplete before the run asks a human. */
export const MAX_CONTENT_ATTEMPTS = 3;
const ALREADY_PUBLISHED = "Already published in this topic";
/** Steps before any creative spend, where a published story is still swapped for the next one. */
const PRE_CREATIVE_STEPS = new Set(["approve", "content", "focus", "brief"]);
import { randomUUID } from "node:crypto";
import { requireTopic } from "../topics/topic-context";
import { CollectionRunFailedError, collectionContext, defaultStoryContext, resolveLineResearch } from "../editorial-lines/editorial-lines";
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
  const target = preparationTarget(progress);
  /** One line in the run's visible timeline; bounded so a long run never bloats the row. */
  function note(text:string,kind?:"skip"|"auto") {
    progress.activity=[...(progress.activity ?? []),{at:new Date().toISOString(),text,...(kind?{kind}:{})}].slice(-40);
  }
  async function finish(step: DailyPreparationStep, next?: DailyPreparationStep) {
    progress.completedStep = step;
    progress.stepTimes = { ...progress.stepTimes, [step]: new Date().toISOString() };
    const done = step === target || !next;
    await savePreparation(run, { status: done ? "completed" : "running", step: done ? step : next, progress });
    return !done;
  }
  // Move to the next fallback story, recording why; a human decides only when none is left.
  async function skip(reason:string,countsAsAttempt:boolean) {
    const skipped=[...(progress.skippedStories ?? []),{storyId:progress.storyId!,title:progress.storyTitle,reason}];
    progress.skippedStories=skipped;
    note(`Skipped "${progress.storyTitle ?? "story"}": ${reason}`,"skip");
    const attempts=skipped.filter(s=>s.reason.startsWith("Incomplete")).length;
    const tried=new Set(skipped.map(s=>s.storyId));
    const next=(progress.candidates ?? []).find(c=>!tried.has(c.storyId));
    if(!next || (countsAsAttempt && attempts>=MAX_CONTENT_ATTEMPTS)) {
      if(reason===ALREADY_PUBLISHED && skipped.length===1)throw new PreparationReviewNeeded("This story was already published in this topic. Start a new run to select from today's stories.");
      throw new PreparationReviewNeeded(skipped.length>1
        ? `None of the ${skipped.length} stories tried could be prepared${attempts>=MAX_CONTENT_ATTEMPTS ? " with complete content" : ""}. Review a story's content or start a new run.`
        : "The article content is incomplete. Review or edit the content before continuing.");
    }
    progress.storyId=next.storyId;
    progress.storyTitle=next.title;
    note(`Trying "${next.title ?? "the next story"}"${next.via==="same-event"?" (same event, another source)":""}`);
    // Everything prepared so far belonged to the previous story.
    for(const key of ["editorialDirection","briefId","draftId","assetBatchId","acknowledgedBriefId","provisionalImages"] as const)delete progress[key];
    await savePreparation(run,{step:"content",progress});
    return true;
  }
  try {
    await requireTopic(topicId,{active:true});
    // A resumed or older run may still hold a story published since; never prepare it twice.
    if(progress.storyId && PRE_CREATIVE_STEPS.has(run.step) && await storyAlreadyPublished(topicId,progress.storyId))return await skip(ALREADY_PUBLISHED,false);
    if(run.step==="collect") {
      const [line,sources,research,profile,preferences]=await Promise.all([getEditorialLine(topicId,run.lineId),listTopicRssSourceConfigs(topicId),getAiResearchSourceConfig(topicId),getEditorialProfile(topicId),getStoryKeywordPreferences(topicId)]);
      const now=new Date();
      const context=collectionContext(line,sources,"",undefined,now);
      const aiResearch=resolveLineResearch(research,line,context);
      const selected=sources.filter(s=>context.sourceIds.includes(s.id));
      if(!selected.some(s=>s.enabled) && !aiResearch.enabled)throw new Error("No active sources in this editorial line");
      let collectionId=progress.collectionRunId ?? randomUUID();
      progress.collectionRunId=collectionId;
      await checkpointPreparation(run,progress);
      let reservation;
      try {
        reservation=await reserveCollection(topicId,collectionId,aiResearch.collectionContext);
      } catch(error) {
        if(!(error instanceof CollectionRunFailedError))throw error;
        // The saved attempt failed or was interrupted; its partial results stay. Collect again under a new ID.
        collectionId=randomUUID();
        progress.collectionRunId=collectionId;
        await checkpointPreparation(run,progress);
        note("The previous collection was interrupted; collecting again");
        reservation=await reserveCollection(topicId,collectionId,aiResearch.collectionContext);
      }
      if(reservation.cached) {
        const cached=reservation.cached as {counts?:{included?:number};sources?:{successful?:number;failed?:number}};
        if(cached.sources?.failed && !cached.sources.successful)throw new Error("All collection sources failed");
        progress.collected=cached.counts?.included ?? 0;
        if(cached.sources?.failed)progress.collectionWarning="Some sources could not be collected. Available stories were retained.";
        note(`Reused today's collection: ${progress.collected} stories`);
        return await finish("collect", "evaluate");
      }
      try {
        const {radar,persistence}=await collectAndPersistStoryCandidates({topicId,now,editorialContext:aiResearch.collectionContext,editorialRunId:collectionId,sources:selected,preferences,aiResearch:{config:aiResearch,profile}});
        await finishCollection(topicId,collectionId,{sources:radar.sources,counts:radar.counts,persistence});
        progress.collectionRunId=collectionId;
        progress.collected=radar.counts.included;
        if(radar.sources.failed) progress.collectionWarning="Some sources could not be collected. Available stories were retained.";
        if(!radar.sources.successful && radar.sources.failed)throw new Error("All collection sources failed");
        note(`Collected ${progress.collected} stories from ${radar.sources.successful} ${radar.sources.successful===1?"source":"sources"}${radar.sources.failed?` (${radar.sources.failed} failed)`:""}`);
        return await finish("collect", "evaluate");
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
        if(done) { note(`Evaluated ${progress.evaluated} stories`); return await finish("evaluate", "recommend"); }
        await savePreparation(run,{step:"evaluate",progress});
      } catch(error) {
        if(!(error instanceof EditorialEvaluationDailyLimitError))throw error;
        progress.evaluationWarning="Evaluation incomplete — daily limit reached. Recommendations use the available evaluated stories.";
        note(`Evaluated ${progress.evaluated} stories before the daily evaluation limit`);
        return await finish("evaluate", "recommend");
      }
    } else if(run.step==="recommend") {
      const existing=await getDailyPlanner(topicId,run.timezone);
      const result=existing.running ? existing : await recommendForToday(topicId,run.timezone,false);
      if(result.running) {await savePreparation(run,{progress});return false;}
      if(result.stale || result.saved?.status!=="completed")throw new Error("Recommendation is not current yet");
      progress.recommendationRunId=result.saved.id;
      const choice=result.saved.result?.recommendation;
      if (choice) {
        progress.storyId=choice.storyId;
        progress.storyTitle=result.context.candidates.find(c=>c.storyId===choice.storyId)?.title;
        // Fallbacks in order: each pick, then other sources of the same event.
        const titleOf=(storyId:string)=>result.context.candidates.find(c=>c.storyId===storyId)?.title;
        const picks=[{storyId:choice.storyId,via:"recommended" as const},...(result.saved.result?.alternatives ?? []).map(a=>({storyId:a.storyId,via:"alternative" as const}))];
        const queue:NonNullable<typeof progress.candidates>=[];
        for(const pick of picks) {
          if(!queue.some(c=>c.storyId===pick.storyId))queue.push({...pick,title:titleOf(pick.storyId)});
          for(const same of await sameEventStories(topicId,pick.storyId).catch(()=>[])) {
            if(!queue.some(c=>c.storyId===same.storyId))queue.push({storyId:same.storyId,title:same.title,via:"same-event"});
          }
        }
        progress.candidates=queue;
        const plan=result.saved.result;
        progress.selection={reason:choice.reason,summary:plan?.summary,alternatives:(plan?.alternatives ?? []).map(a=>titleOf(a.storyId) ?? "Untitled story")};
        note(`Selected "${progress.storyTitle ?? "the recommended story"}"${progress.selection.alternatives.length?` over ${progress.selection.alternatives.length} ${progress.selection.alternatives.length===1?"alternative":"alternatives"}`:""}`);
      } else {
        note("No strong recommendation today");
      }
      if (DAILY_PREPARATION_STEPS.indexOf(target) <= 2) return await finish("recommend");
      if(!choice)throw new PreparationReviewNeeded("No strong recommendation is available. Review the candidates before preparing a draft.");
      return await finish("recommend", "approve");
    } else if(run.step==="approve") {
      if(!progress.storyId)throw new PreparationReviewNeeded("Choose a story to approve.");
      await approveDailyStory(topicId, progress.storyId);
      return await finish("approve", "content");
    } else if(run.step==="content") {
      if(!progress.storyId)throw new PreparationReviewNeeded("Choose a story to prepare.");
      try { await approveDailyStory(topicId, progress.storyId); }
      catch(error) {
        if(error instanceof DailyStoryNotEligibleError && progress.skippedStories?.length)return await skip("Not eligible for approval",false);
        throw error;
      }
      let content=await getStoryContent(topicId,progress.storyId);
      // `likely-full` is the normal status for a substantial RSS/editorial
      // copy whose extractor cannot find meaningfully more text. Re-fetching
      // that content can turn an already usable article into a false failure
      // when the publisher or Reader fallback blocks the second request.
      if(!contentLooksComplete(content))content=await prepareStoryContent(topicId,progress.storyId);
      if(!contentLooksComplete(content))return await skip("Incomplete article content (paywall or excerpt only)",true);
      const words=content.text?.trim().split(/\s+/).length ?? 0;
      note(`Article ready: ${words ? `${words.toLocaleString("en-CA")} words` : "full text"}`);
      return await finish("content", "focus");
    } else if(run.step==="focus") {
      if(!progress.storyId)throw new PreparationReviewNeeded("Choose a story before suggesting a focus.");
      // Work done by hand in the studio is the starting point: a current brief keeps its focus.
      const prepared=await getCreativeWorkspaceState(topicId,progress.storyId,run.id);
      if(prepared.briefIsCurrent && prepared.brief) {
        progress.briefId=prepared.brief.id;
        if(prepared.brief.editorialDirection)progress.editorialDirection=prepared.brief.editorialDirection;
        note("Reused the brief already prepared for this story");
        return await finish("focus", "brief");
      }
      const contexts=await storyCollectionContexts(topicId,progress.storyId);
      const context=contexts.find(c=>c.runId===progress.collectionRunId) ?? defaultStoryContext(contexts);
      if(contexts.length>1 && !context)throw new PreparationReviewNeeded(MULTIPLE_CONTEXTS_MESSAGE);
      const result=await suggestEditorialFocus(topicId,progress.storyId,undefined,context?.runId,run.id,run.timezone);
      progress.editorialDirection=result.editorialDirection;
      note("Editorial focus suggested");
      return await finish("focus", "brief");
    } else if(run.step==="brief") {
      // Covers what used to be two daily-preparation steps ("brief" then
      // "draft"): the single-shot pipeline already writes the intelligent
      // draft and its carrousel script together, so treating them as two
      // separate checkpoints here no longer matched what actually happens.
      // createCreativeDraft still runs either way — under single-shot its
      // cache hit returns the draft createCreativeBrief already produced, at
      // no extra cost; the legacy (flag-off) path still pays for it here,
      // exactly as it did as its own step before.
      if(!progress.storyId)throw new PreparationReviewNeeded("The recommended story is unavailable.");
      await approveDailyStory(topicId, progress.storyId);
      const contexts=await storyCollectionContexts(topicId,progress.storyId);
      const context=contexts.find(c=>c.runId===progress.collectionRunId) ?? defaultStoryContext(contexts);
      if(contexts.length>1 && !context)throw new PreparationReviewNeeded(MULTIPLE_CONTEXTS_MESSAGE);
      const prepared=progress.briefId ? await getCreativeWorkspaceState(topicId,progress.storyId,run.id) : undefined;
      const reusedBrief=prepared?.briefIsCurrent && prepared.brief?.id===progress.briefId ? prepared.brief : undefined;
      const brief=reusedBrief ?? (await createCreativeBrief(topicId,progress.storyId,progress.editorialDirection,context?.runId,run.id)).state.brief;
      if(!brief)throw new Error("Brief unavailable");
      progress.briefId=brief.id;
      // A human can accept this exact brief once from the workspace despite
      // limited/insufficient evidence (see acknowledgePreparationBrief) — a
      // later regenerated brief (a new id) needs its own review again.
      if(brief.contentSufficiency!=="sufficient" && progress.acknowledgedBriefId!==brief.id)throw new PreparationReviewNeeded(BRIEF_EVIDENCE_REVIEW_MESSAGE);
      const workspace=await getCreativeWorkspaceState(topicId,progress.storyId,run.id);
      if(!workspace.briefIsCurrent || workspace.brief?.id!==progress.briefId)throw new PreparationReviewNeeded("The creative inputs changed. Review or regenerate the brief in the workspace.");
      // A script already written (and maybe approved, or edited) for this brief is adopted, not rewritten.
      const existingDrafts=workspace.drafts.filter(d=>d.briefId===progress.briefId && d.inputIsCurrent!==false && !d.companion);
      const adopted=existingDrafts.find(d=>d.status==="approved") ?? [...existingDrafts].sort((a,b)=>b.version-a.version)[0];
      const draft=adopted ?? (await createCreativeDraft(topicId,progress.briefId,workspace.brief.recommendedFormat,undefined,false,run.id)).state.drafts
        .find(d=>d.briefId===progress.briefId && d.inputIsCurrent && d.format===workspace.brief!.recommendedFormat);
      if(!draft)throw new Error("Draft unavailable");
      progress.draftId=draft.id;
      progress.draftSummary={format:draft.format,slides:draft.units?.length ?? 0,hook:draft.units?.[0]?.headline};
      note(adopted
        ? `Reused script v${draft.version}${draft.status==="approved"?", already approved":""}`
        : `Script written: ${draft.format}${draft.units?.length?`, ${draft.units.length} slides`:""}`);
      // An editor's approval already answers for this exact version.
      if(adopted?.status==="approved")return await finish("brief", "approve-draft");
      if(!isCreativeDraftReadyForAutomation(draft,draft.format,draft.qualityReviewIsCurrent === true))throw new PreparationReviewNeeded("The draft is saved, but automated editorial validation has not passed for this exact version. Its findings and evidence were preserved; it cannot advance as publication-ready.");
      return await finish("brief", "approve-draft");
    } else if(run.step==="draft") {
      // Legacy only: no new run ever reaches this step ("brief" above now
      // does its work too), but a run already sitting here from before this
      // change must still resolve instead of erroring after deploy.
      if(!progress.storyId || !progress.briefId)throw new PreparationReviewNeeded("Review the creative brief before continuing.");
      await approveDailyStory(topicId, progress.storyId);
      const workspace=await getCreativeWorkspaceState(topicId,progress.storyId,run.id);
      if(!workspace.briefIsCurrent || workspace.brief?.id!==progress.briefId)throw new PreparationReviewNeeded("The creative inputs changed. Review or regenerate the brief in the workspace.");
      const result=await createCreativeDraft(topicId,progress.briefId,workspace.brief.recommendedFormat,undefined,false,run.id);
      const draft=result.state.drafts.find(d=>d.briefId===progress.briefId && d.inputIsCurrent && d.format===workspace.brief!.recommendedFormat);
      if(!draft)throw new Error("Draft unavailable");
      progress.draftId=draft.id;
      if(!isCreativeDraftReadyForAutomation(draft,draft.format,draft.qualityReviewIsCurrent === true))throw new PreparationReviewNeeded("The draft is saved, but automated editorial validation has not passed for this exact version. Its findings and evidence were preserved; it cannot advance as publication-ready.");
      return await finish("draft", "approve-draft");
    } else if(run.step==="approve-draft") {
      if(!progress.storyId || !progress.draftId)throw new PreparationReviewNeeded("Review the carrousel before approving it.");
      const workspace=await getCreativeWorkspaceState(topicId,progress.storyId,run.id);
      const draft=workspace.drafts.find(d=>d.id===progress.draftId);
      if(!draft)throw new PreparationReviewNeeded("The draft is no longer available. Review it in the workspace.");
      if(draft.inputIsCurrent===false)throw new PreparationReviewNeeded("The draft changed. Review the current version in the story workspace.");
      if(draft.status!=="approved") {
        const readyForAutomation=isCreativeDraftReadyForAutomation(draft,draft.format,draft.qualityReviewIsCurrent===true);
        if(progress.autoApprove && readyForAutomation) {
          // Explicitly chosen for this run: the critic accepted this exact
          // version, so the system approves it through the ordinary checks.
          try { await approveSavedCreativeDraft(topicId,draft.id,false,draft.version); }
          catch(error) { throw new PreparationReviewNeeded(`Automatic script approval stopped: ${messageOf(error,"approval failed")}`); }
          progress.autoApproved={...progress.autoApproved,draftId:draft.id,draftApprovedAt:new Date().toISOString()};
          note("Script approved automatically: the critic accepted this exact version","auto");
        } else {
          // A scoop moves ahead to provisional images when the independent
          // critic accepted this exact version; the script stays unapproved.
          if(progress.trigger!=="scoop" || !readyForAutomation)throw new PreparationReviewNeeded(progress.autoApprove
            ? "The automated review has not accepted this exact script version, so it was not approved automatically. Review it in the story workspace."
            : "The exact draft version needs human approval in the story workspace before images can be generated.");
          progress.provisionalImages=true;
        }
      }
      if(draft.status==="approved" && !progress.autoApproved?.draftApprovedAt)note("Script approved by an editor");
      return await finish("approve-draft", "images");
    } else if(run.step==="images") {
      if(!progress.draftId)throw new PreparationReviewNeeded("Approve the draft before generating images.");
      const autoImages=progress.autoApprove===true && progress.provisionalImages!==true;
      if(!progress.assetBatchId) {
        // Images already made for this script version (by hand or an earlier run) are adopted, not regenerated.
        const existing=progress.provisionalImages ? undefined : (await getCreativeDraftAssets(topicId, progress.draftId).catch(()=>undefined))?.batch;
        if(existing && existing.status!=="stale" && existing.assets?.length) {
          progress.assetBatchId=existing.id;
          note(`Reused the ${existing.assets.length} images already generated for this script`);
          if(!autoImages)return await finish("images");
        } else {
          const result=await generateCreativeDraftAssets(topicId, progress.draftId, undefined, {provisional:progress.provisionalImages===true});
          if(!result.batch)throw new Error("Image batch unavailable");
          progress.assetBatchId=result.batch.id;
          note(`Image generation started${progress.provisionalImages?" (provisional)":""}`);
          if(!autoImages)return await finish("images");
          await savePreparation(run,{step:"images",progress});
          return false; // The next poll checks whether the images finished.
        }
      }
      if(!autoImages)return await finish("images");
      const {batch}=await getCreativeDraftAssets(topicId, progress.draftId);
      if(!batch)throw new PreparationReviewNeeded("The image batch is no longer available. Review the images in the story workspace.");
      if(batch.assets.some(a=>a.status==="queued" || a.status==="generating")) {
        await savePreparation(run,{step:"images",progress});
        return false;
      }
      const failed=batch.assets.filter(a=>a.status==="failed").map(a=>a.unitOrder);
      if(failed.length)throw new PreparationReviewNeeded(`Image ${failed.join(", ")} failed to generate. Regenerate it in Visuals, then continue.`);
      const flagged=batch.assets.filter(a=>a.safetyFlag).map(a=>a.unitOrder);
      if(flagged.length)throw new PreparationReviewNeeded(`The safety checker flagged image ${flagged.join(", ")}. Regenerate it in Visuals, then continue.`);
      const approvedIds:string[]=[];
      for(const asset of batch.assets.filter(a=>a.status==="generated")) {
        try { await changeCreativeAssetApproval(topicId,asset.id,"approve"); approvedIds.push(asset.id); }
        catch(error) { throw new PreparationReviewNeeded(`Image ${asset.unitOrder} could not be approved automatically: ${messageOf(error,"approval failed")}`); }
      }
      progress.autoApproved={...progress.autoApproved,assetIds:approvedIds,imagesApprovedAt:new Date().toISOString()};
      note(`${approvedIds.length} images approved automatically`,"auto");
      return await finish("images");
    } else {throw new Error("Unknown preparation stage");}
    return true;
  } catch(error) {
    if(error instanceof PreparationReviewNeeded){await savePreparation(run,{status:"needs-review",progress,error:error.message});return false;}
    const errors:Record<string,string>={collect:"Collection could not finish. Check the editorial line, sources and collection budget, then retry this step.",evaluate:"AI evaluation could not finish. Check provider availability, then retry this step.",content:"Article preparation failed. Review the content or retry this step.",brief:"Creative brief generation failed. Check the content and creative AI budget, then retry.",draft:"Draft generation failed. Check the brief and creative AI budget, then retry.",recommend:"Today's recommendation could not finish. Check the planner status and daily budget, then retry this step.",approve:"The story could not be approved. Check its current status, then retry this step.",focus:"The editorial focus could not be suggested. Check provider availability, then retry this step.","approve-draft":"The carrousel could not be approved. Review it in the creative workspace, then retry this step.",images:"Image generation could not be submitted. Check the approved draft and image budget, then retry this step."};
    await savePreparation(run,{status:"failed",progress,error:errors[run.step] ?? "Preparation failed."});
    return false;
  }
}
/** after() is a fast kick; the optional worker provides recovery after process loss. */
export async function drivePreparation(topicId:string,id:string,budgetMs=450000) {
  const started=Date.now();
  for(let steps=0;steps<12 && Date.now()-started<budgetMs;steps++) {
    if(!await advancePreparation(topicId,id))break;
  }
}

function contentLooksComplete(content: {
  contentStatus: string;
  text?: string;
}): boolean {
  return (
    (content.contentStatus === "full" || content.contentStatus === "likely-full") &&
    Boolean(content.text?.trim())
  );
}
