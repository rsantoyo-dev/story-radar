/**
 * Pure helpers behind the Draft 2 canvas: the links between the story page
 * and the canvas, and the reading view of the source text. Kept free of React
 * and the DOM so they are tested directly.
 */

const RETURN_CONTEXT_PATTERN = /^[0-9a-f-]{36}$/i;

type StoryLinkContext = { from?: string; returnContext?: string };

function contextSearch(context: StoryLinkContext): URLSearchParams {
  const search = new URLSearchParams();
  if (context.from?.startsWith("#")) search.set("from", context.from);
  if (context.returnContext && RETURN_CONTEXT_PATTERN.test(context.returnContext)) search.set("returnContext", context.returnContext);
  return search;
}

/** The canvas of a story, keeping the dashboard return context the story page received. */
export function draft2Href(topicId: string, storyId: string, context: StoryLinkContext = {}): string {
  return draft2StepHref(topicId, storyId, undefined, context);
}

/** One screen of the canvas: the overview without a step, a step's own screen with one, with the same return context. */
export function draft2StepHref(topicId: string, storyId: string, step: Draft2StepKey | undefined, context: StoryLinkContext = {}): string {
  const search = contextSearch(context).toString();
  return `/topics/${encodeURIComponent(topicId)}/stories/${encodeURIComponent(storyId)}/draft-2${step ? `/${step}` : ""}${search ? `?${search}` : ""}`;
}

/** The step a canvas path shows: the segment after /draft-2/, when it names a step; the overview otherwise. */
export function draft2StepFromPath(pathname: string): Draft2StepKey | undefined {
  const match = /\/draft-2\/([^/?#]+)\/?$/.exec(pathname);
  return match && isDraft2Step(match[1]) ? match[1] : undefined;
}

/** Back from the canvas to the story's studio, on its script tab. */
export function storyHref(topicId: string, storyId: string, context: StoryLinkContext = {}): string {
  const search = contextSearch(context);
  search.set("tab", "script");
  return `/topics/${encodeURIComponent(topicId)}/stories/${encodeURIComponent(storyId)}?${search}`;
}

/** The host of the source URL, without "www.", for the story's meta line. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function wordCount(text: string | undefined): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Paragraphs of the stored text: blank-line separated, single line breaks kept inside one paragraph. */
export function paragraphs(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export const CONTENT_STATUS_LABELS: Record<string, string> = {
  full: "Full article",
  "likely-full": "Likely full article",
  excerpt: "Excerpt only",
  missing: "No content",
};

export function contentStatusLabel(status: string): string {
  return CONTENT_STATUS_LABELS[status] ?? status;
}

/**
 * The steps in the order they run. People and places comes before the Focus,
 * so the narrative form is chosen with the brand's characters and the
 * story's verified material in hand.
 */
export const DRAFT_2_STEPS = [
  { key: "facts", title: "Facts", detail: "Verified facts with the qualifier each one must keep." },
  { key: "inventory", title: "People and places", detail: "Who and where the story names, the verified photos and maps of them, and the brand's characters it may use." },
  { key: "focus", title: "Focus", detail: "What the story is for and how it is told: its line, audience, framing, structure, goal, voice, concept and narrative form." },
  { key: "spine", title: "Spine", detail: "The plan the words and the images follow, written from the focus: the hook’s lever and where it is paid, the misreadings the cover prevents, one beat per slide (what its words do, what its image adds, what it withholds) and the two directions." },
  { key: "opening", title: "Opening", detail: "Cover and slide 2 judged as one unit: the promise and its first payoff." },
  { key: "closing", title: "Closing", detail: "The ending: the cover's promise paid in full, what it means for the reader, one call to action." },
  { key: "deck", title: "Deck", detail: "The slides between slide 2 and the closing, one idea each: the story from its promise to its end." },
  { key: "review", title: "Review", detail: "The whole carousel read from the cover to the last slide: a reader of the audience says whether they would swipe, follow and comment; an editor scores it and proposes the exact changes that would make them." },
  { key: "visual", title: "Visual script", detail: "The carousel's images as one visual story, in the brand's identity and the focus's visual direction." },
  { key: "images", title: "Images", detail: "Each slide made from the visual script, reviewed, and corrected once when it needs it; logo and page number added afterwards." },
  { key: "caption", title: "Caption", detail: "The post’s text: short lines and blank lines, the brand’s emojis, the closing’s call to action, the accounts you tag and 5 to 8 hashtags." },
  { key: "publish", title: "Publish", detail: "The carousel approved as it stands, then published to Facebook, Instagram or both once you confirm the exact post." },
] as const;

export type Draft2StepKey = (typeof DRAFT_2_STEPS)[number]["key"];
const STEP_KEYS: readonly string[] = DRAFT_2_STEPS.map((step) => step.key);

export function isDraft2Step(value: unknown): value is Draft2StepKey {
  return typeof value === "string" && STEP_KEYS.includes(value);
}

/** A step's place in the pipeline, from 1. */
export const draft2StepNumber = (step: Draft2StepKey) => STEP_KEYS.indexOf(step) + 1;

/** The pipeline in four phases: what the story says, has and is for, its words, its images, and the post. */
export const DRAFT_2_PHASES = [
  { key: "story", title: "Story", steps: ["facts", "inventory", "focus", "spine"] },
  { key: "words", title: "Words", steps: ["opening", "closing", "deck", "review"] },
  { key: "visuals", title: "Visuals", steps: ["visual", "images"] },
  { key: "post", title: "Post", steps: ["caption", "publish"] },
] as const satisfies readonly { key: string; title: string; steps: readonly Draft2StepKey[] }[];

export const draft2StepPhase = (step: Draft2StepKey) => DRAFT_2_PHASES.find((phase) => (phase.steps as readonly string[]).includes(step))!;

/** The steps the autopilot runs, in order: the accounts to tag (a run of the caption's screen) come after the spine, before the words. */
export const AUTOPILOT_ORDER = ["facts", "inventory", "focus", "spine", "mentions", "opening", "closing", "deck", "review", "visual", "images"] as const;

/**
 * Whether the autopilot runs a step on its way to a target ("Run to here" on
 * a step's screen): every step up to the target, the target included. No
 * target, or one past the images (the caption, the publish), runs to the
 * images, as "Run to images" always did.
 */
export function autopilotRuns(step: string, until: string | undefined): boolean {
  const order: readonly string[] = AUTOPILOT_ORDER;
  const limit = until === undefined ? -1 : order.indexOf(until);
  return limit < 0 || order.indexOf(step) <= limit;
}

/** The screens before and after one: the overview comes before the first step; the last step has none after it. */
export function adjacentDraft2Steps(step: Draft2StepKey | undefined): { previous?: Draft2StepKey | "overview"; next?: Draft2StepKey } {
  if (!step) return { next: DRAFT_2_STEPS[0].key };
  const index = STEP_KEYS.indexOf(step);
  return {
    previous: index === 0 ? "overview" : DRAFT_2_STEPS[index - 1].key,
    ...(index < DRAFT_2_STEPS.length - 1 ? { next: DRAFT_2_STEPS[index + 1].key } : {}),
  };
}

/**
 * Where a key takes the canvas, outside a text field: the left arrow or "["
 * to the screen before, the right arrow or "]" to the one after, a digit to
 * that step (0 is the tenth). Nothing for any other key, or past the ends.
 */
export function draft2StepForKey(key: string, current: Draft2StepKey | undefined): Draft2StepKey | "overview" | undefined {
  const { previous, next } = adjacentDraft2Steps(current);
  if (key === "ArrowLeft" || key === "[") return previous;
  if (key === "ArrowRight" || key === "]") return next;
  if (/^[0-9]$/.test(key)) return DRAFT_2_STEPS[key === "0" ? 9 : Number(key) - 1]?.key;
  return undefined;
}

/** How a step reads on the pipeline rail: finished, working, waiting for the editor, failed, ready to start, or waiting on an earlier step. */
export type Draft2RailState = "done" | "running" | "attention" | "failed" | "idle" | "blocked";

/**
 * A step's rail state from its status badge, whether it runs now in this tab,
 * and whether it can start: a running label (Running, Generating, Searching,
 * Deciding, Approving) is work under way; any other informational label
 * (Paused, Acceptable) waits for the editor.
 */
export function draft2RailState(status: { label: string; tone: string } | undefined, { live = false, available = true }: { live?: boolean; available?: boolean } = {}): Draft2RailState {
  if (live) return "running";
  if (!status || status.tone === "neutral") return available ? "idle" : "blocked";
  if (status.tone === "success") return "done";
  if (status.tone === "error") return "failed";
  if (status.tone === "info" && /^(running|generating|searching|deciding|approving)/i.test(status.label)) return "running";
  return "attention";
}

/** Characters per token, roughly, for JSON in English, French or Spanish: close enough to tell an answer from thinking. */
const CHARACTERS_PER_TOKEN = 3.5;

/** What the trace line reads of one provider call (draft2-facts.types.ts, Draft2TraceEntry). */
export type TraceCall = {
  step?: string;
  /** When the call started (ISO); its end is this plus durationMs. */
  at?: string;
  provider: "openai" | "anthropic";
  effort?: string;
  costMicros?: number;
  usage?: { promptTokens: number; outputTokens: number; thoughtsTokens?: number; totalTokens: number };
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  answerCharacters?: number;
  outcome: "ok" | "error";
  note?: string;
  durationMs: number;
};

/**
 * One provider call in the trace: tokens in and out, how the output split
 * between the answer and thinking (Sol reports its reasoning; for Claude it
 * is what the output holds beyond the answer, estimated from its length),
 * the cache, and the error a failed call ended on, with what it still cost.
 */
export function traceUsageLine(call: TraceCall): string {
  const usage = call.usage && call.usage.totalTokens > 0 ? call.usage : undefined;
  let split = "";
  if (usage && call.provider === "openai" && usage.thoughtsTokens) split = ` (${usage.thoughtsTokens} reasoning)`;
  if (usage && call.provider === "anthropic" && call.answerCharacters !== undefined) {
    const answer = Math.round(call.answerCharacters / CHARACTERS_PER_TOKEN);
    split = ` (≈${answer} answer, ≈${Math.max(0, usage.outputTokens - answer)} thinking)`;
  }
  const tokens = usage ? [
    `${usage.promptTokens} in`,
    `${usage.outputTokens} out${split}`,
    ...(call.cachedInputTokens ? [`${call.cachedInputTokens} cached`] : []),
    ...(call.cacheWriteTokens ? [`${call.cacheWriteTokens} written to cache`] : []),
  ] : [];
  const lead = call.outcome === "ok" ? tokens : [call.note ?? "failed", ...tokens];
  return [...lead, `${(call.durationMs / 1000).toFixed(1)} s`, ...(call.costMicros !== undefined ? [usd(call.costMicros)] : [])].join(" · ");
}

/** USD micros as the canvas shows them: cents. */
export const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;
/** A duration as the canvas shows it: seconds under a minute, else minutes with one decimal. */
export const minutes = (ms: number) => ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${Math.round(ms / 1000)} s`;

export type StepMetrics = { ms: number; costMicros: number; calls: number; /** When the step's last call ended (ISO): the step last ran then. */ lastAt?: string };
/** The trace's step for each canvas step: the accounts to tag belong to the caption step; publishing makes no provider call. */
const METRICS_STEP: Record<string, string> = { mentions: "caption" };

/** What the images cost beside the trace: each attempt's charge and the anchor plate's. */
type ImageCharges = { slides: { attempts: { costMicros?: number }[] }[]; anchorPlate?: { costMicros?: number }; masterPlate?: { costMicros?: number } };

/**
 * Model time and cost per canvas step, from the session's trace (every
 * provider call, this run's and earlier ones) and the images' provider
 * charges, the anchor plate's among them. Time is time inside calls, not the
 * clock on the wall; cost is the meter's estimate when the call's model had a
 * verified rate.
 */
export function stepMetrics(trace: readonly TraceCall[], images?: ImageCharges | null): Record<string, StepMetrics> {
  const metrics: Record<string, StepMetrics> = {};
  const add = (step: string, ms: number, costMicros: number, calls: number, endedAt?: string) => {
    const entry = metrics[step] ?? (metrics[step] = { ms: 0, costMicros: 0, calls: 0 });
    entry.ms += ms; entry.costMicros += costMicros; entry.calls += calls;
    if (endedAt && (!entry.lastAt || endedAt > entry.lastAt)) entry.lastAt = endedAt;
  };
  for (const call of trace) {
    if (!call.step) continue;
    const started = call.at ? Date.parse(call.at) : NaN;
    add(METRICS_STEP[call.step] ?? call.step, call.durationMs, call.costMicros ?? 0, 1, Number.isFinite(started) ? new Date(started + call.durationMs).toISOString() : undefined);
  }
  for (const slide of images?.slides ?? []) for (const attempt of slide.attempts) if (attempt.costMicros) add("images", 0, attempt.costMicros, 0);
  if (images?.anchorPlate?.costMicros) add("images", 0, images.anchorPlate.costMicros, 0);
  if (images?.masterPlate?.costMicros) add("images", 0, images.masterPlate.costMicros, 0);
  return metrics;
}

/** The whole session's calls: time inside them, cost, and the judge's share of the time. */
export function sessionMetrics(trace: readonly TraceCall[], images?: ImageCharges | null): { ms: number; costMicros: number; calls: number; openaiShare: number } {
  const steps = Object.values(stepMetrics(trace, images));
  const ms = steps.reduce((sum, step) => sum + step.ms, 0);
  const openaiMs = trace.filter((call) => call.step && call.provider === "openai").reduce((sum, call) => sum + call.durationMs, 0);
  return { ms, costMicros: steps.reduce((sum, step) => sum + step.costMicros, 0), calls: steps.reduce((sum, step) => sum + step.calls, 0), openaiShare: ms ? openaiMs / ms : 0 };
}

/**
 * When something ran, as the canvas says it: the time alone on the day it is
 * now ("10:33"), else the date and the time ("Oct 15, 23:25"), on a 24-hour
 * clock. The time zone is the viewer's unless one is given (the tests').
 */
export function ranAt(iso: string | undefined, now: Date, timeZone?: string): string {
  const at = iso ? new Date(iso) : undefined;
  if (!at || Number.isNaN(at.getTime())) return "";
  const zone = timeZone ? { timeZone } : {};
  const day = (date: Date) => date.toLocaleDateString("en-CA", zone);
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...zone });
  return day(at) === day(now) ? time : `${at.toLocaleDateString("en-US", { month: "short", day: "numeric", ...zone })}, ${time}`;
}
