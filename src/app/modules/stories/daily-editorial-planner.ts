import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { requireTopic } from "../topics/topic-context";
import { getEditorialProfile } from "./editorial-profile.repository";
import { getStoryKeywordPreferences } from "./story-preferences.repository";
import type { StoryKeywordPreferences } from "./story-relevance.config";
import { getEditorialEvaluationPublicConfig, getEditorialEvaluationRuntimeConfig } from "./editorial-evaluation.config";
import { evaluateStoriesWithFallback } from "./gemini-story-editorial-evaluator";
import { finishDailyPlan, latestDailyPlan, plannerInputs, reserveDailyPlan, cachedDailyPlan } from "./daily-editorial-planner.repository";
import { EXTENDED_LOOKBACK_HOURS, MIN_CANDIDATES_BEFORE_TOPUP, PLANNER_PROMPT_VERSION, plannerDay, type PlannerView } from "./daily-editorial-planner.types";
import { collectionContext, resolveLineResearch } from "../editorial-lines/editorial-lines";
import { ensureDefaultEditorialLine, reserveCollection, finishCollection } from "../editorial-lines/editorial-lines.repository";
import { listTopicRssSourceConfigs } from "../topics/topic-catalog.repository";
import { getAiResearchSourceConfig } from "../sources/ai-research/ai-research.repository";
import { collectAndPersistStoryCandidates } from "./collect-and-persist-story-candidates";
import { evaluateEditorialCandidates } from "./evaluate-editorial-candidates";
import type { EditorialProfile } from "./editorial-profile.types";

export class DailyPlannerError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// MIN_CANDIDATES_BEFORE_TOPUP and EXTENDED_LOOKBACK_HOURS (imported above)
// gate both this file's fresh-story top-up and plannerInputs' own widening
// of already-evaluated older candidates — kept together so a normal day
// with several candidates never pays for either.

async function currentInput(topicId: string, timezone: string) {
  const now = new Date();
  let day;
  try { day = plannerDay(timezone,now); } catch { throw new DailyPlannerError("Choose a valid IANA timezone"); }
  const [topic,profile,preferences] = await Promise.all([requireTopic(topicId,{active:true}),getEditorialProfile(topicId),getStoryKeywordPreferences(topicId)]);
  const context = { ...day, topic:{name:topic.name,description:topic.description},profile,preferences,...await plannerInputs(topicId,profile,now) };
  // No secrets in snapshots or cache identities. Capability/model changes invalidate.
  const providers = {
    model:getEditorialEvaluationPublicConfig().model,
    paidGemini:!!process.env.GEMINI_PAID_API_KEY,
    groq:!!process.env.GROQ_API_KEY,
    groqModel:process.env.EDITORIAL_GROQ_MODEL || process.env.CREATIVE_GROQ_MODEL || "openai/gpt-oss-20b",
    cloudflare:!!process.env.CLOUDFLARE_AI_ACCOUNT_ID && !!process.env.CLOUDFLARE_AI_API_TOKEN,
    cloudflareModel:process.env.EDITORIAL_CLOUDFLARE_AI_MODEL || process.env.CLOUDFLARE_AI_MODEL || "@cf/zai-org/glm-4.7-flash",
  };
  const inputHash=createHash("sha256").update(JSON.stringify({version:PLANNER_PROMPT_VERSION,providers,context})).digest("hex");
  return {context,inputHash,profile,preferences};
}

/**
 * Best-effort: collects fresh candidates for the topic's default editorial
 * line, then re-runs AI evaluation, so a thin shortlist gets a real chance
 * to grow before the planner declares defeat. Never throws — a top-up
 * failure (no configured sources, provider outage, daily budget spent)
 * just leaves the planner working with whatever candidates already existed,
 * the same as if this were never attempted.
 */
async function topUpCandidatePool(
  topicId: string,
  profile: EditorialProfile,
  preferences: StoryKeywordPreferences,
): Promise<void> {
  try {
    const line = await ensureDefaultEditorialLine(topicId);
    if (line.archived) return;
    const [sources, research] = await Promise.all([
      listTopicRssSourceConfigs(topicId),
      getAiResearchSourceConfig(topicId),
    ]);
    const now = new Date();
    // Widen a narrower relative window for this one top-up; leave a wider
    // relative window, a dated range, or "any" (no cutoff) untouched.
    const periodOverride = line.period.kind === "relative" && line.period.hours < EXTENDED_LOOKBACK_HOURS
      ? { kind: "relative" as const, hours: EXTENDED_LOOKBACK_HOURS }
      : undefined;
    const context = collectionContext(line, sources, "", periodOverride, now);
    const aiResearch = resolveLineResearch(research, line, context);
    const selected = sources.filter((source) => context.sourceIds.includes(source.id));
    if (!selected.some((source) => source.enabled) && !aiResearch.enabled) return;

    const collectionId = randomUUID();
    const reservation = await reserveCollection(topicId, collectionId, aiResearch.collectionContext);
    if (!reservation.cached) {
      const { radar, persistence } = await collectAndPersistStoryCandidates({
        topicId,
        now,
        editorialContext: aiResearch.collectionContext,
        editorialRunId: collectionId,
        sources: selected,
        preferences,
        aiResearch: { config: aiResearch, profile },
      });
      await finishCollection(topicId, collectionId, { sources: radar.sources, counts: radar.counts, persistence });
    }
    await evaluateEditorialCandidates(topicId);
  } catch (error) {
    console.error("Planner top-up collection/evaluation failed; continuing with the existing candidate pool", error);
  }
}

export async function getDailyPlanner(topicId: string, timezone: string): Promise<PlannerView> {
  const [{context,inputHash},latest] = await Promise.all([currentInput(topicId,timezone),latestDailyPlan(topicId)]);
  const running=!!latest && latest.status==="running" && latest.startedAt.getTime()>Date.now()-600000;
  return {context,running,stale:!!latest && latest.inputHash!==inputHash,
    saved:latest ? {id:latest.id,result:latest.result,status:latest.status === "running" && !running ? "interrupted" : latest.status,error:latest.error,provider:latest.provider,model:latest.model,startedAt:latest.startedAt.toISOString(),context:latest.context} : null};
}
export async function recommendForToday(topicId: string, timezone: string, force: boolean): Promise<PlannerView> {
  let {context,inputHash,profile,preferences}=await currentInput(topicId,timezone);
  if (!force) {
    const cached=await cachedDailyPlan(topicId,inputHash);
    if (cached) return {context,stale:false,running:false,saved:{id:cached.id,result:cached.result,status:cached.status,error:cached.error,provider:cached.provider,model:cached.model,startedAt:cached.startedAt.toISOString(),context:cached.context}};
  }
  if (context.candidates.length < MIN_CANDIDATES_BEFORE_TOPUP) {
    await topUpCandidatePool(topicId, profile, preferences);
    ({context,inputHash,profile,preferences}=await currentInput(topicId,timezone));
    if (!force) {
      const cached=await cachedDailyPlan(topicId,inputHash);
      if (cached) return {context,stale:false,running:false,saved:{id:cached.id,result:cached.result,status:cached.status,error:cached.error,provider:cached.provider,model:cached.model,startedAt:cached.startedAt.toISOString(),context:cached.context}};
    }
  }
  const config=getEditorialEvaluationRuntimeConfig();
  const id=await reserveDailyPlan(topicId,inputHash,context,force,config.maxRunsPerDay);
  if (!id) {
    const view=await getDailyPlanner(topicId,timezone);
    if(view.running) return view;
    if (!force && !view.stale && view.saved?.status==="completed") return view;
    throw new DailyPlannerError(`Daily planner limit reached (${config.maxRunsPerDay} attempts per UTC day). Existing evaluations are unchanged.`,429);
  }
  try {
    if (!context.candidates.length) {
      await finishDailyPlan(topicId,id,{status:"completed",result:{outcome:"no-strong-candidate",recommendation:null,alternatives:[],deferred:[],summary:"No eligible evaluated stories are available. Collect or evaluate more stories first.",uncertainty:"Published, scheduled, in-flight, rejected, duplicate, future-dated and out-of-window stories are excluded."}});
    } else {
      const result=await evaluateStoriesWithFallback({...config,topic:context.topic,editorialProfile:profile,preferences,candidates:[],planningContext:context});
      if (!result.dailyPlan) throw new Error("Planner response missing");
      await finishDailyPlan(topicId,id,{status:"completed",result:result.dailyPlan,provider:result.provider,model:result.model,usage:result.usage});
    }
  } catch {
    await finishDailyPlan(topicId,id,{status:"failed",error:"The configured AI providers could not complete the recommendation. You can retry."});
    throw new DailyPlannerError("The daily recommendation could not be completed. Your story evaluations were not changed.",502);
  }
  // A publication, edit or date rollover during the provider call invalidates the snapshot.
  return getDailyPlanner(topicId,timezone);
}
