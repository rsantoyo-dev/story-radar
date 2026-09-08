import { randomUUID } from "node:crypto";
import { collectionContext, resolveLineResearch, EditorialLineError } from "@/app/modules/editorial-lines/editorial-lines";
import { getEditorialLine, ensureDefaultEditorialLine, reserveCollection, finishCollection, validId } from "@/app/modules/editorial-lines/editorial-lines.repository";
import { collectAndPersistStoryCandidates } from "@/app/modules/stories/collect-and-persist-story-candidates";
import { getEditorialProfile } from "@/app/modules/stories/editorial-profile.repository";
import { getStoryKeywordPreferences } from "@/app/modules/stories/story-preferences.repository";
import { getAiResearchSourceConfig } from "@/app/modules/sources/ai-research/ai-research.repository";
import { listTopicRssSourceConfigs } from "@/app/modules/topics/topic-catalog.repository";
import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "../radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "../radar-topic";

export const maxDuration = 120;

export async function POST(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const searchParams = new URL(request.url).searchParams;
  const rawMaxAgeHours = searchParams.get("maxAgeHours");
  const maxAgeHours = parseMaxAgeHours(rawMaxAgeHours);

  if (rawMaxAgeHours !== null && maxAgeHours === undefined) {
    return NextResponse.json(
      {
        error: 'Query parameter "maxAgeHours" must be a positive number',
      },
      {
        status: 400,
      },
    );
  }

  let reserved: {topicId:string;id:string} | undefined;
  try {
    const topicId = await requireActiveRequestTopic(request);
    const [initialSources, initialResearch, profile, preferences] = await Promise.all([
      listTopicRssSourceConfigs(topicId),
      getAiResearchSourceConfig(topicId),
      getEditorialProfile(topicId),
      getStoryKeywordPreferences(topicId),
    ]);

    let sources=initialSources;
    let aiResearch=initialResearch;
    const rawBody=await request.text();
    if(rawBody.length>16000)throw new EditorialLineError("Collection request too large");
    let input: Record<string,unknown>={};
    if(rawBody){try{input=JSON.parse(rawBody);}catch{throw new EditorialLineError("Invalid collection JSON");}}
    if(!input || typeof input!=="object" || Array.isArray(input))throw new EditorialLineError("Expected a collection object");
    const now=new Date();
    const line=input.lineId !== undefined ? await getEditorialLine(topicId,validId(input.lineId)) : await ensureDefaultEditorialLine(topicId);
    let context=collectionContext(line,sources,input.query ?? "",input.period ?? (input.lineId===undefined && maxAgeHours!==undefined ? {kind:"relative",hours:maxAgeHours} : undefined),now);
    if(context){
      const selectedSourceIds=context.sourceIds;
      sources=sources.filter(source=>selectedSourceIds.includes(source.id));
      aiResearch=resolveLineResearch(aiResearch,line!,context);
      context=aiResearch.collectionContext!;
    }
    if (!sources.some((source) => source.enabled) && !aiResearch.enabled) {
      return NextResponse.json(
        { error: "This topic does not have any active RSS or AI research sources" },
        { status: 422 },
      );
    }

    const id=input.requestId ? validId(input.requestId) : randomUUID();
    const reservation=await reserveCollection(topicId,id,context);
    if(reservation.cached)return NextResponse.json(reservation.cached);
    reserved={topicId,id};
    const { radar, persistence } = await collectAndPersistStoryCandidates({
      topicId, now, editorialContext:context, editorialRunId:id,
      sources,
      preferences,
      aiResearch: { config: aiResearch, profile },
      ...(!context && maxAgeHours !== undefined ? { maxAgeHours } : {}),
    });

    const result = {
      runId:id, editorialContext:context,
      coverage:context ? "RSS sources expose their current feed only. Web research is bounded and does not guarantee archive coverage. Unknown dates and current applicability require editorial review." : undefined,
      generatedAt: radar.generatedAt,
      sources: radar.sources,
      counts: radar.counts,
      persistence,
    };
    await finishCollection(topicId,id,result);
    return NextResponse.json(result);
  } catch (error) {
    if(reserved)await finishCollection(reserved.topicId,reserved.id,undefined,"Collection interrupted; saved partial results remain available").catch(()=>{});
    if(error instanceof EditorialLineError)return NextResponse.json({error:error.message},{status:error.status});
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error("Failed to collect and persist Press Craftor stories", error);

    return NextResponse.json(
      {
        error: "The radar could not be collected and persisted",
      },
      {
        status: 500,
      },
    );
  }
}

function parseMaxAgeHours(value: string | null): number | undefined {
  if (value === null || !value.trim()) {
    return undefined;
  }

  const maxAgeHours = Number(value);

  return Number.isFinite(maxAgeHours) && maxAgeHours > 0
    ? maxAgeHours
    : undefined;
}
