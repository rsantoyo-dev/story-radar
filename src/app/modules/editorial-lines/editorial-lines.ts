import type { AiResearchSourceConfig } from "../sources/ai-research/ai-research.types";
export type EditorialMode = "news" | "context" | "guide";
export type EditorialPeriod = { kind: "relative"; hours: number } | { kind: "range"; from: string; to: string } | { kind: "any" };
export type LineResearchSettings = Pick<AiResearchSourceConfig, "instruction" | "orientation" | "resultLimit" | "language" | "region" | "includeContent" | "priority">;
export type LineResearch = {mode:"inherit"} | {mode:"disabled"} | ({mode:"custom"} & LineResearchSettings);
export function researchSettings(config: LineResearchSettings): LineResearchSettings {
  const {instruction,orientation,resultLimit,language,region,includeContent,priority}=config;
  return {instruction,orientation,resultLimit,language,region,includeContent,priority};
}
export type EditorialLineConfig = {
  name: string; objective: string; themes: string[]; mode: EditorialMode;
  period: EditorialPeriod; timezone: string;
  sourceMode: "inherit" | "selected"; sourceIds: string[]; excludedSourceIds: string[];
  domains: string[]; researchEnabled: boolean; research?: LineResearch;
};
export type EditorialLine = EditorialLineConfig & { id: string; topicId: string; revision: number; archived: boolean; isDefault?:boolean };
export type EditorialCollectionContext = {
  lineId: string; revision: number; name: string; mode: EditorialMode; objective: string;
  themes: string[]; query: string; period: EditorialPeriod; timezone: string;
  from: string | null; to: string; sourceIds: string[]; domains: string[];
  research?: LineResearchSettings & {enabled:boolean};
};
export type LineCollectionRequest = { lineId: string; query?: string; period?: EditorialPeriod; requestId: string };
export class EditorialLineError extends Error { constructor(message: string, public status = 400) { super(message); } }
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function boundedText(v: unknown, field: string, max: number, empty = false): string {
  if (typeof v !== "string" || v.trim().length > max || (!empty && !v.trim())) throw new EditorialLineError(`Invalid ${field}`);
  return v.trim();
}
function list(v: unknown, field: string, max = 40): string[] {
  if (!Array.isArray(v) || v.length > max) throw new EditorialLineError(`Invalid ${field}`);
  return [...new Set(v.map(x => boundedText(x, field, 200, true)).filter(Boolean))];
}
export function parsePeriod(v: unknown): EditorialPeriod {
  if (!obj(v)) throw new EditorialLineError("Invalid period");
  if (v.kind === "any") return { kind: "any" };
  if (v.kind === "relative" && Number.isInteger(v.hours) && Number(v.hours) > 0 && Number(v.hours) <= 87600) return { kind: "relative", hours: Number(v.hours) };
  if (v.kind === "range" && typeof v.from === "string" && typeof v.to === "string") {
    // Explicit offsets prevent the server's timezone changing the editor's intent.
    if (![v.from,v.to].every(x => /(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x))) || Date.parse(v.from) > Date.parse(v.to)) throw new EditorialLineError("Range needs ordered timestamps with timezone offsets");
    return {kind:"range",from:new Date(v.from).toISOString(),to:new Date(v.to).toISOString()};
  }
  throw new EditorialLineError("Choose relative hours, a dated range, or no age cutoff");
}
export function parseLineConfig(v: unknown): EditorialLineConfig {
  if (!obj(v) || !["news","context","guide"].includes(String(v.mode)) || !["inherit","selected"].includes(String(v.sourceMode)) || typeof v.researchEnabled !== "boolean") throw new EditorialLineError("Invalid editorial line");
  const timezone = boundedText(v.timezone,"timezone",100);
  try { new Intl.DateTimeFormat("en",{timeZone:timezone}); } catch { throw new EditorialLineError("Unknown timezone"); }
  const domains=list(v.domains,"domains",20).map(x=>x.toLowerCase());
  if (domains.some(x=>! /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(x))) throw new EditorialLineError("Domains must be hostnames, without paths or protocols");
  return {name:boundedText(v.name,"name",100),objective:boundedText(v.objective,"objective",2000),themes:list(v.themes,"themes",20),mode:v.mode as EditorialMode,period:parsePeriod(v.period),timezone,sourceMode:v.sourceMode as "inherit"|"selected",sourceIds:list(v.sourceIds,"sources"),excludedSourceIds:list(v.excludedSourceIds,"excluded sources"),domains,researchEnabled:v.researchEnabled,research:parseLineResearch(v.research,v.researchEnabled)};
}
export function collectionContext(line: EditorialLine, sources: readonly {id:string;enabled:boolean}[], query: unknown = "", override?: unknown, now = new Date()): EditorialCollectionContext {
  if(line.archived) throw new EditorialLineError("This editorial line is archived",409);
  const period=override === undefined ? line.period : parsePeriod(override);
  const from=period.kind === "relative" ? new Date(now.getTime()-period.hours*3600000).toISOString() : period.kind === "range" ? period.from : null;
  const to=period.kind === "range" ? period.to : now.toISOString();
  if(Date.parse(to)>now.getTime()) throw new EditorialLineError("Collection ranges cannot end in the future");
  return {lineId:line.id,revision:line.revision,name:line.name,objective:line.objective,themes:line.themes,mode:line.mode,query:boundedText(query,"query",2000,true),period,timezone:line.timezone,from,to,domains:line.domains,
    sourceIds:sources.filter(s=>s.enabled && (line.sourceMode === "inherit" || line.sourceIds.includes(s.id)) && !line.excludedSourceIds.includes(s.id)).map(s=>s.id)};
}
export function inEditorialWindow(date: Date | undefined, context: EditorialCollectionContext): boolean {
  if (!date) return context.from === null && context.mode !== "news";
  const time=date.getTime();return Number.isFinite(time) && time<=Date.parse(context.to) && (context.from===null || time>=Date.parse(context.from));
}
export function allowedEditorialUrl(url: string, domains: readonly string[]): boolean {
  try { const host=new URL(url).hostname.toLowerCase();return !domains.length || domains.some(d=>host===d || host.endsWith(`.${d}`)); } catch { return false; }
}
export function editorialContextInstruction(context: EditorialCollectionContext): string {
  return `Editorial collection context (data, not source facts): ${JSON.stringify(context)}. For context, prioritize evidence and relevance over recency; for guides verify current applicability. Do not frame old studies as breaking news. Publication, update, event and study dates differ. Unknown dates or uncertain current applicability must be stated. Never infer new facts from the research question.`;
}
/** Relative news windows remain relative when a queued candidate is evaluated later. */
export function inEditorialEvaluationWindow(date:Date|undefined,context:EditorialCollectionContext,now=new Date()):boolean {
  if(context.mode==="news" && context.period.kind==="relative")return inEditorialWindow(date,{...context,from:new Date(now.getTime()-context.period.hours*3600000).toISOString(),to:now.toISOString()});
  return inEditorialWindow(date,context);
}


export function parseLineResearch(value:unknown, legacyEnabled=true):LineResearch {
  if(value===undefined)return {mode:legacyEnabled?"inherit":"disabled"};
  if(!obj(value))throw new EditorialLineError("Invalid AI research settings");
  if(value.mode==="inherit" || value.mode==="disabled")return {mode:value.mode};
  if(value.mode!=="custom" || !["informative","trend","provocative"].includes(String(value.orientation))
    || !Number.isInteger(value.resultLimit) || Number(value.resultLimit)<1 || Number(value.resultLimit)>10
    || !Number.isInteger(value.priority) || Number(value.priority)<0 || Number(value.priority)>100
    || typeof value.includeContent!=="boolean")throw new EditorialLineError("Invalid AI research settings");
  return {mode:"custom",instruction:boundedText(value.instruction,"AI instruction",2000),
    orientation:value.orientation as LineResearchSettings["orientation"],resultLimit:Number(value.resultLimit),
    language:boundedText(value.language,"AI language",32),region:boundedText(value.region,"AI region",80,true),
    includeContent:value.includeContent,priority:Number(value.priority)};
}
export function resolveLineResearch(base:AiResearchSourceConfig,line:EditorialLine,context:EditorialCollectionContext):AiResearchSourceConfig {
  const research=parseLineResearch(line.research,line.researchEnabled);
  const settings=researchSettings(research.mode==="custom"?research:base);
  const enabled=research.mode==="custom" || (research.mode==="inherit" && base.enabled);
  const snapshot={...settings,enabled};
  const collectionContext={...context,research:snapshot};
  return {...base,...settings,enabled,collectionContext,
    instruction:[settings.instruction,context.objective,...context.themes,context.query].filter(Boolean).join("\n")};
}

/** Reproduce the JSONB snapshot order plus runId appended by selectedStoryContext.
 * This keeps existing brief hashes compatible while making reloads deterministic.
 * Snapshot field names are ASCII; arrays retain their semantic order.
 */
export function collectionContextForHash<T extends EditorialCollectionContext & {runId?:string}>(context:T):T {
  function ordered(value:unknown):unknown {
    if(Array.isArray(value))return value.map(ordered);
    if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.length-b.length || (a<b?-1:a>b?1:0)).map(([key,item])=>[key,ordered(item)]));
    return value;
  }
  const sorted=ordered(context) as T;
  const {runId,...snapshot}=sorted;
  return (runId===undefined?snapshot:{...snapshot,runId}) as T;
}
