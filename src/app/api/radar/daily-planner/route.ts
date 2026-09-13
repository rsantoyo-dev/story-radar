import { DailyPlannerError, getDailyPlanner, recommendForToday } from "@/app/modules/stories/daily-editorial-planner";
import { EditorialEvaluationConfigurationError } from "@/app/modules/stories/editorial-evaluation.config";
import { authorizeRadarCollector } from "../radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "../radar-topic";
import { noStoreJson } from "../creative-route-error";

export const runtime = "nodejs";
export async function GET(request: Request) { return handle(request,false); }
export async function POST(request: Request) { return handle(request,true); }
async function handle(request: Request, generate: boolean) {
  const unauthorized=authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topicId=await requireActiveRequestTopic(request);
    const timezone=new URL(request.url).searchParams.get("timezone") ?? "";
    if (!generate) return noStoreJson(await getDailyPlanner(topicId,timezone));
    const body:unknown=await request.json().catch(() => null);
    if (!body || typeof body!=="object" || Array.isArray(body) || !("force" in body) || typeof body.force!=="boolean") throw new DailyPlannerError("force must be a boolean");
    return noStoreJson(await recommendForToday(topicId,timezone,body.force));
  } catch(error) {
    const topicError=topicRequestErrorResponse(error);
    if(topicError) return topicError;
    if(error instanceof DailyPlannerError) return noStoreJson({error:error.message},error.status);
    if(error instanceof EditorialEvaluationConfigurationError) return noStoreJson({error:error.message},503);
    console.error("Daily planner request failed");
    return noStoreJson({error:"The daily planner could not be loaded. Check server configuration and migrations."},500);
  }
}
