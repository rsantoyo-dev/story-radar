import { after } from "next/server";
import { authorizeRadarCollector } from "../../radar-api-auth";
import { noStoreJson } from "../../creative-route-error";
import { pendingPreparations } from "@/app/modules/stories/daily-preparation.repository";
import { drivePreparation } from "@/app/modules/stories/daily-preparation";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request) {
  const denied=authorizeRadarCollector(request);if(denied)return denied;
  const runs=await pendingPreparations();
  after(async()=>{await Promise.allSettled(runs.map(run=>drivePreparation(run.topicId,run.id)));});
  return noStoreJson({selected:runs.length});
}
