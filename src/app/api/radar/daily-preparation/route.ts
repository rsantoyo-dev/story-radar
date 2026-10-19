import { after } from "next/server";
import { authorizeRadarCollector } from "../radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "../radar-topic";
import { noStoreJson } from "../creative-route-error";
import { storyIsSelected } from "@/app/modules/stories/story-editorial.repository";
import { latestPreparation, startStoryPreparation, startPreparation, retryPreparation, continuePreparation, stopPreparation } from "@/app/modules/stories/daily-preparation.repository";
import { DRAFT2_PREPARATION_STEPS, type DailyPreparationStep } from "@/app/modules/stories/daily-preparation.types";
import { drivePreparation } from "@/app/modules/stories/daily-preparation";
import { listEditorialLines, getEditorialLine, validId } from "@/app/modules/editorial-lines/editorial-lines.repository";
import { EditorialLineError } from "@/app/modules/editorial-lines/editorial-lines";
import { plannerDay } from "@/app/modules/stories/daily-editorial-planner.types";

/**
 * Prepare my day, as far as Draft 2 takes it: collect, evaluate, select
 * today's story, approve it and prepare its content (DRAFT2_PREPARATION_STEPS);
 * the carousel is Draft 2's from there. GET reads the latest run (and drives
 * one whose lease expired); POST starts, continues, retries or stops a run.
 * The v1 steps after Content (focus, script, cover, images) are no longer
 * offered since the studio retired on 2026-10-19; a run saved with one of them
 * as its target still resolves.
 */
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(request:Request){return handle(request,false);}
export async function POST(request:Request){return handle(request,true);}
async function handle(request:Request,write:boolean) {
  const denied=await authorizeRadarCollector(request);if(denied)return denied;
  try {
    const topicId=await requireActiveRequestTopic(request);
    let run=await latestPreparation(topicId);
    if(write) {
      const input=await request.json().catch(()=>null);
      if(!input || typeof input!=="object" || Array.isArray(input))return noStoreJson({error:"Invalid preparation request"},400);
      const targetStep=input.targetStep as DailyPreparationStep|undefined;
      if(targetStep!==undefined && !DRAFT2_PREPARATION_STEPS.includes(targetStep))return noStoreJson({error:"Choose a step up to Content: the carousel is Draft 2's"},400);
      const timezoneOf=(value:unknown)=>{try{return plannerDay(String(value ?? "")).timezone;}catch{return undefined;}};
      if(input.action==="start-story") {
        const line=await getEditorialLine(topicId,validId(input.lineId));
        if(line.archived)return noStoreJson({error:"Choose an active editorial line"},400);
        const timezone=timezoneOf(input.timezone);
        if(!timezone)return noStoreJson({error:"Choose a valid timezone"},400);
        const result=await startStoryPreparation({topicId,lineId:line.id,lineName:line.name,timezone,storyId:validId(input.storyId),targetStep:targetStep ?? "content"});
        if(!result.created)return noStoreJson({error:"That story is not in this topic, or another run is still in progress. Stop it first."},409);
        run=result.run;
      } else if(input.action==="stop") {
        if(!run || run.id!==validId(input.runId))return noStoreJson({error:"This is no longer the latest preparation"},409);
        run=await stopPreparation(topicId,run.id);
      } else if(input.action==="continue") {
        if(!run || run.id!==validId(input.runId))return noStoreJson({error:"This is no longer the latest preparation"},409);
        if(!targetStep)return noStoreJson({error:"Choose a target step"},400);
        run=await continuePreparation(topicId,run.id,targetStep);
      } else if(input.action==="retry") {
        if(!run || run.id!==validId(input.runId))return noStoreJson({error:"This is no longer the latest preparation"},409);
        run=await retryPreparation(topicId,run.id);
      } else if(input.action==="start") {
        const line=await getEditorialLine(topicId,validId(input.lineId));
        if(line.archived)return noStoreJson({error:"Choose an active editorial line"},400);
        const timezone=timezoneOf(input.timezone);
        if(!timezone)return noStoreJson({error:"Choose a valid timezone"},400);
        run=(await startPreparation(topicId,line.id,line.name,timezone,"day",targetStep ?? "recommend","manual")).run;
      } else return noStoreJson({error:"Choose start, start-story, continue, retry or stop"},400);
    }
    // Reconcile an already-authorized job; GET never creates a new job.
    if(run?.status==="running" && (!run.leaseUntil || run.leaseUntil.getTime()<Date.now())) {
      const id=run.id;
      after(()=>drivePreparation(topicId,id));
    }
    const lines=(await listEditorialLines(topicId)).filter(l=>!l.archived).map(l=>({id:l.id,name:l.name,timezone:l.timezone}));
    // Whether the run's story is still in production, so the panel can offer to unselect it or say it was removed.
    const storySelected=run?.progress.storyId ? await storyIsSelected(topicId,run.progress.storyId).catch(()=>null) : null;
    return noStoreJson({run:run?{id:run.id,topicId:run.topicId,lineId:run.lineId,timezone:run.timezone,status:run.status,step:run.step,progress:run.progress,error:run.error,startedAt:run.startedAt,updatedAt:run.updatedAt}:null,lines,storySelected});
  } catch(error) {
    const topicError=topicRequestErrorResponse(error);if(topicError)return topicError;
    if(error instanceof EditorialLineError)return noStoreJson({error:error.message},error.status);
    console.error("Daily preparation request failed");
    return noStoreJson({error:"Daily preparation could not be loaded. Check server configuration."},500);
  }
}
