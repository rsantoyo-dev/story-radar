import { after } from "next/server";
import { authorizeRadarCollector } from "../radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "../radar-topic";
import { noStoreJson } from "../creative-route-error";
import { listStoryTextCallsSince } from "@/app/modules/stories/creative-text-accounting.repository";
import { findCreativeDraftById } from "@/app/modules/stories/creative-content.repository";
import { listStoriesInProgress, latestPreparation, startStoryPreparation, startPreparation, retryPreparation, continuePreparation, acknowledgePreparationBrief, stopPreparation } from "@/app/modules/stories/daily-preparation.repository";
import { DAILY_PREPARATION_STEPS, type DailyPreparationStep } from "@/app/modules/stories/daily-preparation.types";
import { drivePreparation } from "@/app/modules/stories/daily-preparation";
import { listEditorialLines, getEditorialLine, validId } from "@/app/modules/editorial-lines/editorial-lines.repository";
import { EditorialLineError } from "@/app/modules/editorial-lines/editorial-lines";
import { plannerDay } from "@/app/modules/stories/daily-editorial-planner.types";
import { withApiLog } from "@/app/modules/observability/api-request-log";
export const runtime="nodejs";
export const maxDuration=300;
async function route_GET(request:Request){return handle(request,false);}
async function route_POST(request:Request){return handle(request,true);}
async function handle(request:Request,write:boolean) {
  const denied=await authorizeRadarCollector(request);if(denied)return denied;
  try {
    const topicId=await requireActiveRequestTopic(request);
    let run=await latestPreparation(topicId);
    if(write) {
      const input=await request.json().catch(()=>null);
      if(!input || typeof input!=="object" || Array.isArray(input))return noStoreJson({error:"Invalid preparation request"},400);
      if(input.targetStep!==undefined && !DAILY_PREPARATION_STEPS.includes(input.targetStep))return noStoreJson({error:"Choose a valid target step"},400);
      if(input.action==="start-story") {
        const line=await getEditorialLine(topicId,validId(input.lineId));
        if(line.archived)return noStoreJson({error:"Choose an active editorial line"},400);
        let timezone:string;
        try{timezone=plannerDay(input.timezone).timezone;}catch{return noStoreJson({error:"Choose a valid timezone"},400);}
        const result=await startStoryPreparation({topicId,lineId:line.id,lineName:line.name,timezone,storyId:validId(input.storyId),
          targetStep:(input.targetStep ?? "brief") as DailyPreparationStep,autoApprove:input.autoApprove===true});
        if(!result.created)return noStoreJson({error:"That story is not in this topic, or another run is still in progress. Stop it first."},409);
        run=result.run;
      } else if(input.action==="stop") {
        if(!run || run.id!==validId(input.runId))return noStoreJson({error:"This is no longer the latest preparation"},409);
        run=await stopPreparation(topicId,run.id);
      } else if(input.action==="continue") {
        if(!run || run.id!==validId(input.runId))return noStoreJson({error:"This is no longer the latest preparation"},409);
        if(!input.targetStep)return noStoreJson({error:"Choose a target step"},400);
        run=await continuePreparation(topicId,run.id,input.targetStep as DailyPreparationStep,typeof input.autoApprove==="boolean"?input.autoApprove:undefined);
      } else
      if(input.action==="retry") {
        if(!run || run.id!==validId(input.runId))return noStoreJson({error:"This is no longer the latest preparation"},409);
        run=await retryPreparation(topicId,run.id);
      } else if(input.action==="acknowledge-brief") {
        if(!run || run.id!==validId(input.runId))return noStoreJson({error:"This is no longer the latest preparation"},409);
        run=await acknowledgePreparationBrief(topicId,run.id);
      } else if(input.action==="start") {
        if(input.mode!==undefined && input.mode!=="day" && input.mode!=="draft")return noStoreJson({error:"Invalid preparation mode"},400);
        const line=await getEditorialLine(topicId,validId(input.lineId));
        if(line.archived)return noStoreJson({error:"Choose an active editorial line"},400);
        let timezone:string;
        try{timezone=plannerDay(input.timezone).timezone;}catch{return noStoreJson({error:"Choose a valid timezone"},400);}
        run=(await startPreparation(topicId,line.id,line.name,timezone,input.mode ?? "day",input.targetStep,"manual",input.autoApprove===true)).run;
      } else return noStoreJson({error:"Choose start, start-story, continue, retry, stop or acknowledge-brief"},400);
    }
    // Reconcile an already-authorized job; GET never creates a new job.
    if(run?.status==="running" && (!run.leaseUntil || run.leaseUntil.getTime()<Date.now())) {
      const id=run.id;
      after(()=>drivePreparation(topicId,id));
    }
    const lines=(await listEditorialLines(topicId)).filter(l=>!l.archived).map(l=>({id:l.id,name:l.name,timezone:l.timezone}));
    // The AI calls behind this run's story, with credits, so the panel shows its sub-steps live.
    const calls=run?.progress.storyId ? await listStoryTextCallsSince(topicId,run.progress.storyId,new Date(run.startedAt)).catch(()=>[]) : [];
    // Stories worked on by hand, so the panel can pick one up where it was left.
    const inProgress=await listStoriesInProgress(topicId).catch(()=>[]);
    // The current script as slides (read live, so edits in the studio show here too).
    const draft=run?.progress.draftId ? await findCreativeDraftById(topicId,run.progress.draftId).catch(()=>undefined) : undefined;
    const slides=draft ? {version:draft.version,status:draft.status,units:draft.units.map(u=>({order:u.order,role:u.role,headline:u.headline,subheadline:u.subheadline ?? null}))} : null;
    return noStoreJson({run:run?{id:run.id,topicId:run.topicId,lineId:run.lineId,timezone:run.timezone,status:run.status,step:run.step,progress:run.progress,error:run.error,startedAt:run.startedAt,updatedAt:run.updatedAt}:null,lines,calls,slides,inProgress});
  } catch(error) {
    const topicError=topicRequestErrorResponse(error);if(topicError)return topicError;
    if(error instanceof EditorialLineError)return noStoreJson({error:error.message},error.status);
    console.error("Daily preparation request failed");
    return noStoreJson({error:"Daily preparation could not be loaded. Check server configuration."},500);
  }
}

export const GET = withApiLog(route_GET);
export const POST = withApiLog(route_POST);
