import { after } from "next/server";
import { authorizeRadarCollector, requestAccess } from "../../radar-api-auth";
import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { noStoreJson } from "../../creative-route-error";
import { pendingPreparations } from "@/app/modules/stories/daily-preparation.repository";
import { drivePreparation } from "@/app/modules/stories/daily-preparation";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request) {
  const denied=await authorizeRadarCollector(request);if(denied)return denied;
  // Only this caller's workspace: one member never drives another workspace's work.
  const access=requestAccess(request);
  const pending=await pendingPreparations();
  const owned=await Promise.all(pending.map(async run=>(access.staff&&access.kind==="operator")||(await getTopicById(run.topicId))?.workspaceId===access.workspaceId));
  const runs=pending.filter((_,index)=>owned[index]);
  after(async()=>{await Promise.allSettled(runs.map(run=>drivePreparation(run.topicId,run.id)));});
  return noStoreJson({selected:runs.length});
}
