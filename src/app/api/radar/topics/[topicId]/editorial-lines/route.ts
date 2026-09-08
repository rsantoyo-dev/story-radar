import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";
import { listEditorialLines, listStoryContexts, recentLineRuns, saveEditorialLine } from "@/app/modules/editorial-lines/editorial-lines.repository";
import { getAiResearchSourceConfig } from "@/app/modules/sources/ai-research/ai-research.repository";
import { EditorialLineError, researchSettings } from "@/app/modules/editorial-lines/editorial-lines";
import { listTopicRssSourceConfigs } from "@/app/modules/topics/topic-catalog.repository";
import { noStoreJson } from "../../topic-route-utils";
type Context={params:Promise<{topicId:string}>};
async function topic(context:Context){return (await requireTopic((await context.params).topicId,{active:true})).id;}
export async function GET(request:Request,context:Context){
  const denied=authorizeRadarCollector(request);if(denied)return denied;
  try {const id=await topic(context);const [lines,associations,runs,sources,research]=await Promise.all([listEditorialLines(id),listStoryContexts(id),recentLineRuns(id),listTopicRssSourceConfigs(id),getAiResearchSourceConfig(id)]);return noStoreJson({lines,associations,runs,researchDefaults:{...researchSettings(research),enabled:research.enabled},sources:sources.map(s=>({id:s.id,name:s.name,enabled:s.enabled}))});}catch(e){return failure(e);}
}
export async function POST(request:Request,context:Context){
  const denied=authorizeRadarCollector(request);if(denied)return denied;
  try {const id=await topic(context);let input;try{input=await request.json();}catch{throw new EditorialLineError("Invalid JSON");}if(!input||typeof input!=="object"||Array.isArray(input))throw new EditorialLineError("Expected an object");return noStoreJson({line:await saveEditorialLine(id,input)});}catch(e){return failure(e);}
}
function failure(error:unknown){if(error instanceof EditorialLineError)return noStoreJson({error:error.message},error.status);if(error instanceof TopicContextError)return noStoreJson({error:error.message},404);console.error("Editorial lines request failed",error);return noStoreJson({error:"Unable to load or save editorial lines"},500);}
